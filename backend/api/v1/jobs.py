from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from core.security import verify_supabase_jwt
from schemas.jobs import JobExtractRequest
from api.dependencies import get_job_repository
from repositories.job_repository import JobRepository
from services.ai.groq_service import GroqService
from app.analytics.events.tracking.analytics_service import AnalyticsService
from core.database import get_db_connection

router = APIRouter(prefix="/jobs", tags=["jobs"])

@router.post("/extract")
async def extract_job_details(
    request: JobExtractRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: JobRepository = Depends(get_job_repository),
    conn = Depends(get_db_connection)
):
    if not request.jd_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job text cannot be empty."
        )

    try:
        AnalyticsService(conn).emit_event(
            user_id=user["id"],
            event_type="JD_EXTRACTION_STARTED",
            metadata={"text_length": len(request.jd_text)}
        )
        
        ai = GroqService()
        analysis = ai.analyze_job(
            request.jd_text,
            url=request.url,
            page_title=request.page_title,
            page_company=request.page_company
        )

        record = repo.create(
            user_id=user["id"],
            raw_text=request.jd_text,
            company_name=analysis.company or "Company",
            job_title=analysis.title or "Job Title",
            normalized_content=analysis.dict(),
            ats_keywords=analysis.ats_keywords or [],
            skills_categories={"required": analysis.required_skills or [], "preferred": analysis.preferred_skills or []}
        )
        
        AnalyticsService(conn).emit_event(
            user_id=user["id"],
            event_type="JD_EXTRACTED",
            resource_type="job",
            resource_id=record["id"],
            metadata={"company_name": analysis.company, "job_title": analysis.title}
        )
        
        return record
    except ValueError as val_err:
        AnalyticsService(conn).emit_event(
            user_id=user["id"],
            event_type="JD_EXTRACTION_FAILED",
            metadata={"reason": "validation_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err)
        )
    except Exception as e:
        AnalyticsService(conn).emit_event(
            user_id=user["id"],
            event_type="JD_EXTRACTION_FAILED",
            metadata={"reason": "internal_error", "error_msg": str(e)}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Job analysis failed: {str(e)}"
        )
