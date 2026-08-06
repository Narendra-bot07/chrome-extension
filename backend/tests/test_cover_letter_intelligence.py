import pytest

from schemas.cover_letter_intelligence import (
    CoverLetterEditRequest,
    CoverLetterReviewRequest,
    ParagraphPatch,
)
from services.cover_letter.intelligence import (
    _PatchPlan,
    _assert_no_new_fact_markers,
    apply_paragraph_patches,
    edit_cover_letter,
    review_cover_letter_deterministically,
)
from test_cover_letter_generation import generation_request
from services.cover_letter.generation import _GeneratedDraft, finalize_generated_cover_letter


def test_paragraph_patch_preserves_every_untouched_block():
    content = "Dear Hiring Manager,\n\nFirst body paragraph.\n\nSecond body paragraph.\n\nSincerely,\nAda"
    result = apply_paragraph_patches(content, [
        ParagraphPatch(
            paragraph_index=2,
            before="Second body paragraph.",
            after="A clearer second body paragraph.",
            reason="Improve clarity",
        )
    ])
    assert result == (
        "Dear Hiring Manager,\n\nFirst body paragraph.\n\n"
        "A clearer second body paragraph.\n\nSincerely,\nAda"
    )


def test_patch_rejects_stale_before_content():
    with pytest.raises(ValueError, match="does not match"):
        apply_paragraph_patches("Current paragraph.", [
            ParagraphPatch(
                paragraph_index=0,
                before="Old paragraph.",
                after="Replacement.",
                reason="Test",
            )
        ])


def test_fact_guard_rejects_new_unsupported_metric():
    with pytest.raises(ValueError, match="42%"):
        _assert_no_new_fact_markers(
            "I improved reliability.",
            "I improved reliability by 42%.",
            "Python and Azure are supported.",
        )


def test_fact_guard_allows_supported_metric():
    _assert_no_new_fact_markers(
        "I improved reliability.",
        "I improved reliability by 30%.",
        "Resume evidence: improved reliability by 30%.",
    )


def test_default_review_is_deterministic_and_preserves_generated_letter():
    generation = generation_request()
    letter = finalize_generated_cover_letter(_GeneratedDraft(
        title="Cloud Engineer Cover Letter",
        content=(
            "July 27, 2026\n\nDear Hiring Manager,\n\n"
            "My experience building reliable Python services aligns with the Cloud Engineer role at Acme. "
            "I built Python services that improved reliability by 30% and deployed an Azure cloud platform. "
            "Those systems required careful delivery, clear ownership, and attention to production reliability.\n\n"
            "The role's cloud reliability challenges match the work I have already delivered. "
            "I would welcome the opportunity to discuss how this experience can support Acme's engineering goals "
            "and help the team build dependable cloud services.\n\n"
            "Sincerely,\nAda"
        ),
    ), generation)
    request = CoverLetterReviewRequest(
        context=generation.context,
        strategy=generation.strategy,
        generated_cover_letter=letter,
    )

    result = review_cover_letter_deterministically(request)

    assert request.review_mode == "deterministic"
    assert result.final_cover_letter == letter
    assert result.issues_fixed == []
    assert result.review_score >= 0


def test_interactive_edit_rejects_a_noop_plan(monkeypatch):
    generation = generation_request()
    letter = finalize_generated_cover_letter(_GeneratedDraft(
        title="Cloud Engineer Cover Letter",
        content="Dear Hiring Manager,\n\nI build reliable Python services.\n\nSincerely,\nAda",
    ), generation)
    request = CoverLetterEditRequest(
        context=generation.context,
        strategy=generation.strategy,
        generated_cover_letter=letter,
        user_prompt="Make the opening stronger",
    )
    monkeypatch.setattr(
        "services.cover_letter.intelligence._invoke_plan",
        lambda *args, **kwargs: _PatchPlan(summary="No changes", patches=[]),
    )

    with pytest.raises(ValueError, match="meaningful change"):
        edit_cover_letter(request)


def test_interactive_edit_allows_an_explicit_user_fact_correction(monkeypatch):
    generation = generation_request()
    before = "Dear Hiring Manager,\n\nI improved processing by 30%.\n\nSincerely,\nAda"
    letter = finalize_generated_cover_letter(_GeneratedDraft(
        title="Cloud Engineer Cover Letter",
        content=before,
    ), generation)
    request = CoverLetterEditRequest(
        context=generation.context,
        strategy=generation.strategy,
        generated_cover_letter=letter,
        user_prompt="Correct 30% to 25%.",
    )
    monkeypatch.setattr(
        "services.cover_letter.intelligence._invoke_plan",
        lambda *args, **kwargs: _PatchPlan(
            summary="Applied the requested correction.",
            patches=[ParagraphPatch(
                paragraph_index=1,
                before="I improved processing by 30%.",
                after="I improved processing by 25%.",
                reason="Apply explicit user correction.",
            )],
        ),
    )

    result = edit_cover_letter(request)

    assert "25%" in result.after_content
    assert "30%" not in result.after_content
