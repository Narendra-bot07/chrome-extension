from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import date, datetime

class ProfileBase(BaseModel):
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    preferred_name: Optional[str] = None
    username: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    phone_country_code: Optional[str] = None
    phone_number: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    timezone: Optional[str] = None
    preferred_language: Optional[str] = None
    uploaded_profile_image_url: Optional[str] = None
    google_profile_image_url: Optional[str] = None
    profile_image_source: Optional[str] = None
    current_title: Optional[str] = None
    years_experience: Optional[float] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    website_url: Optional[str] = None
    profile_completed_at: Optional[datetime] = None
    auth_provider: Optional[str] = None
    has_password_credential: bool = False
    email_verified: bool = False

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    preferred_name: Optional[str] = None
    username: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    phone_country_code: Optional[str] = None
    phone_number: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    timezone: Optional[str] = None
    preferred_language: Optional[str] = None
    uploaded_profile_image_url: Optional[str] = None
    profile_image_source: Optional[str] = None
    current_title: Optional[str] = None
    years_experience: Optional[float] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    website_url: Optional[str] = None

class ProfileResponse(ProfileBase):
    id: str
    subscription_plan: str
    credits_remaining: int
    resume_count: int
    created_at: datetime
    updated_at: datetime
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }
