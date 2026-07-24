from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional, Dict, Any

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
    description: List[str] = []

class ProjectItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    name: str = ""
    role: str = ""
    technology_stack: List[str] = []
    link: str = ""
    description: List[str] = []

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
    # Resume parsers encounter legitimate sections and fields that are not in
    # the canonical schema. Keeping extras is essential for lossless
    # composition and lets the generic renderer carry them into the PDF.
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
    raw_text: Optional[str] = ""


class RenderableResume(ResumeStructure):
    """Strict content-only contract used by tailoring and PDF boundaries."""

    model_config = ConfigDict(extra="forbid")
    objective: str = ""
    internships: List[ExperienceItem] = []
    raw_text: Optional[str] = Field(default="", exclude=True)
