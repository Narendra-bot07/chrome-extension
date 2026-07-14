from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class ProfileBase(BaseModel):
    email: str
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    subscription_plan: Optional[str] = None

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
