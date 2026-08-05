"""Authenticated API integration for the single active JD intelligence engine."""
import asyncio
import json
import queue
import threading
import time
import uuid
from contextlib import contextmanager
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from core.logging import logger
from core.security import verify_supabase_jwt
from core.database import get_db_connection
from schemas.jobs import JobUrlExtractRequest
from services.job_extraction.backend_extractor import extract_job_from_url
from services.job_extraction.graph import run_job_intelligence_stream
from services.subscriptions.usage_service import UsageService

router = APIRouter(prefix="/jobs", tags=["jobs"])
_db_context = contextmanager(get_db_connection)


@router.post("/extract-url")
async def extract_job_from_provided_url(
    request: JobUrlExtractRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
):
    """Run the autonomous graph for the complete current-tab URL."""
    request_id = request.request_id or str(uuid.uuid4())
    request_started = time.perf_counter()
    logger.info(
        "[JD-EXTRACTION][BACKEND] Request received request_id=%s url=%s "
        "extension_evidence=%s",
        request_id,
        request.url,
        bool(request.browser_evidence),
    )
    try:
        # A pool connection is only needed for these two quick quota checks —
        # not for the Playwright/LLM pipeline in between, which can run
        # 5-30+s and would otherwise hold a connection idle that long.
        with _db_context() as conn:
            UsageService(conn).require_available(user["id"], "jd_extraction")
        result = await asyncio.to_thread(
            extract_job_from_url,
            request.url,
            request_id,
            request.browser_evidence,
        )
        with _db_context() as conn:
            UsageService(conn).consume_usage(
                user["id"],
                "jd_extraction",
                request_id=request_id,
                metadata={"url": request.url},
            )
        logger.info(
            "[JD-EXTRACTION][BACKEND] Request completed request_id=%s duration_ms=%s "
            "browser_attempts=%s selected_source=%s",
            request_id,
            round((time.perf_counter() - request_started) * 1000),
            (result.get("execution_summary") or {}).get("browser_attempts"),
            result.get("selected_source"),
        )
        return result
    except HTTPException:
        raise
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


def _run_stream_in_thread(url: str, request_id: str, browser_evidence: Any) -> "queue.Queue":
    """run_job_intelligence_stream is a synchronous generator (it makes
    blocking network/DB/subprocess calls throughout) -- run it on a
    background thread and hand items back over a thread-safe queue.Queue so
    the async SSE generator below can drain it via asyncio.to_thread without
    blocking the event loop."""
    q: "queue.Queue" = queue.Queue()

    def _worker():
        try:
            for event in run_job_intelligence_stream(url, request_id, browser_evidence):
                q.put(("event", event))
        except Exception as exc:  # noqa: BLE001 - forwarded to the client as an SSE error event
            q.put(("error", exc))
        finally:
            q.put(("done", None))

    threading.Thread(target=_worker, daemon=True, name=f"jd-stream-{request_id}").start()
    return q


@router.post("/extract-url-stream")
async def extract_job_from_provided_url_stream(
    request: JobUrlExtractRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
):
    """SSE variant of /extract-url. Streams a "core" partial event (job
    title/company/location/responsibilities/etc., with skills still empty)
    the instant that half of the extraction finishes, followed by a "final"
    event once skills and the reviewer/repair pass complete too -- instead of
    the client blocking on one big JSON response for the whole 60-100+s
    pipeline. Which of core/skills finishes first varies per posting (proven
    directly, not assumed -- see docs/CHANGELOG.md 3.15.12), so this is a real
    but not perfectly reliable latency-hiding improvement, not a guarantee
    that something always shows up within a few seconds.
    """
    request_id = request.request_id or str(uuid.uuid4())
    request_started = time.perf_counter()
    logger.info(
        "[JD-EXTRACTION][BACKEND] Stream request received request_id=%s url=%s "
        "extension_evidence=%s",
        request_id,
        request.url,
        bool(request.browser_evidence),
    )

    try:
        with _db_context() as conn:
            UsageService(conn).require_available(user["id"], "jd_extraction")
    except HTTPException as exc:
        # Quota errors must surface before the stream opens, not as an SSE
        # event, so the client's existing 4xx/JSON handling for this case
        # (see QUOTA_EXCEEDED handling in AppContext.jsx) keeps working
        # unchanged for this endpoint too.
        raise exc

    async def _event_source():
        q = _run_stream_in_thread(request.url, request_id, request.browser_evidence)
        final_event: Dict[str, Any] | None = None
        try:
            while True:
                kind, payload = await asyncio.to_thread(q.get)
                if kind == "done":
                    break
                if kind == "error":
                    raise payload
                if payload.get("stage") == "final":
                    final_event = payload
                yield f"data: {json.dumps(payload)}\n\n".encode("utf-8")
        except ValueError as exc:
            logger.warning(
                "[JD-EXTRACTION][BACKEND] Stream request rejected request_id=%s error=%s",
                request_id, exc,
            )
            yield f"data: {json.dumps({'stage': 'final', 'success': False, 'skills_pending': False, 'request_id': request_id, 'error': {'code': 'INVALID_JOB_URL', 'message': str(exc)}})}\n\n".encode("utf-8")
            return
        except Exception:
            logger.exception(
                "[JD-EXTRACTION][BACKEND] Stream extraction failed request_id=%s",
                request_id,
            )
            yield f"data: {json.dumps({'stage': 'final', 'success': False, 'skills_pending': False, 'request_id': request_id, 'error': {'code': 'JD_EXTRACTION_FAILED', 'message': 'The job page could not be reviewed successfully. Please retry the extraction.'}})}\n\n".encode("utf-8")
            return

        if final_event and final_event.get("success"):
            with _db_context() as conn:
                UsageService(conn).consume_usage(
                    user["id"], "jd_extraction", request_id=request_id,
                    metadata={"url": request.url},
                )
        logger.info(
            "[JD-EXTRACTION][BACKEND] Stream request completed request_id=%s duration_ms=%s",
            request_id,
            round((time.perf_counter() - request_started) * 1000),
        )

    return StreamingResponse(
        _event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
