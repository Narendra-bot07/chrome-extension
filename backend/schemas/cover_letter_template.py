from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from schemas.cover_letter_context import CoverLetterContext
from schemas.cover_letter_generation import GeneratedCoverLetter


class CoverLetterPresentationSettings(BaseModel):
    selected_template: Literal[
        "classic_ats", "modern_corporate", "executive_professional"
    ] = "classic_ats"
    font: Literal["Arial", "Calibri", "Georgia", "Times New Roman"] = "Arial"
    theme_color: str = "#1d4ed8"
    font_size: float = Field(default=11, ge=9, le=13)
    paragraph_spacing: float = Field(default=12, ge=6, le=24)
    line_height: float = Field(default=1.5, ge=1.25, le=1.8)
    page_margin: float = Field(default=20, ge=12, le=32)
    paper_size: Literal["A4", "Letter"] = "A4"
    page_mode: Literal["auto", "force_one_page", "allow_two_pages"] = "auto"
    spacing_profile: Literal["compact", "balanced", "comfortable"] = "balanced"
    margin_profile: Literal["narrow", "standard", "wide"] = "standard"

    @field_validator("theme_color")
    @classmethod
    def validate_theme_color(cls, value: str) -> str:
        if len(value) != 7 or not value.startswith("#"):
            raise ValueError("theme_color must be a six-digit hexadecimal color.")
        try:
            int(value[1:], 16)
        except ValueError as exc:
            raise ValueError(
                "theme_color must be a six-digit hexadecimal color."
            ) from exc
        return value.lower()


class CoverLetterRenderRequest(BaseModel):
    context: CoverLetterContext
    generated_cover_letter: GeneratedCoverLetter
    settings: CoverLetterPresentationSettings = Field(
        default_factory=CoverLetterPresentationSettings
    )
