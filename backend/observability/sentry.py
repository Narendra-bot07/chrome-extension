import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from typing import Dict, Any, Optional
from observability.config import (
    SENTRY_BACKEND_DSN, APP_ENV, APP_RELEASE, 
    SENTRY_TRACES_SAMPLE_RATE, SENTRY_PROFILES_SAMPLE_RATE, OBSERVABILITY_ENABLED
)
from observability.logging import redact_sensitive_data, logger

def before_send(event: Dict[str, Any], hint: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Sanitize errors before sending to Sentry Cloud. Every non-2xx status
    (3xx/4xx/5xx) is wanted in Sentry now, not just 500s -- see
    observability/middleware.py's _capture_non_2xx, which is the primary
    path for this. This no longer filters by status code; it only redacts."""
    try:
        sanitized_event = redact_sensitive_data(event)
        return sanitized_event
    except Exception as err:
        logger.warning(f"[SENTRY_SANITY] Event sanitization failed: {err}")
        return event

def setup_sentry():
    """Initialize the backend Sentry integration."""
    if not OBSERVABILITY_ENABLED or not SENTRY_BACKEND_DSN:
        logger.info("[SENTRY] Backend Sentry SDK integration is disabled (missing DSN or OBSERVABILITY_ENABLED=false).")
        return

    try:
        sentry_sdk.init(
            dsn=SENTRY_BACKEND_DSN,
            environment=APP_ENV,
            release=APP_RELEASE or "unknown",
            traces_sample_rate=SENTRY_TRACES_SAMPLE_RATE,
            profiles_sample_rate=SENTRY_PROFILES_SAMPLE_RATE,
            send_default_pii=False,  # Enforce strict user privacy
            before_send=before_send,
            integrations=[FastApiIntegration()]
        )
        logger.info("[SENTRY] Backend Sentry SDK successfully initialized.")
    except Exception as err:
        logger.error(f"[SENTRY] Sentry SDK initialization crashed: {err}. Continuing execution.")
