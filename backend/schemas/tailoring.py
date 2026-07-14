from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from schemas.resume import ResumeStructure
from schemas.jobs import JobAnalysis

class MissingSkillSuggestion(BaseModel):
    skill: str
    reason: str
    suggestion: str

class BulletSuggestion(BaseModel):
    section_type: str
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
