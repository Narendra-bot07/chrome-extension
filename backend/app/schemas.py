from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import List, Optional, Dict, Any, Union
from schemas.resume import ResumeLayoutModel, RenderableResume
from schemas.tailoring import TailorRequest, DownloadPDFRequest, CoverLetterRequest, TailoringReport, ResumePatch

class PersonalInfo(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin: str = ""
    website: str = ""
    github: str = ""
    job_title: str = ""

class ExperienceItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    company: str = ""
    role: str = ""
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    description: Union[List[str], str] = Field(default_factory=list)

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, v):
        if isinstance(v, str):
            items = [item.strip(" •\t\r") for item in v.replace("\r", "").split("\n") if item.strip()]
            return items if items else [v.strip()]
        if isinstance(v, list):
            return [str(item).strip() for item in v if item]
        return []

class ProjectItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = ""
    role: str = ""
    technology_stack: Union[List[str], str] = Field(default_factory=list)
    link: str = ""
    description: Union[List[str], str] = Field(default_factory=list)

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, v):
        if isinstance(v, str):
            items = [item.strip(" •\t\r") for item in v.replace("\r", "").split("\n") if item.strip()]
            return items if items else [v.strip()]
        if isinstance(v, list):
            return [str(item).strip() for item in v if item]
        return []

    @field_validator("technology_stack", mode="before")
    @classmethod
    def normalize_tech_stack(cls, v):
        if isinstance(v, str):
            items = [item.strip() for item in v.split(",") if item.strip()]
            return items if items else [v.strip()]
        if isinstance(v, list):
            return [str(item).strip() for item in v if item]
        return []

class EducationItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    institution: str = ""
    degree: str = ""
    field_of_study: str = ""
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    gpa: str = ""

class CertificationItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = ""
    issuing_organization: str = ""
    issue_date: str = ""
    expiration_date: str = ""
    credential_id: str = ""
    credential_url: str = ""
    url: str = ""

class ResumeStructure(BaseModel):
    model_config = ConfigDict(extra="allow")
    personal_info: PersonalInfo = Field(default_factory=PersonalInfo)
    summary: str = ""
    experience: List[ExperienceItem] = []
    projects: List[ProjectItem] = []
    education: List[EducationItem] = []
    skills: List[str] = []
    skills_categories: Optional[Dict[str, List[str]]] = {}
    certifications: List[CertificationItem] = []
    achievements: List[str] = []
    publications: List[Dict[str, Any]] = []
    languages: List[Dict[str, Any]] = []
    volunteer_experience: List[Dict[str, Any]] = []
    open_source: List[Dict[str, Any]] = []
    leadership: List[Dict[str, Any]] = []
    extracurricular_activities: List[Dict[str, Any]] = []
    custom_sections: List[Dict[str, Any]] = []
    awards: List[Dict[str, Any]] = []
    interests: List[str] = []
    portfolio: str = ""
    links: Dict[str, str] = {}
    section_order: Optional[List[str]] = None
    layout_level: Optional[int] = None
    # The legacy /api router still owns PDF download. Keep its request
    # contract aligned with the canonical resume schema used by the editor.
    layout_model: Optional[ResumeLayoutModel] = None
    raw_text: Optional[str] = ""

class JobAnalysis(BaseModel):
    is_job_related: bool = True
    reason: Optional[str] = ""
    title: Optional[str] = ""
    company: Optional[str] = ""
    location: Optional[str] = ""
    salary: Optional[str] = ""
    job_type: Optional[str] = ""
    work_mode: Optional[str] = ""
    experience_required: Optional[str] = ""
    highlights: List[str] = []
    qualifications: List[str] = []
    required_skills: List[str] = []
    preferred_skills: List[str] = []
    skills_categories: Optional[Dict[str, List[str]]] = {}
    responsibilities: List[str] = []
    keywords: List[str] = []
    ats_keywords: List[str] = []
    seniority: Optional[str] = ""
    cover_letter_context: Optional[Dict[str, Any]] = None

    @field_validator("salary", mode="before")
    @classmethod
    def normalize_salary_field(cls, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, dict):
            raw = value.get("raw")
            if raw:
                return str(raw).strip()
            minimum = value.get("minimum", value.get("min"))
            maximum = value.get("maximum", value.get("max"))
            currency = value.get("currency") or ""
            period = value.get("period") or ""
            parts = [currency]
            if minimum is not None and maximum is not None:
                parts.append(f"{minimum} - {maximum}")
            elif minimum is not None:
                parts.append(str(minimum))
            elif maximum is not None:
                parts.append(str(maximum))
            if period:
                parts.append(str(period))
            return " ".join(p for p in parts if p).strip()
        if hasattr(value, "raw") and getattr(value, "raw"):
            return str(getattr(value, "raw")).strip()
        return str(value)

    @field_validator("reason", "title", "company", "location", "job_type", "work_mode", "experience_required", "seniority", mode="before")
    @classmethod
    def normalize_str_fields(cls, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, (list, tuple, set)):
            return ", ".join(str(x) for x in value if x is not None)
        return str(value)

    @field_validator("highlights", "qualifications", "required_skills", "preferred_skills", "responsibilities", "keywords", "ats_keywords", mode="before")
    @classmethod
    def normalize_list_fields(cls, value: Any) -> List[str]:
        if value is None:
            return []
        if isinstance(value, str):
            val = value.strip()
            return [val] if val else []
        if isinstance(value, (list, tuple, set)):
            return [str(x).strip() for x in value if x is not None and str(x).strip()]
        if isinstance(value, dict):
            return [str(v).strip() for v in value.values() if v is not None and str(v).strip()]
        return [str(value).strip()]

class MissingSkillSuggestion(BaseModel):
    skill: str
    reason: str
    suggestion: str

class BulletSuggestion(BaseModel):
    section_type: str  # "experience" or "projects"
    item_index: int
    bullet_index: int
    original_bullet: str
    suggested_bullet: str
    reason: str

class SummarySuggestion(BaseModel):
    original_summary: str
    suggested_summary: str
    reason: str

class ComparisonResult(BaseModel):
    ats_score: int
    missing_skills: List[MissingSkillSuggestion] = []
    bullet_suggestions: List[BulletSuggestion] = []
    summary_suggestion: Optional[SummarySuggestion] = None
    key_action_items: List[str] = []

class MissingSkillItem(BaseModel):
    skill: str
    importance: str  # "High", "Medium", "Low"
    category: str
    reason: str

class BulletRewriteItem(BaseModel):
    section: str  # "experience" or "projects"
    item_index: int
    bullet_index: int
    original: str
    suggested: str
    targeted_skills: List[str]
    reason: str

class SectionGapDetail(BaseModel):
    section_name: str
    current_score: int
    gaps_found: List[str]
    improvement_ideas: List[str]

class GapsAnalysis(BaseModel):
    overall_match_score: int
    summary_feedback: str
    missing_skills: List[MissingSkillItem]
    bullet_rewrites: List[BulletRewriteItem]
    section_breakdown: List[SectionGapDetail]

class ScopeCheckResult(BaseModel):
    in_scope: bool
    reason: str = ""

class SummaryEditorOutput(BaseModel):
    summary: str
    added_keywords: List[str]

class SkillsEditorOutput(BaseModel):
    skills: List[str]
    skills_categories: Dict[str, List[str]]

class ExperienceEditorOutput(BaseModel):
    experience: List[ExperienceItem]

class ProjectEditorOutput(BaseModel):
    projects: List[ProjectItem]

class BulletEditorOutput(BaseModel):
    """Structure-preserving output for editing existing resume bullets."""
    updated_bullets: List[str]

class RecordEditorOutput(BaseModel):
    """Structure-preserving output for education and other record sections."""
    updated_records: List[Any]

class CoverLetterResult(BaseModel):
    cover_letter: str
    recipient_name: Optional[str] = "Hiring Manager"
    recipient_title: Optional[str] = "Recruiter"
    company_name: Optional[str] = ""
    job_title: Optional[str] = ""
    key_highlights: List[str] = []

class TailoringStrategy(BaseModel):
    summary_focus: str = ""
    target_skills_to_add: List[str] = []
    experience_goals: Dict[str, Any] = {}
    project_goals: Dict[str, Any] = {}
    key_theme: str = ""

class FactVerificationResult(BaseModel):
    is_valid: bool = True
    hallucinations: List[str] = []
    corrections: Dict[str, str] = {}

class ReviewReport(BaseModel):
    score: int = 0
    strengths: List[str] = []
    weaknesses: List[str] = []
    actionable_feedback: List[str] = []
