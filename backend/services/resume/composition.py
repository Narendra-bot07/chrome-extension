"""Lossless resume composition and pre-render preservation checks."""

from __future__ import annotations

import copy
import re
from io import BytesIO
from dataclasses import dataclass, field
from typing import Any, Iterable

from schemas.resume import ResumeStructure
from services.resume.preservation import PreservationResult, preserve_resume

URL_RE = re.compile(r"(?:https?://|www\.)[^\s<>\])},;]+", re.IGNORECASE)
METRIC_RE = re.compile(r"(?<!\w)(?:\d+(?:\.\d+)?%|\d+\+|\$\s?\d[\d,.]*|\d[\d,.]*x)(?!\w)", re.IGNORECASE)
FORBIDDEN_METADATA_HEADINGS = {
    "created at", "updated at", "file name", "file size", "file type",
    "parse status", "parsing status", "upload source", "is active",
    "storage path", "bucket name", "checksum", "parser version",
    "processing status", "workflow state",
}

_COUNTED_SECTIONS = (
    "experience",
    "projects",
    "education",
    "certifications",
    "achievements",
    "publications",
    "languages",
    "volunteer_experience",
    "open_source",
    "awards",
    "interests",
    "leadership",
    "extracurricular_activities",
    "custom_sections",
)
_BULLET_FIELDS = ("description", "bullet_points", "bullets", "highlights")


@dataclass
class PreservationReport:
    valid: bool = True
    issues: list[str] = field(default_factory=list)
    original_urls: list[str] = field(default_factory=list)
    composed_urls: list[str] = field(default_factory=list)
    score: float = 100.0
    confidence: float = 1.0
    compared_elements: int = 0
    structured_issues: list[dict[str, Any]] = field(default_factory=list)
    repair_actions: list[dict[str, Any]] = field(default_factory=list)
    lossless_resume: dict[str, Any] | None = None

    def add(self, issue: str) -> None:
        self.valid = False
        self.issues.append(issue)


def _dump(value: ResumeStructure | dict[str, Any]) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


def _meaningful(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set, dict)):
        return bool(value)
    return True


def _text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _urls(value: Any) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            if isinstance(child, str) and (
                key.lower() in {"url", "link", "website", "linkedin", "github", "portfolio", "credential_url"}
                or URL_RE.search(child)
            ):
                match = URL_RE.search(child)
                normalized = (match.group(0) if match else child).strip().rstrip("/")
                if normalized:
                    found.add(normalized)
            else:
                found.update(_urls(child))
    elif isinstance(value, list):
        for child in value:
            found.update(_urls(child))
    elif isinstance(value, str):
        found.update(match.rstrip("/") for match in URL_RE.findall(value))
    return found


def _canonical_url(value: str) -> str:
    normalized = str(value or "").strip().lower()
    normalized = re.sub(r"^(?:https?://)?(?:www\.)?", "", normalized)
    normalized = re.sub(r"[?#].*$", "", normalized)
    return normalized.rstrip("/")


def _rendered_urls(resume: ResumeStructure | dict[str, Any]) -> set[str]:
    """Return only URLs the ownership-aware renderer is expected to expose."""

    data = _dump(resume)
    rendered: set[str] = set()
    owned_model = any(
        key in data
        for key in ("candidate_links", "profile_links", "unresolved_links", "link_review")
    )

    def add_records(records: Any, owner_type: str | None = None) -> None:
        if not isinstance(records, list):
            return
        for record in records:
            if not isinstance(record, dict):
                continue
            if record.get("validation_status", "VALID") != "VALID":
                continue
            if owner_type and record.get("owner_type", owner_type) != owner_type:
                continue
            value = record.get("normalized_url") or record.get("url")
            if value:
                rendered.add(str(value).strip().rstrip("/"))

    if owned_model:
        add_records(data.get("candidate_links") or data.get("profile_links"), "candidate")
        for owner_type, section in (
            ("project", "projects"),
            ("certification", "certifications"),
            ("publication", "publications"),
            ("achievement", "achievements"),
            ("experience", "experience"),
            ("education", "education"),
        ):
            for item in data.get(section) or []:
                if isinstance(item, dict):
                    add_records(item.get("links"), owner_type)
        return rendered

    # Compatibility for stored resumes that predate ownership intelligence.
    personal = data.get("personal_info") or {}
    for key in ("linkedin", "github", "website"):
        value = personal.get(key)
        if value:
            rendered.add(str(value).strip().rstrip("/"))
    for value in (personal.get("coding_profiles") or {}).values():
        if value:
            rendered.add(str(value).strip().rstrip("/"))
    for section in ("projects", "certifications", "publications"):
        for item in data.get(section) or []:
            if not isinstance(item, dict):
                continue
            for key in ("url", "link", "credential_url", "repository_url", "github_url"):
                value = item.get(key)
                if value:
                    rendered.add(str(value).strip().rstrip("/"))
    return rendered


def normalize_link_ownership(
    resume: ResumeStructure | dict[str, Any],
) -> dict[str, Any]:
    """Make approved candidate ownership authoritative over legacy header fields."""

    data = copy.deepcopy(_dump(resume))
    records = data.get("candidate_links") or data.get("profile_links")
    if not isinstance(records, list):
        return data

    approved: dict[str, str] = {}
    for record in records:
        if not isinstance(record, dict):
            continue
        if record.get("validation_status", "VALID") != "VALID":
            continue
        if record.get("owner_type", "candidate") != "candidate":
            continue
        platform = _text(record.get("platform")).lower()
        value = record.get("normalized_url") or record.get("url")
        if platform and value and platform not in approved:
            approved[platform] = str(value)

    personal = data.setdefault("personal_info", {})
    personal["linkedin"] = approved.get("linkedin", "")
    personal["github"] = approved.get("github", "")
    personal["website"] = approved.get("portfolio") or approved.get("website", "")
    personal["coding_profiles"] = {
        platform: value
        for platform, value in approved.items()
        if platform in {"leetcode", "x", "kaggle", "medium"}
    }
    data["links"] = {}
    return data


def _bullet_count(items: Any) -> int:
    if not isinstance(items, list):
        return 0
    total = 0
    for item in items:
        if not isinstance(item, dict):
            continue
        for field_name in _BULLET_FIELDS:
            bullets = item.get(field_name)
            if isinstance(bullets, list):
                total += len([bullet for bullet in bullets if _meaningful(bullet)])
                break
    return total


def _allowed(path: str, intentional_removals: Iterable[str]) -> bool:
    allowed = tuple(intentional_removals)
    return any(path == prefix or path.startswith(f"{prefix}.") for prefix in allowed)


def audit_resume_preservation(
    original: ResumeStructure | dict[str, Any],
    composed: ResumeStructure | dict[str, Any],
    intentional_removals: Iterable[str] = (),
    approved_additions: Iterable[str] = (),
    auto_repair: bool = False,
) -> PreservationReport:
    """Reject structural/content loss while allowing approved text rewrites.

    Tailoring may rewrite summary and existing bullet text, but it may not
    reduce section entries, bullet counts, or silently remove hyperlinks.
    Explicit removals must be supplied as auditable field paths.
    """

    source = _dump(original)
    result = _dump(composed)
    approved = tuple(intentional_removals)
    intelligence: PreservationResult = preserve_resume(
        source,
        result,
        candidate_evidence=approved_additions,
        approved_removals=approved,
        auto_repair=auto_repair,
    )
    if auto_repair:
        result = intelligence.lossless_resume
    report = PreservationReport(
        valid=intelligence.valid,
        score=intelligence.score,
        confidence=intelligence.confidence,
        compared_elements=intelligence.compared_elements,
        structured_issues=[
            {
                "code": issue.code,
                "severity": issue.severity,
                "element_id": issue.element_id,
                "path": issue.path,
                "message": issue.message,
                "repairable": issue.repairable,
            }
            for issue in intelligence.issues
        ],
        repair_actions=[
            {
                "action": action.action,
                "element_id": action.element_id,
                "path": action.path,
                "reason": action.reason,
                "responsible_agent": action.responsible_agent,
                "timestamp": action.timestamp,
                "applied": action.applied,
            }
            for action in intelligence.repair_actions
        ],
        lossless_resume=intelligence.lossless_resume,
    )
    report.issues.extend(
        issue.message for issue in intelligence.issues if issue.severity == "critical"
    )

    for section in _COUNTED_SECTIONS:
        before = source.get(section)
        after = result.get(section)
        if isinstance(before, list) and len(after or []) < len(before) and not _allowed(section, approved):
            report.add(f"{section}: entries decreased from {len(before)} to {len(after or [])}")
        before_bullets = _bullet_count(before)
        after_bullets = _bullet_count(after)
        if after_bullets < before_bullets and not _allowed(section, approved):
            report.add(f"{section}: bullets decreased from {before_bullets} to {after_bullets}")

    canonical = set(ResumeStructure.model_fields)
    for key, value in source.items():
        if key not in canonical and _meaningful(value) and not _meaningful(result.get(key)) and not _allowed(key, approved):
            report.add(f"{key}: custom section or field was removed")

    source_urls = _urls(source)
    result_urls = _urls(result)
    report.original_urls = sorted(source_urls)
    report.composed_urls = sorted(result_urls)
    for url in sorted(source_urls - result_urls):
        if not _allowed("links", approved):
            report.add(f"hyperlink removed: {url}")

    return report


def compose_resume(
    original: ResumeStructure,
    candidate: ResumeStructure,
    intentional_removals: Iterable[str] = (),
) -> tuple[ResumeStructure, PreservationReport]:
    """Validate a composed candidate against its source of truth."""

    report = audit_resume_preservation(original, candidate, intentional_removals)
    return candidate, report


def validate_resume_presentation(
    resume: ResumeStructure | dict[str, Any],
) -> PreservationReport:
    """Block flattened, duplicated, or cross-contaminated detail records."""

    data = _dump(resume)
    report = PreservationReport()
    descriptions: dict[str, str] = {}
    record_keys: dict[str, str] = {}

    def parts(item: Any) -> tuple[str, str]:
        if isinstance(item, dict):
            title = _text(
                item.get("title") or item.get("name")
                or item.get("achievement") or item.get("certification_name")
            )
            description = _text(
                item.get("description") or item.get("details")
                or item.get("summary") or item.get("evidence")
            )
            return title, description
        text = _text(item)
        split = re.split(r"\s+(?:—|–|â€”|â€“|-)\s+", text, maxsplit=1)
        return (split[0], split[1]) if len(split) == 2 else ("", text)

    for section in ("achievements", "certifications"):
        for index, item in enumerate(data.get(section) or []):
            title, description = parts(item)
            path = f"{section}.{index}"
            if not title:
                report.add(f"{path}: missing a distinct professional title")
            if not description:
                report.add(f"{path}: missing its supporting description")
            if len(description) > 320:
                report.add(f"{path}: description is too long for a concise professional record")
            if isinstance(item, dict):
                raw_description = (
                    item.get("description") or item.get("details")
                    or item.get("summary") or item.get("evidence")
                )
                if isinstance(raw_description, list) and len(
                    [value for value in raw_description if _text(value)]
                ) != 1:
                    report.add(f"{path}: must contain exactly one description")
            combined = f"{title} {description}"
            achievement_like = bool(re.search(
                r"\b(hackathon|finalist|scholar(?:ship)?|competitive programming|"
                r"leetcode|volunteer|leadership|student chapter|top \d+)\b",
                combined,
                re.I,
            ))
            credential_like = bool(re.search(
                r"\b(certifi|credential|course|training|license|badge|voucher)\b",
                combined,
                re.I,
            ))
            if section == "certifications" and achievement_like and not credential_like:
                report.add(f"{path}: appears to contain achievement evidence")
            if section == "achievements" and credential_like and not achievement_like:
                report.add(f"{path}: appears to contain certification evidence")
            record_key = _fingerprint_line(f"{title} {description}")
            if record_key in record_keys:
                report.add(f"{path}: duplicates {record_keys[record_key]}")
            elif record_key:
                record_keys[record_key] = path
            description_key = _fingerprint_line(description)
            if description_key in descriptions and descriptions[description_key] != path:
                report.add(
                    f"{path}: reuses the description from {descriptions[description_key]}"
                )
            elif description_key:
                descriptions[description_key] = path
    return report


def validate_generated_pdf(pdf_bytes: bytes, resume: ResumeStructure | dict[str, Any]) -> PreservationReport:
    """Post-render gate for visible metadata, metrics, and PDF annotations."""

    from pypdf import PdfReader

    data = _dump(resume)
    report = PreservationReport()
    reader = PdfReader(BytesIO(pdf_bytes))
    pages_text = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(pages_text)
    normalized_lines = {_fingerprint_line(line) for line in text.splitlines() if line.strip()}

    visible_raw_urls = sorted(set(URL_RE.findall(text)))
    for url in visible_raw_urls:
        report.add(f"raw URL is visible instead of a professional link label: {url}")

    for heading in sorted(FORBIDDEN_METADATA_HEADINGS & normalized_lines):
        report.add(f"internal metadata heading rendered in PDF: {heading}")

    source_text = str(data)
    for metric in sorted(set(METRIC_RE.findall(source_text))):
        if metric not in text:
            report.add(f"metric missing from rendered PDF: {metric}")

    required_urls = _rendered_urls(data)
    annotation_urls: set[str] = set()
    for page in reader.pages:
        for annotation_ref in page.get("/Annots") or []:
            annotation = annotation_ref.get_object()
            action = annotation.get("/A")
            uri = action.get("/URI") if action else None
            if uri:
                annotation_urls.add(str(uri).rstrip("/"))
    report.original_urls = sorted(required_urls)
    report.composed_urls = sorted(annotation_urls)
    canonical_annotations = {_canonical_url(url) for url in annotation_urls}
    for url in sorted(required_urls):
        if _canonical_url(url) not in canonical_annotations:
            report.add(f"clickable PDF annotation missing: {url}")

    return report


def _fingerprint_line(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()
