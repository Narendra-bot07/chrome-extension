from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from schemas.cover_letter_context import CoverLetterContext
from schemas.cover_letter_generation import GeneratedCoverLetter
from schemas.cover_letter_strategy import CoverLetterStrategy


class CoverLetterIntelligenceInput(BaseModel):
    context: CoverLetterContext
    strategy: CoverLetterStrategy
    generated_cover_letter: GeneratedCoverLetter


class CoverLetterIssue(BaseModel):
    category: str
    description: str
    paragraph_index: int | None = Field(default=None, ge=0)


class CoverLetterReviewRequest(CoverLetterIntelligenceInput):
    pass


class CoverLetterReviewResult(BaseModel):
    review_summary: str
    issues_found: list[CoverLetterIssue] = Field(default_factory=list)
    issues_fixed: list[CoverLetterIssue] = Field(default_factory=list)
    final_cover_letter: GeneratedCoverLetter
    review_score: int = Field(ge=0, le=100)


class CoverLetterEditRequest(CoverLetterIntelligenceInput):
    user_prompt: str = Field(min_length=1, max_length=1000)


class ParagraphPatch(BaseModel):
    paragraph_index: int = Field(ge=0)
    before: str
    after: str
    reason: str


class CoverLetterEditResult(BaseModel):
    edit_id: str
    status: Literal["edited"] = "edited"
    user_prompt: str
    before_content: str
    after_content: str
    patches: list[ParagraphPatch]
    review_summary: str
    created_at: datetime
