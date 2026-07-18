from fastapi import APIRouter, UploadFile, File, Header, HTTPException, status, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io
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
from api.dependencies import get_resume_repository
from core.security import verify_supabase_jwt
from repositories.resume_repository import ResumeRepository


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
    parsed = payload.get("parsed_content")
    if isinstance(parsed, dict):
        merged = {**parsed}
        for key in ("id", "file_name", "file_size", "file_type", "created_at"):
            if key in payload and key not in merged:
                merged[key] = payload[key]
        return merged
    return payload

def normalize_job_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    normalized = payload.get("normalized_content")
    if isinstance(normalized, dict):
        job = {**normalized}
    else:
        job = {**payload}

    if payload.get("job_title") and not job.get("title"):
        job["title"] = payload["job_title"]
    if payload.get("company_name") and not job.get("company"):
        job["company"] = payload["company_name"]
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
    repo: ResumeRepository = Depends(get_resume_repository)
):
    try:
        if request.resume_id:
            resume_record = repo.get_by_id(request.resume_id, user["id"])
            if not resume_record:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resume not found.")
            if not resume_record.get("is_active"):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected resume is not active.")
        resume = ResumeStructure(**normalize_resume_payload(request.resume))
        job = JobAnalysis(**normalize_job_payload(request.job))
        try:
            comparison = generate_tailoring_patch(
                resume,
                job,
                api_key=x_groq_key
            )
        except Exception:
            score = calculate_resume_job_match_score(resume, job)
            comparison = TailoringReport(
                changes_made=[],
                ats_score_before=score,
                ats_score_after=score,
                patch=ResumePatch()
            )
        return comparison
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to generate tailoring patch: {str(e)}"
        )

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
        
        resume_json_str = request.resume.json()
        
        pdf_bytes = await run_in_threadpool(
            generate_pdf_via_playwright, 
            resume_json_str, 
            request.template_name
        )
        
        if not pdf_bytes:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Playwright failed to generate PDF."
            )
        
        user_name = request.resume.personal_info.name or "User"
        clean_user = "".join([c if c.isalnum() or c == '_' else '_' for c in user_name.replace(" ", "_")])
        clean_company = "".join([c if c.isalnum() or c == '_' else '_' for c in company_name.replace(" ", "_")])
        filename = f"{clean_user}_{clean_company}_Resume.pdf"
        
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate PDF resume: {str(e)}\n\n{tb}"
        )

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

from typing import Any
class RefineSectionRequest(BaseModel):
    section_type: str
    section_data: Any
    prompt: str
    job: JobAnalysis

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
            api_key=x_groq_key
        )
        return {"refined": refined_content}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Refinement failed: {str(e)}"
        )
