from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from core.security import verify_supabase_jwt
from schemas.jobs import JobExtractRequest, JobDetectionLogRequest
from core.logging import logger
from api.dependencies import get_job_repository
from repositories.job_repository import JobRepository
from services.ai.groq_service import GroqService
from app.analytics.events.tracking.analytics_service import AnalyticsService
from core.database import get_db_connection
from services.subscriptions.feature_gate_service import FeatureGateService
from services.subscriptions.usage_service import UsageService
from services.browser_intelligence.schemas import AstraPlannerRequest, AstraPlannerResponse
from services.browser_intelligence.planner_service import AstraPlannerService, ASTRA_FREE_MODEL
import asyncio

router = APIRouter(prefix="/jobs", tags=["jobs"])

@router.post("/astra/plan", response_model=AstraPlannerResponse)
async def create_astra_extraction_plan(
    request: AstraPlannerRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt)
):
    request_id = request.request_id or "no-request-id"
    logger.info(
        f"[ASTRA:{request_id}] planner.start user={user['id']} model={ASTRA_FREE_MODEL} "
        f"candidates={len(request.context.get('candidates', []))} evidence={len(request.evidence)}"
    )
    try:
        plan = await asyncio.wait_for(
            asyncio.to_thread(AstraPlannerService().create_plan, request),
            timeout=15
        )
        logger.info(
            f"[ASTRA:{request_id}] planner.complete page_kind={plan.pageKind} "
            f"confidence={plan.confidence} operations={len(plan.operations)} recovery={plan.requiresRecovery}"
        )
        return AstraPlannerResponse(model=ASTRA_FREE_MODEL, plan=plan, request_id=request.request_id)
    except asyncio.TimeoutError:
        logger.warning(f"[ASTRA:{request_id}] planner.timeout")
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail={"code": "ASTRA_PLANNER_TIMEOUT", "message": "ASTRA planner timed out."})
    except ValueError as error:
        logger.warning(f"[ASTRA:{request_id}] planner.configuration_error error={str(error)}")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail={"code": "ASTRA_PLANNER_UNAVAILABLE", "message": str(error)})
    except Exception as error:
        logger.exception(f"[ASTRA:{request_id}] planner.failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail={"code": "ASTRA_PLANNER_FAILED", "message": "ASTRA could not create a valid plan."})

@router.post("/detection-log")
async def log_job_detection(
    request: JobDetectionLogRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt)
):
    prefix = f"[JobDetection:{request.request_id or 'no-request-id'}]"
    logger.info(f"{prefix} START user={user['id']} url={request.url}")
    for item in request.trace[:30]:
        step = item.get("step", "?")
        name = str(item.get("name", "unknown"))[:120]
        details = item.get("details", {})
        logger.info(f"{prefix} STEP {step}: {name} | {details}")
    logger.info(
        f"{prefix} RESULT classification={request.classification} confidence={request.confidence} "
        f"page_state={request.page_state} source={request.extraction_source} title={request.title!r} "
        f"company={request.company!r} description_length={request.description_length} "
        f"validation={request.validation} signals={request.signals} content_hash={request.content_hash}"
    )
    logger.info(f"{prefix} END")
    return {"success": True, "request_id": request.request_id}

@router.post("/extract")
async def extract_job_details(
    request: JobExtractRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: JobRepository = Depends(get_job_repository),
    conn = Depends(get_db_connection)
):
    clean_jd = request.jd_text.strip()
    if not clean_jd:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Job text cannot be empty."
        )
    if request.classification in {"non_job", "uncertain"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "JOB_CLASSIFICATION_REQUIRED", "message": "Only a verified job listing or manually supplied JD can be tailored."}
        )
    word_count = len(clean_jd.split())
    job_sections = sum(marker in clean_jd.lower() for marker in (
        "responsibilities", "requirements", "qualifications", "about the role", "about the job", "experience", "skills"
    ))
    if len(clean_jd) < 300 or word_count < 50 or (request.classification != "manual" and job_sections < 1):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_JOB_DESCRIPTION", "message": "A meaningful job title and complete job description are required."}
        )
    if not request.page_title.strip() or request.page_title.strip().lower() in {"jobs", "careers", "search jobs", "software engineer"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "INVALID_JOB_TITLE", "message": "A meaningful job title is required before tailoring."}
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
            metadata={"url": request.url, "page_title": request.page_title, "content_hash": request.content_hash}
        )
        usage_consumed = True

        AnalyticsService(conn).emit_event(
            user_id=user["id"],
            event_type="JD_EXTRACTION_STARTED",
            metadata={"text_length": len(request.jd_text), "classification": request.classification, "detection_confidence": request.detection_confidence, "extraction_method": request.extraction_method}
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
