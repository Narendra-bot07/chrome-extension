"""Pydantic v2 contracts for the autonomous job-intelligence graph."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SalaryInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")
    minimum: Optional[float] = None
    maximum: Optional[float] = None
    currency: Optional[str] = None
    period: Optional[str] = None
    raw: Optional[str] = None

    @field_validator("minimum", "maximum", mode="before")
    @classmethod
    def normalize_salary_number(cls, value: Any) -> Optional[float]:
        if value is None or value == "":
            return None
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            cleaned = re.sub(r"[^\d.]", "", value)
            if cleaned:
                try:
                    return float(cleaned)
                except ValueError:
                    return None
        return None

    @field_validator("currency", "period", "raw", mode="before")
    @classmethod
    def normalize_salary_str(cls, value: Any) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, str):
            val = value.strip()
            return val if val else None
        val = str(value).strip()
        return val if val else None


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
    company_domain: Optional[str] = Field(
        None,
        description=(
            "Official employer hostname supported by the source page or structured "
            "metadata, for example microsoft.com. Never construct it from company_name."
        ),
    )
    location: Optional[str] = Field(
        None, description="Evidence-supported job location, without unrelated locations."
    )
    workplace_type: Optional[str] = "unknown"
    employment_type: Optional[str] = "unknown"
    seniority: Optional[str] = None
    department: Optional[str] = None
    description: Optional[str] = Field(
        None, description="Clean role overview and job description supported by the selected evidence."
    )
    responsibilities: Optional[list[str]] = Field(
        default_factory=list, description="Distinct duties and expected outcomes."
    )
    requirements: Optional[list[str]] = Field(
        default_factory=list, description="Mandatory education, experience, and qualifications."
    )
    preferred_qualifications: Optional[list[str]] = Field(
        default_factory=list, description="Explicitly preferred or nice-to-have qualifications."
    )
    skills: Optional[list[str]] = Field(
        default_factory=list,
        description=(
            "All explicit evidence-supported skills: languages, tools, platforms, "
            "frameworks, statistical/scientific methods, analytical techniques, "
            "domain capabilities, and named professional competencies. Use concise "
            "canonical labels and do not omit skills merely because they occur inside "
            "responsibilities or qualification examples."
        ),
    )
    suggested_skills: Optional[list[str]] = Field(
        default_factory=list,
        description=(
            "Atomic, high-confidence ATS skill recommendations inferred from the role "
            "title, responsibilities, outcomes, seniority, and domain, but not explicitly "
            "stated by the page. These are recommendations, not employer claims. Never "
            "duplicate or mix these into skills."
        ),
    )
    benefits: Optional[list[str]] = Field(default_factory=list)
    salary: Optional[SalaryInfo] = None
    application_url: Optional[str] = None
    date_posted: Optional[str] = None
    valid_through: Optional[str] = None
    source_url: Optional[str] = None

    @field_validator(
        "job_title",
        "company_name",
        "company_domain",
        "location",
        "seniority",
        "department",
        "description",
        "application_url",
        "date_posted",
        "valid_through",
        "source_url",
        mode="before",
    )
    @classmethod
    def normalize_optional_strings(cls, value: Any) -> Optional[str]:
        if value is None or value == "":
            return None
        if isinstance(value, str):
            val = value.strip()
            return val if val else None
        if isinstance(value, (list, tuple, set)):
            val = ", ".join(str(x).strip() for x in value if x is not None and str(x).strip())
            return val if val else None
        val = str(value).strip()
        return val if val else None

    @field_validator(
        "responsibilities",
        "requirements",
        "preferred_qualifications",
        "skills",
        "suggested_skills",
        "benefits",
        mode="before",
    )
    @classmethod
    def normalize_optional_lists(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            val = value.strip()
            if not val:
                return []
            if "\n" in val:
                return [line.strip("- •*").strip() for line in val.split("\n") if line.strip()]
            return [val]
        if isinstance(value, (list, tuple, set)):
            res = []
            for item in value:
                if item is None:
                    continue
                s = str(item).strip()
                if s:
                    res.append(s)
            return res
        if isinstance(value, dict):
            return [str(v).strip() for v in value.values() if v is not None and str(v).strip()]
        s = str(value).strip()
        return [s] if s else []

    @field_validator("salary", mode="before")
    @classmethod
    def normalize_salary(cls, value: Any) -> Optional[SalaryInfo | dict[str, Any]]:
        if value is None or value == "":
            return None
        if isinstance(value, (SalaryInfo, dict)):
            return value
        if isinstance(value, str):
            val = value.strip()
            return {"raw": val} if val else None
        return {"raw": str(value)}

    @field_validator("workplace_type", mode="before")
    @classmethod
    def normalize_workplace_type(cls, value: Any) -> str:
        text = str(value or "").strip().casefold().replace("-", " ").replace("_", " ")
        if "hybrid" in text:
            return "hybrid"
        if "remote" in text or "work from home" in text:
            return "remote"
        if any(marker in text for marker in ("onsite", "on site", "in office", "office based")):
            return "onsite"
        return "unknown"

    @field_validator("employment_type", mode="before")
    @classmethod
    def normalize_employment_type(cls, value: Any) -> str:
        text = str(value or "").strip().casefold().replace("-", " ").replace("_", " ")
        if "intern" in text:
            return "internship"
        if "part time" in text:
            return "part_time"
        if "full time" in text or text == "permanent":
            return "full_time"
        if "volunteer" in text:
            return "volunteer"
        if "temporary" in text or text == "temp":
            return "temporary"
        if any(marker in text for marker in ("contract", "freelance", "consultant")):
            return "contract"
        if text in {"other", "unknown", "", "not specified", "n/a"}:
            return "unknown"
        return "other"


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


class EvidenceSource(BaseModel):
    """One independently evaluated acquisition source."""

    model_config = ConfigDict(extra="ignore")
    source_type: str
    access_status: Literal[
        "available", "unavailable", "usable", "partial", "restricted",
        "stale", "malformed", "empty", "failed"
    ] = "unavailable"
    available: bool = False
    usable: bool = False
    restricted: bool = False
    restriction_type: Optional[str] = None
    restriction_confidence: float = Field(default=0, ge=0, le=1)
    restriction_signals: list[str] = Field(default_factory=list)
    content_length: int = 0
    job_signal_score: float = Field(default=0, ge=0, le=1)
    quality_score: float = Field(default=0, ge=0, le=1)
    freshness_score: float = Field(default=1, ge=0, le=1)
    specificity_score: float = Field(default=0, ge=0, le=1)
    selected_job_signal: bool = False
    contains_security_challenge: bool = False
    contains_login_wall: bool = False
    content: Any = None
    warnings: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class JDState(BaseModel):
    """The single serializable state passed through every LangGraph node."""

    model_config = ConfigDict(extra="forbid", validate_assignment=True)
    request_id: str
    url: str
    original_url: str
    final_url: Optional[str] = None
    detected_portal: str = "generic"
    browser_strategy: dict[str, Any] = Field(default_factory=dict)
    extension_evidence: dict[str, Any] = Field(default_factory=dict)
    evidence_sources: list[dict[str, Any]] = Field(default_factory=list)
    evidence_sources_discovered: list[str] = Field(default_factory=list)
    selected_evidence_source: Optional[str] = None
    primary_source: Optional[str] = None
    source_selection_reason: Optional[str] = None
    supplementary_sources: list[str] = Field(default_factory=list)
    excluded_sources: list[str] = Field(default_factory=list)
    source_restrictions: dict[str, dict[str, Any]] = Field(default_factory=dict)
    page_access_status: Optional[Literal[
        "fully_accessible", "partially_accessible", "extension_accessible",
        "backend_accessible", "evidence_available", "fully_blocked",
        "insufficient_evidence", "unknown"
    ]] = None
    surface_type: Optional[Literal[
        "job_detail", "job_list", "career_home", "login", "blocked", "non_job"
    ]] = None
    extraction_readiness: Literal[
        "READY", "PARTIAL", "NOT_READY", "BLOCKED", "MANUAL_REVIEW"
    ] = "NOT_READY"
    selected_job_detected: bool = False
    selected_job_identity: Optional[dict[str, Any]] = None
    evidence_conflicts: list[str] = Field(default_factory=list)
    planner_warnings: list[str] = Field(default_factory=list)
    restriction_type: Optional[Literal[
        "login_required", "captcha", "access_denied", "rate_limited",
        "security_challenge", "empty_shell", "javascript_not_rendered",
        "permission_required", "unknown"
    ]] = None
    browser_attempts: int = 0
    max_browser_attempts: int = 1
    classification_attempts: int = 0
    max_classification_attempts: int = 1
    raw_html: str = ""
    backend_raw_html: str = ""
    backend_final_url: Optional[str] = None
    backend_page_title: Optional[str] = None
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
