from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import List, Optional, Dict, Any, Literal


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
    layout_tree: Dict[str, Any] = Field(default_factory=dict)
    component_positions: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    hidden_components: List[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_layout(cls, value):
        """Upgrade saved pre-layout-tree models at every API boundary."""
        if not isinstance(value, dict) or value.get("layout_tree"):
            return value

        migrated = dict(value)
        header = migrated.get("header") if isinstance(migrated.get("header"), dict) else {}
        header_components = [
            "name", "headline", "email", "phone", "location",
            "linkedin", "github", "portfolio", "other_links",
        ]
        if header.get("show_avatar"):
            header_components.insert(0, "photo")
        if header.get("show_divider", True):
            header_components.append("header_divider")

        main_column = list(dict.fromkeys(migrated.get("main_column") or []))
        sidebar = [
            section for section in dict.fromkeys(migrated.get("sidebar") or [])
            if section not in main_column
        ]
        columns = [{"id": "main", "width": 8 if sidebar else 12, "sections": main_column}]
        if sidebar:
            columns.append({"id": "sidebar", "width": 4, "sections": sidebar})

        footer_components = [
            component
            for component in ("page_number", "footer_links", "footer_text", "document_metadata")
            if component not in set(migrated.get("hidden_components") or [])
        ]
        migrated["layout_tree"] = {
            "header": {"components": header_components},
            "body": {"rows": [{"columns": columns}]},
            "footer": {"components": footer_components},
        }
        migrated["component_positions"] = {
            component: {"region": "header", "index": index}
            for index, component in enumerate(header_components)
        } | {
            component: {"region": "footer", "index": index}
            for index, component in enumerate(footer_components)
        }
        return migrated

    @model_validator(mode="after")
    def validate_layout(self):
        supported = {
            "summary", "objective", "experience", "internships", "projects",
            "education", "skills", "certifications", "achievements", "volunteer",
            "publications", "languages", "awards", "interests", "open_source",
            "leadership", "extracurricular_activities", "custom_sections",
        }
        main_only = {"summary", "objective", "experience", "internships", "projects"}
        all_sections = self.main_column + self.sidebar + self.hidden_sections
        unsupported = set(all_sections) - supported
        if unsupported:
            raise ValueError(f"Unsupported resume section IDs: {sorted(unsupported)}")
        if len(all_sections) != len(set(all_sections)):
            raise ValueError("Each resume section may appear only once.")
        if main_only.intersection(self.sidebar):
            raise ValueError("This section needs more width and must remain in the main column.")
        if {"summary", "experience"}.intersection(self.hidden_sections):
            raise ValueError("Important resume sections cannot be hidden.")
        header_components = self.layout_tree.get("header", {}).get("components", [])
        footer_components = self.layout_tree.get("footer", {}).get("components", [])
        allowed_header = {
            "photo", "name", "headline", "email", "phone", "location",
            "linkedin", "github", "portfolio", "other_links", "header_divider",
        }
        allowed_footer = {"page_number", "footer_links", "footer_text", "document_metadata"}
        if "name" not in header_components:
            raise ValueError("Name must remain inside the header.")
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
    layout_model: Optional[ResumeLayoutModel] = None
    raw_text: Optional[str] = ""


class RenderableResume(ResumeStructure):
    """Strict content-only contract used by tailoring and PDF boundaries."""

    model_config = ConfigDict(extra="forbid")
    objective: str = ""
    internships: List[ExperienceItem] = []
    raw_text: Optional[str] = Field(default="", exclude=True)
