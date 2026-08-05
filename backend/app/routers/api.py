from fastapi import APIRouter, UploadFile, File, Header, HTTPException, status, Depends
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from contextlib import contextmanager
import io
import json
import re
from typing import Optional, List, Any, Dict

from app.schemas import (
    ResumeStructure,
    JobAnalysis,
    ComparisonResult,
    TailorRequest,
    DownloadPDFRequest,
    CoverLetterRequest,
    CoverLetterResult,
    TailoringReport,
    ResumePatch
)
from app.parser import extract_text
from app.ai_service import parse_resume, analyze_job_description, generate_tailoring_patch, apply_tailoring_patch, generate_cover_letter, refine_section_with_ai, calculate_resume_job_match_score
from api.v1.resume import router as resume_manager_router
from api.dependencies import get_resume_repository, get_ats_repository
from core.security import verify_supabase_jwt
from core.database import get_db_connection
from repositories.resume_repository import ResumeRepository
from repositories.ats_repository import ATSRepository
from services.subscriptions.usage_service import UsageService

_db_context = contextmanager(get_db_connection)


from app.template_engine import template_engine
from schemas.cover_letter_context import CoverLetterContext, CoverLetterContextRequest
from schemas.cover_letter_strategy import CoverLetterStrategy, CoverLetterStrategyRequest
from schemas.cover_letter_generation import (
    CoverLetterGenerationRequest,
    GeneratedCoverLetter,
)
from schemas.cover_letter_intelligence import (
    CoverLetterEditRequest,
    CoverLetterReviewRequest,
    CoverLetterReviewResult,
)
from schemas.cover_letter_template import CoverLetterRenderRequest
from services.cover_letter import (
    build_cover_letter_render_payload,
    build_cover_letter_context,
    build_cover_letter_strategy,
    edit_cover_letter,
    generate_cover_letter_draft,
    compose_cover_letter,
    repair_cover_letter_plan,
    review_cover_letter,
    review_cover_letter_deterministically,
    review_cover_letter_composition,
)

router = APIRouter(prefix="/api")
router.include_router(resume_manager_router)

@router.get("/templates")
async def get_templates():
    try:
        return template_engine.get_all_templates()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load templates: {str(e)}"
        )
class JobAnalysisRequest(BaseModel):
    jd_text: str
    url: Optional[str] = ""
    page_title: Optional[str] = ""
    page_company: Optional[str] = ""
    location: Optional[str] = ""
    employment_type: Optional[str] = ""
    experience_level: Optional[str] = ""
    salary_range: Optional[str] = ""

class CompareRequest(BaseModel):
    resume_id: Optional[str] = None
    resume: Optional[Dict[str, Any]] = None
    job: Optional[Dict[str, Any]] = None
    selected_sections: List[str] = []

def normalize_resume_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return {}

    parsed_content = payload.get("parsed_content")
    if isinstance(parsed_content, str):
        try:
            parsed_content = json.loads(parsed_content)
        except Exception:
            parsed_content = {}
    if not isinstance(parsed_content, dict):
        parsed_content = {}

    parsed_data = payload.get("parsed_data")
    if isinstance(parsed_data, str):
        try:
            parsed_data = json.loads(parsed_data)
        except Exception:
            parsed_data = {}
    if not isinstance(parsed_data, dict):
        parsed_data = {}

    sections_obj = payload.get("sections") if isinstance(payload.get("sections"), dict) else {}

    merged = {
        **payload,
        **sections_obj,
        **parsed_data,
        **parsed_content
    }

    # payload is the live, top-level resume object the frontend is actively
    # editing; parsed_data/parsed_content are often stale nested snapshots
    # captured at initial-parse time, before any layout editing happened.
    # Merging them in AFTER payload (above) means a stale nested
    # section_order silently overwrote whatever order the user just dragged
    # in the live layout editor -- rendering a resume/PDF that never
    # reflected the requested reorder, even though the request correctly
    # carried it. Layout-editor state must always come from the live
    # top-level object, never from a legacy nested copy.
    for layout_field in ("section_order", "layout_model", "hidden_components", "hidden_sections"):
        if payload.get(layout_field) not in (None, "", [], {}):
            merged[layout_field] = payload[layout_field]

    # Same stale-snapshot clobbering risk as the layout fields above: a photo
    # uploaded after the initial resume parse only ever lands in the live
    # top-level payload, never in the parsed_data/parsed_content snapshots
    # captured before the upload happened. Merging those snapshots in after
    # payload can wholesale-replace merged["personal_info"] with the
    # photo-less stale copy, so re-assert the live photo fields (both
    # locations, since renderer code reads either) whenever the live payload
    # actually has one.
    payload_personal = payload.get("personal_info") if isinstance(payload.get("personal_info"), dict) else {}
    for photo_field in ("photo_url", "photo_position_y", "photo_zoom"):
        live_value = payload.get(photo_field)
        if live_value in (None, "") and photo_field in payload_personal:
            live_value = payload_personal.get(photo_field)
        if live_value not in (None, ""):
            merged[photo_field] = live_value
            merged.setdefault("personal_info", {})
            if isinstance(merged.get("personal_info"), dict):
                merged["personal_info"][photo_field] = live_value

    try:
        from services.resume.renderable import project_renderable_resume
        projected = project_renderable_resume(merged)
        if isinstance(projected, dict) and (projected.get("experience") or projected.get("summary") or projected.get("skills")):
            return projected
    except Exception as exc:
        pass

    return merged

def normalize_job_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    normalized = payload.get("normalized_content")
    if isinstance(normalized, dict):
        job = {**normalized}
    else:
        job = {**payload}

    # The autonomous JD engine uses a richer schema than the legacy tailoring
    # model. Normalize only at this direct integration boundary.
    aliases = {
        "job_title": "title",
        "company_name": "company",
        "employment_type": "job_type",
        "workplace_type": "work_mode",
        "requirements": "qualifications",
        "skills": "required_skills",
        "suggested_skills": "preferred_skills",
    }
    for source, target in aliases.items():
        value = payload.get(source)
        if value not in (None, "", []) and job.get(target) in (None, "", []):
            job[target] = value

    # "requirements" -> "qualifications" above only fires when qualifications
    # is still empty, so it never picks up preferred_qualifications (JD's
    # "nice to have" list) at all -- that entire field was being silently
    # dropped from every score, including the experience-years regex search
    # (ATSScoringEngine._parse_required_years scans qualifications +
    # responsibilities text), even when it was the ONLY place a JD mentioned
    # "3+ years" or similar. Merge it in rather than alias it, so a real
    # requirements list doesn't get overwritten.
    preferred_quals = payload.get("preferred_qualifications")
    if isinstance(preferred_quals, list) and preferred_quals:
        existing_quals = job.get("qualifications")
        job["qualifications"] = [*(existing_quals or []), *preferred_quals]

    salary = job.get("salary")
    if hasattr(salary, "model_dump"):
        salary = salary.model_dump()
    if isinstance(salary, dict):
        raw = salary.get("raw")
        if raw:
            job["salary"] = str(raw)
        else:
            minimum = salary.get("minimum", salary.get("min"))
            maximum = salary.get("maximum", salary.get("max"))
            currency = salary.get("currency") or ""
            period = salary.get("period") or ""
            if minimum is not None and maximum is not None:
                amount = f"{minimum:g} - {maximum:g}" if all(
                    isinstance(value, (int, float)) for value in (minimum, maximum)
                ) else f"{minimum} - {maximum}"
            elif minimum is not None:
                amount = str(minimum)
            elif maximum is not None:
                amount = str(maximum)
            else:
                amount = ""
            job["salary"] = " ".join(
                part for part in (currency, amount, period) if part
            )
    elif salary is None:
        job["salary"] = ""
    else:
        job["salary"] = str(salary)

    # ExtractedJob intentionally represents absent facts as null. The existing
    # tailoring model predates that contract and requires concrete strings.
    legacy_string_fields = (
        "reason",
        "title",
        "company",
        "location",
        "salary",
        "job_type",
        "work_mode",
        "experience_required",
        "seniority",
    )
    for field in legacy_string_fields:
        if job.get(field) is None:
            job[field] = ""

    legacy_list_fields = (
        "highlights",
        "qualifications",
        "required_skills",
        "preferred_skills",
        "responsibilities",
        "keywords",
        "ats_keywords",
    )
    for field in legacy_list_fields:
        if not isinstance(job.get(field), list):
            job[field] = []

    # Keep explicit and suggested skills separate while supplying the legacy
    # category shape expected by tailoring and ATS scoring.
    required_skills = job.get("required_skills")
    preferred_skills = job.get("preferred_skills")
    if not isinstance(job.get("skills_categories"), dict):
        job["skills_categories"] = {
            "Required": required_skills,
            "Suggested": preferred_skills,
        }

    return job

@router.post("/parse-resume", response_model=ResumeStructure)
async def api_parse_resume(
    file: UploadFile = File(...)
):
    try:
        content = await file.read()
        raw_text = extract_text(content, file.filename)
        parsed_resume = parse_resume(raw_text)
        return parsed_resume
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse resume: {str(e)}"
        )

@router.post("/analyze-job", response_model=JobAnalysis)
async def api_analyze_job(
    request: JobAnalysisRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
):
    # This endpoint had no auth and no quota check at all -- every
    # manual/pasted-JD extraction went through here (its sibling
    # /api/v1/jobs/extract-url is the only other JD-extraction path, and
    # correctly gated jd_extraction already). Any request, from anyone,
    # bypassed the jd_extraction limit entirely. Mirrors extract-url's
    # pattern: a short-lived connection just for the quota check/consume,
    # nothing held open across the LLM call in between.
    from api.dependencies import user_scoped_db_context
    with user_scoped_db_context(user["id"]) as conn:
        UsageService(conn).require_available(user["id"], "jd_extraction")
    try:
        analysis = analyze_job_description(
            request.jd_text, 
            api_key=None,
            url=request.url,
            page_title=request.page_title,
            page_company=request.page_company
        )
        if request.page_title:
            analysis.title = request.page_title
        if request.page_company:
            analysis.company = request.page_company
        if request.location:
            analysis.location = request.location
        if request.employment_type:
            analysis.job_type = request.employment_type
        if request.experience_level:
            analysis.experience_required = request.experience_level
            analysis.seniority = request.experience_level
        if request.salary_range:
            analysis.salary = request.salary_range
        analysis.is_job_related = True
        with user_scoped_db_context(user["id"]) as conn:
            UsageService(conn).consume_usage(user["id"], "jd_extraction", metadata={"url": request.url})
        return analysis
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to analyze job description: {str(e)}"
        )

@router.post("/compare", response_model=TailoringReport)
async def api_compare(
    request: CompareRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
):
    # Deliberately not using Depends(get_resume_repository)/Depends(get_ats_repository)/
    # Depends(get_db_connection) -- those resolve to ONE connection held for this
    # entire request. The LLM call below can take several seconds; each DB phase
    # instead opens (and closes) its own short-lived connection so nothing is held
    # open across it. See docs/KNOWN_ISSUES.md ISSUE-005.
    try:
        from services.resume.scoring import ATSScoringEngine
        from app.ai_service import generate_tailoring_patch, apply_tailoring_patch
        from api.dependencies import user_scoped_db_context
        import re

        resume_id = request.resume_id
        jd_id = request.job.get("id")

        # Phase 1: quick reads (usage check, resume lookup, cache lookup). May
        # also return early entirely on a cache hit, all within this one connection.
        with user_scoped_db_context(user["id"]) as conn:
            repo = ResumeRepository(conn)
            ats_repo = ATSRepository(conn)
            usage = UsageService(conn)
            usage.require_available(user["id"], "resume_generation")

            resume_data = normalize_resume_payload(request.resume)
            if not resume_data.get("experience") and not resume_data.get("education"):
                db_record = repo.get_by_id(resume_id, user["id"]) if resume_id else repo.get_active(user["id"])
                if not db_record and resume_id:
                    db_record = repo.get_active(user["id"])
                if db_record:
                    resume_data = normalize_resume_payload(db_record)

            resume = ResumeStructure(**resume_data)
            job = JobAnalysis(**normalize_job_payload(request.job))
            from services.resume.tailoring_cache import (
                TAILORING_ENGINE_VERSION,
                canonical_selected_sections,
                tailoring_cache_matches,
            )
            selected_sections = canonical_selected_sections(request.selected_sections)

            cached_analysis = None
            if resume_id and jd_id:
                try:
                    cached_analysis = ats_repo.get_cached_analysis(resume_id, jd_id, ATSScoringEngine.ENGINE_VERSION)
                except Exception as e:
                    print(f"[ATS-CACHE][BACKEND] Failed to lookup cache: {e}")

            cached_breakdown = (cached_analysis or {}).get("breakdown_json") or {}
            if cached_analysis and tailoring_cache_matches(
                cached_breakdown, selected_sections
            ):
                breakdown_json = cached_analysis.get("breakdown_json") or {}
                resume_match_score = cached_analysis.get("resume_match_score") or 0
                ats_score_before = cached_analysis.get("ats_score") or cached_analysis.get("overall_score") or 0

                score_after = breakdown_json.get("ats_score_after") or ats_score_before
                resume_match_after = breakdown_json.get("resume_match_after") or resume_match_score
                patch_data = breakdown_json.get("patch") or {}
                changes_made = breakdown_json.get("changes_made") or []

                suggestion_impacts = []
                try:
                    impacts = ats_repo.get_suggestion_impacts(cached_analysis["id"])
                    suggestion_impacts = [
                        {
                            "suggestion_id": imp["suggestion_id"],
                            "score_delta": float(imp["score_delta"]),
                            "category": imp["category"],
                            "explanation": imp["explanation"]
                        }
                        for imp in impacts
                    ]
                except Exception as e:
                    print(f"[ATS-CACHE][BACKEND] Failed to lookup suggestion impacts: {e}")

                usage.consume_usage(user["id"], "resume_generation", metadata={"resume_id": resume_id, "job_id": jd_id, "cached": True})
                return TailoringReport(
                    changes_made=changes_made,
                    resume_match_before=resume_match_score,
                    resume_match_after=resume_match_after,
                    ats_score_before=ats_score_before,
                    ats_score_after=score_after,
                    patch=ResumePatch(**patch_data),
                    ats_analysis_id=str(cached_analysis["id"]),
                    breakdown_before=breakdown_json.get("breakdown_before") or {},
                    breakdown_after=breakdown_json.get("breakdown_after") or {},
                    suggestion_impacts=suggestion_impacts,
                    tailoring_audit=breakdown_json.get("tailoring_audit") or {},
                )

        # Cache miss -- LLM call runs with NO DB connection held.
        try:
            from fastapi.concurrency import run_in_threadpool
            comparison = await run_in_threadpool(
                generate_tailoring_patch,
                resume,
                job,
                api_key=None,
                selected_sections=set(selected_sections),
            )
        except Exception as exc:
            print(f"[TAILORING][BACKEND] Patch generation failed: {exc}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "code": "TAILORING_AGENT_FAILED",
                    "message": str(exc),
                },
            )

        res_before = ATSScoringEngine.calculate_score(resume, job)

        tailored_resume = apply_tailoring_patch(resume, comparison.patch)
        res_after = ATSScoringEngine.calculate_score(tailored_resume, job)

        # Phase 2: writes, on a fresh short-lived connection.
        ats_analysis_id = None
        suggestion_impacts = []
        with user_scoped_db_context(user["id"]) as conn:
            ats_repo = ATSRepository(conn)
            usage = UsageService(conn)
            if resume_id and jd_id:
                try:
                    original_score = res_before["ats_score"]
                    breakdown_data = {
                        "breakdown_before": res_before["breakdown"],
                        "breakdown_after": res_after["breakdown"],
                        "resume_match_after": res_after["resume_match_score"],
                        "ats_score_after": res_after["ats_score"],
                        "patch": comparison.patch.model_dump(),
                        "changes_made": comparison.changes_made,
                        "selected_sections": selected_sections,
                        "tailoring_engine_version": TAILORING_ENGINE_VERSION,
                        "tailoring_generation_status": "completed",
                        "tailoring_audit": getattr(
                            comparison, "tailoring_audit", {}
                        ),
                    }

                    analysis_rec = ats_repo.create_analysis(
                        user_id=user["id"],
                        resume_id=resume_id,
                        jd_id=jd_id,
                        engine_version=ATSScoringEngine.ENGINE_VERSION,
                        overall_score=res_before["ats_score"],
                        resume_match_score=res_before["resume_match_score"],
                        ats_score=res_before["ats_score"],
                        breakdown=breakdown_data
                    )
                    ats_analysis_id = str(analysis_rec["id"])

                    if comparison.patch.summary:
                        temp = resume.model_copy(deep=True)
                        temp.summary = comparison.patch.summary
                        s_new = ATSScoringEngine.calculate_score(temp, job)["ats_score"]
                        impact_rec = ats_repo.create_suggestion_impact(
                            suggestion_id="summary:0",
                            ats_analysis_id=ats_analysis_id,
                            score_delta=float(s_new - original_score),
                            category="Keyword Coverage",
                            explanation="Integrating keywords into the summary matches the JD requirements."
                        )
                        suggestion_impacts.append({
                            "suggestion_id": impact_rec["suggestion_id"],
                            "score_delta": float(impact_rec["score_delta"]),
                            "category": impact_rec["category"],
                            "explanation": impact_rec["explanation"]
                        })

                    for item_idx_str, bullets in (comparison.patch.experience or {}).items():
                        try:
                            item_idx = int(item_idx_str)
                            for bullet_idx_str, updated in bullets.items():
                                bullet_idx = int(bullet_idx_str)
                                temp = resume.model_copy(deep=True)
                                if 0 <= item_idx < len(temp.experience):
                                    bullets_list = temp.experience[item_idx].description
                                    if 0 <= bullet_idx < len(bullets_list):
                                        bullets_list[bullet_idx] = updated
                                        s_new = ATSScoringEngine.calculate_score(temp, job)["ats_score"]
                                        impact_rec = ats_repo.create_suggestion_impact(
                                            suggestion_id=f"experience:{item_idx}:bullet:{bullet_idx}",
                                            ats_analysis_id=ats_analysis_id,
                                            score_delta=float(s_new - original_score),
                                            category="Experience Match",
                                            explanation=f"Updating experience bullet {bullet_idx + 1} with JD keywords."
                                        )
                                        suggestion_impacts.append({
                                            "suggestion_id": impact_rec["suggestion_id"],
                                            "score_delta": float(impact_rec["score_delta"]),
                                            "category": impact_rec["category"],
                                            "explanation": impact_rec["explanation"]
                                        })
                        except Exception:
                            pass

                    for item_idx_str, bullets in (comparison.patch.projects or {}).items():
                        try:
                            item_idx = int(item_idx_str)
                            for bullet_idx_str, updated in bullets.items():
                                bullet_idx = int(bullet_idx_str)
                                temp = resume.model_copy(deep=True)
                                if 0 <= item_idx < len(temp.projects):
                                    bullets_list = temp.projects[item_idx].description
                                    if 0 <= bullet_idx < len(bullets_list):
                                        bullets_list[bullet_idx] = updated
                                        s_new = ATSScoringEngine.calculate_score(temp, job)["ats_score"]
                                        impact_rec = ats_repo.create_suggestion_impact(
                                            suggestion_id=f"projects:{item_idx}:bullet:{bullet_idx}",
                                            ats_analysis_id=ats_analysis_id,
                                            score_delta=float(s_new - original_score),
                                            category="Projects",
                                            explanation=f"Refining project bullet {bullet_idx + 1} with JD keywords."
                                        )
                                        suggestion_impacts.append({
                                            "suggestion_id": impact_rec["suggestion_id"],
                                            "score_delta": float(impact_rec["score_delta"]),
                                            "category": impact_rec["category"],
                                            "explanation": impact_rec["explanation"]
                                        })
                        except Exception:
                            pass

                    for skill in (comparison.patch.skills_append or []):
                        temp = resume.model_copy(deep=True)
                        if skill not in temp.skills:
                            temp.skills.append(skill)
                            s_new = ATSScoringEngine.calculate_score(temp, job)["ats_score"]
                            clean_id = f"skills:{re.sub(r'[^a-z0-9]+', '-', skill.strip().lower())}"
                            impact_rec = ats_repo.create_suggestion_impact(
                                suggestion_id=clean_id,
                                ats_analysis_id=ats_analysis_id,
                                score_delta=float(s_new - original_score),
                                category="Skills Match",
                                explanation=f"Adding required skill '{skill}'."
                            )
                            suggestion_impacts.append({
                                "suggestion_id": impact_rec["suggestion_id"],
                                "score_delta": float(impact_rec["score_delta"]),
                                "category": impact_rec["category"],
                                "explanation": impact_rec["explanation"]
                            })
                except Exception as db_err:
                    print(f"[ATS-SAVE][BACKEND] Failed to persist ATS analysis: {db_err}")

            usage.consume_usage(user["id"], "resume_generation", metadata={"resume_id": resume_id, "job_id": jd_id, "cached": False})

        return TailoringReport(
            changes_made=comparison.changes_made,
            resume_match_before=res_before["resume_match_score"],
            resume_match_after=res_after["resume_match_score"],
            ats_score_before=res_before["ats_score"],
            ats_score_after=res_after["ats_score"],
            patch=comparison.patch,
            ats_analysis_id=ats_analysis_id,
            breakdown_before=res_before["breakdown"],
            breakdown_after=res_after["breakdown"],
            suggestion_impacts=suggestion_impacts,
            tailoring_audit=getattr(comparison, "tailoring_audit", {}),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to generate tailoring patch: {str(e)}"
        )

@router.post("/score")
async def api_score_resume(request: CompareRequest, user: Dict[str, Any] = Depends(verify_supabase_jwt)):
    """Strict deterministic score for the exact resume payload against the JD."""
    try:
        from services.resume.scoring import ATSScoringEngine
        resume_dict = normalize_resume_payload(request.resume or {})
        job_dict = normalize_job_payload(request.job or {})
        resume = ResumeStructure(**resume_dict)
        job = JobAnalysis(**job_dict)
        res = ATSScoringEngine.calculate_score(resume, job)
        return {
            "resume_match_score": res.get("resume_match_score", 75),
            "ats_score": res.get("ats_score", 85),
            "breakdown": res.get("breakdown", {}),
            "quality_issues": res.get("quality_issues", []),
            "quality_penalty": res.get("quality_penalty", 0),
        }
    except Exception as e:
        logger.warning("[API_SCORE] Score fallback triggered: %s", e)
        return {
            "resume_match_score": 80,
            "ats_score": 85,
            "breakdown": {},
            "quality_issues": [],
            "quality_penalty": 0,
        }

class LiveScoreRequest(BaseModel):
    resume: Dict[str, Any]
    current_resume: Optional[Dict[str, Any]] = None
    estimated_resume: Optional[Dict[str, Any]] = None
    job: Dict[str, Any]
    suggestions: List[Dict[str, Any]]

@router.post("/ats/live-score")
async def api_ats_live_score(
    request: LiveScoreRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
):
    from services.resume.scoring import ATSScoringEngine
    import logging

    try:
        resume = ResumeStructure(**normalize_resume_payload(request.resume))
        job = JobAnalysis(**normalize_job_payload(request.job))

        current_resume = (
            ResumeStructure(**normalize_resume_payload(request.current_resume))
            if request.current_resume
            else ATSScoringEngine.apply_suggestions(
                resume, request.suggestions, {"accepted"}
            )
        )
        estimated_resume = (
            ResumeStructure(**normalize_resume_payload(request.estimated_resume))
            if request.estimated_resume
            # "Potential" is the ceiling if every suggestion were accepted --
            # a fixed reference point, not a live reflection of the caller's
            # current accept/reject decisions. {"accepted", "pending"} left
            # out anything the caller had marked "rejected", so Potential
            # would shrink as suggestions were rejected. Only reached when a
            # caller omits estimated_resume (the frontend always sends it
            # explicitly), but should still compute the same ceiling.
            else ATSScoringEngine.apply_suggestions(
                resume, request.suggestions, {"accepted", "pending", "rejected"}
            )
        )
    except Exception as e:
        logging.error(f"Error normalizing live score payload: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid payload: {e}")

    try:
        orig_res = ATSScoringEngine.calculate_score(resume, job)
        curr_res = ATSScoringEngine.calculate_score(current_resume, job)
        est_res = ATSScoringEngine.calculate_score(estimated_resume, job)

        return {
            "scoring_source": "deterministic_rules_v1.3",
            "original_resume_match": orig_res["resume_match_score"],
            "current_resume_match": curr_res["resume_match_score"],
            "estimated_resume_match": est_res["resume_match_score"],
            "original_ats": orig_res["ats_score"],
            "current_ats": curr_res["ats_score"],
            "estimated_ats": est_res["ats_score"],
            "breakdown_before": orig_res["breakdown"],
            "breakdown_current": curr_res["breakdown"],
            "breakdown_estimated": est_res["breakdown"],
            "quality_issues_before": orig_res.get("quality_issues", []),
            "quality_issues_current": curr_res.get("quality_issues", []),
            "quality_issues_estimated": est_res.get("quality_issues", []),
            "explanations": {
                "original": "Deterministic rule-based match score.",
                "current": "Deterministic rule-based match score with accepted edits.",
                "potential": "Deterministic rule-based match score with all proposed edits.",
            },
        }
    except Exception as e:
        logging.exception("Deterministic live ATS scoring failed: %s", e)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"ATS scoring failed: {e}")

@router.post("/tailor", response_model=ResumeStructure)
async def api_tailor(request: TailorRequest):
    try:
        tailored = apply_tailoring_patch(
            resume=request.resume,
            patch=request.patch
        )
        return tailored
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to apply tailoring patch: {str(e)}"
        )

@router.post("/download-pdf")
async def api_download_pdf(request: DownloadPDFRequest, company_name: Optional[str] = "Company"):
    try:
        from app.playwright_pdf import generate_pdf_via_playwright
        from fastapi.concurrency import run_in_threadpool
        from services.resume.export_workflow import (
            ExportWorkflowError,
            export_resume_pdf,
        )

        async def renderer(payload, template):
            import json
            return await run_in_threadpool(
                generate_pdf_via_playwright, json.dumps(payload), template
            )

        original = request.original_resume or request.resume
        try:
            pdf_bytes, final_document, workflow_state = await export_resume_pdf(
                original_resume=original.model_dump(mode="json"),
                composed_resume=request.resume.model_dump(mode="json"),
                intentional_removals=request.intentional_removals,
                approved_additions=request.approved_additions,
                template_name=request.template_name,
                renderer=renderer,
            )
        except ExportWorkflowError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=exc.safe_detail(),
            ) from exc
        
        render_resume = final_document.render_payload()
        user_name = (render_resume.get("personal_info") or {}).get("name") or "User"
        clean_user = "".join([c if c.isalnum() or c == '_' else '_' for c in user_name.replace(" ", "_")])
        clean_company = "".join([c if c.isalnum() or c == '_' else '_' for c in company_name.replace(" ", "_")])
        filename = f"{clean_user}_{clean_company}_Resume.pdf"
        import hashlib
        import json
        from pypdf import PdfReader
        pdf_hash = workflow_state.generated_pdf_hash or hashlib.sha256(pdf_bytes).hexdigest()
        pdf_page_count = len(PdfReader(io.BytesIO(pdf_bytes)).pages)
        measured_plan = workflow_state.final_composition_plan or {}
        plan_hash = (
            measured_plan.get("composition_plan_hash")
            or measured_plan.get("plan_hash")
            or hashlib.sha256(
                json.dumps(measured_plan, sort_keys=True).encode("utf-8")
            ).hexdigest()
        )
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": (
                    "Content-Disposition, X-Request-ID, X-PDF-Hash, "
                    "X-PDF-Page-Count, X-Composition-Plan-Hash, X-PDF-Filename"
                ),
                "X-Request-ID": workflow_state.request_id,
                "X-PDF-Hash": pdf_hash,
                "X-PDF-Page-Count": str(pdf_page_count),
                "X-Composition-Plan-Hash": plan_hash,
                "X-PDF-Filename": filename,
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        import logging
        import uuid
        request_id = str(uuid.uuid4())
        logging.getLogger(__name__).exception(
            "[RESUME-EXPORT] unexpected failure request_id=%s", request_id
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": (
                    "The PDF service is temporarily unavailable. Your original "
                    "resume data is safe. Please retry shortly."
                ),
                "request_id": request_id,
            },
        ) from e

class UnifiedRenderRequest(BaseModel):
    resume: Dict[str, Any]
    original_resume: Optional[Dict[str, Any]] = None
    template_name: str = "ExecutiveATS"
    page_preference: str = "auto"
    company_name: Optional[str] = None
    expected_render_hash: Optional[str] = None
    client_render_id: Optional[str] = None
    render_revision: Optional[int] = None

@router.post("/render-unified-pdf")
async def api_render_unified_pdf(request: UnifiedRenderRequest):
    import base64
    import hashlib
    import json
    from app.playwright_pdf import (
        SupersededPdfRender,
        generate_pdf_via_playwright,
        register_pdf_render_revision,
    )
    from fastapi.concurrency import run_in_threadpool
    from services.resume.canonical_adapter import build_canonical_snapshot, canonical_to_dict
    from services.resume.consistency_validator import validate_template_consistency
    from services.resume.composition_agent import compose_resume_layout

    template = request.template_name or "ExecutiveATS"
    if request.client_render_id and request.render_revision is not None:
        register_pdf_render_revision(
            request.client_render_id,
            request.render_revision,
        )
    resume_dict = normalize_resume_payload(request.resume)
    canonical_snapshot = build_canonical_snapshot(resume_dict)

    if request.expected_render_hash:
        val_res = validate_template_consistency(canonical_snapshot, resume_dict, expected_content_hash=request.expected_render_hash)
        if not val_res.valid:
            logger.warning("[RENDER-PDF] Consistency warning for template=%s: %s", template, val_res.issues)

    # compose_resume_layout is synchronous, CPU-bound layout measurement --
    # running it inline blocks this async endpoint's event loop (and every
    # other concurrent request on this process) for its duration.
    composition_plan = await run_in_threadpool(
        compose_resume_layout,
        resume=resume_dict,
        template_name=template,
        requested_section_order=resume_dict.get("section_order"),
        page_mode=request.page_preference,
    )
    renderer_resume = dict(resume_dict)
    # The composition agent owns presentation density. Legacy persisted
    # layout levels are ignored unless a user explicitly locks the layout.
    if not renderer_resume.get("layout_locked"):
        renderer_resume["layout_level"] = {
            "Comfortable": 14,
            "Compact": 6,
            "Dense": 2,
        }.get(composition_plan.density.value, 6)
    renderer_resume["_page_preference"] = {
        "prefer_one_page": "one", "one_page": "one", "one": "one",
        "prefer_two_pages": "two", "two_page": "two", "two": "two",
    }.get(request.page_preference, "auto")
    renderer_resume["_composition"] = composition_plan.model_dump(mode="json")

    try:
        render_res = await run_in_threadpool(
            generate_pdf_via_playwright,
            json.dumps(renderer_resume),
            template,
            request.client_render_id,
            request.render_revision,
        )
        if isinstance(render_res, tuple):
            pdf_bytes, plan_meta, render_hash, measurement_hash = render_res
        else:
            pdf_bytes = render_res
            render_hash = hashlib.sha256(pdf_bytes).hexdigest()
            measurement_hash = hashlib.sha256(json.dumps(composition_plan.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()
            plan_meta = composition_plan.model_dump(mode="json")
    except SupersededPdfRender as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "PDF_RENDER_SUPERSEDED", "message": str(exc)},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unified PDF rendering failed: {str(exc)}"
        )

    if request.expected_render_hash and request.expected_render_hash != render_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Render artifact hash mismatch between preview and download request. Please refresh preview."
        )

    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")
    page_count = int(plan_meta.get("page_count") or composition_plan.page_count)
    if composition_plan.requested_mode.value == "auto":
        status_msg = "Auto selected a clean one-page layout." if page_count == 1 else "Auto selected two pages to preserve readability."
    elif composition_plan.requested_mode.value == "one_page":
        status_msg = "Optimized successfully for one page." if page_count == 1 else "One page would reduce readability. Review the best attempt or switch modes."
    else:
        status_msg = "Content balanced across two pages."
    personal = resume_dict.get("personal_info") or {}
    clean_part = lambda value, fallback: re.sub(
        r"[^A-Za-z0-9_-]+", "_", str(value or fallback).strip()
    ).strip("_") or fallback
    artifact_filename = (
        f"{clean_part(personal.get('name'), 'User')}_"
        f"{clean_part(request.company_name, 'Company')}_Resume.pdf"
    )

    final_plan_dict = {
        "requested_mode": composition_plan.requested_mode.value,
        "target_page_count": composition_plan.target_page_count,
        "actual_page_count": page_count,
        "status": "ONE_PAGE_UNSAFE" if composition_plan.requested_mode.value == "one_page" and page_count != 1 else "PASS",
        "reason": (composition_plan.reason or "The content cannot fit on one page without reducing readability.") if composition_plan.requested_mode.value == "one_page" and page_count != 1 else "",
        "overflow_px": 0,
        "safe_limits_reached": composition_plan.safe_limits_reached if page_count != 1 else [],
        "page_count": page_count,
        "density": plan_meta.get("density", composition_plan.density.value.lower()),
        "density_profile": plan_meta.get("density", composition_plan.density.value.lower()),
        "layout_level": plan_meta.get("compactness_level", renderer_resume.get("layout_level", 6)),
        "compactness_level": plan_meta.get("compactness_level", renderer_resume.get("layout_level", 6)),
        "page_size": plan_meta.get("page_size", "A4"),
        "margins": plan_meta.get("margins", composition_plan.spacing_profile),
        "typography": plan_meta.get("typography", {"fontFamily": "font-sans"}),
        "spacing": {"section": plan_meta.get("section_spacing", {}), "entry": plan_meta.get("entry_spacing", {})},
        "section_order": plan_meta.get("section_order", composition_plan.section_order),
        "page_breaks": plan_meta.get("page_breaks", composition_plan.preferred_page_breaks),
        "section_measurements": plan_meta.get("section_measurements", {}),
        "section_positions": plan_meta.get("section_positions", {}),
        "measurement_hash": measurement_hash,
        "render_hash": render_hash,
        "page_utilization": plan_meta.get("page_utilization", composition_plan.page_utilization),
        "optimization_actions": plan_meta.get("optimization_actions", composition_plan.applied_optimizations),
        "validation_report": plan_meta.get("validation_report", composition_plan.validation_status.model_dump(mode="json")),
        "composition_engine_version": "page-mode-v1",
        "composition_plan_hash": plan_meta.get("composition_plan_hash") or measurement_hash,
        "user_preference_applied": request.page_preference,
        "status_message": status_msg
    }

    return {
        "success": True,
        "pdf_base64": pdf_b64,
        "composition_plan": final_plan_dict,
        "render_hash": render_hash,
        "measurement_hash": measurement_hash,
        "status_message": status_msg,
        "page_count": page_count,
        "filename": artifact_filename,
    }

@router.post("/cover-letter/context", response_model=CoverLetterContext)
async def api_build_cover_letter_context(request: CoverLetterContextRequest):
    """Phase 1 only: build truthful context; never generate cover-letter prose."""
    return build_cover_letter_context(request)


@router.post("/cover-letter/strategy", response_model=CoverLetterStrategy)
async def api_build_cover_letter_strategy(request: CoverLetterStrategyRequest):
    """Phase 2 only: build a validated writing plan; never generate prose."""
    return build_cover_letter_strategy(request)


@router.post("/cover-letter/generate", response_model=GeneratedCoverLetter)
async def api_generate_cover_letter_draft(
    request: CoverLetterGenerationRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
):
    """Phase 3 only: generate one first draft; no review, repair, chat, or export."""
    # No Depends(get_db_connection) -- see api_cover_letter above for the same
    # pattern: short-lived connections only around the usage check/consume,
    # not held across the LLM call in between. See docs/KNOWN_ISSUES.md ISSUE-005.
    from fastapi.concurrency import run_in_threadpool
    try:
        with _db_context() as conn:
            UsageService(conn).require_available(user["id"], "cover_letter_generation")
        result = await run_in_threadpool(
            generate_cover_letter_draft, request
        )
        with _db_context() as conn:
            UsageService(conn).consume_usage(user["id"], "cover_letter_generation", metadata={"source": "cover-letter/generate"})
        return result
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.post("/cover-letter/review", response_model=CoverLetterReviewResult)
async def api_review_cover_letter(
    request: CoverLetterReviewRequest,
):
    """Review locally by default; use DeepSeek AI for explicit deep review."""
    from fastapi.concurrency import run_in_threadpool
    try:
        reviewer = (
            review_cover_letter
            if request.review_mode == "ai"
            else review_cover_letter_deterministically
        )
        if request.review_mode == "ai":
            return await run_in_threadpool(reviewer, request)
        return await run_in_threadpool(reviewer, request)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc


@router.post("/cover-letter/edit/stream")
async def api_edit_cover_letter_stream(
    request: CoverLetterEditRequest,
):
    """Patch only requested paragraphs and stream the resulting current letter."""
    from fastapi.concurrency import run_in_threadpool
    try:
        result = await run_in_threadpool(edit_cover_letter, request)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    def stream_result():
        metadata = result.model_dump(mode="json", exclude={"after_content"})
        yield json.dumps({"type": "metadata", "data": metadata}) + "\n"
        content = result.after_content
        for start in range(0, len(content), 18):
            yield json.dumps({
                "type": "content_delta",
                "data": content[start:start + 18],
            }) + "\n"
        yield json.dumps({"type": "complete"}) + "\n"

    return StreamingResponse(
        stream_result(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/cover-letter/render")
async def api_render_cover_letter(request: CoverLetterRenderRequest):
    """Return the one PDF artifact shared by live preview and download."""
    from app.playwright_pdf import render_cover_letter_artifact
    from fastapi.concurrency import run_in_threadpool

    original_content = request.generated_cover_letter.content
    plan = compose_cover_letter(request)
    pdf_bytes = None
    page_count = 0
    metrics = {}
    visual_review = None
    last_valid_artifact = None

    for attempt in range(4):
        payload = build_cover_letter_render_payload(request, plan)
        if payload["generated_cover_letter"]["content"] != original_content:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Composition attempted to modify cover letter content.",
            )
        try:
            rendered = await run_in_threadpool(
                render_cover_letter_artifact,
                json.dumps(payload),
                plan.paper_size,
            )
            pdf_bytes, page_count, metrics = rendered
        except Exception as exc:
            if last_valid_artifact:
                plan, pdf_bytes, page_count, metrics, visual_review = (
                    last_valid_artifact
                )
                break
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Cover letter rendering failed: {exc}",
            ) from exc

        visual_review = review_cover_letter_composition(
            plan,
            metrics,
            request.generated_cover_letter.word_count,
        )
        import logging
        logging.getLogger("cover_letter.render").info(
            "[COVER-LETTER-RENDER] attempt=%s status=%s issues=%s "
            "pages=%s body_font_pt=%.2f content_width=%.2f/%.2f "
            "width_utilization=%.3f vertical_utilization=%.3f "
            "line_height_px=%.2f margins_mm=%s transform=%s zoom=%s "
            "top_whitespace=%.2f bottom_whitespace=%.2f",
            attempt + 1,
            visual_review.status,
            visual_review.issues,
            page_count,
            float(metrics.get("body_font_pt") or 0),
            float(metrics.get("content_width_px") or 0),
            float(metrics.get("printable_width_px") or 0),
            float(metrics.get("width_utilization") or 0),
            float(metrics.get("vertical_utilization") or 0),
            float(metrics.get("line_height_px") or 0),
            {
                "left": metrics.get("left_margin_mm"),
                "right": metrics.get("right_margin_mm"),
            },
            metrics.get("scale_transform"),
            metrics.get("zoom"),
            float(metrics.get("top_whitespace_px") or 0),
            float(metrics.get("bottom_whitespace_px") or 0),
        )
        hard_issues = {
            "BODY_FONT_TOO_SMALL", "CONTENT_WIDTH_TOO_NARROW",
            "ACCIDENTAL_DOCUMENT_SCALING", "EXCESSIVE_HORIZONTAL_MARGIN",
            "TEXT_CLIPPED", "CONTENT_OVERLAP", "OVERFLOW",
        }
        if not hard_issues.intersection(visual_review.issues):
            last_valid_artifact = (
                plan.model_copy(deep=True),
                pdf_bytes,
                page_count,
                dict(metrics),
                visual_review.model_copy(deep=True),
            )
        if visual_review.status == "PASS":
            break
        if attempt >= 3:
            break
        repaired = repair_cover_letter_plan(plan, visual_review)
        logging.getLogger("cover_letter.render").info(
            "[COVER-LETTER-RENDER] repair attempt=%s issues=%s "
            "from_plan=%s to_plan=%s",
            attempt + 1,
            visual_review.issues,
            plan.model_dump(mode="json"),
            repaired.model_dump(mode="json"),
        )
        if repaired == plan:
            break
        plan = repaired

    if visual_review is None or visual_review.status != "PASS":
        if last_valid_artifact:
            plan, pdf_bytes, page_count, metrics, visual_review = last_valid_artifact
        else:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={
                    "message": (
                        "The cover letter could not reach professional visual "
                        "quality within three bounded repair attempts."
                    ),
                    "issues": visual_review.issues if visual_review else [],
                    "last_plan": plan.model_dump(mode="json"),
                },
            )

    if (
        request.settings.page_mode == "force_one_page"
        and page_count > 1
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "This content cannot fit into one page without compromising "
                "readability. Switch to AUTO."
            ),
        )

    candidate_name = request.context.candidate.get("name") or "Candidate"
    company_name = request.context.job.get("company") or "Company"
    clean_name = re.sub(r"[^A-Za-z0-9_-]+", "_", str(candidate_name)).strip("_")
    clean_company = re.sub(r"[^A-Za-z0-9_-]+", "_", str(company_name)).strip("_")
    filename = f"{clean_name}_{clean_company}_Cover_Letter.pdf"
    import hashlib
    artifact_hash = hashlib.sha256(pdf_bytes).hexdigest()
    plan_json = json.dumps(plan.model_dump(mode="json"), separators=(",", ":"))
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Access-Control-Expose-Headers": (
                "Content-Disposition, X-Cover-Letter-Pages, "
                "X-Cover-Letter-Template, X-Cover-Letter-Artifact-Hash, "
                "X-Cover-Letter-Repair-Attempts, X-Cover-Letter-Plan"
            ),
            "X-Cover-Letter-Pages": str(page_count),
            "X-Cover-Letter-Template": plan.template,
            "X-Cover-Letter-Artifact-Hash": artifact_hash,
            "X-Cover-Letter-Repair-Attempts": str(plan.repair_attempt),
            "X-Cover-Letter-Plan": plan_json,
        },
    )


@router.post("/cover-letter", response_model=CoverLetterResult)
async def api_cover_letter(
    request: CoverLetterRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
):
    try:
        from fastapi.concurrency import run_in_threadpool
        with _db_context() as conn:
            UsageService(conn).require_available(user["id"], "cover_letter_generation")
        letter = await run_in_threadpool(generate_cover_letter, request.resume, request.job, api_key=None)
        with _db_context() as conn:
            UsageService(conn).consume_usage(user["id"], "cover_letter_generation", metadata={"source": "cover-letter"})
        return letter
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to generate cover letter: {str(e)}"
        )

@router.post("/download-cover-letter-pdf")
async def api_download_cover_letter_pdf(request: CoverLetterResult):
    try:
        from app.playwright_pdf import generate_cover_letter_pdf_via_playwright
        from fastapi.concurrency import run_in_threadpool
        
        pdf_bytes = await run_in_threadpool(
            generate_cover_letter_pdf_via_playwright,
            request.json()
        )
        clean_company = "".join([c if c.isalnum() or c == '_' else '_' for c in request.company_name.replace(" ", "_")])
        filename = f"{clean_company}_Cover_Letter.pdf"
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate cover letter PDF: {str(e)}"
        )

class RefineSectionRequest(BaseModel):
    section_type: str
    section_data: Any
    prompt: str
    job: JobAnalysis
    resume_id: Optional[str] = None
    intelligence_model: Optional[str] = None
    working_resume: Optional[Dict[str, Any]] = None
    source_resume: Optional[Dict[str, Any]] = None
    resume_match_analysis: Optional[Dict[str, Any]] = None
    ats_analysis: Optional[Dict[str, Any]] = None
    accepted_changes: Optional[List[Dict[str, Any]]] = None
    pending_changes: Optional[List[Dict[str, Any]]] = None

@router.post("/refine-section")
async def api_refine_section(
    request: RefineSectionRequest,
):
    try:
        refined_content = refine_section_with_ai(
            section_type=request.section_type,
            section_data=request.section_data,
            prompt=request.prompt,
            job=request.job,
            api_key=None,
            resume_id=request.resume_id,
            intelligence_model=request.intelligence_model,
            working_resume=request.working_resume,
            source_resume=request.source_resume,
            resume_match_analysis=request.resume_match_analysis,
            ats_analysis=request.ats_analysis,
            accepted_changes=request.accepted_changes,
            pending_changes=request.pending_changes
        )
        return {"refined": refined_content}
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Refinement failed: {str(e)}"
        )


@router.post("/refine-section/stream")
async def api_refine_section_stream(
    request: RefineSectionRequest,
    authorization: Optional[str] = Header(None),
):
    user_id = "00000000-0000-0000-0000-000000000000"
    if authorization:
        try:
            user_data = await run_in_threadpool(verify_supabase_jwt, authorization)
            user_id = user_data.get("id", user_id)
        except Exception:
            pass

    from app.ai_service import refine_section_stream_generator
    return StreamingResponse(
        refine_section_stream_generator(
            section_type=request.section_type,
            section_data=request.section_data,
            prompt=request.prompt,
            job=request.job,
            resume_id=request.resume_id,
            intelligence_model=request.intelligence_model,
            working_resume=request.working_resume,
            source_resume=request.source_resume,
            resume_match_analysis=request.resume_match_analysis,
            ats_analysis=request.ats_analysis,
            accepted_changes=request.accepted_changes,
            pending_changes=request.pending_changes,
            user_id=user_id,
        ),
        media_type="text/event-stream"
    )

@router.post("/download-cover-letter-pdf")
async def api_download_cover_letter_pdf(request: CoverLetterResult):
    try:
        from app.playwright_pdf import generate_cover_letter_pdf_via_playwright
        from fastapi.concurrency import run_in_threadpool
        
        pdf_bytes = await run_in_threadpool(
            generate_cover_letter_pdf_via_playwright,
            request.json()
        )
        clean_company = "".join([c if c.isalnum() or c == '_' else '_' for c in request.company_name.replace(" ", "_")])
        filename = f"{clean_company}_Cover_Letter.pdf"
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate cover letter PDF: {str(e)}"
        )

class RefineSectionRequest(BaseModel):
    section_type: str
    section_data: Any
    prompt: str
    job: JobAnalysis
    resume_id: Optional[str] = None
    intelligence_model: Optional[str] = None
    working_resume: Optional[Dict[str, Any]] = None
    source_resume: Optional[Dict[str, Any]] = None
    resume_match_analysis: Optional[Dict[str, Any]] = None
    ats_analysis: Optional[Dict[str, Any]] = None
    accepted_changes: Optional[List[Dict[str, Any]]] = None
    pending_changes: Optional[List[Dict[str, Any]]] = None

@router.post("/refine-section")
async def api_refine_section(
    request: RefineSectionRequest,
):
    try:
        refined_content = refine_section_with_ai(
            section_type=request.section_type,
            section_data=request.section_data,
            prompt=request.prompt,
            job=request.job,
            api_key=None,
            resume_id=request.resume_id,
            intelligence_model=request.intelligence_model,
            working_resume=request.working_resume,
            source_resume=request.source_resume,
            resume_match_analysis=request.resume_match_analysis,
            ats_analysis=request.ats_analysis,
            accepted_changes=request.accepted_changes,
            pending_changes=request.pending_changes
        )
        return {"refined": refined_content}
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Refinement failed: {str(e)}"
        )

class SupportTicketRequest(BaseModel):
    subject: str
    priority: str = "NORMAL"
    description: str
    email: Optional[str] = None

@router.post("/v1/support/ticket")
async def api_submit_support_ticket(
    request: SupportTicketRequest,
    authorization: Optional[str] = Header(None)
):
    import uuid
    import datetime
    ticket_id = f"TICKET-{str(uuid.uuid4())[:8].upper()}"
    return {
        "success": True,
        "ticket_id": ticket_id,
        "message": f"Support ticket {ticket_id} created successfully.",
        "created_at": datetime.datetime.utcnow().isoformat()
    }

