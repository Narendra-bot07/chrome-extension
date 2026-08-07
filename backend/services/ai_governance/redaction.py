"""Recursive sensitive-field redaction, applied to every gateway input
before it reaches a prompt, and to audit/telemetry payloads before they
leave the process. Two independent mechanisms, since a secret can arrive
either as a suspiciously-named field (a stray `access_token` key nested in
some payload) or as a suspiciously-shaped VALUE with an innocuous key name
(a JWT pasted into a free-text "instruction" field).
"""
from __future__ import annotations

import re
from typing import Any

# Key-name based redaction: catches secrets carried in structured dict
# fields regardless of what the value looks like.
_SENSITIVE_KEY_PATTERN = re.compile(
    r"(password|secret|token|api[_-]?key|authorization|cookie|"
    r"client[_-]?secret|refresh[_-]?token|access[_-]?token|"
    r"private[_-]?key|session[_-]?id|bearer)",
    re.IGNORECASE,
)

# Value-shape based redaction: catches secrets even under an innocent key
# name (e.g. a JWT or connection string pasted into a free-text field).
_VALUE_PATTERNS = (
    # JWT: header.payload.signature, base64url segments
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
    # Bearer token in a header-like string
    re.compile(r"\bBearer\s+[A-Za-z0-9._-]{16,}\b", re.IGNORECASE),
    # Common cloud/service API key prefixes
    re.compile(r"\b(sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b"),
    # Database/service connection URLs with embedded credentials
    re.compile(r"\b[a-z][a-z0-9+.-]*://[^\s:@/]+:[^\s:@/]+@[^\s/]+", re.IGNORECASE),
    # Signed/presigned URLs (R2/S3-style) carrying a credential in the query string
    re.compile(r"[?&](?:X-Amz-Signature|Signature|token|access_token)=[^&\s]+", re.IGNORECASE),
)

_REDACTED = "[REDACTED]"
_MAX_DEPTH = 12


def redact_value(value: Any) -> Any:
    """Redacts secret-shaped substrings inside a single string value.
    Non-string values pass through unchanged (redact_payload handles
    recursion/key-name checks for dicts/lists)."""
    if not isinstance(value, str):
        return value
    redacted = value
    for pattern in _VALUE_PATTERNS:
        redacted = pattern.sub(_REDACTED, redacted)
    return redacted


def redact_payload(payload: Any, *, _depth: int = 0) -> Any:
    """Recursively redacts a dict/list/str payload before it's allowed into
    a prompt or a telemetry/audit record. Depth-bounded so a maliciously
    deep/self-referential structure can't hang this (also a token-bomb
    defense concern -- see input_guardrails.py for the size-side check)."""
    if _depth >= _MAX_DEPTH:
        return "[MAX_DEPTH_EXCEEDED]"
    if isinstance(payload, dict):
        out = {}
        for key, val in payload.items():
            if _SENSITIVE_KEY_PATTERN.search(str(key)):
                out[key] = _REDACTED
            else:
                out[key] = redact_payload(val, _depth=_depth + 1)
        return out
    if isinstance(payload, (list, tuple)):
        return [redact_payload(item, _depth=_depth + 1) for item in payload]
    if isinstance(payload, str):
        return redact_value(payload)
    return payload


def contains_secret_like_material(text: str) -> bool:
    """Used by output_guardrails.py to block model output that resembles a
    leaked credential, regardless of what field it's in."""
    if not isinstance(text, str) or not text:
        return False
    return any(pattern.search(text) for pattern in _VALUE_PATTERNS)
