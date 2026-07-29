from pydantic import BaseModel, ConfigDict, Field
from typing import List, Dict, Any, Optional
from schemas.resume import RenderableResume, ResumeStructure
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
    resume: RenderableResume
    original_resume: Optional[RenderableResume] = None
    intentional_removals: List[str] = []
    approved_additions: List[str] = []
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
    summary: Optional[str] = Field(default=None, description="Updated professional summary text string, or null if unchanged.")
    skills_append: List[str] = Field(default_factory=list, description="List of skill strings to append to the skills section.")
    # Keyed by item_index (stringified int e.g. '0'), then bullet_index (stringified int e.g. '0') to updated text string (e.g. {'0': {'0': 'Updated bullet text'}})
    experience: Dict[str, Dict[str, str]] = Field(default_factory=dict, description="Dictionary mapping item index string (e.g. '0') to bullet index string (e.g. '0') to updated bullet text string (e.g. {'0': {'0': 'Rewritten bullet text'}}). DO NOT return full experience objects or arrays.")
    projects: Dict[str, Dict[str, str]] = Field(default_factory=dict, description="Dictionary mapping item index string (e.g. '0') to bullet index string (e.g. '0') to updated bullet text string (e.g. {'0': {'0': 'Rewritten bullet text'}}). DO NOT return full project objects or arrays.")

class TailoringReport(BaseModel):
    model_config = ConfigDict(extra="allow")
    changes_made: List[str] = []
    resume_match_before: int = 0
    resume_match_after: int = 0
    ats_score_before: int = 0
    ats_score_after: int = 0
    patch: Optional[ResumePatch] = Field(default_factory=ResumePatch)
    ats_analysis_id: Optional[str] = None
    breakdown_before: Optional[Dict[str, Any]] = None
    breakdown_after: Optional[Dict[str, Any]] = None
    suggestion_impacts: Optional[List[Dict[str, Any]]] = None

    # Legacy fields compatibility
    summary_before: str = ""
    summary_after: str = ""
    added_skills: List[str] = []
    rewritten_bullets: List[Dict[str, Any]] = []
    score_before: int = 0
    score_after: int = 0

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
    resume: RenderableResume
    patch: ResumePatch


class PreservationRequest(BaseModel):
    original_resume: Dict[str, Any]
    current_resume: Dict[str, Any]
    candidate_evidence: List[str] = []
    approved_removals: List[str] = []
    auto_repair: bool = True
