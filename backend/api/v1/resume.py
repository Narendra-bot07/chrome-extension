from fastapi import APIRouter, Depends, UploadFile, File, Header, HTTPException, status
from fastapi.responses import Response
from typing import Dict, Any, List
from datetime import datetime, timezone
from pathlib import Path
import re
import hashlib
from core.security import verify_supabase_jwt
from core.constants import MAX_FILE_SIZE_BYTES, SUPPORTED_FILE_EXTENSIONS
from api.dependencies import get_resume_repository, get_storage_service
from repositories.resume_repository import ResumeRepository
from services.storage.file_service import FileService
from services.resume.parser import ResumeParser
from services.ai.groq_service import GroqService
from app.analytics.events.tracking.analytics_service import AnalyticsService
from core.database import get_db_connection
from core.logging import logger

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
    stored_path = storage.upload_file("original-resumes", unique_path, content, file.content_type)
    logger.info(
        "[RESUME][BACKEND] Resume file stored user_id=%s file_name=%s "
        "size=%s storage_path=%s",
        user["id"],
        file.filename,
        len(content),
        stored_path,
    )

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
    logger.info(
        "[RESUME][BACKEND] Resume upload completed user_id=%s resume_id=%s "
        "file_name=%s parsing_status=pending",
        user["id"],
        record.get("id"),
        record.get("file_name"),
    )

    # Return immediately after durable upload. AI parsing is intentionally
    # deferred to /{resume_id}/parse so rate limits cannot prevent the Resume
    # Manager from displaying and activating the newly uploaded file.
    record["parsed_content"] = parsed_res
    record["parsing_status"] = "pending"
    
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


@router.post("/reconcile-local")
async def reconcile_local_resumes(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service),
):
    """Recover this user's locally stored files whose DB insert was rolled back."""
    base_dir = getattr(storage, "base_dir", None)
    if not base_dir:
        return {"recovered": 0, "active_resume_id": None}

    user_dir = Path(base_dir) / "original-resumes" / user["id"]
    if not user_dir.exists():
        return {"recovered": 0, "active_resume_id": None}

    known_paths = repo.all_file_paths(user["id"])
    local_files = sorted(
        (path for path in user_dir.iterdir() if path.is_file()),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    known_content_hashes = {
        hashlib.sha256(path.read_bytes()).hexdigest()
        for path in local_files
        if f"{user['id']}/{path.name}" in known_paths
    }
    recovered: list[Dict[str, Any]] = []
    for local_file in local_files:
        relative_path = f"{user['id']}/{local_file.name}"
        if relative_path in known_paths:
            continue

        display_name = re.sub(
            r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
            r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_",
            "",
            local_file.name,
        )
        data = local_file.read_bytes()
        content_hash = hashlib.sha256(data).hexdigest()
        if content_hash in known_content_hashes:
            logger.info(
                "[RESUME][BACKEND] Duplicate orphan file skipped "
                "user_id=%s file_name=%s",
                user["id"],
                display_name,
            )
            continue
        try:
            raw_text = ResumeParser.extract_text(data, display_name)
        except Exception as exc:
            logger.warning(
                "[RESUME][BACKEND] Recovered file text extraction skipped "
                "user_id=%s file_name=%s error=%s",
                user["id"],
                display_name,
                str(exc),
            )
            raw_text = ""

        uploaded_at = datetime.fromtimestamp(
            local_file.stat().st_mtime,
            tz=timezone.utc,
        )
        record = repo.recover_local_file(
            user_id=user["id"],
            file_path=relative_path,
            file_name=display_name,
            file_size=len(data),
            file_type=local_file.suffix.lstrip(".").upper() or "PDF",
            parsed_content={"raw_text": raw_text, "parse_status": "pending"},
            uploaded_at=uploaded_at,
        )
        if record:
            recovered.append(record)
            known_paths.add(relative_path)
            known_content_hashes.add(content_hash)

    active = None
    if recovered:
        newest = recovered[0]
        active = repo.activate(str(newest["id"]), user["id"])

    logger.info(
        "[RESUME][BACKEND] Local resume reconciliation completed "
        "user_id=%s recovered=%s active_resume_id=%s",
        user["id"],
        len(recovered),
        active.get("id") if active else None,
    )
    return {
        "recovered": len(recovered),
        "active_resume_id": active.get("id") if active else None,
    }

@router.get("/active")
async def get_active_resume(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    return repo.get_active(user["id"]) or None

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

@router.post("/{resume_id}/mark-used")
async def mark_resume_used(
    resume_id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    record = repo.mark_used(resume_id, user["id"])
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resume not found, not active, or not owned by current user."
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
    updated_content["parse_status"] = "parsed"
    
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
