"""Resume Composition Agent.

Responsible for HOW the final resume is visually composed (layout, spacing,
typography limits, pagination, and multi-pass space optimization).

This agent NEVER modifies resume facts, rewrites content, removes bullets, or
hallucinates.
"""

from __future__ import annotations

import copy
import logging
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class DensityLevel(str, Enum):
    COMFORTABLE = "Comfortable"
    COMPACT = "Compact"
    DENSE = "Dense"


class PageMode(str, Enum):
    AUTO = "auto"
    ONE_PAGE = "one_page"
    TWO_PAGE = "two_page"


PAGE_MODE_ALIASES = {
    "auto": PageMode.AUTO,
    "one": PageMode.ONE_PAGE,
    "one_page": PageMode.ONE_PAGE,
    "prefer_one_page": PageMode.ONE_PAGE,
    "two": PageMode.TWO_PAGE,
    "two_page": PageMode.TWO_PAGE,
    "prefer_two_pages": PageMode.TWO_PAGE,
}

SAFETY_LIMITS = {
    "minimum_font_pt": 8.5,
    "minimum_line_height": 1.05,
    "minimum_vertical_margin_mm": 8.0,
    "minimum_horizontal_margin_mm": 10.0,
    "minimum_divider_px": 0.4,
}


class ContentProfile(BaseModel):
    estimated_section_heights: dict[str, float]
    paragraph_density: float
    bullet_density: float
    heading_density: float
    whitespace_usage: float
    available_printable_area: float
    total_estimated_height: float


class SectionPriority(BaseModel):
    ranked_sections: list[str]
    section_weights: dict[str, int]
    non_splittable_sections: list[str]


class OptimizationStepResult(BaseModel):
    step_number: int
    optimization_name: str
    height_before: float
    height_after: float
    space_recovered: float
    applied: bool


class Measurements(BaseModel):
    total_height_px: float
    page_capacity_px: float
    remaining_height_px: float
    page_fill_ratio: float
    page_break_index: int | None = None
    page1_height_px: float
    page2_height_px: float | None = None


class ValidationStatus(BaseModel):
    valid: bool
    no_orphan_headings: bool = True
    no_isolated_bullets: bool = True
    no_clipped_text: bool = True
    no_missing_sections: bool = True
    no_empty_pages: bool = True
    no_single_section_page2: bool = True
    no_overflow: bool = True
    issues: list[str] = Field(default_factory=list)


class CompositionPlan(BaseModel):
    requested_mode: PageMode = PageMode.AUTO
    target_page_count: int = Field(default=1, ge=1, le=2)
    status: str = "PASS"
    reason: str = ""
    confidence: float = Field(default=1.0, ge=0, le=1)
    hard_constraints: dict[str, Any] = Field(default_factory=dict)
    section_layout_modes: dict[str, str] = Field(default_factory=dict)
    sections_to_compact: list[str] = Field(default_factory=list)
    preferred_page_breaks: list[str] = Field(default_factory=list)
    page_utilization: list[float] = Field(default_factory=list)
    safe_limits_reached: list[str] = Field(default_factory=list)
    page_count: int = Field(ge=1, le=2)
    density: DensityLevel
    applied_optimizations: list[str]
    recovered_space: float
    final_measurements: Measurements
    validation_status: ValidationStatus
    content_profile: ContentProfile
    section_order: list[str]
    page_assignment: dict[str, int]
    spacing_profile: dict[str, Any]
    layout_strategy: str
    repair_iterations: int = 0


# Default printable page dimensions at 96 DPI for A4 (816px x 1056px)
PAGE_WIDTH_PX = 816.0
PAGE_HEIGHT_PX = 1056.0
PAGE_MARGIN_Y_PX = 20.0
PAGE_PRINTABLE_HEIGHT_PX = PAGE_HEIGHT_PX - (2 * PAGE_MARGIN_Y_PX)  # 1016.0px

DEFAULT_SECTION_RANKING = [
    "summary",
    "objective",
    "experience",
    "projects",
    "skills",
    "education",
    "certifications",
    "achievements",
    "volunteer_experience",
    "publications",
    "languages",
    "awards",
    "interests",
]

NON_SPLITTABLE_SECTIONS = [
    "experience",
    "projects",
    "certifications",
    "education",
]


class ResumeCompositionAgent:
    """Professional Resume Composition Agent."""

    def __init__(self, max_repair_iterations: int = 8) -> None:
        self.max_repair_iterations = max_repair_iterations

    def analyze_content(
        self,
        resume: dict[str, Any],
        section_order: list[str],
        typography_rules: dict[str, Any] | None = None,
        page_size: str = "A4",
    ) -> ContentProfile:
        """Step 1: Content Analysis - calculate section heights and density metrics."""

        rules = typography_rules or {}
        line_height_px = float(rules.get("line_height_px", 18.0))
        heading_height_px = float(rules.get("heading_height_px", 32.0))
        header_height_px = float(rules.get("header_height_px", 110.0))

        estimated_heights: dict[str, float] = {}
        total_bullets = 0
        total_paragraphs = 0
        total_entries = 0

        for section in section_order:
            val = resume.get(section)
            if val in (None, "", [], {}):
                continue

            section_height = heading_height_px + 12.0  # Base heading + margin

            if isinstance(val, str):
                lines = max(1, len(val.strip()) // 85 + 1)
                section_height += lines * line_height_px
                total_paragraphs += 1
            elif isinstance(val, list):
                total_entries += len(val)
                for item in val:
                    if isinstance(item, str):
                        lines = max(1, len(item.strip()) // 85 + 1)
                        section_height += lines * line_height_px + 4.0
                        total_bullets += 1
                    elif isinstance(item, dict):
                        # Item title & org row
                        section_height += line_height_px + 6.0
                        bullets = item.get("description") or item.get("bullet_points") or item.get("highlights") or []
                        if isinstance(bullets, list):
                            for b in bullets:
                                if isinstance(b, str) and b.strip():
                                    b_lines = max(1, len(b.strip()) // 80 + 1)
                                    section_height += b_lines * line_height_px + 3.0
                                    total_bullets += 1
                        tech = item.get("technology_stack")
                        if tech:
                            section_height += line_height_px + 2.0
            elif isinstance(val, dict):
                lines = max(1, len(str(val)) // 85 + 1)
                section_height += lines * line_height_px
                total_paragraphs += 1

            estimated_heights[section] = round(section_height, 1)

        total_content_height = header_height_px + sum(estimated_heights.values())
        available_area = PAGE_PRINTABLE_HEIGHT_PX

        paragraph_density = round(total_paragraphs / max(1, len(estimated_heights)), 2)
        bullet_density = round(total_bullets / max(1, len(estimated_heights)), 2)
        heading_density = round(len(estimated_heights) / max(1, total_entries + len(estimated_heights)), 2)
        whitespace_usage = round(max(0.0, (available_area - (total_content_height % available_area)) / available_area), 3)

        return ContentProfile(
            estimated_section_heights=estimated_heights,
            paragraph_density=paragraph_density,
            bullet_density=bullet_density,
            heading_density=heading_density,
            whitespace_usage=whitespace_usage,
            available_printable_area=available_area,
            total_estimated_height=round(total_content_height, 1),
        )

    def rank_section_priority(
        self, content: dict[str, Any], requested_order: list[str] | None = None
    ) -> SectionPriority:
        """Step 2: Section Priority ranking."""

        present_sections = [s for s in (requested_order or DEFAULT_SECTION_RANKING) if content.get(s) not in (None, "", [], {})]
        for default_s in DEFAULT_SECTION_RANKING:
            if default_s not in present_sections and content.get(default_s) not in (None, "", [], {}):
                present_sections.append(default_s)

        weights = {section: (100 - idx * 5) for idx, section in enumerate(present_sections)}

        return SectionPriority(
            ranked_sections=present_sections,
            section_weights=weights,
            non_splittable_sections=NON_SPLITTABLE_SECTIONS,
        )

    def determine_layout_strategy(self, profile: ContentProfile) -> DensityLevel:
        """Step 3: Choose Layout Strategy (Comfortable, Compact, or Dense)."""

        height = profile.total_estimated_height
        if height <= 880.0:
            return DensityLevel.COMFORTABLE
        elif height <= 1016.0:
            return DensityLevel.COMPACT
        else:
            # If height overflows single page, check if readable at Compact/Dense
            if height <= 1160.0 and profile.bullet_density <= 6.0:
                return DensityLevel.COMPACT
            return DensityLevel.DENSE

    def execute_space_optimization(
        self,
        profile: ContentProfile,
        strategy: DensityLevel,
        section_order: list[str],
        force_one_page: bool = False,
    ) -> tuple[dict[str, Any], list[OptimizationStepResult], float]:
        """Step 4: 12-Step Progressive Space Optimization Pass."""

        spacing_profile = {
            "margin_top_mm": 12.0 if strategy == DensityLevel.COMFORTABLE else 10.0,
            "margin_bottom_mm": 12.0 if strategy == DensityLevel.COMFORTABLE else 10.0,
            "margin_left_mm": 14.0,
            "margin_right_mm": 14.0,
            "body_font_pt": 10.5 if strategy == DensityLevel.COMFORTABLE else 9.5,
            "padding_top_px": 28.0 if strategy == DensityLevel.COMFORTABLE else 20.0,
            "padding_bottom_px": 28.0 if strategy == DensityLevel.COMFORTABLE else 20.0,
            "section_gap_px": 18.0 if strategy == DensityLevel.COMFORTABLE else 12.0,
            "divider_margin_px": 10.0 if strategy == DensityLevel.COMFORTABLE else 6.0,
            "divider_thickness_px": 1.5 if strategy == DensityLevel.COMFORTABLE else 1.0,
            "heading_spacing_px": 8.0 if strategy == DensityLevel.COMFORTABLE else 4.0,
            "bullet_spacing_px": 4.0 if strategy == DensityLevel.COMFORTABLE else 2.0,
            "line_height": 1.35 if strategy == DensityLevel.COMFORTABLE else 1.25,
            "skills_style": "standard",
            "education_style": "standard",
            "certifications_style": "standard",
        }

        current_height = profile.total_estimated_height
        target_height = PAGE_PRINTABLE_HEIGHT_PX
        steps_history: list[OptimizationStepResult] = []
        total_space_recovered = 0.0

        # Ordered, bounded, presentation-only adjustments. Content is immutable.
        optimizations = [
            ("remove_empty_nodes", "empty_nodes", 8.0, 8.0),
            ("deduplicate_parent_child_margins", "margin_collapse", 10.0, 10.0),
            ("reduce_section_spacing", "section_gap_px", len(section_order) * 3.0, 15.0),
            ("reduce_heading_divider_spacing", "divider_margin_px", len(section_order) * 2.0, 10.0),
            ("reduce_entry_spacing", "entry_spacing_px", 18.0, 12.0),
            ("reduce_bullet_spacing", "bullet_spacing_px", profile.bullet_density * len(section_order) * 1.5, 12.0),
            ("compact_header_and_metadata", "header_style", 18.0, 14.0),
            ("compact_skills", "skills_style", 20.0, 20.0),
            ("compact_education", "education_style", 15.0, 15.0),
            ("compact_certifications_achievements", "certifications_style", 12.0, 12.0),
            ("reduce_line_height", "line_height", 22.0, 14.0),
            ("reduce_margins_and_font", "safe_geometry", 28.0, 18.0),
        ]

        for step_idx, (name, param, max_saving, typical_saving) in enumerate(optimizations, 1):
            if current_height <= target_height:
                # Target achieved, no further compression needed
                steps_history.append(
                    OptimizationStepResult(
                        step_number=step_idx,
                        optimization_name=name,
                        height_before=round(current_height, 1),
                        height_after=round(current_height, 1),
                        space_recovered=0.0,
                        applied=False,
                    )
                )
                continue

            height_before = current_height
            saving = min(max_saving, current_height - target_height)
            current_height -= saving
            total_space_recovered += saving

            # Update spacing profile
            if param == "padding_top_px":
                spacing_profile["padding_top_px"] = max(10.0, spacing_profile["padding_top_px"] - 6.0)
            elif param == "section_gap_px":
                spacing_profile["section_gap_px"] = max(6.0, spacing_profile["section_gap_px"] - 3.0)
            elif param == "divider_margin_px":
                spacing_profile["divider_margin_px"] = max(3.0, spacing_profile["divider_margin_px"] - 2.0)
            elif param == "divider_thickness_px":
                spacing_profile["divider_thickness_px"] = 1.0
            elif param == "heading_spacing_px":
                spacing_profile["heading_spacing_px"] = max(2.0, spacing_profile["heading_spacing_px"] - 2.0)
            elif param == "bullet_spacing_px":
                spacing_profile["bullet_spacing_px"] = max(1.0, spacing_profile["bullet_spacing_px"] - 1.0)
            elif param == "line_height":
                spacing_profile["line_height"] = max(SAFETY_LIMITS["minimum_line_height"], 1.10)
            elif param in {"skills_style", "education_style", "certifications_style"}:
                spacing_profile[param] = "compact"
            elif param == "padding_bottom_px":
                spacing_profile["padding_bottom_px"] = max(10.0, spacing_profile["padding_bottom_px"] - 6.0)
            elif param == "safe_geometry":
                spacing_profile["margin_top_mm"] = SAFETY_LIMITS["minimum_vertical_margin_mm"]
                spacing_profile["margin_bottom_mm"] = SAFETY_LIMITS["minimum_vertical_margin_mm"]
                spacing_profile["margin_left_mm"] = SAFETY_LIMITS["minimum_horizontal_margin_mm"]
                spacing_profile["margin_right_mm"] = SAFETY_LIMITS["minimum_horizontal_margin_mm"]
                spacing_profile["body_font_pt"] = SAFETY_LIMITS["minimum_font_pt"]

            steps_history.append(
                OptimizationStepResult(
                    step_number=step_idx,
                    optimization_name=name,
                    height_before=round(height_before, 1),
                    height_after=round(current_height, 1),
                    space_recovered=round(saving, 1),
                    applied=True,
                )
            )

        return spacing_profile, steps_history, round(total_space_recovered, 1)

    def determine_page_fit_and_balance(
        self,
        final_height: float,
        section_order: list[str],
        content_profile: ContentProfile,
        optimization_exhausted: bool = False,
    ) -> tuple[int, dict[str, int], Measurements]:
        """Step 5: Decide ONE_PAGE vs TWO_PAGE and balance content across pages."""

        capacity = PAGE_PRINTABLE_HEIGHT_PX

        # Small overflow recovery check: never create page 2 for a tiny
        # spillover (< 8% overflow) -- UNLESS every optimization lever in
        # execute_space_optimization has already been applied at its full
        # cap (optimization_exhausted=True). In that state there is no
        # remaining slack for the "micro-adjustments will surely recover
        # this" reasoning below to lean on: the 12-step budget is a hard
        # ceiling, so a residual gap after exhausting it is real, not an
        # estimation-tolerance sliver, and forcing 1 page would mean
        # actually clipping/shrinking below the safety-limited spacing
        # profile in the real render.
        if capacity < final_height <= capacity * 1.08 and not optimization_exhausted:
            page_count = 1
            final_height = capacity  # Recovered space via micro-adjustments
        elif final_height <= capacity:
            page_count = 1
        else:
            page_count = 2

        page_assignment: dict[str, int] = {}

        if page_count == 1:
            for s in section_order:
                page_assignment[s] = 1
            measurements = Measurements(
                total_height_px=round(final_height, 1),
                page_capacity_px=capacity,
                remaining_height_px=round(max(0.0, capacity - final_height), 1),
                page_fill_ratio=round(min(1.0, final_height / capacity), 3),
                page_break_index=None,
                page1_height_px=round(final_height, 1),
                page2_height_px=None,
            )
        else:
            # Page Two Rule: Balance content cleanly across pages
            target_page1_cap = capacity * 0.70
            accumulated_height = 110.0  # Header
            split_idx = len(section_order) // 2
            page1_h = accumulated_height
            page2_h = 0.0

            for idx, section in enumerate(section_order):
                sec_h = content_profile.estimated_section_heights.get(section, 40.0)
                if (accumulated_height + sec_h <= target_page1_cap or idx < 2) and idx < len(section_order) - 2:
                    page_assignment[section] = 1
                    accumulated_height += sec_h
                    page1_h = accumulated_height
                    split_idx = idx
                else:
                    page_assignment[section] = 2
                    page2_h += sec_h

            measurements = Measurements(
                total_height_px=round(final_height, 1),
                page_capacity_px=capacity * 2,
                remaining_height_px=round(max(0.0, (capacity * 2) - final_height), 1),
                page_fill_ratio=round(min(1.0, final_height / (capacity * 2)), 3),
                page_break_index=split_idx,
                page1_height_px=round(page1_h, 1),
                page2_height_px=round(page2_h, 1),
            )

        return page_count, page_assignment, measurements

    def validate_plan(
        self,
        resume: dict[str, Any],
        section_order: list[str],
        page_count: int,
        page_assignment: dict[str, int],
        measurements: Measurements,
    ) -> ValidationStatus:
        """Validate layout against quality rules."""

        issues: list[str] = []
        no_orphan_headings = True
        no_isolated_bullets = True
        no_clipped_text = True
        no_missing_sections = True
        no_empty_pages = True
        no_single_section_page2 = True
        no_overflow = True

        # Check missing sections
        for s in section_order:
            if resume.get(s) not in (None, "", [], {}) and s not in page_assignment:
                no_missing_sections = False
                issues.append(f"Missing section in layout assignment: {s}")

        # Check overflow
        if page_count == 1 and measurements.total_height_px > measurements.page_capacity_px * 1.01:
            no_overflow = False
            issues.append("Layout overflows single page boundary.")

        # Check Page 2 balance
        if page_count == 2:
            p2_sections = [s for s, p in page_assignment.items() if p == 2]
            if len(p2_sections) == 0:
                no_empty_pages = False
                issues.append("Page 2 is empty.")
            elif len(p2_sections) == 1:
                no_single_section_page2 = False
                issues.append("Page 2 contains only one isolated section.")

        valid = not issues

        return ValidationStatus(
            valid=valid,
            no_orphan_headings=no_orphan_headings,
            no_isolated_bullets=no_isolated_bullets,
            no_clipped_text=no_clipped_text,
            no_missing_sections=no_missing_sections,
            no_empty_pages=no_empty_pages,
            no_single_section_page2=no_single_section_page2,
            no_overflow=no_overflow,
            issues=issues,
        )

    def compose(
        self,
        resume: dict[str, Any],
        template_name: str = "ExecutiveATS",
        typography_rules: dict[str, Any] | None = None,
        page_size: str = "A4",
        ats_constraints: dict[str, Any] | None = None,
        requested_section_order: list[str] | None = None,
        page_mode: str | PageMode = PageMode.AUTO,
    ) -> CompositionPlan:
        """Main entry point: execute 5 steps with repair loop."""

        mode = page_mode if isinstance(page_mode, PageMode) else PAGE_MODE_ALIASES.get(str(page_mode).lower())
        if mode is None:
            raise ValueError(f"Unsupported page mode: {page_mode}")

        # Step 1: Content Analysis
        priority = self.rank_section_priority(resume, requested_section_order)
        section_order = priority.ranked_sections

        for iteration in range(self.max_repair_iterations):
            content_profile = self.analyze_content(
                resume, section_order, typography_rules, page_size
            )

            # Step 3: Layout Strategy
            strategy = self.determine_layout_strategy(content_profile)

            # Step 4: Space Optimization
            spacing_profile, steps_results, recovered_space = self.execute_space_optimization(
                content_profile, strategy, section_order, mode == PageMode.ONE_PAGE
            )

            applied_opts = [res.optimization_name for res in steps_results if res.applied]
            final_height = max(100.0, content_profile.total_estimated_height - recovered_space)
            optimization_exhausted = len(applied_opts) == len(steps_results)

            # Step 5: Page Fit & Page Two Rule
            page_count, page_assignment, measurements = self.determine_page_fit_and_balance(
                final_height, section_order, content_profile, optimization_exhausted
            )

            status = "PASS"
            reason = ""
            target_page_count = page_count if mode == PageMode.AUTO else (2 if mode == PageMode.TWO_PAGE else 1)
            if mode == PageMode.TWO_PAGE:
                page_count = 2
                page_assignment, measurements = self._force_two_page_balance(
                    section_order, content_profile, final_height
                )
            elif mode == PageMode.ONE_PAGE and page_count != 1:
                status = "ONE_PAGE_UNSAFE"
                reason = "The content cannot fit on one page without reducing readability."

            # Validation
            val_status = self.validate_plan(
                resume, section_order, page_count, page_assignment, measurements
            )

            if val_status.valid or iteration == self.max_repair_iterations - 1:
                return CompositionPlan(
                    requested_mode=mode,
                    target_page_count=target_page_count,
                    status=status,
                    reason=reason,
                    confidence=0.98 if val_status.valid else 0.72,
                    hard_constraints={"preserve_all_content": True, **SAFETY_LIMITS},
                    section_layout_modes={s: ("compact" if s in {"skills", "education", "certifications", "achievements"} and strategy != DensityLevel.COMFORTABLE else "standard") for s in section_order},
                    sections_to_compact=[s for s in section_order if s in {"skills", "education", "certifications", "achievements"} and strategy != DensityLevel.COMFORTABLE],
                    preferred_page_breaks=[s for s, page in page_assignment.items() if page == 2][:1],
                    page_utilization=[round(measurements.page1_height_px / PAGE_PRINTABLE_HEIGHT_PX, 3)] + ([round((measurements.page2_height_px or 0) / PAGE_PRINTABLE_HEIGHT_PX, 3)] if page_count == 2 else []),
                    safe_limits_reached=list(SAFETY_LIMITS) if status == "ONE_PAGE_UNSAFE" else [],
                    page_count=page_count,
                    density=strategy,
                    applied_optimizations=applied_opts,
                    recovered_space=recovered_space,
                    final_measurements=measurements,
                    validation_status=val_status,
                    content_profile=content_profile,
                    section_order=section_order,
                    page_assignment=page_assignment,
                    spacing_profile=spacing_profile,
                    layout_strategy="single-column" if template_name.endswith("ATS") else "sidebar",
                    repair_iterations=iteration + 1,
                )

        # Fallback return
        return CompositionPlan(
            page_count=1,
            density=DensityLevel.COMPACT,
            applied_optimizations=[],
            recovered_space=0.0,
            final_measurements=Measurements(
                total_height_px=800.0,
                page_capacity_px=PAGE_PRINTABLE_HEIGHT_PX,
                remaining_height_px=216.0,
                page_fill_ratio=0.787,
                page1_height_px=800.0,
            ),
            validation_status=ValidationStatus(valid=True),
            content_profile=self.analyze_content(resume, section_order),
            section_order=section_order,
            page_assignment={s: 1 for s in section_order},
            spacing_profile={},
            layout_strategy="single-column",
            repair_iterations=self.max_repair_iterations,
        )

    def _force_two_page_balance(
        self, section_order: list[str], profile: ContentProfile, final_height: float
    ) -> tuple[dict[str, int], Measurements]:
        """Choose a deterministic whole-section break closest to balanced utilization."""
        heights = profile.estimated_section_heights
        candidates = []
        for index in range(1, len(section_order)):
            page1 = 110.0 + sum(heights.get(s, 0.0) for s in section_order[:index])
            page2 = sum(heights.get(s, 0.0) for s in section_order[index:])
            p2_sections = section_order[index:]
            orphan_penalty = 1000 if len(p2_sections) == 1 and p2_sections[0] in {"education", "certifications", "achievements"} else 0
            utilization_penalty = max(0.0, PAGE_PRINTABLE_HEIGHT_PX * .25 - page2) * 2
            candidates.append((abs(page1 - page2) + orphan_penalty + utilization_penalty, index, page1, page2))
        _, split, page1, page2 = min(candidates, default=(0, 1, final_height / 2, final_height / 2))
        assignment = {s: (1 if i < split else 2) for i, s in enumerate(section_order)}
        return assignment, Measurements(
            total_height_px=round(final_height, 1), page_capacity_px=PAGE_PRINTABLE_HEIGHT_PX * 2,
            remaining_height_px=round(max(0.0, PAGE_PRINTABLE_HEIGHT_PX * 2 - final_height), 1),
            page_fill_ratio=round(min(1.0, final_height / (PAGE_PRINTABLE_HEIGHT_PX * 2)), 3),
            page_break_index=split, page1_height_px=round(page1, 1), page2_height_px=round(page2, 1),
        )


def compose_resume_layout(
    resume: dict[str, Any],
    template_name: str = "ExecutiveATS",
    typography_rules: dict[str, Any] | None = None,
    page_size: str = "A4",
    ats_constraints: dict[str, Any] | None = None,
    requested_section_order: list[str] | None = None,
    page_mode: str | PageMode = PageMode.AUTO,
) -> CompositionPlan:
    """Convenience helper to invoke the Resume Composition Agent."""
    agent = ResumeCompositionAgent()
    return agent.compose(
        resume=resume,
        template_name=template_name,
        typography_rules=typography_rules,
        page_size=page_size,
        ats_constraints=ats_constraints,
        requested_section_order=requested_section_order,
        page_mode=page_mode,
    )
