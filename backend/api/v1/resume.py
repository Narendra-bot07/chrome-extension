from fastapi import APIRouter, Depends, UploadFile, File, Header, HTTPException, status
from fastapi.responses import Response
from typing import Dict, Any, List
from core.security import verify_supabase_jwt
from core.constants import MAX_FILE_SIZE_BYTES, SUPPORTED_FILE_EXTENSIONS
from api.dependencies import get_resume_repository, get_storage_service
from repositories.resume_repository import ResumeRepository
from services.storage.file_service import FileService
from services.resume.parser import ResumeParser
from services.ai.groq_service import GroqService
from app.analytics.events.tracking.analytics_service import AnalyticsService
from core.database import get_db_connection

router = APIRouter(prefix="/resumes", tags=["resumes"])

@router.post("/upload")
async def upload_and_parse(
    file: UploadFile = File(...),
    x_groq_key: str = Header(None),
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    resume_repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service),
    conn = Depends(get_db_connection)
):
    ext = file.filename.split(".")[-1].upper()
    if ext not in SUPPORTED_FILE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format. Allowed: {SUPPORTED_FILE_EXTENSIONS}"
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds limits."
        )

    # Text extraction
    raw_text = ResumeParser.extract_text(content, file.filename)

    # Save to storage
    import uuid
    unique_path = f"{user['id']}/{uuid.uuid4()}_{file.filename}"
    storage.upload_file("original-resumes", unique_path, content, file.content_type)

    # Save to database before AI parsing so uploaded files are never lost from the Resume Manager.
    parsed_res = {"raw_text": raw_text, "parse_status": "pending"}
    record = resume_repo.create(
        user_id=user["id"],
        file_path=unique_path,
        file_name=file.filename,
        file_size=len(content),
        file_type=ext,
        parsed_content=parsed_res
    )

    # Parse immediately when possible, but keep the uploaded resume even if AI parsing fails.
    try:
        ai = GroqService(api_key=x_groq_key)
        parsed_res = ai.parse_resume(raw_text).dict()
        parsed_res["raw_text"] = raw_text
        parsed_res["parse_status"] = "parsed"
        if resume_repo.update_parsed_content(record["id"], user["id"], parsed_res):
            record["parsed_content"] = parsed_res
    except Exception as parse_err:
        parsed_res["parse_status"] = "failed"
        parsed_res["parse_error"] = str(parse_err)
        resume_repo.update_parsed_content(record["id"], user["id"], parsed_res)
        record["parsed_content"] = parsed_res
    
    AnalyticsService(conn).emit_event(
        user_id=user["id"],
        event_type="RESUME_UPLOADED",
        resource_type="resume",
        resource_id=record["id"],
        metadata={"file_name": file.filename, "file_size": len(content)}
    )
    
    return record

@router.get("/")
async def list_resumes(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    return repo.list_by_user(user["id"])

@router.get("/{resume_id}/file")
async def get_resume_file(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service)
):
    record = repo.get_by_id(resume_id, user["id"])
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found."
        )
    file_bytes = storage.download_file("original-resumes", record["file_path"])
    media_type = "application/pdf" if (record.get("file_type") or "").lower() == "pdf" else "application/octet-stream"
    return Response(
        content=file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{record.get("file_name") or "resume"}"'}
    )

@router.get("/{resume_id}/preview")
async def preview_resume_file(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service)
):
    return await get_resume_file(resume_id, user, repo, storage)

@router.post("/{resume_id}/activate")
async def activate_resume(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    record = repo.activate(resume_id, user["id"])
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found."
        )
    return record

@router.delete("/{resume_id}")
async def delete_resume(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    success = repo.soft_delete(resume_id, user["id"])
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found or already deleted."
        )
    return {"status": "success", "message": "Resume soft-deleted."}

@router.post("/{resume_id}/parse")
async def parse_existing_resume(
    resume_id: str,
    x_groq_key: str = Header(None),
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    conn = Depends(get_db_connection)
):
    record = repo.get_by_id(resume_id, user["id"])
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found."
        )
    
    parsed_content = record.get("parsed_content") or {}
    raw_text = parsed_content.get("raw_text")
    if not raw_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No raw text found in this resume to parse."
        )
        
    # Run Groq AI parse on-demand
    ai = GroqService(api_key=x_groq_key)
    parsed_res = ai.parse_resume(raw_text)
    
    # Save back to database
    updated_content = parsed_res.dict()
    updated_content["raw_text"] = raw_text
    
    success = repo.update_parsed_content(resume_id, user["id"], updated_content)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update parsed resume content in database."
        )
    # Emit Analytics Event
    AnalyticsService(conn).emit_event(
        user_id=user["id"],
        event_type="RESUME_PARSED",
        resource_type="resume",
        resource_id=resume_id,
        metadata={"source": "on-demand"}
    )
        
    # Return updated record format
    record["parsed_content"] = updated_content
    return record
