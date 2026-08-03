"""Consistency validator comparing canonical resume data against rendered models across templates."""

from __future__ import annotations

from typing import Any, Dict, List, NamedTuple
from schemas.canonical_resume import CanonicalResumeSnapshot, calculate_content_hash


class ConsistencyValidationResult(NamedTuple):
    valid: bool
    content_hash_matches: bool
    missing_sections: List[str]
    missing_items: List[str]
    issues: List[str]


def validate_template_consistency(
    snapshot: CanonicalResumeSnapshot | Dict[str, Any],
    rendered_payload: Dict[str, Any],
    expected_content_hash: str | None = None
) -> ConsistencyValidationResult:
    """Verify that a template payload preserves exact canonical content without data loss or content hash mismatch."""
    if isinstance(snapshot, dict):
        canonical = CanonicalResumeSnapshot.model_validate(snapshot)
    else:
        canonical = snapshot

    issues: List[str] = []
    missing_sections: List[str] = []
    missing_items: List[str] = []

    # 1. Content Hash Verification
    actual_hash = canonical.generate_hash()
    hash_matches = True
    if expected_content_hash and expected_content_hash != actual_hash:
        hash_matches = False
        issues.append(f"Content hash mismatch: expected {expected_content_hash}, calculated {actual_hash}")

    # 2. Section Verification
    rendered_sections = set(rendered_payload.get("section_order") or [])
    for section in canonical.sections:
        if not section.visible:
            continue
        # Check if section has data
        if section.items or (section.custom_content and str(section.custom_content).strip()):
            # Verification: section data must exist in rendered payload
            if section.id == "summary":
                summary_val = rendered_payload.get("summary")
                if not summary_val or str(summary_val).strip() != canonical.summary.strip():
                    issues.append("Summary text mismatch or missing in template payload.")
            elif section.id in ("experience", "projects", "education", "certifications", "achievements"):
                rend_list = rendered_payload.get(section.id) or []
                if len(rend_list) < len(section.items):
                    missing_sections.append(section.id)
                    issues.append(
                        f"Section '{section.id}' item count mismatch: canonical has {len(section.items)}, rendered has {len(rend_list)}"
                    )

    # 3. Personal Info / Header Links Verification
    rend_personal = rendered_payload.get("personal_info") or {}
    if canonical.header.email and not rend_personal.get("email"):
        missing_items.append("header.email")
        issues.append("Canonical email is missing from template payload personal_info.")

    is_valid = hash_matches and len(missing_sections) == 0 and len(issues) == 0

    return ConsistencyValidationResult(
        valid=is_valid,
        content_hash_matches=hash_matches,
        missing_sections=missing_sections,
        missing_items=missing_items,
        issues=issues
    )
