"""Contracts for Phase 1 of the resume layout intelligence engine."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


LayoutStrategyName = Literal[
    "executive_ats",
    "portfolio",
    "compact_ats",
    "engineering",
    "research",
    "academic",
    "modern_sidebar",
]


class LayoutIntelligenceRequest(BaseModel):
    """Job and ATS context not already present in the stored resume."""

    target_role: str = ""
    target_company: str = ""
    target_industry: str = ""
    ats_score: Optional[int] = Field(default=None, ge=0, le=100)
    user_strategy_override: Optional[LayoutStrategyName] = None


class LayoutConstraints(BaseModel):
    ats_safe: bool = True
    prefer_one_page: bool = True
    maximum_columns: Literal[1, 2] = 1
    allow_sidebar: bool = False
    show_photo: bool = False
    preserve_entry_boundaries: bool = True
    required_sections: List[str] = Field(default_factory=list)


class LayoutStrategyRecommendation(BaseModel):
    recommended_strategy: LayoutStrategyName
    effective_strategy: LayoutStrategyName
    confidence: float = Field(ge=0, le=1)
    reasoning: List[str] = Field(default_factory=list)
    constraints: LayoutConstraints
    overridden_by_user: bool = False


class SectionPriorityRecommendation(BaseModel):
    section_order: List[str]
    reasoning: Dict[str, str] = Field(default_factory=dict)


class LayoutPlan(BaseModel):
    """Renderer-neutral plan. The renderer, never the AI, turns it into markup."""

    model_config = ConfigDict(extra="forbid")

    plan_version: int = Field(default=1, ge=1)
    strategy: LayoutStrategyName
    header: Dict[str, Any]
    columns: List[Dict[str, Any]]
    section_order: List[str]
    spacing: Dict[str, Any]
    page_rules: Dict[str, Any]

    @model_validator(mode="after")
    def validate_plan(self):
        if len(self.section_order) != len(set(self.section_order)):
            raise ValueError("LayoutPlan section_order must contain unique sections.")
        assigned = [
            section
            for column in self.columns
            for section in column.get("sections", [])
        ]
        if assigned != self.section_order:
            raise ValueError("LayoutPlan columns must preserve the declared section order.")
        if not 1 <= len(self.columns) <= 2:
            raise ValueError("LayoutPlan supports one or two columns.")
        return self


class LayoutIntelligenceResponse(BaseModel):
    layout_strategy: LayoutStrategyRecommendation
    section_priority: SectionPriorityRecommendation
    layout_plan: LayoutPlan

