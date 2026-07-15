from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

from core.security import verify_supabase_jwt
from api.dependencies import get_application_repository
from repositories.application_repository import ApplicationRepository

router = APIRouter(prefix="/applications", tags=["applications"])

class ApplicationCreateRequest(BaseModel):
    company_name: str
    job_title: str
    location: Optional[str] = None
    job_url: Optional[str] = None
    resume_version: Optional[str] = None
    cover_letter_version: Optional[str] = None
    ats_score: Optional[float] = None
    resume_match_score: Optional[float] = None
    current_stage: Optional[str] = "Ready To Apply"
    timeline: Optional[List[Dict[str, Any]]] = None

class ApplicationUpdateRequest(BaseModel):
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    location: Optional[str] = None
    job_url: Optional[str] = None
    resume_version: Optional[str] = None
    cover_letter_version: Optional[str] = None
    ats_score: Optional[float] = None
    resume_match_score: Optional[float] = None
    current_stage: Optional[str] = None
    timeline: Optional[List[Dict[str, Any]]] = None
    notes: Optional[str] = None
    recruiter_notes: Optional[str] = None
    interview_notes: Optional[str] = None
    reminder: Optional[Dict[str, Any]] = None

@router.get("/")
async def list_applications(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ApplicationRepository = Depends(get_application_repository)
):
    try:
        return repo.list_by_user(user["id"])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch applications: {str(e)}"
        )

@router.post("/")
async def create_application(
    request: ApplicationCreateRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ApplicationRepository = Depends(get_application_repository)
):
    try:
        # Default timelines if none supplied
        timeline = request.timeline
        if not timeline:
            timeline = [
                {"event": "Ready To Apply", "timestamp": "now"}
            ]
            
        record = repo.create(
            user_id=user["id"],
            company_name=request.company_name,
            job_title=request.job_title,
            location=request.location,
            job_url=request.job_url,
            resume_version=request.resume_version,
            cover_letter_version=request.cover_letter_version,
            ats_score=request.ats_score,
            resume_match_score=request.resume_match_score,
            current_stage=request.current_stage or "Ready To Apply",
            timeline=timeline
        )
        return record
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create application: {str(e)}"
        )

@router.put("/{id}")
async def update_application(
    id: str,
    request: ApplicationUpdateRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ApplicationRepository = Depends(get_application_repository)
):
    try:
        # Filter request data to only fields that were set
        update_data = {k: v for k, v in request.dict().items() if v is not None}
        record = repo.update(id, user["id"], update_data)
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Application session not found."
            )
        return record
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update application: {str(e)}"
        )

@router.delete("/{id}")
async def delete_application(
    id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ApplicationRepository = Depends(get_application_repository)
):
    try:
        success = repo.delete(id, user["id"])
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Application session not found."
            )
        return {"status": "success", "message": "Application deleted successfully."}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete application: {str(e)}"
        )
