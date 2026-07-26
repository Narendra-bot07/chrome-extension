from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from schemas.cover_letter_context import CoverLetterContext


class CoverLetterStrategyRequest(BaseModel):
    context: CoverLetterContext
    session_id: Optional[str] = None


class StrategyParagraph(BaseModel):
    paragraph: int = Field(ge=1)
    purpose: str
    evidence_ids: list[str] = Field(default_factory=list)
    key_points: list[str] = Field(default_factory=list)


class StrategyEvidence(BaseModel):
    evidence_id: str
    source_section: str
    source_entry_id: str
    reason: str
    priority: int = Field(ge=1)
    factual_constraints: list[str] = Field(default_factory=list)


class CoverLetterStrategy(BaseModel):
    session_id: str
    strategy_version: Literal["cover_letter_strategy_v1"] = "cover_letter_strategy_v1"
    tone: Literal["professional", "confident", "conversational", "enthusiastic"]
    target_word_count: int = Field(ge=200, le=500)
    opening_approach: Literal[
        "direct_role_interest", "experience_led", "achievement_led",
        "project_led", "company_motivation_led", "referral_led"
    ]
    narrative: str
    paragraph_plan: list[StrategyParagraph]
    selected_evidence: list[StrategyEvidence]
    keywords_to_use: list[str]
    keywords_to_avoid: list[str]
    company_motivation_points: list[str]
    allowed_claims: list[str]
    prohibited_claims: list[str]
    uncertain_claims: list[str]
    greeting: str
    sign_off: str
    generation_instructions: list[str]
    strategy_confidence: float = Field(ge=0, le=1)
    ready_for_generation: bool
    strategy_status: Literal[
        "strategy_building", "strategy_ready", "needs_clarification", "strategy_failed"
    ]
