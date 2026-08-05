from typing import List, Optional
from pydantic import BaseModel, Field


class JobPreferencesPayload(BaseModel):
    target_roles: List[str] = Field(default_factory=list)
    target_companies: List[str] = Field(default_factory=list)
    preferred_locations: List[str] = Field(default_factory=list)
    work_preference: str = "No Preference"
    experience_level: str = "No Preference"
    priority_skills: List[str] = Field(default_factory=list)

    # Extended fields -- JobPreferencesPage.jsx has always collected these,
    # but until migrate_job_preferences_extended_fields.py + this schema
    # update, Pydantic silently dropped all of them on every save (unknown
    # fields are ignored, not rejected, by default), so the page always
    # fell back to its hardcoded DEFAULT_PREFERENCES for every user.
    primary_role: str = ""
    primary_company: str = ""
    preferred_industries: List[str] = Field(default_factory=list)
    work_modes: List[str] = Field(default_factory=list)
    relocation_preference: str = ""
    sponsorship_preference: str = ""
    current_title: str = ""
    years_experience: str = ""
    secondary_skills: List[str] = Field(default_factory=list)
    current_compensation: str = ""
    expected_compensation: str = ""
    compensation_currency: str = "USD"
    salary_period: str = "Annual"
    min_compensation: str = ""
    is_salary_negotiable: bool = True
    employment_types: List[str] = Field(default_factory=list)
    notice_period: str = ""
    company_size_preferences: List[str] = Field(default_factory=list)
    seniority_preferences: List[str] = Field(default_factory=list)
    job_alert_frequency: str = "Weekly"


class JobPreferencesResponse(JobPreferencesPayload):
    id: Optional[str] = None
    user_id: str
    has_completed_preferences: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
