"""Authenticated API integration for the single active JD intelligence engine."""
import asyncio
import hashlib
import time
import uuid
from contextlib import contextmanager
from typing import Any, Dict
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import APIRouter, Depends, HTTPException, status

from core.logging import logger
from core.security import verify_supabase_jwt
from core.database import get_db_connection
from schemas.jobs import JobUrlExtractRequest
from services.cache.redis_cache import redis_cache
from services.job_extraction.backend_extractor import extract_job_from_url
from services.subscriptions.usage_service import UsageService

router = APIRouter(prefix="/jobs", tags=["jobs"])
_db_context = contextmanager(get_db_connection)

# JD extraction (Playwright scrape + LLM classification/extraction) is one of
# the slowest, most expensive things this API does, and a job posting's URL
# is a genuinely shared/public resource -- when a posting is trending,
# multiple different users hit the exact same URL within the same window.
# Previously this ran the full pipeline fresh for every single request, with
# no caching at all, so the 2nd/3rd/... user to open a popular posting paid
# the same 5-30s+ cost as the first. Caching by normalized URL (not scoped to
# any one user) means every user after the first gets an instant result.
JD_EXTRACTION_CACHE_TTL_SECONDS = 24 * 60 * 60  # Job postings rarely change same-day; 24h balances freshness against hit rate.
_TRACKING_PARAM_PREFIXES = ("utm_", "fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "trk", "ref_", "_hs")


def _normalize_job_url_for_cache(url: str) -> str:
    """Strips tracking params, fragment, and trailing slash so two users
    landing on the same posting via different marketing links (e.g. one with
    ?utm_source=..., one without) still share the same cache entry."""
    parsed = urlparse((url or "").strip())
    host = (parsed.hostname or "").lower()
    if parsed.port:
        host = f"{host}:{parsed.port}"
    path = (parsed.path or "").rstrip("/") or "/"
    kept_params = sorted(
        (key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if not any(key.lower().startswith(prefix) for prefix in _TRACKING_PARAM_PREFIXES)
    )
    return urlunparse(("", host, path, "", urlencode(kept_params), ""))


def _job_extraction_cache_key(url: str, browser_evidence: Dict[str, Any] | None = None) -> str:
    """Key by URL *and rendered job identity* for SPA career portals.

    Some portals keep an old/generic URL while replacing the visible job in
    place. URL-only caching then serves a different posting. The extension's
    DOM fingerprint makes those rendered states distinct while retaining the
    URL-only fallback for API clients without browser evidence.
    """
    normalized = _normalize_job_url_for_cache(url)
    evidence = browser_evidence or {}
    capture = evidence.get("capture") if isinstance(evidence.get("capture"), dict) else {}
    rendered_identity = "|".join(filter(None, (
        str(capture.get("dom_fingerprint") or "").strip(),
        str(evidence.get("job_title_hint") or "").strip().casefold(),
    )))
    identity = f"{normalized}|{rendered_identity}" if rendered_identity else normalized
    # v3 invalidates results produced before focused-panel/title validation.
    return f"jd_extraction:v3:{hashlib.sha256(identity.encode('utf-8')).hexdigest()}"


def _is_disallowed_extraction_target(url: str) -> bool:
    parsed = urlparse((url or "").strip())
    host = (parsed.hostname or "").lower()
    path = (parsed.path or "").lower()
    return bool(
        (host == "chrome.google.com" and path.startswith("/webstore"))
        or host == "chromewebstore.google.com"
        or "/webstore/devconsole" in path
    )


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
    if _is_disallowed_extraction_target(request.url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "request_id": request_id,
                "page_type": "non_job",
                "classification_confidence": 1,
                "extracted_job": None,
                "error": {
                    "code": "NON_JOB_PAGE",
                    "message": "Open a public job-detail page before scanning.",
                },
            },
        )
    cache_key = _job_extraction_cache_key(request.url, request.browser_evidence)
    try:
        # A pool connection is only needed for these two quick quota checks —
        # not for the Playwright/LLM pipeline in between, which can run
        # 5-30+s and would otherwise hold a connection idle that long.
        with _db_context() as conn:
            UsageService(conn).require_available(user["id"], "jd_extraction")

        cached_result = redis_cache.get(cache_key)
        if cached_result:
            with _db_context() as conn:
                UsageService(conn).consume_usage(
                    user["id"],
                    "jd_extraction",
                    request_id=request_id,
                    metadata={"url": request.url, "cached": True},
                )
            logger.info(
                "[JD-EXTRACTION][BACKEND] Cache hit request_id=%s url=%s duration_ms=%s",
                request_id,
                request.url,
                round((time.perf_counter() - request_started) * 1000),
            )
            return {**cached_result, "request_id": request_id}

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
        # Shared across every user, not scoped to this one -- a job posting's
        # URL is a public resource, so the 2nd/3rd/... user to hit a trending
        # posting gets this instantly instead of re-running the full
        # scrape+LLM pipeline. Only cache genuine, complete successes:
        # - "blocked" / "manual_review" / etc. can depend on this specific
        #   request's browser_evidence, so caching a failure could wrongly
        #   deny a different user (with better evidence) a real shot at it.
        # - status == "partial" covers a "skills only" extraction (real
        #   description text but empty responsibilities/requirements --
        #   see final_response_agent) that still has success=True. Caching
        #   that would turn a one-off extraction miss into a persistent bug
        #   served to every subsequent user for the full TTL.
        if result.get("success") and result.get("status") == "extracted":
            redis_cache.set(cache_key, result, ttl_seconds=JD_EXTRACTION_CACHE_TTL_SECONDS)
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
