"""Selection-aware cache contract for AI tailoring patches.

ATS analysis freshness and tailoring-patch compatibility are intentionally
separate. A valid ATS score cache must not make a patch produced for different
user selections reusable.
"""

from __future__ import annotations

from typing import Any, Iterable

TAILORING_ENGINE_VERSION = "v1.4.1-summary-fallback-v11"
PATCHABLE_SELECTIONS = frozenset({"summary", "experience", "projects", "skills"})


def canonical_selected_sections(values: Iterable[str] | None) -> list[str]:
    return sorted({
        str(value).strip().lower()
        for value in (values or [])
        if str(value).strip().lower() in PATCHABLE_SELECTIONS
    })


def tailoring_cache_matches(
    breakdown: dict[str, Any] | None,
    selected_sections: Iterable[str] | None,
) -> bool:
    payload = breakdown or {}
    patch = payload.get("patch") or {}
    has_edits = isinstance(patch, dict) and any(
        bool(v) for v in patch.values() if v is not None
    )
    # ATS breakdown freshness (breakdown_before) is deliberately NOT checked
    # here -- see this module's docstring: ATS-analysis freshness and
    # tailoring-patch compatibility are separate concerns, and this
    # function's only job is the latter. A prior version conflated the two,
    # which made every payload built without a full breakdown_before
    # (nothing in this module's own contract requires one) silently fail
    # the match regardless of whether the selected sections actually
    # matched.
    requested = canonical_selected_sections(selected_sections)
    # Summary is an explicit rewrite contract, not an optional suggestion.
    # A previously cached multi-section patch could contain experience edits
    # but no summary and was incorrectly treated as a hit, silently dropping
    # the user's selected Summary section.
    if "summary" in requested and not str(patch.get("summary") or "").strip():
        return False

    return (
        payload.get("tailoring_engine_version") == TAILORING_ENGINE_VERSION
        and payload.get("tailoring_generation_status") == "completed"
        and payload.get("selected_sections")
        == requested
        and has_edits
    )
