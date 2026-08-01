"""Selection-aware cache contract for AI tailoring patches.

ATS analysis freshness and tailoring-patch compatibility are intentionally
separate. A valid ATS score cache must not make a patch produced for different
user selections reusable.
"""

from __future__ import annotations

from typing import Any, Iterable

TAILORING_ENGINE_VERSION = "v1.3.0-fresh-full-pipeline-v9"
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
    # Reject stale cached analysis that lacks full breakdown dictionary
    breakdown_before = payload.get("breakdown_before") or {}
    if not isinstance(breakdown_before, dict) or len(breakdown_before) < 3:
        return False

    return (
        payload.get("tailoring_engine_version") == TAILORING_ENGINE_VERSION
        and payload.get("tailoring_generation_status") == "completed"
        and payload.get("selected_sections")
        == canonical_selected_sections(selected_sections)
        and has_edits
    )
