from pydantic import BaseModel
from typing import List, Dict, Optional, Literal

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
    request_id: Optional[str] = None
    classification: Optional[Literal["job_listing", "non_job", "uncertain", "manual"]] = None
    detection_confidence: Optional[float] = None
    detection_reason: Optional[str] = ""
    extraction_method: Optional[str] = ""
    content_hash: Optional[str] = ""

class JobDetectionLogRequest(BaseModel):
    url: Optional[str] = ""
    request_id: Optional[str] = ""
    classification: Optional[str] = "unknown"
    confidence: Optional[float] = None
    page_state: Optional[str] = ""
    extraction_source: Optional[str] = ""
    content_hash: Optional[str] = ""
    title: Optional[str] = ""
    company: Optional[str] = ""
    description_length: int = 0
    validation: Optional[Dict] = {}
    signals: Optional[Dict] = {}
    trace: List[Dict] = []
