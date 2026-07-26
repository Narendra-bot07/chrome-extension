from fastapi import APIRouter, UploadFile, File, Header, HTTPException, status, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io
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
from app.groq_service import parse_resume, analyze_job_description, generate_tailoring_patch, apply_tailoring_patch, generate_cover_letter, refine_section_with_ai, calculate_resume_job_match_score
from api.v1.resume import router as resume_manager_router
from api.dependencies import get_resume_repository, get_ats_repository
from core.security import verify_supabase_jwt
from core.database import get_db_connection
from repositories.resume_repository import ResumeRepository
from repositories.ats_repository import ATSRepository


from app.template_engine import template_engine

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
    resume: Dict[str, Any]
    job: Dict[str, Any]

def normalize_resume_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    from services.resume.renderable import project_renderable_resume
    return project_renderable_resume(payload)

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

    salary = job.get("salary")
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
    file: UploadFile = File(...),
    x_groq_key: Optional[str] = Header(None)
):
    try:
        content = await file.read()
        raw_text = extract_text(content, file.filename)
        # Parse using Groq (or fallback heuristically)
        parsed_resume = parse_resume(raw_text, api_key=x_groq_key)
        return parsed_resume
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse resume: {str(e)}"
        )

@router.post("/analyze-job", response_model=JobAnalysis)
async def api_analyze_job(
    request: JobAnalysisRequest,
    x_groq_key: Optional[str] = Header(None)
):
    try:
        analysis = analyze_job_description(
            request.jd_text, 
            api_key=x_groq_key,
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
        return analysis
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to analyze job description: {str(e)}"
        )

@router.post("/compare", response_model=TailoringReport)
async def api_compare(
    request: CompareRequest,
    x_groq_key: Optional[str] = Header(None),
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ResumeRepository = Depends(get_resume_repository),
    ats_repo: ATSRepository = Depends(get_ats_repository)
):
    try:
        from services.resume.scoring import ATSScoringEngine
        from app.groq_service import generate_tailoring_patch, apply_tailoring_patch
        import re

        resume_id = request.resume_id
        jd_id = request.job.get("id")

        resume = ResumeStructure(**normalize_resume_payload(request.resume))
        job = JobAnalysis(**normalize_job_payload(request.job))

        cached_analysis = None
        if resume_id and jd_id:
            try:
                cached_analysis = ats_repo.get_cached_analysis(resume_id, jd_id, ATSScoringEngine.ENGINE_VERSION)
            except Exception as e:
                print(f"[ATS-CACHE][BACKEND] Failed to lookup cache: {e}")

        if cached_analysis:
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
                suggestion_impacts=suggestion_impacts
            )

        try:
            comparison = generate_tailoring_patch(
                resume,
                job,
                api_key=x_groq_key
            )
        except Exception:
            comparison = TailoringReport(
                changes_made=[],
                ats_score_before=0,
                ats_score_after=0,
                patch=ResumePatch()
            )

        res_before = ATSScoringEngine.calculate_score(resume, job)
        tailored_resume = apply_tailoring_patch(resume, comparison.patch)
        res_after = ATSScoringEngine.calculate_score(tailored_resume, job)

        ats_analysis_id = None
        suggestion_impacts = []
        if resume_id and jd_id:
            try:
                original_score = res_before["ats_score"]
                breakdown_data = {
                    "breakdown_before": res_before["breakdown"],
                    "breakdown_after": res_after["breakdown"],
                    "resume_match_after": res_after["resume_match_score"],
                    "ats_score_after": res_after["ats_score"],
                    "patch": comparison.patch.model_dump(),
                    "changes_made": comparison.changes_made
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
            suggestion_impacts=suggestion_impacts
        )
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
        resume = ResumeStructure(**normalize_resume_payload(request.resume))
        job = JobAnalysis(**normalize_job_payload(request.job))
        res = ATSScoringEngine.calculate_score(resume, job)
        return {
            "resume_match_score": res["resume_match_score"],
            "ats_score": res["ats_score"],
            "breakdown": res["breakdown"]
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to calculate ATS score: {str(e)}")

class LiveScoreRequest(BaseModel):
    resume: Dict[str, Any]
    job: Dict[str, Any]
    suggestions: List[Dict[str, Any]]

@router.post("/ats/live-score")
async def api_ats_live_score(request: LiveScoreRequest, user: Dict[str, Any] = Depends(verify_supabase_jwt)):
    try:
        from services.resume.scoring import ATSScoringEngine
        resume = ResumeStructure(**normalize_resume_payload(request.resume))
        job = JobAnalysis(**normalize_job_payload(request.job))

        # Original score (base score)
        res_before = ATSScoringEngine.calculate_score(resume, job)

        # Current score (accepted suggestions applied)
        current_resume = ATSScoringEngine.apply_suggestions(resume, request.suggestions, {"accepted"})
        res_current = ATSScoringEngine.calculate_score(current_resume, job)

        # Estimated score (accepted + pending suggestions applied)
        estimated_resume = ATSScoringEngine.apply_suggestions(resume, request.suggestions, {"accepted", "pending"})
        res_estimated = ATSScoringEngine.calculate_score(estimated_resume, job)

        return {
            "original_resume_match": res_before["resume_match_score"],
            "current_resume_match": res_current["resume_match_score"],
            "estimated_resume_match": res_estimated["resume_match_score"],
            
            "original_ats": res_before["ats_score"],
            "current_ats": res_current["ats_score"],
            "estimated_ats": res_estimated["ats_score"],
            
            "breakdown_before": res_before["breakdown"],
            "breakdown_current": res_current["breakdown"],
            "breakdown_estimated": res_estimated["breakdown"]
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to calculate live scores: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to calculate live scores: {str(e)}")

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

@router.post("/render-unified-pdf")
async def api_render_unified_pdf(request: UnifiedRenderRequest):
    import base64
    import hashlib
    import json
    from app.playwright_pdf import generate_pdf_via_playwright
    from fastapi.concurrency import run_in_threadpool
    from services.resume.composition_agent import compose_resume_layout

    template = request.template_name or "ExecutiveATS"
    resume_dict = normalize_resume_payload(request.resume)

    composition_plan = compose_resume_layout(
        resume=resume_dict,
        template_name=template,
        requested_section_order=resume_dict.get("section_order"),
    )

    try:
        render_res = await run_in_threadpool(
            generate_pdf_via_playwright,
            json.dumps(resume_dict),
            template
        )
        if isinstance(render_res, tuple):
            pdf_bytes, plan_meta, render_hash, measurement_hash = render_res
        else:
            pdf_bytes = render_res
            render_hash = hashlib.sha256(pdf_bytes).hexdigest()
            measurement_hash = hashlib.sha256(json.dumps(composition_plan.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()
            plan_meta = composition_plan.model_dump(mode="json")
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
    status_msg = "Fits cleanly on 1 page" if page_count == 1 else "2 pages selected to preserve readability"
    personal = resume_dict.get("personal_info") or {}
    clean_part = lambda value, fallback: re.sub(
        r"[^A-Za-z0-9_-]+", "_", str(value or fallback).strip()
    ).strip("_") or fallback
    artifact_filename = (
        f"{clean_part(personal.get('name'), 'User')}_"
        f"{clean_part(request.company_name, 'Company')}_Resume.pdf"
    )

    final_plan_dict = {
        "page_count": page_count,
        "density": composition_plan.density.value.lower(),
        "page_size": "A4",
        "margins": {"top": "0", "right": "0", "bottom": "0", "left": "0"},
        "typography": {"fontFamily": "font-sans"},
        "section_order": composition_plan.section_order,
        "page_breaks": [composition_plan.final_measurements.page_break_index] if composition_plan.final_measurements.page_break_index else [],
        "section_positions": plan_meta.get("section_positions", {}),
        "measurement_hash": measurement_hash,
        "render_hash": render_hash,
        "validation_report": composition_plan.validation_status.model_dump(mode="json"),
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
          "filename": artifact_filename
      }

@router.post("/cover-letter", response_model=CoverLetterResult)
async def api_cover_letter(
    request: CoverLetterRequest,
    x_groq_key: Optional[str] = Header(None)
):
    try:
        letter = generate_cover_letter(request.resume, request.job, api_key=x_groq_key)
        return letter
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
    x_groq_key: Optional[str] = Header(None)
):
    try:
        refined_content = refine_section_with_ai(
            section_type=request.section_type,
            section_data=request.section_data,
            prompt=request.prompt,
            job=request.job,
            api_key=x_groq_key,
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
    x_groq_key: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
    conn = Depends(get_db_connection)
):
    user_id = "00000000-0000-0000-0000-000000000000"
    if authorization:
        try:
            user_data = await verify_supabase_jwt(authorization, conn)
            user_id = user_data.get("id", user_id)
        except Exception:
            pass

    from app.groq_service import refine_section_stream_generator
    return StreamingResponse(
        refine_section_stream_generator(
            section_type=request.section_type,
            section_data=request.section_data,
            prompt=request.prompt,
            job=request.job,
            api_key=x_groq_key,
            resume_id=request.resume_id,
            intelligence_model=request.intelligence_model,
            working_resume=request.working_resume,
            source_resume=request.source_resume,
            resume_match_analysis=request.resume_match_analysis,
            ats_analysis=request.ats_analysis,
            accepted_changes=request.accepted_changes,
            pending_changes=request.pending_changes,
            user_id=user_id,
            conn=conn
        ),
        media_type="text/event-stream"
    )
