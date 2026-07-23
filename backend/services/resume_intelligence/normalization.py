"""Deterministic, provenance-preserving resume normalization."""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from hashlib import sha256

from .models import NormalizedSegment, ResumeSection, confidence


HEADING_ALIASES = {
    "contact": {"contact", "contact information", "personal information"},
    "summary": {"summary", "professional summary", "profile", "career summary", "about me"},
    "objective": {"objective", "career objective", "professional objective"},
    "skills": {"skills", "technical skills", "core competencies", "technology", "tech stack"},
    "experience": {
        "experience", "work experience", "professional experience", "employment",
        "employment history", "work history", "career experience", "internships",
    },
    "projects": {"projects", "personal projects", "academic projects", "key projects"},
    "education": {"education", "academic background", "academic qualifications", "qualifications"},
    "certifications": {"certifications", "certificates", "licenses and certifications", "credentials"},
    "achievements": {"achievements", "accomplishments", "awards", "honors", "awards and honors"},
    "publications": {"publications", "research", "papers"},
    "leadership": {"leadership", "leadership experience"},
    "volunteering": {"volunteering", "volunteer experience", "community involvement"},
    "languages": {"languages", "spoken languages"},
    "links": {"links", "profiles", "professional links"},
    "activities": {"activities", "extracurricular activities", "interests"},
}
ALIAS_TO_CANONICAL = {
    alias: canonical for canonical, aliases in HEADING_ALIASES.items() for alias in aliases
}
BULLET_RE = re.compile(r"^\s*[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25CF\u00B7*]+\s*")
NUMBERED_BULLET_RE = re.compile(r"^\s*(?:\d+|[a-zA-Z])[.)]\s+")


def normalize_line(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "")
    value = value.replace("\u00a0", " ").replace("\u200b", "")
    value = BULLET_RE.sub("- ", value)
    value = NUMBERED_BULLET_RE.sub("- ", value)
    value = re.sub(r"[ \t]+", " ", value).strip()
    value = re.sub(r"\s+([,.;:])", r"\1", value)
    return value


def _heading_key(line: str) -> str:
    key = re.sub(r"[^a-z0-9 &]", "", line.lower().strip().rstrip(":"))
    return re.sub(r"\s+", " ", key).strip()


def _looks_like_heading(line: str) -> tuple[str, float] | None:
    key = _heading_key(line)
    if key in ALIAS_TO_CANONICAL:
        return ALIAS_TO_CANONICAL[key], 0.99
    if 1 <= len(key.split()) <= 5 and len(key) <= 45:
        if line.isupper() or line.endswith(":"):
            return "custom", 0.62
    return None


def normalize_resume_text(raw_text: str) -> tuple[str, list[ResumeSection]]:
    raw_lines = (raw_text or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    normalized_lines = [normalize_line(line) for line in raw_lines]

    # Remove safe page headers/footers: exact short lines repeated at least
    # three times. Content-bearing lines and all original text remain available.
    short_counts = Counter(
        line for line in normalized_lines if line and len(line) <= 60
    )
    repeated_decoration = {
        line
        for line, count in short_counts.items()
        if count >= 3 and re.search(r"(?:page\s*\d+|confidential|resume|curriculum vitae)", line, re.I)
    }

    compact: list[tuple[int, str, str]] = []
    previous = None
    for index, (original, normalized) in enumerate(
        zip(raw_lines, normalized_lines), start=1
    ):
        if not normalized or normalized in repeated_decoration:
            continue
        if normalized == previous:
            continue
        compact.append((index, original, normalized))
        previous = normalized

    headings: list[tuple[int, str, str, float]] = []
    for position, (_, original, normalized) in enumerate(compact):
        heading = _looks_like_heading(normalized)
        if heading:
            headings.append((position, original.strip(), heading[0], heading[1]))
    if not headings or headings[0][0] != 0:
        headings.insert(0, (0, "", "contact", 0.7))

    sections: list[ResumeSection] = []
    for order, (position, original_heading, canonical, score) in enumerate(headings):
        next_position = headings[order + 1][0] if order + 1 < len(headings) else len(compact)
        content_start = position + (1 if original_heading else 0)
        entries = compact[content_start:next_position]
        segments = [
            NormalizedSegment(
                id=f"seg-{line_no}",
                original_text=original,
                normalized_text=normalized,
                line_start=line_no,
                line_end=line_no,
            )
            for line_no, original, normalized in entries
        ]
        start_line = compact[position][0] if compact else 1
        end_line = entries[-1][0] if entries else start_line
        sections.append(
            ResumeSection(
                id=f"section-{order + 1}",
                canonical_type=canonical,
                original_heading=original_heading,
                section_order=order,
                line_start=start_line,
                line_end=end_line,
                confidence=confidence(score, "heading alias" if score > 0.9 else "heading shape"),
                segments=segments,
            )
        )

    normalized_text = "\n".join(item[2] for item in compact)
    return normalized_text, sections


def canonical_fingerprint(content: bytes) -> str:
    return sha256(content).hexdigest()
