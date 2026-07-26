import pytest

from schemas.cover_letter_intelligence import ParagraphPatch
from services.cover_letter.intelligence import (
    _assert_no_new_fact_markers,
    apply_paragraph_patches,
)


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
