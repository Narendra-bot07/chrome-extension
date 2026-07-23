from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Literal, Any

class JobAnalysis(BaseModel):
    is_job_related: bool = True
    reason: Optional[str] = ""
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

class JobUrlExtractRequest(BaseModel):
    url: str = Field(min_length=8)
    request_id: Optional[str] = None


