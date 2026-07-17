from fastapi import APIRouter, UploadFile, File, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io
from typing import Optional, List

from app.schemas import (
    ResumeStructure,
    JobAnalysis,
    ComparisonResult,
    TailorRequest,
    DownloadPDFRequest,
    CoverLetterRequest,
    CoverLetterResult,
    TailoringReport
)
from app.parser import extract_text
from app.groq_service import parse_resume, analyze_job_description, generate_tailoring_patch, apply_tailoring_patch, generate_cover_letter, refine_section_with_ai


from app.template_engine import template_engine

router = APIRouter(prefix="/api")

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

class CompareRequest(BaseModel):
    resume: ResumeStructure
    job: JobAnalysis

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
        return analysis
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to analyze job description: {str(e)}"
        )

@router.post("/compare", response_model=TailoringReport)
async def api_compare(
    request: CompareRequest,
    x_groq_key: Optional[str] = Header(None)
):
    try:
        comparison = generate_tailoring_patch(
            request.resume, 
            request.job, 
            api_key=x_groq_key
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
