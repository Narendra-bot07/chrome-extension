"""Authenticated API integration for the single active JD intelligence engine."""
import asyncio
import hashlib
import re
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
from services.job_extraction.graph import register_active_request
from services.subscriptions.usage_service import UsageService
from app.services.rate_limiter_service import RateLimiterService

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
# Some SPA career portals route entirely by fragment (e.g. #/job/12345,
# #job=12345) while keeping one unchanging path+query for the whole site --
# unconditionally dropping the fragment then collapses two DIFFERENT
# postings onto the same normalized URL/cache key. Only fragments that look
# like they encode a job identity are kept; purely presentational fragments
# (#top, #apply-now) are still dropped so they don't fragment the cache for
# portals where the fragment carries no job identity at all.
_FRAGMENT_JOB_ID_PATTERN = re.compile(r"(?:job|jobs|position|opening|req|posting|vacancy|listing)[/_=-]?\d+|\d{4,}", re.I)


def _normalize_job_url_for_cache(url: str) -> str:
    """Strips tracking params and trailing slash so two users landing on the
    same posting via different marketing links (e.g. one with
    ?utm_source=..., one without) still share the same cache entry. Keeps
    the fragment when it looks job-identifying (see _FRAGMENT_JOB_ID_PATTERN)."""
    parsed = urlparse((url or "").strip())
    host = (parsed.hostname or "").lower()
    if parsed.port:
        host = f"{host}:{parsed.port}"
    path = (parsed.path or "").rstrip("/") or "/"
    kept_params = sorted(
        (key, value) for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if not any(key.lower().startswith(prefix) for prefix in _TRACKING_PARAM_PREFIXES)
    )
    fragment = parsed.fragment or ""
    kept_fragment = fragment if _FRAGMENT_JOB_ID_PATTERN.search(fragment) else ""
    return urlunparse(("", host, path, "", urlencode(kept_params), kept_fragment))


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
    # v5 invalidates every result produced by the former deterministic
    # extraction fallback. Otherwise a corrected deployment can continue
    # serving yesterday's wrong Disney/JPMC/LinkedIn record for 24 hours.
    return f"jd_extraction:v5-llm-only:{hashlib.sha256(identity.encode('utf-8')).hexdigest()}"


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
        "extension_evidence=%s html_length=%s visible_text_length=%s "
        "selected_panel_length=%s jsonld_count=%s title_hint=%r company_hint=%r",
        request_id,
        request.url,
        bool(request.browser_evidence),
        len(str((request.browser_evidence or {}).get("html") or "")),
        len(str((request.browser_evidence or {}).get("visible_text") or "")),
        len(str((request.browser_evidence or {}).get("selected_panel_text") or "")),
        len((request.browser_evidence or {}).get("jsonld") or []),
        (request.browser_evidence or {}).get("job_title_hint"),
        (request.browser_evidence or {}).get("company_hint"),
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
    # The only existing throttle here was UsageService's monthly product
    # quota -- no per-minute limiting at all. One user could stay well
    # within a monthly quota (e.g. 20-30 calls/day) while rapid-firing the
    # SAME slow/hostile domain: the browser-scrape fallback is a single-
    # worker pool (browser_pool.py), so repeatedly occupying its one worker
    # thread for 5s per call is a real, low-cost way for one user to
    # degrade extraction latency for every other concurrent user. Redis-only
    # (no DB connection) rate limiter, matching the pattern already
    # established for auth/signup abuse checks.
    limiter = RateLimiterService(conn=None)
    if limiter.is_rate_limited("jd_extraction_user", user["id"], max_requests=10, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "success": False,
                "request_id": request_id,
                "error": {"code": "RATE_LIMITED", "message": "Too many extraction requests. Please wait a moment and try again."},
            },
        )
    request_host = (urlparse(request.url).hostname or "").lower()
    if request_host and limiter.is_rate_limited("jd_extraction_domain", request_host, max_requests=5, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "success": False,
                "request_id": request_id,
                "error": {"code": "RATE_LIMITED", "message": "This job site is receiving a lot of extraction requests right now. Please try again shortly."},
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

        # Marks this as the latest extraction request for this user -- any
        # earlier one from the same user still running stops itself between
        # its next graph node (see graph.py's ExtractionSuperseded) instead
        # of running all the way to a result nobody will read.
        register_active_request(user["id"], request_id)
        result = await asyncio.to_thread(
            extract_job_from_url,
            request.url,
            request_id,
            request.browser_evidence,
            user["id"],
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
