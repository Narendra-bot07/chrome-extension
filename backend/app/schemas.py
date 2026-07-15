from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class PersonalInfo(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin: str = ""
    website: str = ""
    github: str = ""
    job_title: str = ""

class ExperienceItem(BaseModel):
    company: str = ""
    role: str = ""
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    description: List[str] = []

class ProjectItem(BaseModel):
    name: str = ""
    role: str = ""
    technology_stack: List[str] = []
    link: str = ""
    description: List[str] = []

class EducationItem(BaseModel):
    institution: str = ""
    degree: str = ""
    field_of_study: str = ""
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    gpa: str = ""

class CertificationItem(BaseModel):
    name: str = ""
    issuing_organization: str = ""
    issue_date: str = ""
    expiration_date: str = ""
    credential_id: str = ""

class ResumeStructure(BaseModel):
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
    awards: List[Dict[str, Any]] = []
    interests: List[str] = []
    portfolio: str = ""
    links: Dict[str, str] = {}
    section_order: Optional[List[str]] = None
    layout_level: Optional[int] = None
    raw_text: Optional[str] = ""

class JobAnalysis(BaseModel):
    is_job_related: bool = True
    title: str = ""
    company: str = ""
    location: str = ""
    salary: str = ""
    job_type: str = ""
    work_mode: str = ""
    experience_required: str = ""
    highlights: List[str] = []
    qualifications: List[str] = []
    required_skills: List[str] = []
    preferred_skills: List[str] = []
    skills_categories: Optional[Dict[str, List[str]]] = {}
    responsibilities: List[str] = []
    keywords: List[str] = []
    ats_keywords: List[str] = []
    seniority: str = ""

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


class DownloadPDFRequest(BaseModel):
    resume: ResumeStructure
    template_name: str = "modern"

class CoverLetterResult(BaseModel):
    recipient_name: str = "Hiring Manager"
    company_name: str = ""
    date: str = ""
    salutation: str = "Dear Hiring Manager,"
    body: str = ""
    signoff: str = "Sincerely,\n[Your Name]"

class CoverLetterRequest(BaseModel):
    resume: ResumeStructure
    job: JobAnalysis

# Multi-Editor Architecture Schemas

class ResumePatch(BaseModel):
    summary: Optional[str] = None
    skills_append: List[str] = []
    # Keyed by item_index (stringified int), then bullet_index (stringified int)
    experience: Dict[str, Dict[str, str]] = {}
    projects: Dict[str, Dict[str, str]] = {}

class TailoringReport(BaseModel):
    changes_made: List[str] = []
    ats_score_before: int = 0
    ats_score_after: int = 0
    patch: ResumePatch

class GapsAnalysis(BaseModel):
    missing_keywords: List[str] = []

class SummaryEditorOutput(BaseModel):
    updated_summary: str
    change_reason: str

class SkillsEditorOutput(BaseModel):
    skills_to_append: List[str]
    change_reason: str

class BulletUpdate(BaseModel):
    bullet_index: int
    updated_bullet: str
    reason: str

class ExperienceEditorOutput(BaseModel):
    updates: List[BulletUpdate] = []

class ProjectEditorOutput(BaseModel):
    updates: List[BulletUpdate] = []

class TailorRequest(BaseModel):
    resume: ResumeStructure
    patch: ResumePatch

# Multi-Agent Platform Redesign Schemas

class TailoringStrategy(BaseModel):
    summary_focus: str
    skills_to_add: List[str]
    experience_goals: Dict[str, str] = {} # Bullet-by-bullet focus guide for experience indexes
    project_goals: Dict[str, str] = {} # Bullet-by-bullet focus guide for project indexes
    reasoning: str

class FactVerificationResult(BaseModel):
    is_valid: bool
    hallucinations: List[str] = [] # List of any fabricated facts/metrics/dates
    corrections: Dict[str, str] = {} # Keyed by path e.g. "experience.0.description.1" -> corrected text

class ReviewReport(BaseModel):
    score: int = 0 # 0-100 rating
    strengths: List[str] = []
    weaknesses: List[str] = []
    actionable_feedback: List[str] = []

