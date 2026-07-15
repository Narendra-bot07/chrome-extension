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
