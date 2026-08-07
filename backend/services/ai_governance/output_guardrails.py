"""Generic (task-independent) output validation. Runs on every gateway
result before it's returned to the calling feature. Task-specific "domain"
rules (no employer fabrication, no date changes, etc.) are a SEPARATE,
later step -- see policies.py's DomainValidator -- because those require
knowing the resume schema, not just generic safety.

Never trust model output. See docs/AI_GOVERNANCE.md "Output Guardrails".
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from pydantic import BaseModel

from services.ai_governance.permissions import AIPermissions
from services.ai_governance.redaction import contains_secret_like_material

_SCRIPT_TAG = re.compile(r"<\s*script\b", re.IGNORECASE)
_DANGEROUS_URL_SCHEME = re.compile(r"\b(javascript|data|vbscript)\s*:", re.IGNORECASE)
_SYSTEM_PROMPT_LEAK_MARKERS = (
    "SECURITY RULES (these override",
    "<untrusted_data",
    "TASK POLICY (",
)


@dataclass(frozen=True)
class OutputCheckResult:
    ok: bool
    reason_code: str = ""
    safe_message: str = ""


def _iter_strings(value) -> list[str]:
    """Flattens a Pydantic model / dict / list / str into every string leaf,
    so checks below run over the whole output regardless of its schema
    shape."""
    if isinstance(value, BaseModel):
        return _iter_strings(value.model_dump())
    if isinstance(value, dict):
        out = []
        for v in value.values():
            out.extend(_iter_strings(v))
        return out
    if isinstance(value, (list, tuple, set)):
        out = []
        for v in value:
            out.extend(_iter_strings(v))
        return out
    if isinstance(value, str):
        return [value]
    return []


def check_non_empty(output) -> OutputCheckResult:
    if output is None:
        return OutputCheckResult(
            ok=False, reason_code="empty_output",
            safe_message="We couldn't safely validate the generated content. Please try again.",
        )
    strings = _iter_strings(output)
    if not strings or not any(s.strip() for s in strings):
        return OutputCheckResult(
            ok=False, reason_code="empty_output",
            safe_message="We couldn't safely validate the generated content. Please try again.",
        )
    return OutputCheckResult(ok=True)


def check_no_secret_leakage(output) -> OutputCheckResult:
    for text in _iter_strings(output):
        if contains_secret_like_material(text):
            return OutputCheckResult(
                ok=False, reason_code="secret_leakage_blocked",
                safe_message="We couldn't safely validate the generated content. Please try again.",
            )
    return OutputCheckResult(ok=True)


def check_no_system_prompt_leakage(output) -> OutputCheckResult:
    for text in _iter_strings(output):
        for marker in _SYSTEM_PROMPT_LEAK_MARKERS:
            if marker in text:
                return OutputCheckResult(
                    ok=False, reason_code="system_prompt_leakage",
                    safe_message="We couldn't safely validate the generated content. Please try again.",
                )
    return OutputCheckResult(ok=True)


def check_no_unsafe_html(output) -> OutputCheckResult:
    """Model output must be treated as text, never rendered as trusted
    HTML. This blocks the generation-time leakage of script tags and
    dangerous URL schemes; the frontend must ALSO render with a hardened
    markdown renderer (raw HTML disabled) as a second, independent layer --
    see docs/AI_GOVERNANCE.md "XSS / Rendering Safety". Defense in depth:
    this check existing does not excuse the frontend from sanitizing too.
    """
    for text in _iter_strings(output):
        if _SCRIPT_TAG.search(text) or _DANGEROUS_URL_SCHEME.search(text):
            return OutputCheckResult(
                ok=False, reason_code="unsafe_html_or_url",
                safe_message="We couldn't safely validate the generated content. Please try again.",
            )
    return OutputCheckResult(ok=True)


def check_section_scoping(
    output_section_ids: list[str],
    *,
    permissions: AIPermissions,
) -> OutputCheckResult:
    """For any task whose policy sets requires_section_scoping=True (e.g.
    EDIT_WITH_AI): the model's output must not claim to modify any section
    ID outside permissions.allowed_section_ids, no matter what the user's
    free-text instruction asked for ("also rewrite my entire resume" must
    not expand scope). This is enforced here, deterministically -- not
    left to the system prompt alone."""
    allowed = set(permissions.allowed_section_ids)
    offending = [sid for sid in output_section_ids if sid not in allowed]
    if offending:
        return OutputCheckResult(
            ok=False, reason_code="section_scope_violation",
            safe_message="The requested edit is outside the selected resume section.",
        )
    return OutputCheckResult(ok=True)


def run_generic_output_checks(output) -> OutputCheckResult:
    """Runs the task-independent checks in order, short-circuiting on the
    first failure. Domain/section-scoping checks are run separately by the
    gateway once it knows the task's policy."""
    for check in (check_non_empty, check_no_secret_leakage, check_no_system_prompt_leakage, check_no_unsafe_html):
        result = check(output)
        if not result.ok:
            return result
    return OutputCheckResult(ok=True)
