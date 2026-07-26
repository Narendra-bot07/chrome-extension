from schemas.cover_letter_template import (
    CoverLetterPresentationSettings,
    CoverLetterRenderRequest,
)
from services.cover_letter.template import (
    build_cover_letter_render_payload,
    resolve_cover_letter_layout,
)
from test_cover_letter_generation import generation_request
from services.cover_letter.generation import _GeneratedDraft, finalize_generated_cover_letter


def render_request(page_mode="auto"):
    generation = generation_request()
    letter = finalize_generated_cover_letter(
        _GeneratedDraft(
            title="Cloud Engineer Cover Letter",
            content=(
                "July 26, 2026\n\nDear Hiring Manager,\n\n"
                "I built reliable Python services and deployed an Azure platform.\n\n"
                "Sincerely,\nAda"
            ),
        ),
        generation,
    )
    return CoverLetterRenderRequest(
        context=generation.context,
        generated_cover_letter=letter,
        settings=CoverLetterPresentationSettings(page_mode=page_mode),
    )


def test_template_payload_preserves_content_exactly():
    request = render_request()
    payload = build_cover_letter_render_payload(request)
    assert (
        payload["generated_cover_letter"]["content"]
        == request.generated_cover_letter.content
    )


def test_force_one_page_respects_readability_floor():
    settings = resolve_cover_letter_layout(render_request("force_one_page"))
    assert settings.font_size >= 9
    assert settings.page_margin >= 12
    assert settings.line_height >= 1.25
    assert settings.spacing_profile == "compact"
