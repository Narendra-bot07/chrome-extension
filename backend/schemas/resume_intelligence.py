"""HTTP request contract for Selected Resume Intelligence."""

from pydantic import BaseModel, Field


class SelectedResumeIntelligenceRequest(BaseModel):
    request_id: str = Field(min_length=1)
    user_confirmed: bool
    selected_resume_version: int | None = Field(default=None, ge=1)
    selected_resume_fingerprint: str | None = Field(
        default=None, pattern=r"^[a-f0-9]{64}$"
    )


class SelectedResumeConfirmationRequest(BaseModel):
    confirmed: bool
