from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Literal, Any

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

class JobUrlExtractRequest(BaseModel):
    url: str = Field(min_length=8)
    request_id: Optional[str] = None
    browser_evidence: Optional[Dict[str, Any]] = None

