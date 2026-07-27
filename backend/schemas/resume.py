from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import List, Optional, Dict, Any, Literal, Union


class ResumeHeaderConfig(BaseModel):
    enabled: bool = True
    show_avatar: bool = False
    alignment: Literal["left", "center", "split"] = "left"
    contact_placement: Literal["inline", "below"] = "inline"
    links_placement: Literal["inline", "below"] = "inline"
    style: Literal["compact", "standard"] = "standard"
    show_divider: bool = True


class ResumeLayoutModel(BaseModel):
    template_id: str
    layout_version: int = Field(default=1, ge=1)
    header: ResumeHeaderConfig = Field(default_factory=ResumeHeaderConfig)
    main_column: List[str] = Field(default_factory=list)
    sidebar: List[str] = Field(default_factory=list)
    hidden_sections: List[str] = Field(default_factory=list)
    header_components: List[str] = Field(
        default_factory=lambda: [
            "header.name",
            "header.job_title",
            "header.contact",
            "header.links",
        ]
    )
    footer_components: List[str] = Field(default_factory=list)
    section_variants: Dict[str, str] = Field(default_factory=dict)
    custom_section_titles: Dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_layout_tree(self):
        allowed_main = {
            "summary",
            "experience",
            "projects",
            "education",
            "skills",
            "certifications",
            "achievements",
            "publications",
            "languages",
            "volunteer_experience",
            "open_source",
            "leadership",
            "extracurricular_activities",
            "custom_sections",
            "awards",
            "interests",
        }
        allowed_header = {
            "header.name",
            "header.job_title",
            "header.contact",
            "header.links",
        }
        allowed_footer = {"footer.page_number", "footer.custom_text"}

        main = set(self.main_column)
        sidebar = set(self.sidebar)
        if main & sidebar:
            raise ValueError("Layout components cannot overlap between main_column and sidebar.")
        if (main | sidebar) - allowed_main:
            raise ValueError("The layout tree contains unsupported components.")
        if len(self.main_column) != len(main) or len(self.sidebar) != len(sidebar):
            raise ValueError("Duplicate layout components are not allowed.")

        header_components = self.header_components
        footer_components = self.footer_components
        if set(header_components) - allowed_header or set(footer_components) - allowed_footer:
            raise ValueError("The layout tree contains unsupported components.")
        if len(header_components) != len(set(header_components)) or len(footer_components) != len(set(footer_components)):
            raise ValueError("Duplicate layout components are not allowed.")
        return self

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
    layout_model: Optional[ResumeLayoutModel] = None
    raw_text: Optional[str] = ""

class RenderableResume(ResumeStructure):
    model_config = ConfigDict(extra="forbid")
    objective: str = ""
    internships: List[ExperienceItem] = []
    candidate_links: List[Dict[str, Any]] = []
    profile_links: List[Dict[str, Any]] = []
    unresolved_links: List[Dict[str, Any]] = []
    link_review: List[Dict[str, Any]] = []
    links_intelligence_version: Optional[int] = None
    raw_text: Optional[str] = Field(default="", exclude=True)
