"""Phase 7.1: deterministic resume preservation intelligence.

This module never tailors content. It inventories both documents, classifies
semantic continuity, detects loss/duplication/unsupported additions, performs
targeted restoration, and exposes a blocking validation result.
"""

from __future__ import annotations

import copy
import hashlib
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from enum import StrEnum
from typing import Any, Iterable

logger = logging.getLogger(__name__)

URL_RE = re.compile(r"(?:https?://|www\.)[^\s<>\])},;]+", re.I)
METRIC_RE = re.compile(
    r"(?<!\w)(?:\$\s?\d[\d,.]*(?:[kmb])?|\d+(?:\.\d+)?%|\d+\+|"
    r"\d[\d,.]*x|top\s+\d+(?:\.\d+)?%?|(?:\d+)\s*(?:months?|years?|tb|gb|mb))(?!\w)",
    re.I,
)
INTERNAL_FIELDS = {
    "id", "user_id", "created_at", "updated_at", "deleted_at", "file_name",
    "file_size", "file_type", "file_path", "raw_text", "parse_status",
    "parsing_status", "upload_source", "storage_path", "source_fingerprint",
    # Rendering instructions are validated by the composition gate. They are
    # references/configuration, never semantic resume evidence.
    "section_order", "page_assignment", "page_breaks", "layout_mode",
    "spacing_profile", "margin_profile", "font_scale",
    "column_configuration", "rendering_hints", "compactness_level",
    "visual_priority", "layout_level",
}
BULLET_FIELDS = ("description", "bullet_points", "bullets", "highlights", "responsibilities")
SECTION_FIELDS = (
    "experience", "internships", "projects", "education", "skills",
    "certifications", "achievements", "awards", "leadership",
    "volunteer_experience", "publications", "languages", "links",
    "extracurricular_activities", "open_source", "custom_sections",
)


class PreservationState(StrEnum):
    UNCHANGED = "UNCHANGED"
    MODIFIED = "MODIFIED"
    REORDERED = "REORDERED"
    MERGED = "MERGED"
    HIDDEN = "HIDDEN"
    REMOVED = "REMOVED"
    NEW = "NEW"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class Element:
    element_id: str
    kind: str
    section: str
    path: str
    text: str
    value: Any
    order: int
    parent_id: str | None = None
    metrics: tuple[str, ...] = ()
    urls: tuple[str, ...] = ()


@dataclass
class PreservationIssue:
    code: str
    severity: str
    element_id: str | None
    path: str
    message: str
    repairable: bool
    original_value: Any = None
    current_value: Any = None


@dataclass
class RepairAction:
    action: str
    element_id: str
    path: str
    reason: str
    responsible_agent: str = "resume_preservation_engine"
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    applied: bool = False


@dataclass
class PreservationResult:
    valid: bool
    lossless_resume: dict[str, Any]
    issues: list[PreservationIssue]
    repair_actions: list[RepairAction]
    states: dict[str, PreservationState]
    score: float
    confidence: float
    compared_elements: int
    counts: dict[str, int]

    @property
    def warnings(self) -> list[str]:
        return [issue.message for issue in self.issues if issue.severity != "critical"]


def _clean(value: Any) -> str:
    if isinstance(value, str):
        return re.sub(r"\s+", " ", value).strip()
    if isinstance(value, (int, float)):
        return str(value)
    return ""


def _fingerprint(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def _stable_id(kind: str, section: str, identity: str, occurrence: int = 0) -> str:
    digest = hashlib.sha256(
        f"{kind}|{section}|{_fingerprint(identity)}|{occurrence}".encode()
    ).hexdigest()[:16]
    return f"{kind}_{digest}"


def _entry_identity(item: Any, section: str) -> str:
    if not isinstance(item, dict):
        return _clean(item)
    preferred = (
        "name", "title", "role", "role_title", "company", "employer",
        "institution", "degree", "organization", "issuing_organization",
    )
    identity = " | ".join(_clean(item.get(key)) for key in preferred if _clean(item.get(key)))
    if identity:
        return identity
    return " | ".join(_collect_text(item))[:300] or section


def _collect_text(value: Any) -> list[str]:
    if isinstance(value, str):
        return [_clean(value)] if _clean(value) else []
    if isinstance(value, list):
        return [text for child in value for text in _collect_text(child)]
    if isinstance(value, dict):
        return [
            text for key, child in value.items() if key not in INTERNAL_FIELDS
            for text in _collect_text(child)
        ]
    return []


def _extract_urls(value: Any) -> tuple[str, ...]:
    return tuple(sorted({url.rstrip("/") for text in _collect_text(value) for url in URL_RE.findall(text)}))


def _extract_metrics(value: Any) -> tuple[str, ...]:
    return tuple(sorted({_fingerprint(metric) for text in _collect_text(value) for metric in METRIC_RE.findall(text)}))


def inventory_resume(resume: dict[str, Any]) -> list[Element]:
    """Create stable semantic IDs without relying on array positions."""

    elements: list[Element] = []
    seen: dict[tuple[str, str, str], int] = {}

    def add(kind: str, section: str, path: str, value: Any, order: int, parent: str | None, identity: str):
        key = (kind, section, _fingerprint(identity))
        occurrence = seen.get(key, 0)
        seen[key] = occurrence + 1
        element_id = _stable_id(kind, section, identity, occurrence)
        text = " ".join(_collect_text(value))
        elements.append(Element(
            element_id, kind, section, path, text, copy.deepcopy(value), order,
            parent, _extract_metrics(value), _extract_urls(value),
        ))
        return element_id

    for order, (section, value) in enumerate(resume.items()):
        if section in INTERNAL_FIELDS or value in (None, "", [], {}):
            continue
        section_id = add("section", section, section, value, order, None, section)
        if section in {"summary", "objective"}:
            add("description", section, section, value, 0, section_id, _clean(value))
            continue
        if isinstance(value, list):
            for entry_order, item in enumerate(value):
                identity = _entry_identity(item, section)
                entry_id = add("entry", section, f"{section}.{entry_order}", item, entry_order, section_id, identity)
                if isinstance(item, dict):
                    bullet_field = next(
                        (name for name in BULLET_FIELDS if isinstance(item.get(name), list)), None
                    )
                    if bullet_field:
                        for bullet_order, bullet in enumerate(item[bullet_field]):
                            add(
                                "bullet", section,
                                f"{section}.{entry_order}.{bullet_field}.{bullet_order}",
                                bullet, bullet_order, entry_id, _clean(bullet),
                            )
                    for key, child in item.items():
                        if key in INTERNAL_FIELDS or key == bullet_field or child in (None, "", [], {}):
                            continue
                        if key in {"url", "link", "website", "linkedin", "github", "portfolio", "credential_url"}:
                            add("link", section, f"{section}.{entry_order}.{key}", child, 0, entry_id, _clean(child))
                        elif key in {"description", "details", "summary", "evidence"}:
                            add("description", section, f"{section}.{entry_order}.{key}", child, 0, entry_id, _clean(child))
        elif isinstance(value, dict):
            for key, child in value.items():
                if key in INTERNAL_FIELDS or child in (None, "", [], {}):
                    continue
                kind = "link" if key in {"url", "link", "website", "linkedin", "github", "portfolio", "credential_url"} or URL_RE.search(_clean(child)) else "field"
                add(kind, section, f"{section}.{key}", child, 0, section_id, f"{key}|{_clean(child)}")
    return elements


def _similarity(left: Element, right: Element) -> float:
    if left.kind != right.kind or left.section != right.section:
        return 0.0
    a, b = _fingerprint(left.text), _fingerprint(right.text)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    a_tokens, b_tokens = set(a.split()), set(b.split())
    overlap = len(a_tokens & b_tokens) / max(1, len(a_tokens | b_tokens))
    sequence = SequenceMatcher(None, a, b).ratio()
    # Entry renaming should preserve continuity when descriptions overlap.
    return max(overlap, sequence, (overlap + sequence) / 2)


def _get_path(document: dict[str, Any], path: str) -> Any:
    current: Any = document
    for part in path.split("."):
        current = current[int(part)] if isinstance(current, list) else current[part]
    return current


def _restore_path(document: dict[str, Any], path: str, value: Any) -> bool:
    parts = path.split(".")
    current: Any = document
    try:
        for part in parts[:-1]:
            current = current[int(part)] if isinstance(current, list) else current[part]
        last = parts[-1]
        if isinstance(current, list):
            index = int(last)
            if index <= len(current):
                current.insert(index, copy.deepcopy(value))
            else:
                return False
        else:
            current[last] = copy.deepcopy(value)
        return True
    except (KeyError, IndexError, TypeError, ValueError):
        return False


def _replace_path(document: dict[str, Any], path: str, value: Any) -> bool:
    parts = path.split(".")
    current: Any = document
    try:
        for part in parts[:-1]:
            current = current[int(part)] if isinstance(current, list) else current[part]
        last = parts[-1]
        if isinstance(current, list):
            current[int(last)] = copy.deepcopy(value)
        else:
            current[last] = copy.deepcopy(value)
        return True
    except (KeyError, IndexError, TypeError, ValueError):
        return False


def preserve_resume(
    original: dict[str, Any],
    current: dict[str, Any],
    *,
    candidate_evidence: Iterable[str] = (),
    approved_removals: Iterable[str] = (),
    auto_repair: bool = True,
) -> PreservationResult:
    logger.info("[RESUME-PRESERVATION] Preservation Started")
    original_copy, working = copy.deepcopy(original), copy.deepcopy(current)
    before, after = inventory_resume(original_copy), inventory_resume(working)
    evidence = _fingerprint(" ".join(candidate_evidence) + " " + " ".join(_collect_text(original_copy)))
    approved = set(approved_removals)
    states: dict[str, PreservationState] = {}
    issues: list[PreservationIssue] = []
    actions: list[RepairAction] = []
    used_after: set[str] = set()

    leaked = sorted(
        key for key in working
        if key in INTERNAL_FIELDS and working.get(key) not in (None, "", [], {})
    )
    for key in leaked:
        issues.append(PreservationIssue(
            "metadata_leakage", "critical", None, key,
            f"Internal metadata field entered the resume document: {key}.",
            False, None, working.get(key),
        ))

    # Match children before sections so a renamed section/entry has evidence.
    for element in sorted(before, key=lambda item: item.kind == "section"):
        exact = next((item for item in after if item.element_id == element.element_id and item.element_id not in used_after), None)
        match = exact
        similarity = 1.0 if exact else 0.0
        if not match:
            candidates = [item for item in after if item.element_id not in used_after]
            scored = sorted(((_similarity(element, item), item) for item in candidates), reverse=True, key=lambda pair: pair[0])
            if scored and scored[0][0] >= (0.42 if element.kind == "entry" else 0.58):
                similarity, match = scored[0]
            elif element.kind == "bullet":
                # A bullet rewrite may share few literal tokens. Stable parent
                # continuity plus unchanged ordinal is a bounded fallback; the
                # metric/link guards below still reject factual evidence loss.
                positional = [
                    item for item in candidates
                    if item.kind == "bullet"
                    and item.section == element.section
                    and item.order == element.order
                ]
                if len(positional) == 1:
                    match, similarity = positional[0], 0.5
        if match:
            used_after.add(match.element_id)
            if similarity >= 0.995:
                states[element.element_id] = (
                    PreservationState.REORDERED if element.order != match.order else PreservationState.UNCHANGED
                )
            else:
                states[element.element_id] = PreservationState.MODIFIED
            missing_metrics = (
                set(element.metrics) - set(match.metrics)
                if element.kind in {"bullet", "description", "field"} else set()
            )
            missing_urls = (
                set(element.urls) - set(match.urls)
                if element.kind == "link" else set()
            )
            for metric in sorted(missing_metrics):
                issue = PreservationIssue(
                    "missing_metric", "critical", element.element_id, element.path,
                    f"Metric '{metric}' disappeared from {element.path}.", True, metric, None,
                )
                issues.append(issue)
                actions.append(RepairAction(
                    "restore_evidence", element.element_id, element.path, issue.message
                ))
            for url in sorted(missing_urls):
                issue = PreservationIssue(
                    "missing_link", "critical", element.element_id, element.path,
                    f"Link '{url}' disappeared from {element.path}.", True, url, None,
                )
                issues.append(issue)
                actions.append(RepairAction(
                    "restore_evidence", element.element_id, element.path, issue.message
                ))
            continue

        intentionally_hidden = any(
            element.path == prefix or element.path.startswith(f"{prefix}.")
            for prefix in approved
        )
        state = PreservationState.HIDDEN if intentionally_hidden else PreservationState.REMOVED
        states[element.element_id] = state
        if state == PreservationState.REMOVED:
            issue = PreservationIssue(
                f"missing_{element.kind}", "critical", element.element_id, element.path,
                f"{element.kind.title()} disappeared: {element.path}", True,
                element.value, None,
            )
            issues.append(issue)
            actions.append(RepairAction("restore", element.element_id, element.path, issue.message))

    # Additions require evidence. Section wrappers are ignored when their
    # children establish continuity; meaningful new facts are not.
    for element in after:
        if element.element_id in used_after or element.kind == "section":
            continue
        text = _fingerprint(element.text)
        supported = not text or text in evidence or (
            element.kind == "bullet"
            and len(set(text.split()) & set(evidence.split())) / max(1, len(set(text.split()))) >= 0.55
        )
        states[element.element_id] = PreservationState.NEW
        if not supported and element.kind in {"entry", "bullet", "link"}:
            issues.append(PreservationIssue(
                f"unsupported_{element.kind}", "critical", element.element_id, element.path,
                f"Unsupported new {element.kind}: {element.path}", False, None, element.value,
            ))

    # Duplicate IDs mean equivalent semantic elements occurred more than once.
    duplicate_keys: dict[tuple[str, str, str], list[Element]] = {}
    for element in after:
        if element.kind not in {"entry", "bullet", "link"}:
            continue
        duplicate_keys.setdefault((element.kind, element.section, _fingerprint(element.text)), []).append(element)
    for duplicates in duplicate_keys.values():
        if duplicates[0].text and len(duplicates) > 1:
            issues.append(PreservationIssue(
                f"duplicate_{duplicates[0].kind}", "warning", duplicates[1].element_id,
                duplicates[1].path, f"Duplicate {duplicates[0].kind} detected in {duplicates[0].section}.",
                False, duplicates[0].value, duplicates[1].value,
            ))

    if auto_repair:
        # Restore highest-level losses only; restoring a missing parent also
        # restores its descriptions, bullets, metrics, and links.
        missing_paths = sorted(
            {action.path for action in actions},
            key=lambda path: (path.count("."), path),
        )
        restored_prefixes: list[str] = []
        for path in missing_paths:
            if any(path == prefix or path.startswith(f"{prefix}.") for prefix in restored_prefixes):
                continue
            action = next(item for item in actions if item.path == path)
            original_value = _get_path(original_copy, path)
            action.applied = (
                _replace_path(working, path, original_value)
                if action.action == "restore_evidence"
                else _restore_path(working, path, original_value)
            )
            if action.applied:
                restored_prefixes.append(path)

    remaining_critical = [
        issue for issue in issues
        if issue.severity == "critical"
        and not (
            issue.repairable
            and any(
                action.applied
                and (
                    action.element_id == issue.element_id
                    or issue.path == action.path
                    or issue.path.startswith(f"{action.path}.")
                )
                for action in actions
            )
        )
    ]
    counts = {state.value.lower(): sum(value == state for value in states.values()) for state in PreservationState}
    counts.update({
        "duplicated": sum(issue.code.startswith("duplicate_") for issue in issues),
        "hallucinations": sum(issue.code.startswith("unsupported_") for issue in issues),
        "recovered": sum(action.applied for action in actions),
        "lost": len(remaining_critical),
    })
    denominator = max(1, len(before))
    score = round(max(0.0, 100.0 * (1 - len(remaining_critical) / denominator)), 2)
    confidence = round(min(1.0, 0.75 + min(len(before), 100) / 400), 3)
    valid = not remaining_critical
    logger.info(
        "[RESUME-PRESERVATION] Compared %s elements Modified %s Reordered %s "
        "Lost %s Recovered %s Duplicate %s Hallucinations %s valid=%s",
        len(before), counts["modified"], counts["reordered"], counts["lost"],
        counts["recovered"], counts["duplicated"], counts["hallucinations"], valid,
    )
    for issue in issues:
        if issue.severity == "critical":
            logger.warning(
                "[RESUME-PRESERVATION] issue code=%s path=%s element_id=%s "
                "repairable=%s message=%s",
                issue.code, issue.path, issue.element_id, issue.repairable, issue.message,
            )
    return PreservationResult(
        valid, working, issues, actions, states, score, confidence, len(before), counts,
    )
