"""Canonical, template-independent source of truth schema for resumes."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class CanonicalLink(BaseModel):
    model_config = ConfigDict(extra="allow")
    platform: str = ""  # linkedin, github, portfolio, website, leetcode, x, email, phone, etc.
    url: str = ""
    label: str = ""
    owner_type: Optional[str] = "candidate"  # candidate, project, certification


class CanonicalHeader(BaseModel):
    model_config = ConfigDict(extra="allow")
    full_name: str = ""
    headline: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    links: List[CanonicalLink] = Field(default_factory=list)


class CanonicalItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = ""
    title: str = ""  # Role, Degree, Project Name, Cert Name, Achievement Title
    subtitle: str = ""  # Company, Institution, Issuer, Tech Stack summary
    location: str = ""
    start_date: str = ""
    end_date: str = ""
    date_display: str = ""
    description: str = ""
    bullets: List[str] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    links: List[CanonicalLink] = Field(default_factory=list)
    metrics: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class CanonicalSection(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str  # summary, experience, education, skills, projects, certifications, achievements, volunteer, publications, languages, awards, interests, custom
    type: str  # text, structured_list, categorized_skills, simple_list
    display_heading: str = ""
    order: int = 0
    visible: bool = True
    items: List[CanonicalItem] = Field(default_factory=list)
    custom_content: Optional[Any] = None  # e.g. categorized skills dict or raw summary string


class CanonicalJobContext(BaseModel):
    model_config = ConfigDict(extra="allow")
    job_id: Optional[str] = None
    jd_fingerprint: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None


class CanonicalResumeSnapshot(BaseModel):
    model_config = ConfigDict(extra="allow")
    schema_version: str = "2.0_canonical"
    resume_id: str = ""
    source_resume_id: Optional[str] = None
    source_version_id: Optional[str] = None
    tailored_version_id: Optional[str] = None
    content_version_id: str = ""
    content_hash: str = ""
    job_context: CanonicalJobContext = Field(default_factory=CanonicalJobContext)
    header: CanonicalHeader = Field(default_factory=CanonicalHeader)
    summary: Optional[str] = ""
    sections: List[CanonicalSection] = Field(default_factory=list)
    section_order: List[str] = Field(default_factory=list)
    custom_sections: List[Dict[str, Any]] = Field(default_factory=list)
    user_preferences: Dict[str, Any] = Field(default_factory=dict)
    provenance: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def generate_hash(self) -> str:
        """Calculate a deterministic SHA-256 hash of the content."""
        content_dict = {
            "header": self.header.model_dump(mode="json"),
            "summary": self.summary or "",
            "sections": [s.model_dump(mode="json") for s in self.sections],
            "section_order": self.section_order,
            "custom_sections": self.custom_sections,
        }
        serialized = json.dumps(content_dict, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


class LayoutConfig(BaseModel):
    model_config = ConfigDict(extra="allow")
    layout_config_id: str = ""
    content_version_id: str = ""
    template_id: str = "ExecutiveATS"
    page_mode: Literal["auto", "one", "two"] = "auto"
    typography: str = "font-sans"
    spacing: Dict[str, Any] = Field(default_factory=dict)
    margins: Dict[str, Any] = Field(default_factory=dict)
    paper_size: str = "A4"
    layout_tree: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ArtifactManifest(BaseModel):
    model_config = ConfigDict(extra="allow")
    artifact_id: str = ""
    content_version_id: str = ""
    layout_config_id: str = ""
    content_hash: str = ""
    format: Literal["pdf", "docx", "json"] = "pdf"
    storage_key: Optional[str] = None
    file_url: Optional[str] = None
    checksum: str = ""
    page_count: int = 1
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def calculate_content_hash(snapshot: CanonicalResumeSnapshot | Dict[str, Any]) -> str:
    if isinstance(snapshot, CanonicalResumeSnapshot):
        return snapshot.generate_hash()
    snap = CanonicalResumeSnapshot.model_validate(snapshot)
    return snap.generate_hash()
