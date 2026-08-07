"""Deterministic, pre-LLM input checks. Cheap, run first, catch the large
majority of abuse/malformed-input cases before anything touches a
classifier or the model itself -- see docs/AI_GOVERNANCE.md "Deterministic
First-Layer Checks". No network call, no LLM call, microseconds not
milliseconds.
"""
from __future__ import annotations

import base64
import re
from dataclasses import dataclass


# Absolute ceilings, independent of any one task's own (usually tighter)
# max_instruction_chars/max_document_chars from its TaskPolicy. These exist
# so a misconfigured or future policy can't accidentally allow something
# actually dangerous (a multi-megabyte payload) through.
MAX_AI_REQUEST_BYTES = 2_000_000  # 2MB combined request payload
MAX_SINGLE_FIELD_CHARS = 200_000

_REPEATED_CHAR_RUN = re.compile(r"(.)\1{499,}")  # same char 500+ times in a row
_REPEATED_WHITESPACE_RUN = re.compile(r"\s{2000,}")
_LONG_BASE64_BLOB = re.compile(r"[A-Za-z0-9+/]{2000,}={0,2}")


@dataclass(frozen=True)
class InputCheckResult:
    ok: bool
    reason_code: str = ""
    safe_message: str = ""


def _decoded_paragraph_is_repeated(text: str, *, min_paragraph_len: int = 40) -> bool:
    """Duplicated-paragraph detection: same non-trivial chunk of text
    repeated many times (a common token-bomb / prompt-loop shape that a
    simple repeated-character check would miss)."""
    paragraphs = [p.strip() for p in text.split("\n\n") if len(p.strip()) >= min_paragraph_len]
    if len(paragraphs) < 6:
        return False
    seen: dict[str, int] = {}
    for p in paragraphs:
        seen[p] = seen.get(p, 0) + 1
    most_common = max(seen.values())
    return most_common >= 6 and most_common >= len(paragraphs) * 0.5


def check_request_size(*, total_bytes: int) -> InputCheckResult:
    if total_bytes > MAX_AI_REQUEST_BYTES:
        return InputCheckResult(
            ok=False,
            reason_code="input_size_exceeded",
            safe_message="This request is too large to process. Please reduce the input size.",
        )
    return InputCheckResult(ok=True)


def check_field_size(*, field_name: str, value: str, max_chars: int) -> InputCheckResult:
    if value is None:
        return InputCheckResult(ok=True)
    if len(value) > max(max_chars, 0) or len(value) > MAX_SINGLE_FIELD_CHARS:
        return InputCheckResult(
            ok=False,
            reason_code="input_size_exceeded",
            safe_message=f"The {field_name} you provided is too long. Please shorten it and try again.",
        )
    return InputCheckResult(ok=True)


def check_token_bomb_patterns(*, field_name: str, value: str) -> InputCheckResult:
    """Detects massive repeated strings, duplicated paragraphs, and
    suspicious base64-like blobs -- content engineered to burn output
    tokens or smuggle a payload, not legitimate resume/JD/instruction text.
    """
    if not value:
        return InputCheckResult(ok=True)

    if _REPEATED_CHAR_RUN.search(value):
        return InputCheckResult(
            ok=False,
            reason_code="token_bomb_repeated_char",
            safe_message=f"The {field_name} you provided could not be processed. Please check it and try again.",
        )
    if _REPEATED_WHITESPACE_RUN.search(value):
        return InputCheckResult(
            ok=False,
            reason_code="token_bomb_repeated_whitespace",
            safe_message=f"The {field_name} you provided could not be processed. Please check it and try again.",
        )
    if _decoded_paragraph_is_repeated(value):
        return InputCheckResult(
            ok=False,
            reason_code="token_bomb_duplicated_paragraph",
            safe_message=f"The {field_name} you provided could not be processed. Please check it and try again.",
        )
    blob_match = _LONG_BASE64_BLOB.search(value)
    if blob_match:
        candidate = blob_match.group(0)
        try:
            base64.b64decode(candidate[: len(candidate) - (len(candidate) % 4)], validate=False)
            return InputCheckResult(
                ok=False,
                reason_code="token_bomb_encoded_blob",
                safe_message=f"The {field_name} you provided could not be processed. Please check it and try again.",
            )
        except Exception:
            pass  # Not actually decodable base64 -- a long random-looking string is not itself a violation.
    return InputCheckResult(ok=True)


def check_malformed_encoding(*, field_name: str, value: str) -> InputCheckResult:
    if value is None:
        return InputCheckResult(ok=True)
    try:
        value.encode("utf-8").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return InputCheckResult(
            ok=False,
            reason_code="malformed_encoding",
            safe_message=f"The {field_name} you provided contains characters that could not be processed.",
        )
    # Reject a field that is almost entirely control/non-printable characters
    # once obvious whitespace is excluded -- not human-authored text.
    if len(value) >= 40:
        printable = sum(1 for ch in value if ch.isprintable() or ch in "\n\r\t")
        if printable / max(len(value), 1) < 0.5:
            return InputCheckResult(
                ok=False,
                reason_code="malformed_encoding",
                safe_message=f"The {field_name} you provided could not be processed. Please check it and try again.",
            )
    return InputCheckResult(ok=True)
