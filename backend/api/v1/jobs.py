from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from core.security import verify_supabase_jwt
from schemas.jobs import JobExtractRequest
from api.dependencies import get_job_repository
from repositories.job_repository import JobRepository
from services.ai.groq_service import GroqService
from app.analytics.events.tracking.analytics_service import AnalyticsService
from core.database import get_db_connection
from services.subscriptions.feature_gate_service import FeatureGateService
from services.subscriptions.usage_service import UsageService

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

    usage_service = UsageService(conn)
    usage_consumed = False
    try:
        FeatureGateService(conn).require_feature(user["id"], "jd_extraction")
        usage_summary = usage_service.consume_usage(
            user_id=user["id"],
            feature_key="jd_extraction",
            quantity=1,
            request_id=request.request_id,
            metadata={"url": request.url, "page_title": request.page_title}
        )
        usage_consumed = True

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

        # Preserve and merge manual user entries if provided
        if request.page_title:
            analysis.title = request.page_title
        if request.page_company:
            analysis.company = request.page_company
        if hasattr(request, 'location') and request.location:
            analysis.location = request.location
        if hasattr(request, 'employment_type') and request.employment_type:
            analysis.job_type = request.employment_type
        if hasattr(request, 'experience_level') and request.experience_level:
            analysis.experience_required = request.experience_level
            analysis.seniority = request.experience_level
        if hasattr(request, 'salary_range') and request.salary_range:
            analysis.salary = request.salary_range
        analysis.is_job_related = True

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
        
        return {
            "success": True,
            "data": record,
            "usage": usage_summary
        }
    except ValueError as val_err:
        if usage_consumed:
            usage_service.credit_usage(user["id"], "jd_extraction", 1, {"reason": "validation_failure_release", "request_id": request.request_id})
        AnalyticsService(conn).emit_event(
            user_id=user["id"],
            event_type="JD_EXTRACTION_FAILED",
            metadata={"reason": "validation_error"}
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(val_err)
        )
    except HTTPException:
        raise
    except Exception as e:
        if usage_consumed:
            usage_service.credit_usage(user["id"], "jd_extraction", 1, {"reason": "internal_error_release", "request_id": request.request_id})
        AnalyticsService(conn).emit_event(
            user_id=user["id"],
            event_type="JD_EXTRACTION_FAILED",
            metadata={"reason": "internal_error", "error_msg": str(e)}
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Job analysis failed: {str(e)}"
        )
