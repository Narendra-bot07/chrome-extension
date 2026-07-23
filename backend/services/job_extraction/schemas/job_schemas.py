"""Pydantic v2 contracts for the autonomous job-intelligence graph."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class SalaryInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    currency: Optional[str] = None
    period: Optional[str] = None
    raw: Optional[str] = None


class ExtractedJob(BaseModel):
    model_config = ConfigDict(extra="ignore")
    job_title: Optional[str] = Field(
        None, description="Exact role title, excluding job IDs and company names."
    )
    company_name: Optional[str] = Field(
        None,
        description=(
            "Recognizable public employer brand supported by the page. Prefer the "
            "brand over a hiring subsidiary or legal suffix when page/domain evidence "
            "clearly establishes that relationship."
        ),
    )
    location: Optional[str] = Field(
        None, description="Evidence-supported job location, without unrelated locations."
    )
    workplace_type: Literal["remote", "hybrid", "onsite", "unknown"] = "unknown"
    employment_type: Literal[
        "full_time", "part_time", "contract", "internship", "temporary",
        "volunteer", "other", "unknown"
    ] = "unknown"
    seniority: Optional[str] = None
    department: Optional[str] = None
    description: Optional[str] = Field(
        None, description="Clean role overview and job description supported by the selected evidence."
    )
    responsibilities: list[str] = Field(
        default_factory=list, description="Distinct duties and expected outcomes."
    )
    requirements: list[str] = Field(
        default_factory=list, description="Mandatory education, experience, and qualifications."
    )
    preferred_qualifications: list[str] = Field(
        default_factory=list, description="Explicitly preferred or nice-to-have qualifications."
    )
    skills: list[str] = Field(
        default_factory=list,
        description=(
            "All explicit evidence-supported skills: languages, tools, platforms, "
            "frameworks, statistical/scientific methods, analytical techniques, "
            "domain capabilities, and named professional competencies. Use concise "
            "canonical labels and do not omit skills merely because they occur inside "
            "responsibilities or qualification examples."
        ),
    )
    suggested_skills: list[str] = Field(
        default_factory=list,
        description=(
            "Atomic, high-confidence ATS skill recommendations inferred from the role "
            "title, responsibilities, outcomes, seniority, and domain, but not explicitly "
            "stated by the page. These are recommendations, not employer claims. Never "
            "duplicate or mix these into skills."
        ),
    )
    benefits: list[str] = Field(default_factory=list)
    salary: Optional[SalaryInfo] = None
    application_url: Optional[str] = None
    date_posted: Optional[str] = None
    valid_through: Optional[str] = None
    source_url: Optional[str] = None


class ClassificationDecision(BaseModel):
    model_config = ConfigDict(extra="ignore")
    page_type: Literal["job_detail", "job_list", "non_job"]
    confidence: float = Field(ge=0, le=1)
    reasons: list[str] = Field(default_factory=list)
    action: Literal["accept", "browser_retry", "manual_review"] = "accept"


class SkillDecision(BaseModel):
    """Output of the dedicated evidence-aware skill intelligence agent."""

    model_config = ConfigDict(extra="ignore")
    explicit_skills: list[str] = Field(
        default_factory=list,
        description=(
            "Atomic, canonical ATS skill labels explicitly supported by the evidence. "
            "Split every named item in examples and parenthetical lists."
        ),
    )
    suggested_skills: list[str] = Field(
        default_factory=list,
        description=(
            "Atomic role-relevant ATS skill recommendations inferred from the complete "
            "job context but not explicitly stated. Never duplicate explicit_skills."
        ),
    )
    evidence_notes: dict[str, Any] = Field(
        default_factory=dict,
        description="Short source/evidence explanation keyed by explicit skill label.",
    )


class ReviewDecision(BaseModel):
    model_config = ConfigDict(extra="ignore")
    review_issues: list[str] = Field(default_factory=list)
    # LLM tool calls commonly emit either one issue string or an array per
    # field. The reviewer agent normalizes this loose edge contract before it
    # enters the strongly typed JDState.
    field_issues: dict[str, Any] = Field(default_factory=dict)
    repair_fields: list[str] = Field(default_factory=list)
    needs_repair: bool = False
    is_valid: bool = False
    confidence: float = Field(default=0, ge=0, le=1)


class JDState(BaseModel):
    """The single serializable state passed through every LangGraph node."""

    model_config = ConfigDict(extra="forbid", validate_assignment=True)
    request_id: str
    url: str
    original_url: str
    final_url: Optional[str] = None
    detected_portal: str = "generic"
    browser_strategy: dict[str, Any] = Field(default_factory=dict)
    browser_attempts: int = 0
    max_browser_attempts: int = 2
    classification_attempts: int = 0
    max_classification_attempts: int = 1
    raw_html: str = ""
    page_title: Optional[str] = None
    cleaned_html: str = ""
    markdown: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
    jsonld: list[dict[str, Any]] = Field(default_factory=list)
    jobposting_jsonld: list[dict[str, Any]] = Field(default_factory=list)
    detected_sections: dict[str, str] = Field(default_factory=dict)
    discovery: dict[str, Any] = Field(default_factory=dict)
    plan: dict[str, Any] = Field(default_factory=dict)
    page_type: Optional[Literal["job_detail", "job_list", "non_job"]] = None
    classification_confidence: float = 0
    classification_reasons: list[str] = Field(default_factory=list)
    evidence: dict[str, Any] = Field(default_factory=dict)
    source_scores: dict[str, float] = Field(default_factory=dict)
    extracted_job: Optional[dict[str, Any]] = None
    review_issues: list[str] = Field(default_factory=list)
    field_issues: dict[str, list[str]] = Field(default_factory=dict)
    repair_fields: list[str] = Field(default_factory=list)
    needs_repair: bool = False
    repair_attempts: int = 0
    max_repair_attempts: int = 1
    needs_manual_review: bool = False
    is_valid: bool = False
    validation_errors: list[str] = Field(default_factory=list)
    blocked_reason: Optional[str] = None
    error: Optional[dict[str, str]] = None
    final_response: dict[str, Any] = Field(default_factory=dict)
    execution_log: list[dict[str, Any]] = Field(default_factory=list)
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: Optional[str] = None
    duration_ms: int = 0


# Compatibility exports for code outside the removed engine.
SalarySchema = SalaryInfo
ExtractedJobSchema = ExtractedJob
