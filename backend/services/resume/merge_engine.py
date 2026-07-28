"""Source-first final merge and semantic preservation boundary."""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any

from schemas.resume import ResumeStructure
from schemas.tailoring import ResumePatch
from services.resume.tailoring_engine import StrictTailoringEngine

LOCKED_SECTIONS = {
    "personal_info", "education", "certifications", "achievements", "awards",
    "languages", "volunteer_experience", "publications",
}
COUNTED_SECTIONS = (
    "experience", "projects", "education", "certifications", "achievements",
    "awards", "publications", "languages", "volunteer_experience",
)
URL_RE = re.compile(r"(?:https?://|www\.)\S+", re.I)
METRIC_RE = re.compile(r"(?:\$\s*)?\d[\d,.]*(?:%|\+|x|k|m|b)?", re.I)
DATE_RE = re.compile(
    r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|"
    r"dec(?:ember)?)?\s*\d{4}\b", re.I,
)


def _text(value: Any) -> str:
    if isinstance(value, dict):
        return " ".join(_text(child) for child in value.values())
    if isinstance(value, list):
        return " ".join(_text(child) for child in value)
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _items(value: dict[str, Any], section: str) -> list[Any]:
    section_value = value.get(section)
    if section_value in (None, ""):
        return []
    return section_value if isinstance(section_value, list) else [section_value]


@dataclass
class PreservationGuardianReport:
    status: str = "PASS"
    preservation_score: float = 100.0
    violations: list[str] = field(default_factory=list)
    missing_items: list[str] = field(default_factory=list)
    merged_items: list[str] = field(default_factory=list)
    changed_locked_fields: list[str] = field(default_factory=list)
    missing_selected_sections: list[str] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return self.status == "PASS"

    def fail(self, violation: str) -> None:
        if violation not in self.violations:
            self.violations.append(violation)
        self.status = "FAIL"

    def finish(self, checks: int) -> "PreservationGuardianReport":
        self.preservation_score = max(
            0.0, round(100.0 - (100.0 * len(self.violations) / max(1, checks)), 2)
        )
        return self


class PreservationGuardian:
    def validate(
        self,
        original: dict[str, Any],
        merged: dict[str, Any],
        *,
        selected_sections: set[str] | None = None,
        hidden_sections: set[str] | None = None,
        explicit_user_edits: set[str] | None = None,
    ) -> PreservationGuardianReport:
        selected = selected_sections or set()
        hidden = hidden_sections or set()
        user_edits = explicit_user_edits or set()
        report = PreservationGuardianReport()
        checks = 0

        for section in COUNTED_SECTIONS:
            source_items = _items(original, section)
            final_items = _items(merged, section)
            checks += 1
            if section in hidden:
                continue
            if len(source_items) != len(final_items):
                report.fail(
                    f"{section} item count changed: {len(source_items)} -> {len(final_items)}"
                )
                if len(final_items) < len(source_items):
                    report.missing_items.append(section)

            # Item-wise coverage catches one merged item even when a different
            # item was duplicated to keep the raw count unchanged.
            for index, source_item in enumerate(source_items):
                checks += 1
                if index >= len(final_items):
                    continue
                source_text = _text(source_item)
                final_text = _text(final_items[index])
                similarity = SequenceMatcher(
                    None, source_text.lower(), final_text.lower()
                ).ratio()
                if section in LOCKED_SECTIONS and section not in user_edits:
                    if source_item != final_items[index]:
                        report.changed_locked_fields.append(f"{section}.{index}")
                        report.fail(f"locked item changed: {section}.{index}")
                elif similarity < 0.45:
                    report.merged_items.append(f"{section}.{index}")
                    report.fail(f"semantic item boundary lost: {section}.{index}")
                for label, pattern in (
                    ("metric", METRIC_RE), ("date", DATE_RE), ("URL", URL_RE)
                ):
                    if pattern.findall(source_text) != pattern.findall(final_text):
                        report.fail(f"{label} evidence changed: {section}.{index}")

        for section in selected:
            checks += 1
            if section not in hidden and not _text(merged.get(section)):
                report.missing_selected_sections.append(section)
                report.fail(f"selected section missing: {section}")
        return report.finish(checks)


class FinalResumeMergeEngine:
    """Start from source and apply only validated, approved operations."""

    def merge(
        self,
        original: ResumeStructure | dict[str, Any],
        *,
        validated_patch: ResumePatch | None = None,
        selected_sections: set[str] | None = None,
        hidden_sections: set[str] | None = None,
        generated_summary: str | None = None,
        explicit_user_edits: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], PreservationGuardianReport]:
        source = (
            original.model_dump(mode="json")
            if hasattr(original, "model_dump") else copy.deepcopy(original)
        )
        result = copy.deepcopy(source)
        selected = selected_sections or set()
        hidden = hidden_sections or set()

        if validated_patch:
            result = StrictTailoringEngine().apply_patch(
                ResumeStructure(**result), validated_patch
            ).model_dump(mode="json")

        # Inclusion is independent from patch availability.
        if "summary" in selected:
            existing = _text(source.get("summary"))
            result["summary"] = existing or _text(generated_summary)

        user_edit_sections: set[str] = set()
        for section, value in (explicit_user_edits or {}).items():
            if section not in LOCKED_SECTIONS:
                continue
            result[section] = copy.deepcopy(value)
            user_edit_sections.add(section)

        if hidden:
            result.setdefault("_explicitly_hidden_sections", sorted(hidden))

        report = PreservationGuardian().validate(
            source,
            result,
            selected_sections=selected,
            hidden_sections=hidden,
            explicit_user_edits=user_edit_sections,
        )
        if not report.valid:
            # A failed merge never becomes the new source of truth.
            return source, report
        return result, report
