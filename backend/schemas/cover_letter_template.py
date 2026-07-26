from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from schemas.cover_letter_context import CoverLetterContext
from schemas.cover_letter_generation import GeneratedCoverLetter


class CoverLetterPresentationSettings(BaseModel):
    selected_template: Literal[
        "classic_ats", "modern_corporate", "executive_professional"
    ] = "classic_ats"
    font: Literal["Arial", "Calibri", "Georgia", "Times New Roman", "Inter"] = "Arial"
    theme_color: str = "#1d4ed8"
    font_size: float = Field(default=11, ge=9.5, le=13)
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


class CoverLetterMargins(BaseModel):
    top_mm: float = Field(ge=15, le=22)
    right_mm: float = Field(ge=15, le=22)
    bottom_mm: float = Field(ge=15, le=22)
    left_mm: float = Field(ge=15, le=22)


class CoverLetterTypography(BaseModel):
    font_family: str
    body_font_pt: float = Field(ge=9.5, le=11.5)
    name_font_pt: float = Field(ge=16, le=22)
    line_height: float = Field(ge=1.25, le=1.45)


class CoverLetterSpacing(BaseModel):
    header_bottom_px: float = Field(ge=8, le=20)
    recipient_bottom_px: float = Field(ge=6, le=16)
    paragraph_gap_px: float = Field(ge=6, le=10)
    greeting_bottom_px: float = Field(ge=6, le=12)
    closing_top_px: float = Field(ge=8, le=18)


class CoverLetterCompositionPlan(BaseModel):
    page_count: int = Field(default=1, ge=1, le=2)
    paper_size: Literal["A4", "Letter"]
    template: Literal[
        "classic_ats", "modern_corporate", "executive_professional"
    ]
    margins: CoverLetterMargins
    typography: CoverLetterTypography
    spacing: CoverLetterSpacing
    content_width_percent: float = Field(ge=92, le=100)
    alignment: Literal["left", "center"] = "left"
    vertical_alignment: Literal["top", "balanced"] = "top"
    repair_attempt: int = Field(default=0, ge=0, le=3)


class CoverLetterVisualReview(BaseModel):
    status: Literal["PASS", "REPAIR_REQUIRED"]
    issues: list[Literal[
        "CONTENT_WIDTH_TOO_NARROW",
        "BODY_FONT_TOO_SMALL",
        "ACCIDENTAL_DOCUMENT_SCALING",
        "EXCESSIVE_HORIZONTAL_MARGIN",
        "EXCESSIVE_BOTTOM_WHITESPACE",
        "EXCESSIVE_TOP_WHITESPACE",
        "HEADER_TOO_SMALL",
        "HEADER_TOO_LARGE",
        "PARAGRAPH_SPACING_TOO_TIGHT",
        "PARAGRAPH_SPACING_TOO_LARGE",
        "CONTENT_NOT_CENTERED",
        "PREVIEW_EXPORT_MISMATCH",
        "TEXT_CLIPPED",
        "CONTENT_OVERLAP",
        "OVERFLOW",
        "UNNECESSARY_SECOND_PAGE",
    ]] = Field(default_factory=list)
