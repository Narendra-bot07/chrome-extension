from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from core.security import verify_supabase_jwt
from schemas.jobs import JobExtractRequest
from api.dependencies import get_job_repository
from repositories.job_repository import JobRepository
from services.ai.groq_service import GroqService

router = APIRouter(prefix="/jobs", tags=["jobs"])

@router.post("/extract")
async def extract_job_details(
    request: JobExtractRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: JobRepository = Depends(get_job_repository)
):
    if not request.jd_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job text cannot be empty."
        )

    try:
        ai = GroqService()
        analysis = ai.analyze_job(request.jd_text)

        record = repo.create(
            user_id=user["id"],
            raw_text=request.jd_text,
            company_name=analysis.company or "Company",
            job_title=analysis.title or "Job Title",
            normalized_content=analysis.dict(),
            ats_keywords=analysis.ats_keywords or [],
            skills_categories={"required": analysis.required_skills or [], "preferred": analysis.preferred_skills or []}
        )
        return record
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Job analysis failed: {str(e)}"
        )
