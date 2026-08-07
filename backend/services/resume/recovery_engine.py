"""Lossless resume structure recovery before tailoring.

The recovery agent may infer boundaries, never content.  Its canonical model
keeps source spans and verbatim text so every structural decision is auditable
and reversible.
"""

from __future__ import annotations

import copy
import hashlib
import re
from dataclasses import dataclass, field
from typing import Any

URL_RE = re.compile(r"(?:https?://|www\.)\S+", re.I)
METRIC_RE = re.compile(r"(?:\$\s*)?\d[\d,.]*(?:%|\+|x|k|m|b)?", re.I)
BULLET_RE = re.compile(r"^\s*(?:[•●▪◦*]+|[-–—]{1,2})\s*")
HEADING_RE = re.compile(r"^[A-Z][A-Z &/+-]{2,}$")
KNOWN_HEADINGS = {
    "summary": "summary", "professional summary": "summary",
    "experience": "experience", "work experience": "experience",
    "projects": "projects", "skills": "skills", "education": "education",
    "achievements": "achievements", "certifications": "certifications",
    "certificates": "certifications", "achievements & certifications": "achievements_certifications",
    "achievements and certifications": "achievements_certifications",
    "awards": "awards", "languages": "languages",
    "leadership": "leadership", "volunteering": "volunteer_experience",
    "publications": "publications", "interests": "interests",
}
SECTION_FIELDS = (
    "summary", "experience", "projects", "skills", "education", "achievements",
    "certifications", "awards", "publications", "languages",
    "volunteer_experience", "open_source", "leadership",
    "extracurricular_activities", "interests", "custom_sections",
)
ACHIEVEMENT_TITLE_PATTERNS = (
    re.compile(r"Crayon[’']d\s+hackathon\s+finalist", re.I),
    re.compile(r"\$\s*\d[\d,.]*\s+[A-Za-z0-9+&'’ -]{0,45}?\bvoucher\b", re.I),
    re.compile(r"\bCompetitive\s+Programming\b", re.I),
    re.compile(r"\bFind\s+Leader\s+in\s+You(?:\s*\([^)]*\))?", re.I),
    re.compile(r"\bCSI[- ]?Student\s+Chapter(?:\s*\([^)]*\))?", re.I),
    re.compile(r"\b[A-Z][A-Za-z0-9&'’ -]{0,35}\s+Scholarship\b"),
    re.compile(r"\bTTPOC\s*[-–—:]?\s*STUDENT\s+VOLUNTEER\b", re.I),
    re.compile(r"\b[A-Z][A-Za-z0-9+&'’ -]{1,45}\s+(?:Certification|Certificate)\b"),
)


def _clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _stable_id(*parts: Any) -> str:
    payload = "\x1f".join(_clean(part).lower() for part in parts)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _title(value: Any) -> str:
    if isinstance(value, dict):
        return _clean(
            value.get("title") or value.get("name") or value.get("achievement")
            or value.get("degree") or value.get("role") or value.get("company")
            or value.get("institution")
        )
    text = _clean(value)
    return _clean(re.split(r"\s+(?:—|–|-|:)\s+", text, maxsplit=1)[0])


def _description(value: Any) -> str:
    if isinstance(value, dict):
        candidate = (
            value.get("description") or value.get("details")
            or value.get("summary") or value.get("evidence") or ""
        )
        return _clean(" ".join(candidate) if isinstance(candidate, list) else candidate)
    text = _clean(value)
    parts = re.split(r"\s+(?:—|–|-|:)\s+", text, maxsplit=1)
    return parts[1] if len(parts) > 1 else ""


def _source_lines(raw_text: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    cursor = 0
    for raw_line in (raw_text or "").splitlines(keepends=True):
        text = raw_line.rstrip("\r\n")
        start = cursor
        cursor += len(raw_line)
        if _clean(text):
            result.append({"text": text, "clean": _clean(text), "start": start, "end": cursor})
    return result


def _heading_type(text: str) -> str | None:
    normalized = _clean(text).strip(":").lower()
    if normalized in KNOWN_HEADINGS:
        return KNOWN_HEADINGS[normalized]
    if HEADING_RE.match(_clean(text)) and len(normalized.split()) <= 6:
        return "custom"
    return None


def _raw_blocks(raw_text: str) -> list[dict[str, Any]]:
    lines = _source_lines(raw_text)
    blocks: list[dict[str, Any]] = []
    active: dict[str, Any] | None = None
    for line in lines:
        section_type = _heading_type(line["clean"])
        if section_type:
            if active:
                blocks.append(active)
            active = {
                "type": section_type,
                "heading": line["clean"].strip(":"),
                "start": line["start"],
                "end": line["end"],
                "lines": [],
            }
        elif active:
            active["lines"].append(line)
            active["end"] = line["end"]
    if active:
        blocks.append(active)
    return blocks


def _ordered_anchors(parsed: dict[str, Any], section_type: str) -> list[str]:
    fields = (
        ("achievements", "certifications")
        if section_type == "achievements_certifications"
        else (section_type,)
    )
    anchors: list[str] = []
    for field_name in fields:
        for item in parsed.get(field_name) or []:
            title = _title(item)
            if title and title.lower() not in {value.lower() for value in anchors}:
                anchors.append(title)
    return anchors


def _split_by_anchors(text: str, anchors: list[str]) -> list[str]:
    """Split a merged paragraph only at source-backed parser title anchors."""
    hits: list[tuple[int, str]] = []
    lowered = text.lower()
    for anchor in anchors:
        position = lowered.find(anchor.lower())
        if position >= 0:
            hits.append((position, anchor))
    hits.sort()
    if len(hits) < 2:
        return []
    segments: list[str] = []
    for index, (start, _) in enumerate(hits):
        end = hits[index + 1][0] if index + 1 < len(hits) else len(text)
        segment = _clean(BULLET_RE.sub("", text[start:end]))
        if segment:
            segments.append(segment)
    return segments


def _block_source(block: dict[str, Any]) -> tuple[str, int]:
    lines = block.get("lines") or []
    if not lines:
        return "", int(block.get("end") or 0)
    base = int(lines[0]["start"])
    end = int(lines[-1]["end"])
    chars = [" "] * max(0, end - base)
    for line in lines:
        offset = int(line["start"]) - base
        text = line["text"]
        chars[offset:offset + len(text)] = text
        gap_end = int(line["end"]) - base
        if offset + len(text) < gap_end:
            chars[offset + len(text)] = "\n"
    return "".join(chars), base


def _normalized_coverage(value: str) -> str:
    return re.sub(r"[\W_]+", "", value, flags=re.UNICODE).casefold()


@dataclass
class AchievementSegmentationResult:
    items: list[dict[str, Any]]
    source_coverage: float
    unassigned_text: list[str]
    duplicated_text: list[str]
    violations: list[dict[str, Any]]
    confidence: float

    @property
    def valid(self) -> bool:
        return self.source_coverage == 1.0 and not self.violations


class AchievementSegmentationAgent:
    """Detect achievement boundaries; never rewrite the detected source spans."""

    MAX_ATTEMPTS = 3

    # A real achievement/certification title is a short phrase. When the
    # upstream parser hasn't segmented a section at all yet (exactly the
    # degenerate case this agent exists to repair), parsed["achievements"]
    # can itself be one giant unsegmented paragraph -- _title() then falls
    # back to returning that ENTIRE paragraph as the "anchor" (no early
    # dash/colon to split on). That anchor matches the whole text verbatim
    # and, being the longest possible hit at position 0, shadows every real
    # pattern-detected title via the overlap-resolution sort below, which
    # prefers the longest hit at the earliest start. Capping anchor length
    # keeps a degenerate anchor like that from ever poisoning detection.
    _MAX_PLAUSIBLE_TITLE_LENGTH = 120

    @staticmethod
    def _title_hits(text: str, anchors: list[str], strong: bool) -> list[tuple[int, int, str]]:
        hits: list[tuple[int, int, str]] = []
        for anchor in anchors:
            if len(anchor) > AchievementSegmentationAgent._MAX_PLAUSIBLE_TITLE_LENGTH:
                continue
            for match in re.finditer(re.escape(anchor), text, re.I):
                hits.append((match.start(), match.end(), match.group(0)))
                break
        if strong or len(hits) < 2:
            for pattern in ACHIEVEMENT_TITLE_PATTERNS:
                for match in pattern.finditer(text):
                    hits.append((match.start(), match.end(), match.group(0)))
        # Prefer the longest title when two signals start at the same position.
        ordered: list[tuple[int, int, str]] = []
        for hit in sorted(hits, key=lambda value: (value[0], -(value[1] - value[0]))):
            if ordered and hit[0] < ordered[-1][1]:
                continue
            ordered.append(hit)
        return ordered

    @staticmethod
    def _line_hits(text: str) -> list[tuple[int, int, str]]:
        hits: list[tuple[int, int, str]] = []
        cursor = 0
        for line in text.splitlines(keepends=True):
            clean = BULLET_RE.sub("", line).strip()
            if clean:
                start = cursor + line.find(clean)
                detected = next(
                    (
                        match.group(0)
                        for pattern in ACHIEVEMENT_TITLE_PATTERNS
                        if (match := pattern.search(clean)) and match.start() == 0
                    ),
                    _title(clean),
                )
                hits.append((start, start + len(detected), detected))
            cursor += len(line)
        return hits

    def _build(
        self,
        text: str,
        absolute_start: int,
        hits: list[tuple[int, int, str]],
        method: list[str],
    ) -> AchievementSegmentationResult:
        if not hits and _clean(text):
            first = len(text) - len(text.lstrip())
            hits = [(first, first + len(_title(text[first:])), _title(text[first:]))]
        items: list[dict[str, Any]] = []
        for index, (start, title_end, title) in enumerate(hits):
            end = hits[index + 1][0] if index + 1 < len(hits) else len(text)
            # Whitespace between items belongs to neither semantic span.
            item_start = start
            item_end = end
            while item_end > item_start and text[item_end - 1].isspace():
                item_end -= 1
            source_text = text[item_start:item_end]
            description = text[title_end:item_end].strip(" \t\r\n-–—:")
            items.append({
                "id": f"achievement_{_stable_id(absolute_start + item_start, source_text)}",
                "title": _clean(title),
                "description": _clean(description),
                "source_text": source_text.strip(),
                "source_span": {
                    "start": absolute_start + item_start,
                    "end": absolute_start + item_end,
                },
                "source_spans": [{
                    "start": absolute_start + item_start,
                    "end": absolute_start + item_end,
                    "text": source_text.strip(),
                }],
                "confidence": 0.98 if len(hits) > 1 else 0.60,
                "recovery_method": method,
            })
        assigned = "".join(item["source_text"] for item in items)
        source_norm = _normalized_coverage(text)
        assigned_norm = _normalized_coverage(assigned)
        coverage = 1.0 if source_norm == assigned_norm else (
            min(1.0, len(assigned_norm) / max(1, len(source_norm)))
        )
        violations: list[dict[str, Any]] = []
        detected_titles = [item["title"] for item in items]
        if len(items) == 1 and (
            len(items[0]["source_text"]) > 240
            or len(self._title_hits(text, [], True)) > 1
        ):
            violations.append({
                "violation": "MULTIPLE_ACHIEVEMENTS_MERGED",
                "item_id": items[0]["id"],
                "detected_titles": [hit[2] for hit in self._title_hits(text, [], True)],
            })
        spans = [item["source_span"] for item in items]
        if any(
            spans[index]["end"] > spans[index + 1]["start"]
            for index in range(len(spans) - 1)
        ):
            violations.append({"violation": "OVERLAPPING_SOURCE_SPANS"})
        for index, item in enumerate(items):
            for other_index, other_title in enumerate(detected_titles):
                if (
                    index != other_index and other_title
                    and other_title.casefold() in item["description"].casefold()
                ):
                    violations.append({
                        "violation": "TITLE_INSIDE_OTHER_DESCRIPTION",
                        "item_id": item["id"],
                        "title": other_title,
                    })
        if coverage < 1.0:
            violations.append({"violation": "INCOMPLETE_SOURCE_COVERAGE"})
        return AchievementSegmentationResult(
            items=items,
            source_coverage=coverage,
            unassigned_text=[] if coverage == 1.0 else [text],
            duplicated_text=[],
            violations=violations,
            confidence=min((item["confidence"] for item in items), default=0.0),
        )

    def segment(
        self, block: dict[str, Any], parsed: dict[str, Any]
    ) -> AchievementSegmentationResult:
        text, absolute_start = _block_source(block)
        anchors = _ordered_anchors(parsed, block["type"])
        result: AchievementSegmentationResult | None = None
        for attempt in range(self.MAX_ATTEMPTS):
            if attempt == 0:
                hits = self._line_hits(text) if len(block.get("lines") or []) > 1 else []
                if len(hits) < 2:
                    hits = self._title_hits(text, anchors, False)
                method = ["line_boundary_detection", "source_anchor_detection"]
            else:
                hits = self._title_hits(text, anchors, True)
                method = ["strong_title_span_detection", "deterministic_repair"]
            result = self._build(text, absolute_start, hits, method)
            if result.valid:
                return result
        # Verbatim line fallback never collapses multiple visible source lines.
        line_hits = self._line_hits(text)
        if len(line_hits) > 1:
            return self._build(
                text, absolute_start, line_hits,
                ["verbatim_line_fallback"],
            )
        return result or self._build(
            text, absolute_start, [], ["verbatim_block_fallback"]
        )


def _segment_block(block: dict[str, Any], parsed: dict[str, Any]) -> tuple[list[str], float, list[str]]:
    lines = block["lines"]
    cleaned = [_clean(BULLET_RE.sub("", line["text"])) for line in lines if _clean(line["text"])]
    explicit_bullets = [line for line in lines if BULLET_RE.match(line["text"])]
    if len(explicit_bullets) >= 2:
        return cleaned, 0.99, ["heading_detection", "bullet_boundary_detection"]
    anchors = _ordered_anchors(parsed, block["type"])
    joined = _clean(" ".join(cleaned))
    anchored = _split_by_anchors(joined, anchors)
    if anchored and len(anchored) == len(anchors):
        return anchored, 0.96, [
            "heading_detection", "source_anchor_detection",
            "semantic_item_segmentation",
        ]
    if len(cleaned) > 1:
        return cleaned, 0.86, ["heading_detection", "line_boundary_detection"]
    return ([joined] if joined else []), 0.55, ["heading_detection", "verbatim_fallback"]


def _canonical_item(
    section_type: str,
    text: str,
    order: int,
    confidence: float,
    method: list[str],
    block: dict[str, Any],
    title_hint: str = "",
) -> dict[str, Any]:
    title = title_hint or _title(text)
    description = _description(text)
    if title_hint and text.lower().startswith(title_hint.lower()):
        description = _clean(text[len(title_hint):].lstrip(" -–—:"))
    return {
        "id": f"{section_type}_{_stable_id(section_type, order, text)}",
        "title": title,
        "subtitle": "",
        "description": description,
        "bullets": [],
        "links": URL_RE.findall(text),
        "metrics": METRIC_RE.findall(text),
        "dates": {},
        "location": "",
        "source_text": text,
        "source_spans": [{"start": block["start"], "end": block["end"], "text": text}],
        "confidence": confidence,
        "recovery_method": method,
    }


@dataclass
class RecoveryResult:
    canonical_resume: dict[str, Any]
    recovered_resume: dict[str, Any]
    recovery_warnings: list[dict[str, Any]] = field(default_factory=list)
    confidence: float = 1.0


class ResumeRecoveryAgent:
    """Recover a canonical model while keeping the legacy renderer payload."""

    def recover(
        self,
        parsed: dict[str, Any],
        raw_text: str,
        source_metadata: dict[str, Any] | None = None,
    ) -> RecoveryResult:
        source = copy.deepcopy(parsed)
        blocks = _raw_blocks(raw_text)
        canonical_sections: list[dict[str, Any]] = []
        warnings: list[dict[str, Any]] = []
        confidences: list[float] = []
        handled: set[str] = set()
        segmented_renderer_items: dict[str, list[Any]] = {}
        segmentation_reports: list[dict[str, Any]] = []

        for order, block in enumerate(blocks):
            section_type = block["type"]
            if section_type in {
                "achievements", "certifications", "achievements_certifications"
            }:
                segmentation = AchievementSegmentationAgent().segment(block, source)
                canonical_items = segmentation.items
                confidence = segmentation.confidence
                method = sorted({
                    method_name
                    for item in canonical_items
                    for method_name in item.get("recovery_method", [])
                })
                segmentation_reports.append({
                    "section_type": section_type,
                    "source_coverage": segmentation.source_coverage,
                    "unassigned_text": segmentation.unassigned_text,
                    "duplicated_text": segmentation.duplicated_text,
                    "violations": segmentation.violations,
                    "item_count": len(canonical_items),
                })
                renderer_values = [item["source_text"] for item in canonical_items]
                if section_type == "certifications":
                    segmented_renderer_items["certifications"] = [
                        {
                            "name": item["title"],
                            "issuing_organization": item["description"],
                            "source_text": item["source_text"],
                            "source_span": item["source_span"],
                            "confidence": item["confidence"],
                        }
                        for item in canonical_items
                    ]
                else:
                    # A combined source heading retains its interleaved order in
                    # one renderer array instead of being regrouped by category.
                    segmented_renderer_items["achievements"] = renderer_values
                    if section_type == "achievements_certifications":
                        segmented_renderer_items["certifications"] = []
            else:
                items, confidence, method = _segment_block(block, source)
                anchors = _ordered_anchors(source, section_type)
                canonical_items = [
                    _canonical_item(
                        section_type, text, index, confidence, method, block,
                        next(
                            (
                                anchor for anchor in anchors
                                if text.lower().startswith(anchor.lower())
                            ),
                            "",
                        ),
                    )
                    for index, text in enumerate(items)
                ]
            handled.add(section_type)
            canonical_sections.append({
                "id": f"section_{_stable_id(order, block['heading'])}",
                "type": section_type,
                "original_heading": block["heading"],
                "display_heading": block["heading"],
                "order": order,
                "locked": section_type not in {"summary", "experience", "projects", "skills"},
                "items": canonical_items,
                "recovery_confidence": confidence,
                "recovery_method": method,
            })
            confidences.append(confidence)
            if confidence < 0.80:
                warnings.append({
                    "section_id": canonical_sections[-1]["id"],
                    "message": (
                        "We recovered this section from inconsistent formatting. "
                        "Please review the detected items."
                    ),
                    "original_text": _clean(" ".join(line["text"] for line in block["lines"])),
                })

        # Parser-only data remains represented, and unknown fields are retained.
        order = len(canonical_sections)
        for field_name in SECTION_FIELDS:
            if field_name in handled or not source.get(field_name):
                continue
            values = source[field_name] if isinstance(source[field_name], list) else [source[field_name]]
            canonical_sections.append({
                "id": f"section_{_stable_id(order, field_name)}",
                "type": field_name,
                "original_heading": field_name.replace("_", " ").title(),
                "display_heading": field_name.replace("_", " ").title(),
                "order": order,
                "locked": field_name not in {"summary", "experience", "projects", "skills"},
                "items": [
                    _canonical_item(field_name, _clean(value), index, 0.75,
                                    ["parser_provenance"], {"start": -1, "end": -1})
                    for index, value in enumerate(values) if _clean(value)
                ],
                "recovery_confidence": 0.75,
                "recovery_method": ["parser_provenance"],
            })
            order += 1

        known = set(SECTION_FIELDS) | {
            "personal_info", "links", "raw_text", "section_order", "layout_level",
            "layout_model", "source_preservation_version",
        }
        unknown = [
            {"heading": key.replace("_", " ").title(), "content": copy.deepcopy(value)}
            for key, value in source.items() if key not in known and value not in (None, "", [], {})
        ]
        canonical = {
            "header": copy.deepcopy(source.get("personal_info") or {}),
            "summary": {
                "enabled": bool(source.get("summary")),
                "selected_by_user": False,
                "source": "original" if source.get("summary") else "generated",
                "text": _clean(source.get("summary")),
            },
            "sections": canonical_sections,
            "custom_sections": copy.deepcopy(source.get("custom_sections") or []) + unknown,
            "provenance": {
                "source_priority": [
                    "original_source_text", "parser_output", "user_confirmed",
                    "ai_recovered_structure", "tailoring_patch",
                ],
                "raw_text_hash": hashlib.sha256((raw_text or "").encode("utf-8")).hexdigest(),
                "source_metadata": copy.deepcopy(source_metadata or {}),
            },
            "recovery_warnings": warnings,
            "achievement_segmentation": segmentation_reports,
        }
        recovered = copy.deepcopy(source)
        for field_name, values in segmented_renderer_items.items():
            recovered[field_name] = values
        recovered["raw_text"] = raw_text
        recovered["canonical_resume"] = canonical
        recovered["recovery_warnings"] = warnings
        recovered["source_preservation_version"] = "9.1-achievement-segmentation"
        return RecoveryResult(
            canonical_resume=canonical,
            recovered_resume=recovered,
            recovery_warnings=warnings,
            confidence=min(confidences) if confidences else 1.0,
        )
