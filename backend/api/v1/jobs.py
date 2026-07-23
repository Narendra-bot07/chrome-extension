"""Authenticated API integration for the single active JD intelligence engine."""
import asyncio
import uuid
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status

from core.logging import logger
from core.security import verify_supabase_jwt
from schemas.jobs import JobUrlExtractRequest
from services.job_extraction.backend_extractor import extract_job_from_url

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/extract-url")
async def extract_job_from_provided_url(
    request: JobUrlExtractRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
):
    """Run the autonomous graph for the complete current-tab URL."""
    request_id = request.request_id or str(uuid.uuid4())
    logger.info(
        "[JD-EXTRACTION][BACKEND] Request received request_id=%s url=%s "
        "extension_evidence=%s",
        request_id,
        request.url,
        bool(request.browser_evidence),
    )
    try:
        return await asyncio.to_thread(
            extract_job_from_url,
            request.url,
            request_id,
            request.browser_evidence,
        )
    except ValueError as exc:
        logger.warning(
            "[JD-EXTRACTION][BACKEND] Request rejected request_id=%s error=%s",
            request_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "request_id": request_id,
                "page_type": None,
                "classification_confidence": 0,
                "extracted_job": None,
                "error": {"code": "INVALID_JOB_URL", "message": str(exc)},
            },
        ) from exc
    except Exception as exc:
        logger.exception(
            "[JD-EXTRACTION][BACKEND] Extraction failed request_id=%s",
            request_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "success": False,
                "request_id": request_id,
                "page_type": None,
                "classification_confidence": 0,
                "extracted_job": None,
                "error": {
                    "code": "JD_EXTRACTION_FAILED",
                    "message": "The job page could not be reviewed successfully. Please retry the extraction.",
                },
            },
        ) from exc
