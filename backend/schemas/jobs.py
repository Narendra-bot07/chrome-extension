from pydantic import BaseModel
from typing import List, Dict, Optional

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

class JobExtractRequest(BaseModel):
    jd_text: str
    url: Optional[str] = ""
    page_title: Optional[str] = ""
    page_company: Optional[str] = ""
    location: Optional[str] = ""
    employment_type: Optional[str] = ""
    experience_level: Optional[str] = ""
    salary_range: Optional[str] = ""
