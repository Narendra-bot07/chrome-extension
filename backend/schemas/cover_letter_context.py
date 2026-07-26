from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class CoverLetterContextRequest(BaseModel):
    resume: dict[str, Any]
    resume_intelligence: Optional[dict[str, Any]] = None
    jd: dict[str, Any]
    jd_intelligence: Optional[dict[str, Any]] = None
    user_answers: dict[str, Any] = Field(default_factory=dict)
    skipped_questions: list[str] = Field(default_factory=list)
    resume_id: Optional[str] = None
    jd_id: Optional[str] = None


class CoverLetterEvidence(BaseModel):
    source_section: str
    source_entry_id: str
    exact_factual_evidence: str
    relevance_to_jd: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class ClarificationQuestion(BaseModel):
    id: str
    prompt: str
    kind: Literal["choice", "text", "optional_text"]
    options: list[str] = Field(default_factory=list)
    required: bool = False
    material_reason: str


class CoverLetterContext(BaseModel):
    resume_id: Optional[str] = None
    jd_id: Optional[str] = None
    job: dict[str, Any]
    recipient: dict[str, Any]
    candidate: dict[str, Any]
    role_requirements: dict[str, list[str]]
    selected_evidence: list[CoverLetterEvidence]
    user_preferences: dict[str, Any]
    missing_fields: list[str]
    questions: list[ClarificationQuestion]
    ready_for_generation: bool
    status: Literal[
        "collecting_context", "awaiting_user_input", "ready_for_generation",
        "generated", "failed"
    ]
    scope_fingerprint: str
