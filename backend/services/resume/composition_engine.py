"""Content-aware, renderer-neutral resume composition planning."""

from __future__ import annotations

import math
from typing import Any

from pydantic import BaseModel, Field


PAGE_CAPACITY_UNITS = 42.0
SAFE_TWO_PAGE_MIN_UNITS = 35.0


class SectionCompositionEstimate(BaseModel):
    section: str
    units: float = Field(ge=0)
    entries: int = Field(ge=0)
    keep_entries_together: bool = True


class ResumeCompositionDecision(BaseModel):
    engine_version: int = 1
    estimated_page_count: int = Field(ge=1, le=2)
    total_content_units: float = Field(ge=0)
    section_estimates: list[SectionCompositionEstimate]
    spacing_profile: str
    maximum_compression_level: int = Field(ge=0, le=3)
    target_page_fill: float = Field(ge=0, le=1)
    page_balance_target: float = Field(ge=0, le=1)
    optimization_passes: list[str]
    constraints: dict[str, Any]


def _text_units(value: Any) -> float:
    if isinstance(value, str):
        return max(0.15, len(value.strip()) / 95)
    if isinstance(value, list):
        return sum(_text_units(item) for item in value)
    if isinstance(value, dict):
        return sum(_text_units(item) for item in value.values())
    return 0


def _entries(value: Any) -> int:
    if isinstance(value, list):
        return len(value)
    return int(bool(value))


def plan_resume_composition(
    content: dict[str, Any], section_order: list[str]
) -> ResumeCompositionDecision:
    estimates: list[SectionCompositionEstimate] = []
    for section in section_order:
        value = content.get(section)
        if value in (None, "", [], {}):
            continue
        entry_count = _entries(value)
        # Section headings and entry metadata consume space beyond raw text.
        units = 1.1 + _text_units(value) + entry_count * (
            0.75 if section in {"experience", "projects", "education"} else 0.35
        )
        estimates.append(SectionCompositionEstimate(
            section=section,
            units=round(units, 2),
            entries=entry_count,
        ))

    header = content.get("personal_info") or {}
    header_units = 2.2 + _text_units(header) * 0.45
    total = header_units + sum(item.units for item in estimates)
    estimated_pages = 1 if total <= PAGE_CAPACITY_UNITS else 2
    # A borderline overflow gets modest spacing optimization before page two.
    if PAGE_CAPACITY_UNITS < total <= PAGE_CAPACITY_UNITS * 1.08:
        estimated_pages = 1
        spacing = "compact"
        max_compression = 3
        passes = ["estimate_capacity", "optimize_spacing", "validate_one_page"]
    elif estimated_pages == 1:
        spacing = "balanced" if total >= 25 else "spacious"
        max_compression = 2
        passes = ["estimate_capacity", "balance_whitespace", "validate_one_page"]
    else:
        spacing = "balanced"
        max_compression = 2
        passes = [
            "estimate_capacity", "select_two_pages", "find_safe_section_break",
            "balance_pages", "validate_composition",
        ]

    fill = min(1.0, total / (PAGE_CAPACITY_UNITS * estimated_pages))
    return ResumeCompositionDecision(
        estimated_page_count=estimated_pages,
        total_content_units=round(total, 2),
        section_estimates=estimates,
        spacing_profile=spacing,
        maximum_compression_level=max_compression,
        target_page_fill=round(fill, 3),
        page_balance_target=0.82 if estimated_pages == 2 else 1.0,
        optimization_passes=passes,
        constraints={
            "preserve_all_content": True,
            "keep_entries_together": True,
            "keep_heading_with_first_entry": True,
            "minimum_font_size_px": 13.5,
            "maximum_pages": 2,
        },
    )

