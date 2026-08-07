"""Structured permission and context models for the AI governance gateway.

These are enforced by the output validator, not just stated in the prompt --
see docs/AI_GOVERNANCE.md "Final Principle": the LLM is never an
authorization authority. A model that ignores its instructions and rewrites
an unselected section still gets rejected here, deterministically.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class AIPermissions(BaseModel):
    """What a single AI call is allowed to change. Callers must construct
    this explicitly per request -- there is no "all true" default, because
    that would silently re-open the exact bypass this model exists to close.
    """
    can_rewrite_text: bool = False
    can_add_summary: bool = False
    can_modify_dates: bool = False
    can_modify_metrics: bool = False
    can_modify_links: bool = False
    can_modify_education: bool = False
    can_modify_achievements: bool = False
    can_add_skills: bool = False
    can_remove_sections: bool = False

    # Section/item scoping for EDIT_WITH_AI and any other task that must be
    # constrained to a caller-declared target. An empty list means "no
    # section-level restriction" (task policy decides whether that's legal --
    # EDIT_WITH_AI's policy requires this to be non-empty; RESUME_TAILOR's
    # does not, since it legitimately operates over the whole resume).
    allowed_section_ids: list[str] = Field(default_factory=list)
    allowed_item_ids: list[str] = Field(default_factory=list)

    model_config = {"frozen": True}


class SafeUserContext(BaseModel):
    """The minimum caller identity the gateway needs. Deliberately does NOT
    carry raw PII beyond what a specific task's policy says it needs --
    prompt_builder.py enforces per-task PII minimization by reading only the
    fields a given TaskPolicy.pii_fields_allowed declares, not this whole
    object. Never log full email/name outside audit fields explicitly
    designed to be redacted."""
    user_id: str
    resume_id: Optional[str] = None
    resume_version: Optional[int] = None
    request_id: str = ""

    model_config = {"frozen": True}


class AIExecutionOptions(BaseModel):
    """Per-call knobs that don't belong on the permanent policy."""
    temperature: float = 0.0
    max_output_tokens: Optional[int] = None
    escalate_on_error: bool = True
    queue_timeout_seconds: Optional[float] = None
    # Skip the LLM cache read/write for this one call (e.g. a user-triggered
    # "regenerate" action that must not return a stale cached result).
    bypass_cache: bool = False

    model_config = {"frozen": True}


class AIExecutionResult(BaseModel):
    """What the gateway hands back to the calling feature service. The
    feature service owns persistence/canonical-merge -- the gateway's job
    ends at "this validated output is safe to use for the declared task."
    """
    output: Any
    task: str
    decision: str  # "allowed" | "allowed_with_restrictions"
    prompt_version: str
    policy_version: str
    schema_version: str
    cache_hit: bool = False
    request_id: str = ""
    restrictions_applied: list[str] = Field(default_factory=list)

    model_config = {"arbitrary_types_allowed": True}
