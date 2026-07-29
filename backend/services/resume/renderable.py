"""Projection from a stored resume record to the strict renderable content model."""

from __future__ import annotations

import copy
import json
import re
from typing import Any

from schemas.resume import RenderableResume

RENDERABLE_FIELDS = frozenset(RenderableResume.model_fields)
PERSONAL_FIELDS = frozenset(RenderableResume.model_fields["personal_info"].annotation.model_fields)
SPACE_RE = re.compile(r"\s+")
TOKEN_RE = re.compile(r"[^a-z0-9]+")


def _text(value: Any) -> str:
    return SPACE_RE.sub(" ", str(value or "")).strip()


def _fingerprint(value: Any) -> str:
    return TOKEN_RE.sub(" ", _text(value).lower()).strip()


def _unique(values: list[Any]) -> list[Any]:
    seen: set[str] = set()
    output: list[Any] = []
    for value in values:
        key = _fingerprint(value if isinstance(value, str) else json.dumps(value, sort_keys=True, default=str))
        if key and key not in seen:
            seen.add(key)
            output.append(value)
    return output


def _unique_achievement_evidence(values: list[str]) -> list[str]:
    kept: list[str] = []
    for value in values:
        key = _fingerprint(value)
        if not any(
            existing_key == key
            or existing_key.startswith(f"{key} ")
            or key.startswith(f"{existing_key} ")
            for existing_key in (_fingerprint(existing) for existing in kept)
        ):
            kept.append(value)
    return kept


def _achievement_text(item: Any) -> str:
    if isinstance(item, str):
        return _text(item)
    if not isinstance(item, dict):
        return ""
    title = _text(item.get("title") or item.get("name") or item.get("achievement") or item.get("award"))
    raw_details = [
        item.get("description"),
        item.get("details"),
        item.get("summary"),
        item.get("result"),
        *(item.get("bullets") or []),
        *(item.get("highlights") or []),
    ]
    details: list[str] = []
    for value in raw_details:
        if isinstance(value, list):
            details.extend(_text(child) for child in value if _text(child))
        elif _text(value):
            details.append(_text(value))
    detail = " ".join(_unique(details))
    if title and detail and not _fingerprint(detail).startswith(_fingerprint(title)):
        return f"{title} — {detail}"
    return detail or title


def _credential_like(item: Any) -> bool:
    if not isinstance(item, dict):
        return False
    combined = _text(" ".join(_text(item.get(key)) for key in ("name", "title", "description", "details")))
    explicitly_credentialed = bool(re.search(r"\b(certifi|credential|course|training|license)\b", combined, re.I))
    achievement_like = bool(re.search(
        r"\b(hackathon|finalist|scholar(?:ship)?|competitive programming|leetcode|volunteer|leadership|student chapter|membership|selected (?:among|as)|top \d+)\b",
        combined,
        re.I,
    ))
    if achievement_like and not explicitly_credentialed:
        return False
    return bool(
        item.get("credential_id")
        or item.get("credential_url")
        or item.get("url")
        or item.get("issuing_organization")
        or item.get("issue_date")
        or item.get("expiration_date")
        or explicitly_credentialed
    )


def project_renderable_resume(record: dict[str, Any]) -> dict[str, Any]:
    """Allowlist professional content and normalize loss-prone item shapes."""

    source = record.get("parsed_content") if isinstance(record.get("parsed_content"), dict) else record
    projected = {key: copy.deepcopy(value) for key, value in source.items() if key in RENDERABLE_FIELDS}
    personal = source.get("personal_info") if isinstance(source.get("personal_info"), dict) else {}
    projected["personal_info"] = {
        key: copy.deepcopy(value)
        for key, value in personal.items()
        if key in PERSONAL_FIELDS and value not in (None, "")
    }

    achievements = [text for text in (_achievement_text(item) for item in source.get("achievements") or []) if text]
    reclassified_achievements: list[str] = []
    credential_items: list[Any] = []
    for item in source.get("certifications") or []:
        normalized = {"name": _text(item)} if isinstance(item, str) else copy.deepcopy(item)
        if _credential_like(normalized):
            credential_items.append(normalized)
        else:
            evidence = _achievement_text(normalized)
            if evidence:
                reclassified_achievements.append(evidence)
    achievements = _unique_achievement_evidence([*achievements, *reclassified_achievements])
    projected["achievements"] = achievements
    achievement_titles = {
        _fingerprint(value.split("—", 1)[0])
        for value in achievements
        if _fingerprint(value)
    }
    internal_cert_keys = {
        "item_index", "bullet_index", "index", "order", "sort_order",
        "itemIndex", "bulletIndex", "change_id", "status", "category",
        "confidence", "source", "source_span", "source_text",
        "normalized_text", "raw_text", "provenance", "metadata"
    }
    certifications = []
    for item in credential_items:
        normalized = {"name": _text(item)} if isinstance(item, str) else copy.deepcopy(item)
        if isinstance(normalized, dict):
            normalized = {k: v for k, v in normalized.items() if k not in internal_cert_keys and v not in (None, "")}
            if "description" in normalized and str(normalized["description"]).strip() in ("0", "0.", "1", "1."):
                del normalized["description"]
        if not normalized.get("name") and normalized.get("title"):
            normalized["name"] = normalized["title"]
        if str(normalized.get("name") or "").strip().lower() in {
            "", "0", "0.", "null", "none", "undefined", "n/a", "na"
        }:
            continue
        title = _fingerprint(normalized.get("name") or normalized.get("title"))
        if title not in achievement_titles or _credential_like(normalized):
            certifications.append(normalized)
    projected["certifications"] = _unique(certifications)

    return RenderableResume.model_validate(projected).model_dump(mode="json")
