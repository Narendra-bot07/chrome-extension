from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

Priority = Literal["critical", "high", "normal", "low"]
ReminderStatus = Literal["scheduled", "due", "snoozed", "completed", "cancelled", "overdue"]

class ReminderCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    application_id: Optional[str] = None
    recruiter_contact_id: Optional[str] = None
    interview_id: Optional[str] = None
    description: Optional[str] = Field(default=None, max_length=2000)
    reminder_type: str = "custom"
    due_at: datetime
    timezone: str = "UTC"
    priority: Priority = "normal"
    recurrence_rule: Optional[str] = None
    created_by: str = "user"

class ReminderUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=180)
    description: Optional[str] = Field(default=None, max_length=2000)
    due_at: Optional[datetime] = None
    timezone: Optional[str] = None
    priority: Optional[Priority] = None
    recurrence_rule: Optional[str] = None

class SnoozeRequest(BaseModel):
    until: datetime

class NotificationStateRequest(BaseModel):
    status: Literal["unread", "read", "archived", "dismissed", "actioned"]

class PreferencesUpdate(BaseModel):
    categories: List[Dict[str, Any]]
    timezone: str = "UTC"
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    daily_digest_enabled: bool = False
    digest_time: str = "08:00"
    smart_reminders_enabled: bool = False
