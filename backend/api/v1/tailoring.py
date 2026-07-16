from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from typing import Dict, Any, Optional
import io

from core.security import verify_supabase_jwt
from schemas.tailoring import TailorRequest, DownloadPDFRequest
from api.dependencies import get_tailoring_service, get_storage_service, get_audit_repository, get_tailoring_repository
from services.resume.tailoring_service import TailoringService
from services.storage.file_service import FileService
from repositories.audit_repository import AuditRepository
from repositories.tailoring_repository import TailoringRepository
from app.analytics.events.tracking.analytics_service import AnalyticsService
from core.database import get_db_connection

router = APIRouter(prefix="/tailor", tags=["tailor"])

@router.post("/")
async def tailor_resume(
    request: TailorRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    service: TailoringService = Depends(get_tailoring_service),
    conn = Depends(get_db_connection)
):
    try:
        # We assume request has job_analysis attached if the old format had it, 
        # but in the updated TailorRequest, we might need a default title for mock resolution.
        # Let's handle it safely.
        job_title = "Tailored Role"
        if hasattr(request, "job_analysis") and request.job_analysis:
            job_title = str(request.job_analysis.title)
            
        record = service.execute_tailoring_flow(
            user_id=user["id"],
            resume_id=str(request.resume.personal_info.name),  # Mock resolution
            job_id=job_title,
            patch=request.patch
        )
        
        # Emit event
        AnalyticsService(conn).emit_event(
            user_id=user["id"],
            event_type="RESUME_TAILORED",
            resource_type="tailoring",
            resource_id=record["id"],
            metadata={"job_title": job_title}
        )
        
        return record
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Tailoring failed: {str(e)}")

@router.post("/download-pdf")
async def download_pdf(
    request: DownloadPDFRequest,
    company_name: Optional[str] = "Company",
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    storage: FileService = Depends(get_storage_service),
    audit_repo: AuditRepository = Depends(get_audit_repository),
    conn = Depends(get_db_connection)
):
    try:
        from app.playwright_pdf import generate_pdf_via_playwright
        from fastapi.concurrency import run_in_threadpool
        
        pdf_bytes = await run_in_threadpool(
            generate_pdf_via_playwright,
            request.resume.json(),
            request.template_name
        )
        
        if not pdf_bytes:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Playwright failed to generate PDF."
            )
        
        import uuid
        file_path = f"{user['id']}/{uuid.uuid4()}_{company_name}_Resume.pdf".replace(" ", "_")
        storage.upload_file("generated-resumes", file_path, pdf_bytes, "application/pdf")

        audit_repo.log_download(
            user_id=user["id"],
            tailored_resume_id=user["id"],
            template_id=None,
            file_type="pdf",
            ats_score=85.0,
            company_name=company_name,
            job_title="Software Engineer"
        )
        
        AnalyticsService(conn).emit_event(
            user_id=user["id"],
            event_type="PDF_DOWNLOADED",
            resource_type="pdf",
            resource_id=file_path,
            metadata={"company_name": company_name, "template": request.template_name}
        )

        filename = f"{company_name}_Tailored_Resume.pdf"
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
            detail=f"Failed to generate and download PDF: {str(e)}"
        )

@router.get("/history")
async def get_tailoring_history(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: TailoringRepository = Depends(get_tailoring_repository)
):
    try:
        return repo.list_by_user(user["id"])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch tailoring history: {str(e)}"
        )
