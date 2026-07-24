"""Deterministically restore detailed source lines that structured parsing shortened."""

from __future__ import annotations

import copy
import re
from difflib import SequenceMatcher
from typing import Any

COMBINED_HEADING = re.compile(
    r"^\s*(?:achievements?|awards?|certifications?|certificates?)"
    r"(?:\s*(?:&|/|and)\s*(?:achievements?|awards?|certifications?|certificates?))?\s*:?\s*$",
    re.I,
)
NEXT_HEADING = re.compile(
    r"^\s*(?:education|work experience|experience|projects?|skills?(?: summary)?|"
    r"leadership|volunteering|publications?|languages?|interests?)\s*:?\s*$",
    re.I,
)


def _clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip(" \t\r\n•-")


def _title(item: Any) -> str:
    if isinstance(item, str):
        return _clean(re.split(r"\s+[—–-]\s+", item, maxsplit=1)[0])
    if isinstance(item, dict):
        return _clean(item.get("name") or item.get("title") or item.get("achievement"))
    return ""


def achievement_certificate_lines(raw_text: str) -> list[str]:
    lines = [_clean(line) for line in (raw_text or "").splitlines()]
    captured: list[str] = []
    active = False
    for line in lines:
        if COMBINED_HEADING.match(line):
            active = True
            continue
        if active and NEXT_HEADING.match(line):
            break
        if active and line:
            captured.append(line)
    return captured


def _best_line(title: str, lines: list[str], used: set[str]) -> str | None:
    if not title:
        return None
    normalized = title.lower()
    available = [line for line in lines if line not in used]
    containing = [line for line in available if normalized in line.lower()]
    if containing:
        return max(containing, key=len)
    scored = sorted(
        ((SequenceMatcher(None, normalized, line.lower()).ratio(), line) for line in available),
        reverse=True,
    )
    return scored[0][1] if scored and scored[0][0] >= 0.55 else None


def restore_source_evidence(
    parsed: dict[str, Any],
    raw_text: str,
    source_links: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Restore full combined-section evidence and original annotation URLs."""

    result = copy.deepcopy(parsed)
    lines = achievement_certificate_lines(raw_text)
    used_lines: set[str] = set()
    for section in ("achievements", "certifications"):
        restored = []
        for item in result.get(section) or []:
            title = _title(item)
            match = _best_line(title, lines, used_lines)
            if not match:
                restored.append(item)
                continue
            used_lines.add(match)
            if isinstance(item, str):
                detail = match
                if title and match.lower().startswith(title.lower()):
                    detail = _clean(match[len(title):].lstrip(" —–-:"))
                restored.append(
                    f"{title} — {detail}" if title and detail else
                    (match if len(match) > len(_clean(item)) else item)
                )
                continue
            normalized = copy.deepcopy(item)
            detail = match
            if title and match.lower().startswith(title.lower()):
                detail = _clean(match[len(title):].lstrip(" —–-:"))
            # The structured parser may populate a non-empty but incorrect
            # description by reusing a neighboring record's evidence. The
            # immutable source line is authoritative, so replace parser text
            # whenever a unique title-to-line match exists.
            if detail:
                normalized["description"] = detail
                normalized.pop("details", None)
                normalized.pop("summary", None)
                normalized.pop("evidence", None)
            restored.append(normalized)
        result[section] = restored
    if source_links:
        result["links"] = {**(result.get("links") or {}), **source_links}
    return result
