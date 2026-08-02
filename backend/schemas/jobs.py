from pydantic import BaseModel, Field, field_validator
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

    @field_validator("salary", mode="before")
    @classmethod
    def normalize_salary_field(cls, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, dict):
            raw = value.get("raw")
            if raw:
                return str(raw).strip()
            minimum = value.get("minimum", value.get("min"))
            maximum = value.get("maximum", value.get("max"))
            currency = value.get("currency") or ""
            period = value.get("period") or ""
            parts = [currency]
            if minimum is not None and maximum is not None:
                parts.append(f"{minimum} - {maximum}")
            elif minimum is not None:
                parts.append(str(minimum))
            elif maximum is not None:
                parts.append(str(maximum))
            if period:
                parts.append(str(period))
            return " ".join(p for p in parts if p).strip()
        if hasattr(value, "raw") and getattr(value, "raw"):
            return str(getattr(value, "raw")).strip()
        return str(value)

    @field_validator("reason", "title", "company", "location", "job_type", "work_mode", "experience_required", "seniority", mode="before")
    @classmethod
    def normalize_str_fields(cls, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, (list, tuple, set)):
            return ", ".join(str(x) for x in value if x is not None)
        return str(value)

    @field_validator("highlights", "qualifications", "required_skills", "preferred_skills", "responsibilities", "keywords", "ats_keywords", mode="before")
    @classmethod
    def normalize_list_fields(cls, value: Any) -> List[str]:
        if value is None:
            return []
        if isinstance(value, str):
            val = value.strip()
            return [val] if val else []
        if isinstance(value, (list, tuple, set)):
            return [str(x).strip() for x in value if x is not None and str(x).strip()]
        if isinstance(value, dict):
            return [str(v).strip() for v in value.values() if v is not None and str(v).strip()]
        return [str(value).strip()]

class JobUrlExtractRequest(BaseModel):
    url: str = Field(min_length=8)
    request_id: Optional[str] = None
    browser_evidence: Optional[Dict[str, Any]] = None
