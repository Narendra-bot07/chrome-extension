from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class FeedbackCreateRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    category: str
    title: str
    description: str
    screenshot_url: Optional[str] = None

class SupportTicketCreateRequest(BaseModel):
    subject: str
    description: str
    priority: Optional[str] = "NORMAL"

class FeedbackResponse(BaseModel):
    id: str
    user_id: str
    rating: int
    category: str
    title: str
    description: str
    screenshot_url: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class SupportTicketResponse(BaseModel):
    id: str
    user_id: str
    subject: str
    description: str
    status: str
    priority: str
    created_at: datetime
    resolved_at: Optional[datetime]

    class Config:
        from_attributes = True
