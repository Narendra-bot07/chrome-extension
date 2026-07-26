from schemas.cover_letter_template import (
    CoverLetterPresentationSettings,
    CoverLetterRenderRequest,
)
from services.cover_letter.generation import (
    _GeneratedDraft,
    finalize_generated_cover_letter,
)
from services.cover_letter.template import (
    build_cover_letter_render_payload,
    compose_cover_letter,
    repair_cover_letter_plan,
    review_cover_letter_composition,
)
from test_cover_letter_generation import generation_request


def render_request(
    *,
    template="classic_ats",
    paper_size="A4",
    content=None,
):
    generation = generation_request()
    letter = finalize_generated_cover_letter(
        _GeneratedDraft(
            title="Cloud Engineer Cover Letter",
            content=content or (
                "July 26, 2026\n\nDear Hiring Manager,\n\n"
                + "I built reliable Python services and deployed an Azure platform. " * 30
                + "\n\nSincerely,\nAda"
            ),
        ),
        generation,
    )
    return CoverLetterRenderRequest(
        context=generation.context,
        generated_cover_letter=letter,
        settings=CoverLetterPresentationSettings(
            selected_template=template,
            paper_size=paper_size,
        ),
    )


def good_metrics(**overrides):
    values = {
        "page_height_px": 1123,
        "printable_width_px": 650,
        "content_width_px": 650,
        "width_utilization": 1,
        "vertical_utilization": 0.6,
        "bottom_whitespace_px": 250,
        "top_whitespace_px": 90,
        "header_height_px": 80,
        "body_font_pt": 10.75,
        "page_count": 1,
        "clipped": False,
        "overlap": False,
        "scale_transform": False,
        "zoom": 1,
        "document_scale": 1,
        "content_has_max_width": False,
        "horizontal_overflow": False,
        "left_margin_mm": 18,
        "right_margin_mm": 18,
    }
    values.update(overrides)
    return values


def test_normal_letter_plan_is_readable_and_full_width():
    request = render_request()
    plan = compose_cover_letter(request)
    assert 10 <= plan.typography.body_font_pt <= 11.5
    assert plan.content_width_percent == 100
    assert plan.page_count == 1


def test_template_payload_preserves_content_exactly():
    request = render_request()
    payload = build_cover_letter_render_payload(request)
    assert payload["generated_cover_letter"]["content"] == request.generated_cover_letter.content


def test_template_switching_never_changes_content():
    classic = render_request(template="classic_ats")
    modern = render_request(template="modern_corporate")
    executive = render_request(template="executive_professional")
    contents = {
        build_cover_letter_render_payload(item)["generated_cover_letter"]["content"]
        for item in (classic, modern, executive)
    }
    assert len(contents) == 1


def test_small_text_is_rejected_and_repaired_to_floor():
    plan = compose_cover_letter(render_request())
    review = review_cover_letter_composition(
        plan, good_metrics(body_font_pt=8.5), 300
    )
    assert "BODY_FONT_TOO_SMALL" in review.issues
    assert repair_cover_letter_plan(plan, review).typography.body_font_pt >= 9.5


def test_large_bottom_whitespace_triggers_targeted_repair():
    plan = compose_cover_letter(render_request())
    review = review_cover_letter_composition(
        plan,
        good_metrics(bottom_whitespace_px=600, vertical_utilization=0.3),
        300,
    )
    repaired = repair_cover_letter_plan(plan, review)
    assert "EXCESSIVE_BOTTOM_WHITESPACE" in review.issues
    assert repaired.typography.body_font_pt >= plan.typography.body_font_pt
    assert repaired.spacing.paragraph_gap_px >= plan.spacing.paragraph_gap_px


def test_narrow_content_and_scale_transform_are_rejected():
    plan = compose_cover_letter(render_request())
    review = review_cover_letter_composition(
        plan,
        good_metrics(
            content_width_px=400,
            width_utilization=0.61,
            scale_transform=True,
        ),
        300,
    )
    assert {
        "CONTENT_WIDTH_TOO_NARROW",
        "ACCIDENTAL_DOCUMENT_SCALING",
    }.issubset(review.issues)


def test_typical_letter_does_not_accept_unnecessary_second_page():
    plan = compose_cover_letter(render_request())
    review = review_cover_letter_composition(
        plan, good_metrics(page_count=2), 300
    )
    assert "UNNECESSARY_SECOND_PAGE" in review.issues


def test_repairs_are_bounded_to_three_attempts_by_contract():
    plan = compose_cover_letter(render_request())
    review = review_cover_letter_composition(
        plan,
        good_metrics(bottom_whitespace_px=600, vertical_utilization=0.3),
        300,
    )
    for _ in range(3):
        plan = repair_cover_letter_plan(plan, review)
    assert plan.repair_attempt == 3


def test_a4_and_letter_plans_are_supported():
    assert compose_cover_letter(render_request(paper_size="A4")).paper_size == "A4"
    assert compose_cover_letter(render_request(paper_size="Letter")).paper_size == "Letter"


def test_excessive_horizontal_margins_are_rejected():
    plan = compose_cover_letter(render_request())
    review = review_cover_letter_composition(
        plan,
        good_metrics(left_margin_mm=26, right_margin_mm=26),
        300,
    )
    assert "EXCESSIVE_HORIZONTAL_MARGIN" in review.issues


def test_max_width_constraint_is_treated_as_narrow_content():
    plan = compose_cover_letter(render_request())
    review = review_cover_letter_composition(
        plan,
        good_metrics(content_has_max_width=True),
        300,
    )
    assert "CONTENT_WIDTH_TOO_NARROW" in review.issues


def test_composition_is_deterministic_for_identical_input():
    request = render_request()
    assert compose_cover_letter(request) == compose_cover_letter(request)
