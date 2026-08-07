"""Privacy-safe AI security audit events. Structured JSON logs (same
`logger` used everywhere else in this codebase) + Prometheus metrics +
Sentry for genuinely unexpected guardrail failures only.

Never log full prompts, full resume/JD text, or raw user instructions here.
`user_id_hash` (not raw user_id) is the only identity field, and even that
is only for correlating a spike back to a single abusive account during
incident response -- not for routine per-request tracing (request_id
already exists for that via the standard correlation middleware).
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Optional

from core.config import settings
from observability.logging import logger
from observability.metrics import (
    record_ai_guardrail_request,
    record_ai_guardrail_block,
    record_ai_prompt_injection,
    record_ai_jailbreak_attempt,
    record_ai_output_rejection,
    record_ai_quota_rejection,
    record_ai_input_size_rejection,
    record_ai_security_classifier_duration,
)


def _hash_user_id(user_id: str) -> str:
    if not user_id:
        return ""
    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:16]


def _bounded_fingerprint(text: str, *, max_len: int = 40) -> str:
    """A bounded, non-reversible fingerprint of flagged content, for
    investigation correlation only -- never the raw text itself. See
    docs/AI_GOVERNANCE.md 'Jailbreak Detection': do not store the complete
    malicious prompt unnecessarily."""
    if not text:
        return ""
    digest = hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()
    return digest[:max_len]


def log_ai_security_event(
    *,
    event_type: str,
    task: str,
    decision: str,
    reason_code: str,
    policy_version: str,
    request_id: str,
    workflow_id: str = "",
    user_id: str = "",
    flagged_content_fingerprint: Optional[str] = None,
) -> None:
    """The single entry point for every AI governance audit event. Fields
    match docs/AI_GOVERNANCE.md 'Audit Logging' exactly."""
    try:
        logger.info(
            event_type,
            extra={
                "event_type": event_type,
                "task": task,
                "decision": decision,
                "reason_code": reason_code,
                "policy_version": policy_version,
                "request_id": request_id,
                "workflow_id": workflow_id,
                "user_id_hash": _hash_user_id(user_id),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "environment": settings.APP_ENV,
                "release": settings.APP_RELEASE,
                "flagged_content_fingerprint": flagged_content_fingerprint or "",
            },
        )
    except Exception:
        # Telemetry failure must never block a safe generation -- fail open.
        pass

    record_ai_guardrail_request(task, decision)
    if decision == "BLOCK":
        record_ai_guardrail_block(task, reason_code)
        if reason_code in ("jailbreak_signature",):
            record_ai_jailbreak_attempt(task)
        if reason_code in ("embedded_instruction_in_document", "instruction_smuggling"):
            record_ai_prompt_injection(task)


def log_quota_rejected(*, task: str, request_id: str, user_id: str) -> None:
    log_ai_security_event(
        event_type="ai_quota_rejected", task=task, decision="BLOCK",
        reason_code="quota_or_rate_limit_exceeded", policy_version="n/a",
        request_id=request_id, user_id=user_id,
    )
    record_ai_quota_rejection(task)


def log_input_size_rejected(*, task: str, request_id: str, user_id: str, reason_code: str) -> None:
    log_ai_security_event(
        event_type="ai_input_size_rejected", task=task, decision="BLOCK",
        reason_code=reason_code, policy_version="n/a",
        request_id=request_id, user_id=user_id,
    )
    record_ai_input_size_rejection(task)


def log_schema_rejected(*, task: str, request_id: str, user_id: str, policy_version: str) -> None:
    log_ai_security_event(
        event_type="ai_schema_rejected", task=task, decision="BLOCK",
        reason_code="output_schema_validation_failed", policy_version=policy_version,
        request_id=request_id, user_id=user_id,
    )
    record_ai_output_rejection(task, "output_schema_validation_failed")


def log_output_policy_rejected(*, task: str, request_id: str, user_id: str, policy_version: str, reason_code: str) -> None:
    log_ai_security_event(
        event_type="output_policy_rejected", task=task, decision="BLOCK",
        reason_code=reason_code, policy_version=policy_version,
        request_id=request_id, user_id=user_id,
    )
    record_ai_output_rejection(task, reason_code)


def log_secret_leakage_blocked(*, task: str, request_id: str, user_id: str, policy_version: str) -> None:
    log_ai_security_event(
        event_type="secret_leakage_blocked", task=task, decision="BLOCK",
        reason_code="secret_leakage_blocked", policy_version=policy_version,
        request_id=request_id, user_id=user_id,
    )
    record_ai_output_rejection(task, "secret_leakage_blocked")


def capture_unexpected_guardrail_failure(exc: Exception, *, task: str, policy_version: str, reason_code: str) -> None:
    """Unexpected guardrail subsystem failures (a bug in the gateway itself,
    not a normal blocked user request) go to Sentry. Never attach the
    prompt, resume, JD, or secrets -- see docs/AI_GOVERNANCE.md 'Sentry'."""
    try:
        import sentry_sdk
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("component", "ai_governance")
            scope.set_tag("task", task)
            scope.set_tag("policy_version", policy_version)
            scope.set_tag("reason_code", reason_code)
            sentry_sdk.capture_exception(exc)
    except Exception:
        pass
