from services.resume.tailoring_cache import (
    TAILORING_ENGINE_VERSION,
    canonical_selected_sections,
    tailoring_cache_matches,
)


def _cached(sections):
    return {
        "tailoring_engine_version": TAILORING_ENGINE_VERSION,
        "tailoring_generation_status": "completed",
        "selected_sections": canonical_selected_sections(sections),
        "patch": {},
    }


def test_same_selected_sections_reuse_tailoring_patch_cache():
    assert tailoring_cache_matches(
        _cached(["projects", "summary"]),
        ["summary", "projects"],
    )


def test_changed_selected_sections_invalidate_tailoring_patch_cache():
    assert not tailoring_cache_matches(
        _cached(["experience"]),
        ["summary", "experience"],
    )


def test_legacy_cache_without_selection_metadata_is_not_reused():
    assert not tailoring_cache_matches(
        {"patch": {"summary": "Old cached text"}},
        ["summary"],
    )


def test_locked_ui_sections_do_not_change_patch_cache_identity():
    assert tailoring_cache_matches(
        _cached(["summary"]),
        ["summary", "achievements", "education", "certifications"],
    )
