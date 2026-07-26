from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from schemas.cover_letter_context import CoverLetterContext
from schemas.cover_letter_strategy import CoverLetterStrategy, StrategyEvidence


class CoverLetterGenerationRequest(BaseModel):
    context: CoverLetterContext
    strategy: CoverLetterStrategy


class GeneratedCoverLetter(BaseModel):
    cover_letter_id: str
    status: Literal["generated"] = "generated"
    title: str
    content: str
    word_count: int = Field(ge=1)
    paragraph_count: int = Field(ge=1)
    selected_evidence: list[StrategyEvidence]
    used_keywords: list[str]
    generation_notes: list[str] = Field(default_factory=list)
