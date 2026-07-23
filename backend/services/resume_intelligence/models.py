"""Typed contracts for Selected Resume Intelligence."""

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ConfidenceLabel(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    UNKNOWN = "UNKNOWN"


class Confidence(BaseModel):
    score: float = Field(ge=0, le=1)
    label: ConfidenceLabel
    reasons: list[str] = Field(default_factory=list)


def confidence(score: float, *reasons: str) -> Confidence:
    label = (
        ConfidenceLabel.HIGH
        if score >= 0.85
        else ConfidenceLabel.MEDIUM
        if score >= 0.6
        else ConfidenceLabel.LOW
        if score > 0
        else ConfidenceLabel.UNKNOWN
    )
    return Confidence(score=score, label=label, reasons=list(reasons))


class ProvenanceRecord(BaseModel):
    id: str
    source_section: str
    source_entry_id: str | None = None
    original_text: str
    normalized_text: str
    page: int | None = None
    location: str | None = None
    extraction_method: Literal["deterministic", "structured_source", "llm"]
    confidence: Confidence


class SourceReference(BaseModel):
    provenance_ids: list[str] = Field(default_factory=list)


class NormalizedSegment(BaseModel):
    id: str
    original_text: str
    normalized_text: str
    line_start: int
    line_end: int
    page: int | None = None


class ResumeSection(BaseModel):
    id: str
    canonical_type: str
    original_heading: str
    section_order: int
    line_start: int
    line_end: int
    confidence: Confidence
    segments: list[NormalizedSegment] = Field(default_factory=list)


class CandidateInformation(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    portfolio_url: str | None = None
    other_links: list[str] = Field(default_factory=list)
    source: SourceReference = Field(default_factory=SourceReference)


class DateValue(BaseModel):
    original: str
    year: int | None = None
    month: int | None = Field(default=None, ge=1, le=12)
    is_present: bool = False
    confidence: Confidence


class Metric(BaseModel):
    original_text: str
    metric_value: str
    unit: str | None = None
    context: str
    source_bullet: str
    source: SourceReference
    confidence: Confidence


class EvidenceSignal(BaseModel):
    kind: str
    text: str
    source: SourceReference
    confidence: Confidence


class ExperienceEntry(BaseModel):
    id: str
    employer: str | None = None
    role_title: str | None = None
    normalized_role_title: str | None = None
    employment_type: str | None = None
    location: str | None = None
    start_date: DateValue | None = None
    end_date: DateValue | None = None
    currently_employed: bool | None = None
    duration_months: int | None = Field(default=None, ge=0)
    responsibilities: list[str] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    methodologies: list[str] = Field(default_factory=list)
    business_domain: list[str] = Field(default_factory=list)
    collaboration_evidence: list[EvidenceSignal] = Field(default_factory=list)
    leadership_evidence: list[EvidenceSignal] = Field(default_factory=list)
    ownership_evidence: list[EvidenceSignal] = Field(default_factory=list)
    measurable_impact: list[Metric] = Field(default_factory=list)
    source: SourceReference
    confidence: Confidence
    warnings: list[str] = Field(default_factory=list)


class ProjectEntry(BaseModel):
    id: str
    project_name: str | None = None
    project_type: Literal[
        "professional", "academic", "personal", "open_source", "hackathon", "uncertain"
    ] = "uncertain"
    description: list[str] = Field(default_factory=list)
    objective: str | None = None
    problem: str | None = None
    responsibilities: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    architecture_signals: list[str] = Field(default_factory=list)
    datasets_or_systems: list[str] = Field(default_factory=list)
    measurable_outcomes: list[Metric] = Field(default_factory=list)
    deployment_evidence: list[EvidenceSignal] = Field(default_factory=list)
    collaboration_evidence: list[EvidenceSignal] = Field(default_factory=list)
    ownership_evidence: list[EvidenceSignal] = Field(default_factory=list)
    source_link: str | None = None
    associated_context: str | None = None
    source: SourceReference
    confidence: Confidence
    warnings: list[str] = Field(default_factory=list)


class SkillEntry(BaseModel):
    normalized_name: str
    original_mentions: list[str]
    category: str
    status: Literal["explicit", "inferred"]
    source_sections: list[str]
    supporting_evidence: list[str]
    frequency: int = Field(ge=1)
    recency_evidence: str | None = None
    usage_context: list[str] = Field(default_factory=list)
    confidence: Confidence
    source: SourceReference


class EducationEntry(BaseModel):
    id: str
    institution: str | None = None
    degree: str | None = None
    normalized_degree: str | None = None
    field_of_study: str | None = None
    start_date: DateValue | None = None
    graduation_date: DateValue | None = None
    grade: str | None = None
    coursework: list[str] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)
    location: str | None = None
    source: SourceReference
    confidence: Confidence
    warnings: list[str] = Field(default_factory=list)


class CertificationEntry(BaseModel):
    id: str
    name: str
    issuing_organization: str | None = None
    issue_date: DateValue | None = None
    expiry_date: DateValue | None = None
    credential_id: str | None = None
    credential_url: str | None = None
    credential_type: Literal[
        "certification", "course", "training", "workshop", "badge", "uncertain"
    ] = "uncertain"
    status: str | None = None
    source: SourceReference
    confidence: Confidence


class Capability(BaseModel):
    name: str
    status: Literal["explicit", "inferred"]
    supporting_evidence: list[str]
    inference_reason: str | None = None
    limitations: list[str] = Field(default_factory=list)
    confirmation_status: Literal["not_required", "unconfirmed", "confirmed"] = "not_required"
    confidence: Confidence
    source: SourceReference


class DomainExperience(BaseModel):
    domain: str
    supporting_entries: list[str]
    evidence_strength: Literal["strong", "moderate", "weak"]
    status: Literal["explicit", "inferred"]
    confidence: Confidence
    source: SourceReference


class AmbiguityRecord(BaseModel):
    field: str
    issue_type: str
    affected_content: str
    severity: Literal["info", "warning", "critical"]
    evidence: list[str]
    recommended_resolution: str
    user_confirmation_required: bool = False


class InconsistencyRecord(BaseModel):
    field: str
    issue_type: str
    message: str
    affected_entries: list[str] = Field(default_factory=list)
    severity: Literal["warning", "critical"]


class QualitySignal(BaseModel):
    code: str
    message: str
    severity: Literal["info", "warning"]
    evidence: list[str] = Field(default_factory=list)


class ExperienceCalculation(BaseModel):
    total_calendar_months: int = Field(ge=0)
    non_overlapping_professional_months: int = Field(ge=0)
    internship_months: int = Field(ge=0)
    uncertain_months: int = Field(ge=0)
    calculation_confidence: Confidence
    included_entries: list[str]
    excluded_entries: list[str]
    warnings: list[str]


class ReviewIssue(BaseModel):
    code: str
    message: str
    severity: Literal["warning", "critical"]
    field: str | None = None
    repairable: bool = False
    provenance_ids: list[str] = Field(default_factory=list)


class ResumeReview(BaseModel):
    status: Literal[
        "PASSED", "PASSED_WITH_WARNINGS", "NEEDS_REPAIR", "MANUAL_REVIEW", "FAILED"
    ]
    issues: list[ReviewIssue] = Field(default_factory=list)


class SelectedResumeLock(BaseModel):
    resume_id: str
    version: int = Field(ge=1)
    fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    display_name: str
    source_type: str
    locked: bool = True


class SelectedResumeIntelligence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resume_id: str
    resume_version: int
    resume_fingerprint: str
    source_type: str
    display_name: str
    candidate: CandidateInformation = Field(default_factory=CandidateInformation)
    professional_summary: str | None = None
    experience: list[ExperienceEntry] = Field(default_factory=list)
    projects: list[ProjectEntry] = Field(default_factory=list)
    skills: list[SkillEntry] = Field(default_factory=list)
    education: list[EducationEntry] = Field(default_factory=list)
    certifications: list[CertificationEntry] = Field(default_factory=list)
    achievements: list[Metric | EvidenceSignal] = Field(default_factory=list)
    leadership: list[EvidenceSignal] = Field(default_factory=list)
    publications: list[dict[str, Any]] = Field(default_factory=list)
    languages: list[dict[str, Any]] = Field(default_factory=list)
    links: list[str] = Field(default_factory=list)
    custom_sections: list[ResumeSection] = Field(default_factory=list)
    total_experience: ExperienceCalculation
    explicit_capabilities: list[Capability] = Field(default_factory=list)
    inferred_capabilities: list[Capability] = Field(default_factory=list)
    measurable_impact: list[Metric] = Field(default_factory=list)
    domain_experience: list[DomainExperience] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    inconsistencies: list[InconsistencyRecord] = Field(default_factory=list)
    ambiguities: list[AmbiguityRecord] = Field(default_factory=list)
    quality_signals: list[QualitySignal] = Field(default_factory=list)
    provenance: dict[str, ProvenanceRecord] = Field(default_factory=dict)
    confidence: Confidence
    parser_version: str = "resume-normalizer-v1"
    intelligence_version: str = "resume-intelligence-v1"


class Phase2Output(BaseModel):
    status: Literal["completed", "waiting_for_user", "blocked", "manual_review", "failed"]
    selected_resume: SelectedResumeLock | None = None
    resume_intelligence: SelectedResumeIntelligence | None = None
    review: ResumeReview | None = None
    version: str = "resume-intelligence-v1"
    workflow_id: str
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def completed_requires_intelligence(self) -> "Phase2Output":
        if self.status == "completed" and (
            self.selected_resume is None or self.resume_intelligence is None
        ):
            raise ValueError("completed output requires selected resume intelligence")
        return self
