from __future__ import annotations

from schemas.cover_letter_template import (
    CoverLetterCompositionPlan,
    CoverLetterMargins,
    CoverLetterPresentationSettings,
    CoverLetterRenderRequest,
    CoverLetterSpacing,
    CoverLetterTypography,
    CoverLetterVisualReview,
)


TEMPLATE_DEFAULTS = {
    "classic_ats": {
        "font": "Arial", "body": 10.75, "name": 18,
        "line": 1.35, "margin": 19, "alignment": "left",
    },
    "modern_corporate": {
        "font": "Inter", "body": 10.75, "name": 20,
        "line": 1.36, "margin": 18, "alignment": "left",
    },
    "executive_professional": {
        "font": "Georgia", "body": 10.5, "name": 20,
        "line": 1.38, "margin": 21, "alignment": "left",
    },
}


def compose_cover_letter(
    request: CoverLetterRenderRequest,
) -> CoverLetterCompositionPlan:
    """Structured composition recommendation; never modifies letter content."""
    settings = request.settings
    defaults = TEMPLATE_DEFAULTS[settings.selected_template]
    words = request.generated_cover_letter.word_count
    paragraphs = max(1, request.generated_cover_letter.paragraph_count)

    body = min(11.5, max(9.5, settings.font_size or defaults["body"]))
    line_height = min(1.45, max(1.25, settings.line_height))
    margin = min(22, max(15, settings.page_margin))
    paragraph_gap = min(10, max(6, settings.paragraph_spacing))

    if words < 280:
        body = max(body, 11)
        line_height = max(line_height, 1.4)
        paragraph_gap = max(paragraph_gap, 9)
    elif words > 430:
        body = min(body, 10.25)
        line_height = min(line_height, 1.32)
        paragraph_gap = min(paragraph_gap, 7)
        margin = min(margin, 18)

    if settings.page_mode == "force_one_page":
        body = max(9.5, min(body, 10.25))
        line_height = max(1.25, min(line_height, 1.32))
        margin = max(15, min(margin, 17))
        paragraph_gap = max(6, min(paragraph_gap, 8))

    return CoverLetterCompositionPlan(
        paper_size=settings.paper_size,
        template=settings.selected_template,
        margins=CoverLetterMargins(
            top_mm=margin,
            right_mm=margin,
            bottom_mm=margin,
            left_mm=margin,
        ),
        typography=CoverLetterTypography(
            font_family=settings.font or defaults["font"],
            body_font_pt=body,
            name_font_pt=defaults["name"],
            line_height=line_height,
        ),
        spacing=CoverLetterSpacing(
            header_bottom_px=12,
            recipient_bottom_px=10,
            paragraph_gap_px=paragraph_gap,
            greeting_bottom_px=8,
            closing_top_px=10,
        ),
        content_width_percent=100,
        alignment=defaults["alignment"],
        vertical_alignment=(
            "balanced" if words < 330 and paragraphs <= 5 else "top"
        ),
    )


def review_cover_letter_composition(
    plan: CoverLetterCompositionPlan,
    metrics: dict,
    word_count: int,
) -> CoverLetterVisualReview:
    issues: list[str] = []
    page_height = max(1, float(metrics.get("page_height_px") or 1))
    printable_width = max(1, float(metrics.get("printable_width_px") or 1))
    content_width = float(metrics.get("content_width_px") or 0)
    bottom_whitespace = float(metrics.get("bottom_whitespace_px") or 0)
    width_utilization = content_width / printable_width
    vertical_utilization = float(metrics.get("vertical_utilization") or 0)
    body_font = float(metrics.get("body_font_pt") or 0)
    horizontal_margin = max(
        float(metrics.get("left_margin_mm") or 0),
        float(metrics.get("right_margin_mm") or 0),
    )

    if body_font < 9.5:
        issues.append("BODY_FONT_TOO_SMALL")
    if width_utilization < 0.92 or metrics.get("content_has_max_width"):
        issues.append("CONTENT_WIDTH_TOO_NARROW")
    if (
        metrics.get("scale_transform")
        or float(metrics.get("zoom") or 1) != 1
        or float(metrics.get("document_scale") or 1) != 1
    ):
        issues.append("ACCIDENTAL_DOCUMENT_SCALING")
    if horizontal_margin > 22:
        issues.append("EXCESSIVE_HORIZONTAL_MARGIN")
    if (
        int(metrics.get("page_count") or 1) == 1
        and word_count >= 280
        and (
            bottom_whitespace / page_height > 0.52
            or vertical_utilization < 0.32
        )
    ):
        issues.append("EXCESSIVE_BOTTOM_WHITESPACE")
    if float(metrics.get("top_whitespace_px") or 0) / page_height > 0.12:
        issues.append("EXCESSIVE_TOP_WHITESPACE")
    if float(metrics.get("header_height_px") or 0) / page_height > 0.18:
        issues.append("HEADER_TOO_LARGE")
    if float(metrics.get("header_height_px") or 0) < 28:
        issues.append("HEADER_TOO_SMALL")
    if plan.spacing.paragraph_gap_px < 6:
        issues.append("PARAGRAPH_SPACING_TOO_TIGHT")
    if plan.spacing.paragraph_gap_px > 24:
        issues.append("PARAGRAPH_SPACING_TOO_LARGE")
    if metrics.get("clipped"):
        issues.append("TEXT_CLIPPED")
    if metrics.get("horizontal_overflow"):
        issues.append("OVERFLOW")
    if metrics.get("overlap"):
        issues.append("CONTENT_OVERLAP")
    if int(metrics.get("page_count") or 1) > 1 and word_count <= 500:
        issues.append("UNNECESSARY_SECOND_PAGE")

    unique_issues = list(dict.fromkeys(issues))
    return CoverLetterVisualReview(
        status="REPAIR_REQUIRED" if unique_issues else "PASS",
        issues=unique_issues,
    )


def repair_cover_letter_plan(
    plan: CoverLetterCompositionPlan,
    review: CoverLetterVisualReview,
) -> CoverLetterCompositionPlan:
    repaired = plan.model_copy(deep=True)
    repaired.repair_attempt += 1
    issues = set(review.issues)

    if "CONTENT_WIDTH_TOO_NARROW" in issues:
        repaired.content_width_percent = 100
        repaired.margins.left_mm = max(15, repaired.margins.left_mm - 1)
        repaired.margins.right_mm = max(15, repaired.margins.right_mm - 1)
    if "BODY_FONT_TOO_SMALL" in issues:
        repaired.typography.body_font_pt = max(
            9.5, repaired.typography.body_font_pt
        )
    if "EXCESSIVE_BOTTOM_WHITESPACE" in issues:
        repaired.typography.body_font_pt = min(
            12.5, repaired.typography.body_font_pt + 0.4
        )
        repaired.typography.line_height = min(
            1.65, repaired.typography.line_height + 0.05
        )
        repaired.spacing.paragraph_gap_px = min(
            20, repaired.spacing.paragraph_gap_px + 2
        )
        repaired.vertical_alignment = "balanced"
    if "EXCESSIVE_TOP_WHITESPACE" in issues:
        repaired.margins.top_mm = max(15, repaired.margins.top_mm - 2)
    if "HEADER_TOO_LARGE" in issues:
        repaired.typography.name_font_pt = max(
            16, repaired.typography.name_font_pt - 2
        )
        repaired.spacing.header_bottom_px = max(
            8, repaired.spacing.header_bottom_px - 2
        )
    if "HEADER_TOO_SMALL" in issues:
        repaired.typography.name_font_pt = min(
            22, repaired.typography.name_font_pt + 1
        )
    if "EXCESSIVE_HORIZONTAL_MARGIN" in issues:
        repaired.margins.left_mm = min(22, repaired.margins.left_mm)
        repaired.margins.right_mm = min(22, repaired.margins.right_mm)
    if "PARAGRAPH_SPACING_TOO_TIGHT" in issues:
        repaired.spacing.paragraph_gap_px = 6
    if "PARAGRAPH_SPACING_TOO_LARGE" in issues:
        repaired.spacing.paragraph_gap_px = 10
    if {"TEXT_CLIPPED", "CONTENT_OVERLAP", "OVERFLOW", "UNNECESSARY_SECOND_PAGE"} & issues:
        repaired.typography.body_font_pt = max(
            9.5, repaired.typography.body_font_pt - 0.25
        )
        repaired.typography.line_height = max(
            1.25, repaired.typography.line_height - 0.03
        )
        repaired.spacing.paragraph_gap_px = max(
            6, repaired.spacing.paragraph_gap_px - 1
        )
        repaired.margins.top_mm = max(15, repaired.margins.top_mm - 1)
        repaired.margins.bottom_mm = max(15, repaired.margins.bottom_mm - 1)
    return repaired


def build_cover_letter_render_payload(
    request: CoverLetterRenderRequest,
    plan: CoverLetterCompositionPlan | None = None,
) -> dict:
    active_plan = plan or compose_cover_letter(request)
    payload = request.model_dump(mode="json")
    payload["composition_plan"] = active_plan.model_dump(mode="json")
    return payload


# Backward-compatible name retained for callers/tests from the first template phase.
def resolve_cover_letter_layout(
    request: CoverLetterRenderRequest,
) -> CoverLetterPresentationSettings:
    plan = compose_cover_letter(request)
    settings = request.settings.model_copy(deep=True)
    settings.font = plan.typography.font_family
    settings.font_size = plan.typography.body_font_pt
    settings.line_height = plan.typography.line_height
    settings.paragraph_spacing = plan.spacing.paragraph_gap_px
    settings.page_margin = plan.margins.top_mm
    return settings
