from __future__ import annotations

from schemas.cover_letter_template import (
    CoverLetterPresentationSettings,
    CoverLetterRenderRequest,
)


def resolve_cover_letter_layout(
    request: CoverLetterRenderRequest,
) -> CoverLetterPresentationSettings:
    """Resolve presentation settings without touching letter content."""
    settings = request.settings.model_copy(deep=True)
    words = request.generated_cover_letter.word_count

    if settings.page_mode == "force_one_page":
        settings.page_margin = min(settings.page_margin, 15)
        settings.font_size = max(9, min(settings.font_size, 10))
        settings.paragraph_spacing = min(settings.paragraph_spacing, 8)
        settings.line_height = min(settings.line_height, 1.35)
        settings.spacing_profile = "compact"
        settings.margin_profile = "narrow"
    elif settings.page_mode == "auto" and words > 390:
        settings.page_margin = min(settings.page_margin, 17)
        settings.font_size = max(9.5, min(settings.font_size, 10.5))
        settings.paragraph_spacing = min(settings.paragraph_spacing, 9)
        settings.line_height = min(settings.line_height, 1.4)
        settings.spacing_profile = "compact"
        settings.margin_profile = "narrow"
    elif settings.page_mode == "allow_two_pages":
        settings.paragraph_spacing = max(settings.paragraph_spacing, 12)
        settings.line_height = max(settings.line_height, 1.45)
    return settings


def build_cover_letter_render_payload(request: CoverLetterRenderRequest) -> dict:
    resolved = resolve_cover_letter_layout(request)
    payload = request.model_dump(mode="json")
    payload["settings"] = resolved.model_dump(mode="json")
    return payload
