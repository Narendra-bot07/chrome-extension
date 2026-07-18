from typing import List, Optional
from pydantic import BaseModel, Field


class JobPreferencesPayload(BaseModel):
    target_roles: List[str] = Field(default_factory=list)
    target_companies: List[str] = Field(default_factory=list)
    preferred_locations: List[str] = Field(default_factory=list)
    work_preference: str = "No Preference"
    experience_level: str = "No Preference"
    priority_skills: List[str] = Field(default_factory=list)


class JobPreferencesResponse(JobPreferencesPayload):
    id: Optional[str] = None
    user_id: str
    has_completed_preferences: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
