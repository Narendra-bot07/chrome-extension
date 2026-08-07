"""Safe, user-facing-safe exception types for the governance gateway.

`safe_message` is what a route handler may show the user. It must never
contain guardrail regexes, classifier prompts, system prompts, internal
thresholds, or anything else useful for bypass attempts -- see
docs/AI_GOVERNANCE.md "Error Messages". `reason_code` is for internal
audit/telemetry only (bounded, low-cardinality, never raw user text).
"""
from __future__ import annotations

from typing import Optional


class AIGovernanceError(Exception):
    """Base class for every error the gateway raises."""

    def __init__(self, safe_message: str, *, reason_code: str, details: Optional[dict] = None):
        super().__init__(safe_message)
        self.safe_message = safe_message
        self.reason_code = reason_code
        self.details = details or {}


class AIGovernanceBlockedError(AIGovernanceError):
    """A guardrail (prompt injection, jailbreak, abuse classification,
    output policy, secret leakage) blocked this request. Fail closed --
    never persist, never return the underlying content."""


class AIGovernanceQuotaError(AIGovernanceError):
    """Rate limit or product quota exceeded. Raised before any DeepSeek
    call is made."""


class AIGovernanceValidationError(AIGovernanceError):
    """Input size/encoding validation, unknown task type, missing policy,
    or output schema/domain validation failure. Fail closed."""
