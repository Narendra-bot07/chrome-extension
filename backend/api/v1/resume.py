from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from typing import Dict, Any, List
from core.security import verify_supabase_jwt
from core.constants import MAX_FILE_SIZE_BYTES, SUPPORTED_FILE_EXTENSIONS
from api.dependencies import get_resume_repository, get_storage_service
from repositories.resume_repository import ResumeRepository
from services.storage.file_service import FileService
from services.resume.parser import ResumeParser
from services.ai.groq_service import GroqService

router = APIRouter(prefix="/resumes", tags=["resumes"])

@router.post("/upload")
async def upload_and_parse(
    file: UploadFile = File(...),
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    resume_repo: ResumeRepository = Depends(get_resume_repository),
    storage: FileService = Depends(get_storage_service)
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

    # Parse structure
    ai = GroqService()
    parsed_res = ai.parse_resume(raw_text)

    # Save to storage
    import uuid
    unique_path = f"{user['id']}/{uuid.uuid4()}_{file.filename}"
    storage.upload_file("original-resumes", unique_path, content, file.content_type)

    # Save to database
    record = resume_repo.create(
        user_id=user["id"],
        file_path=unique_path,
        file_name=file.filename,
        file_size=len(content),
        file_type=ext,
        parsed_content=parsed_res.dict()
    )
    return record

@router.get("/")
async def list_resumes(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository)
):
    return repo.list_by_user(user["id"])

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
