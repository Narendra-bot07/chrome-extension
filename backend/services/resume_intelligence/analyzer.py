"""Evidence-grounded deterministic resume intelligence builder."""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from hashlib import sha1
from typing import Any

from .dates import calculate_experience, month_index, parse_date
from .models import (
    AmbiguityRecord,
    CandidateInformation,
    Capability,
    CertificationEntry,
    DomainExperience,
    EducationEntry,
    EvidenceSignal,
    ExperienceEntry,
    InconsistencyRecord,
    Metric,
    ProjectEntry,
    ProvenanceRecord,
    QualitySignal,
    ResumeSection,
    SelectedResumeIntelligence,
    SkillEntry,
    SourceReference,
    confidence,
)


SKILL_ALIASES = {
    "py": "Python", "python3": "Python", "js": "JavaScript", "javascript": "JavaScript",
    "typescript": "TypeScript", "ts": "TypeScript", "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL", "mongo": "MongoDB", "mongodb": "MongoDB",
    "nodejs": "Node.js", "node.js": "Node.js", "reactjs": "React", "react.js": "React",
    "airflow": "Apache Airflow", "apache airflow": "Apache Airflow",
    "aws": "AWS", "amazon web services": "AWS", "gcp": "Google Cloud",
    "google cloud platform": "Google Cloud", "k8s": "Kubernetes",
}
SKILL_CATEGORIES = {
    "Python": "programming_languages", "Java": "programming_languages",
    "JavaScript": "programming_languages", "TypeScript": "programming_languages",
    "C++": "programming_languages", "C#": "programming_languages",
    "SQL": "programming_languages", "R": "programming_languages",
    "React": "frameworks", "Angular": "frameworks", "Django": "frameworks",
    "FastAPI": "frameworks", "Spring": "frameworks", "Node.js": "frameworks",
    "PostgreSQL": "databases", "MySQL": "databases", "MongoDB": "databases",
    "Redis": "databases", "Snowflake": "data_warehouses",
    "AWS": "cloud_platforms", "Azure": "cloud_platforms", "Google Cloud": "cloud_platforms",
    "Docker": "devops_tools", "Kubernetes": "devops_tools", "Jenkins": "devops_tools",
    "Terraform": "devops_tools", "Git": "devops_tools",
    "Apache Airflow": "workflow_orchestration", "Dagster": "workflow_orchestration",
    "Tableau": "bi_visualization", "Power BI": "bi_visualization",
    "TensorFlow": "machine_learning", "PyTorch": "machine_learning",
    "Machine Learning": "machine_learning", "LLM": "ai_llm",
    "LangChain": "ai_llm", "LangGraph": "ai_llm",
    "Agile": "methodologies", "Scrum": "methodologies",
}
KNOWN_SKILLS = sorted(SKILL_CATEGORIES, key=len, reverse=True)
LEADERSHIP_RE = re.compile(r"\b(led|managed|mentored|supervised|directed|headed)\b", re.I)
COLLAB_RE = re.compile(r"\b(collaborated|partnered|cross-functional|stakeholders?|clients?|team)\b", re.I)
OWNERSHIP_RE = re.compile(r"\b(owned|architected|drove|end-to-end|responsible for)\b", re.I)
DEPLOYMENT_RE = re.compile(r"\b(deployed|production|released|launched)\b", re.I)
METRIC_RE = re.compile(
    r"(?P<value>(?:[$₹€£]\s*)?\d+(?:[.,]\d+)?\s*(?:%|x|k|m|b|ms|s|hours?|days?|users?|records?|TB|GB|MB)?)",
    re.I,
)
URL_RE = re.compile(r"https?://[^\s)>,]+", re.I)
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
PHONE_RE = re.compile(r"(?<!\d)(?:\+?\d[\d ()-]{7,}\d)(?!\d)")


def _text(value: Any) -> str:
    return str(value or "").strip()


def _list(value: Any) -> list:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


class ProvenanceBuilder:
    def __init__(self) -> None:
        self.records: dict[str, ProvenanceRecord] = {}

    def add(
        self,
        section: str,
        original: str,
        *,
        entry_id: str | None = None,
        method: str = "structured_source",
        score: float = 0.95,
    ) -> SourceReference:
        original = _text(original)
        normalized = re.sub(r"\s+", " ", original).strip()
        seed = f"{section}|{entry_id}|{original}|{len(self.records)}"
        identifier = "prov-" + sha1(seed.encode("utf-8")).hexdigest()[:16]
        self.records[identifier] = ProvenanceRecord(
            id=identifier,
            source_section=section,
            source_entry_id=entry_id,
            original_text=original,
            normalized_text=normalized,
            extraction_method=method,
            confidence=confidence(score, "direct selected-resume evidence"),
        )
        return SourceReference(provenance_ids=[identifier])


def normalize_skill(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value.strip()).strip(" ,.;:|")
    alias = SKILL_ALIASES.get(cleaned.lower())
    if alias:
        return alias
    for known in KNOWN_SKILLS:
        if cleaned.lower() == known.lower():
            return known
    return cleaned


def categorize_skill(name: str, supplied_category: str | None = None) -> str:
    if name in SKILL_CATEGORIES:
        return SKILL_CATEGORIES[name]
    if supplied_category:
        return re.sub(r"[^a-z0-9]+", "_", supplied_category.lower()).strip("_")
    return "other"


def extract_metrics(text: str, source: SourceReference) -> list[Metric]:
    metrics = []
    for match in METRIC_RE.finditer(text):
        raw = match.group("value").strip()
        if not re.search(r"\d", raw):
            continue
        unit_match = re.search(r"(%|x|k|m|b|ms|s|hours?|days?|users?|records?|TB|GB|MB)$", raw, re.I)
        metrics.append(
            Metric(
                original_text=match.group(0),
                metric_value=raw,
                unit=unit_match.group(1) if unit_match else None,
                context=text,
                source_bullet=text,
                source=source,
                confidence=confidence(0.99, "exact numeric expression preserved"),
            )
        )
    return metrics


def _signals(texts: list[str], pattern: re.Pattern, kind: str, prov: ProvenanceBuilder, section: str, entry_id: str):
    result = []
    for text in texts:
        if pattern.search(text):
            result.append(
                EvidenceSignal(
                    kind=kind,
                    text=text,
                    source=prov.add(section, text, entry_id=entry_id),
                    confidence=confidence(0.92, f"explicit {kind} wording"),
                )
            )
    return result


def _candidate(parsed: dict[str, Any], raw_text: str, prov: ProvenanceBuilder) -> CandidateInformation:
    personal = parsed.get("personal_info") or {}
    header = "\n".join(raw_text.splitlines()[:12])
    email = _text(personal.get("email")) or next(iter(EMAIL_RE.findall(header)), "")
    phone = _text(personal.get("phone")) or next(iter(PHONE_RE.findall(header)), "")
    links = URL_RE.findall(header)
    linkedin = _text(personal.get("linkedin")) or next((x for x in links if "linkedin.com" in x.lower()), "")
    github = _text(personal.get("github")) or next((x for x in links if "github.com" in x.lower()), "")
    website = _text(personal.get("website")) or next(
        (x for x in links if x not in {linkedin, github}), ""
    )
    evidence = " | ".join(
        filter(None, [_text(personal.get("name")), email, phone, linkedin, github, website])
    )
    source = prov.add("contact", evidence, entry_id="candidate") if evidence else SourceReference()
    location = _text(personal.get("location"))
    parts = [part.strip() for part in location.split(",") if part.strip()]
    return CandidateInformation(
        full_name=_text(personal.get("name")) or None,
        email=email or None,
        phone=phone or None,
        city=parts[0] if parts else None,
        state=parts[1] if len(parts) > 1 else None,
        country=parts[2] if len(parts) > 2 else None,
        linkedin_url=linkedin or None,
        github_url=github or None,
        portfolio_url=website or None,
        other_links=[x for x in links if x not in {linkedin, github, website}],
        source=source,
    )


def _experiences(parsed: dict[str, Any], prov: ProvenanceBuilder) -> list[ExperienceEntry]:
    result = []
    for index, item in enumerate(_list(parsed.get("experience")), start=1):
        if not isinstance(item, dict):
            continue
        entry_id = f"experience-{index}"
        bullets = [_text(x) for x in _list(item.get("description")) if _text(x)]
        raw = " | ".join(
            filter(None, [_text(item.get("company")), _text(item.get("role")), *bullets])
        )
        source = prov.add("experience", raw, entry_id=entry_id)
        start = parse_date(_text(item.get("start_date")))
        end = parse_date(_text(item.get("end_date")))
        start_month, end_month = month_index(start), month_index(end, end=True)
        warnings = []
        duration = None
        if start_month is not None and end_month is not None:
            if end_month >= start_month:
                duration = end_month - start_month + 1
            else:
                warnings.append("End date precedes start date")
        metrics = [m for bullet in bullets for m in extract_metrics(bullet, prov.add("experience", bullet, entry_id=entry_id))]
        explicit_tech = []
        joined = " ".join(bullets)
        for skill in KNOWN_SKILLS:
            if re.search(rf"(?<![\w]){re.escape(skill)}(?![\w])", joined, re.I):
                explicit_tech.append(skill)
        role = _text(item.get("role"))
        return_type = _text(item.get("employment_type"))
        if not return_type and "intern" in role.lower():
            return_type = "internship"
        result.append(
            ExperienceEntry(
                id=entry_id,
                employer=_text(item.get("company")) or None,
                role_title=role or None,
                normalized_role_title=re.sub(r"\s+", " ", role).strip() or None,
                employment_type=return_type or None,
                location=_text(item.get("location")) or None,
                start_date=start,
                end_date=end,
                currently_employed=end.is_present if end else None,
                duration_months=duration,
                responsibilities=bullets,
                achievements=[b for b in bullets if METRIC_RE.search(b)],
                technologies=sorted(set(explicit_tech)),
                collaboration_evidence=_signals(bullets, COLLAB_RE, "collaboration", prov, "experience", entry_id),
                leadership_evidence=_signals(bullets, LEADERSHIP_RE, "leadership", prov, "experience", entry_id),
                ownership_evidence=_signals(bullets, OWNERSHIP_RE, "ownership", prov, "experience", entry_id),
                measurable_impact=metrics,
                source=source,
                confidence=confidence(0.94 if role and item.get("company") else 0.68, "structured experience entry"),
                warnings=warnings,
            )
        )
    return result


def _projects(parsed: dict[str, Any], prov: ProvenanceBuilder) -> list[ProjectEntry]:
    result = []
    for index, item in enumerate(_list(parsed.get("projects")), start=1):
        if not isinstance(item, dict):
            continue
        entry_id = f"project-{index}"
        bullets = [_text(x) for x in _list(item.get("description")) if _text(x)]
        tech = [normalize_skill(_text(x)) for x in _list(item.get("technology_stack")) if _text(x)]
        name = _text(item.get("name"))
        raw = " | ".join(filter(None, [name, *bullets, *tech]))
        source = prov.add("projects", raw, entry_id=entry_id)
        link = _text(item.get("link"))
        lower = raw.lower()
        project_type = (
            "academic" if re.search(r"\b(academic|capstone|university|college)\b", lower)
            else "open_source" if re.search(r"\b(open.source|github contribution)\b", lower)
            else "hackathon" if "hackathon" in lower
            else "personal" if "personal" in lower
            else "uncertain"
        )
        metrics = [m for bullet in bullets for m in extract_metrics(bullet, prov.add("projects", bullet, entry_id=entry_id))]
        result.append(
            ProjectEntry(
                id=entry_id,
                project_name=name or None,
                project_type=project_type,
                description=bullets,
                responsibilities=bullets,
                technologies=sorted(set(tech)),
                measurable_outcomes=metrics,
                deployment_evidence=_signals(bullets, DEPLOYMENT_RE, "deployment", prov, "projects", entry_id),
                collaboration_evidence=_signals(bullets, COLLAB_RE, "collaboration", prov, "projects", entry_id),
                ownership_evidence=_signals(bullets, OWNERSHIP_RE, "ownership", prov, "projects", entry_id),
                source_link=link or None,
                associated_context=_text(item.get("role")) or _text(item.get("associated_context")) or None,
                source=source,
                confidence=confidence(0.93 if name else 0.62, "structured project entry"),
            )
        )
    return result


def _skills(
    parsed: dict[str, Any],
    experience: list[ExperienceEntry],
    projects: list[ProjectEntry],
    prov: ProvenanceBuilder,
) -> list[SkillEntry]:
    mentions: dict[str, list[tuple[str, str, str | None]]] = defaultdict(list)
    categories = parsed.get("skills_categories") or {}
    for value in _list(parsed.get("skills")):
        if _text(value):
            name = normalize_skill(_text(value))
            mentions[name].append((_text(value), "skills", None))
    if isinstance(categories, dict):
        for category, values in categories.items():
            for value in _list(values):
                if _text(value):
                    name = normalize_skill(_text(value))
                    mentions[name].append((_text(value), "skills", _text(category)))
    for entry in experience:
        for value in entry.technologies:
            mentions[normalize_skill(value)].append((value, entry.id, None))
    for entry in projects:
        for value in entry.technologies:
            mentions[normalize_skill(value)].append((value, entry.id, None))

    result = []
    for name, items in sorted(mentions.items()):
        originals = list(dict.fromkeys(item[0] for item in items))
        sections = list(dict.fromkeys(item[1] for item in items))
        source = prov.add("skills", ", ".join(originals), entry_id=name)
        result.append(
            SkillEntry(
                normalized_name=name,
                original_mentions=originals,
                category=categorize_skill(name, next((x[2] for x in items if x[2]), None)),
                status="explicit",
                source_sections=sections,
                supporting_evidence=[item[0] for item in items],
                frequency=len(items),
                usage_context=[section for section in sections if section != "skills"],
                confidence=confidence(
                    0.98 if any(section == "skills" for section in sections) else 0.88,
                    "explicit selected-resume mention",
                ),
                source=source,
            )
        )
    return result


def _education(parsed: dict[str, Any], prov: ProvenanceBuilder) -> list[EducationEntry]:
    result = []
    for index, item in enumerate(_list(parsed.get("education")), start=1):
        if not isinstance(item, dict):
            continue
        entry_id = f"education-{index}"
        raw = " | ".join(_text(x) for x in item.values() if _text(x))
        result.append(
            EducationEntry(
                id=entry_id,
                institution=_text(item.get("institution")) or None,
                degree=_text(item.get("degree")) or None,
                normalized_degree=_text(item.get("degree")) or None,
                field_of_study=_text(item.get("field_of_study")) or None,
                start_date=parse_date(_text(item.get("start_date"))),
                graduation_date=parse_date(_text(item.get("end_date"))),
                grade=_text(item.get("gpa")) or None,
                location=_text(item.get("location")) or None,
                source=prov.add("education", raw, entry_id=entry_id),
                confidence=confidence(0.94, "structured education entry"),
            )
        )
    return result


def _certifications(parsed: dict[str, Any], prov: ProvenanceBuilder) -> list[CertificationEntry]:
    result = []
    for index, item in enumerate(_list(parsed.get("certifications")), start=1):
        item = item if isinstance(item, dict) else {"name": _text(item)}
        name = _text(item.get("name"))
        if not name:
            continue
        lower = name.lower()
        credential_type = (
            "course" if re.search(r"\b(course|course completion)\b", lower)
            else "training" if "training" in lower
            else "workshop" if "workshop" in lower
            else "badge" if "badge" in lower
            else "certification"
        )
        entry_id = f"certification-{index}"
        raw = " | ".join(_text(x) for x in item.values() if _text(x))
        result.append(
            CertificationEntry(
                id=entry_id,
                name=name,
                issuing_organization=_text(item.get("issuing_organization")) or None,
                issue_date=parse_date(_text(item.get("issue_date"))),
                expiry_date=parse_date(_text(item.get("expiration_date"))),
                credential_id=_text(item.get("credential_id")) or None,
                credential_url=_text(item.get("credential_url")) or None,
                credential_type=credential_type,
                source=prov.add("certifications", raw, entry_id=entry_id),
                confidence=confidence(0.9, "credential wording classified deterministically"),
            )
        )
    return result


def consistency_checks(
    intelligence: SelectedResumeIntelligence,
) -> tuple[list[InconsistencyRecord], list[AmbiguityRecord], list[QualitySignal]]:
    inconsistencies: list[InconsistencyRecord] = []
    ambiguities: list[AmbiguityRecord] = []
    quality: list[QualitySignal] = []
    for entry in intelligence.experience:
        start, end = month_index(entry.start_date), month_index(entry.end_date, end=True)
        if start is not None and end is not None and end < start:
            inconsistencies.append(
                InconsistencyRecord(
                    field="experience.dates",
                    issue_type="reversed_date_range",
                    message="Experience end date precedes its start date.",
                    affected_entries=[entry.id],
                    severity="critical",
                )
            )
        if entry.end_date and entry.end_date.is_present and entry.currently_employed is False:
            inconsistencies.append(
                InconsistencyRecord(
                    field="experience.currently_employed",
                    issue_type="current_status_conflict",
                    message="Current-date marker conflicts with employment status.",
                    affected_entries=[entry.id],
                    severity="warning",
                )
            )
    dated_ranges = []
    for entry in intelligence.experience:
        start, end = month_index(entry.start_date), month_index(entry.end_date, end=True)
        if start is not None and end is not None and end >= start:
            dated_ranges.append((entry.id, start, end))
    for index, (left_id, left_start, left_end) in enumerate(dated_ranges):
        for right_id, right_start, right_end in dated_ranges[index + 1:]:
            if max(left_start, right_start) <= min(left_end, right_end):
                ambiguities.append(
                    AmbiguityRecord(
                        field="experience.dates",
                        issue_type="overlapping_experience",
                        affected_content=f"{left_id}, {right_id}",
                        severity="warning",
                        evidence=[left_id, right_id],
                        recommended_resolution="Confirm whether the roles were concurrent.",
                    )
                )
    bullet_counts = Counter(
        re.sub(r"\W+", " ", bullet.lower()).strip()
        for entry in intelligence.experience
        for bullet in entry.responsibilities
        if bullet
    )
    duplicates = [bullet for bullet, count in bullet_counts.items() if count > 1]
    if duplicates:
        quality.append(
            QualitySignal(
                code="duplicate_bullets",
                message="Repeated experience bullets were detected.",
                severity="warning",
                evidence=duplicates,
            )
        )
    project_names = Counter(
        (item.project_name or "").lower().strip()
        for item in intelligence.projects
        if item.project_name
    )
    duplicate_projects = [name for name, count in project_names.items() if count > 1]
    if duplicate_projects:
        inconsistencies.append(
            InconsistencyRecord(
                field="projects",
                issue_type="duplicate_project",
                message="Projects with duplicate names were detected.",
                affected_entries=duplicate_projects,
                severity="warning",
            )
        )
    if not intelligence.professional_summary:
        quality.append(
            QualitySignal(
                code="missing_summary",
                message="No professional summary was found.",
                severity="info",
            )
        )
    elif match := re.search(
        r"\b(\d{1,2})\+?\s+years?\s+of\s+experience\b",
        intelligence.professional_summary,
        re.I,
    ):
        claimed_months = int(match.group(1)) * 12
        supported = intelligence.total_experience.non_overlapping_professional_months
        if supported and abs(claimed_months - supported) > 18:
            inconsistencies.append(
                InconsistencyRecord(
                    field="professional_summary",
                    issue_type="experience_claim_conflict",
                    message="Summary experience claim conflicts with dated roles.",
                    affected_entries=[match.group(0)],
                    severity="warning",
                )
            )
    for entry in intelligence.education:
        start, end = month_index(entry.start_date), month_index(entry.graduation_date, end=True)
        if start is not None and end is not None and end < start:
            inconsistencies.append(
                InconsistencyRecord(
                    field="education.dates",
                    issue_type="reversed_education_date_range",
                    message="Education graduation date precedes its start date.",
                    affected_entries=[entry.id],
                    severity="critical",
                )
            )
    if intelligence.projects and not intelligence.measurable_impact:
        quality.append(
            QualitySignal(
                code="projects_without_measurable_outcomes",
                message="Projects contain no explicit measurable outcomes.",
                severity="info",
                evidence=[item.id for item in intelligence.projects],
            )
        )
    contextual_skills = {
        skill.normalized_name
        for skill in intelligence.skills
        if any(source != "skills" for source in skill.source_sections)
    }
    unsupported = [
        skill.normalized_name
        for skill in intelligence.skills
        if skill.source_sections == ["skills"] and skill.normalized_name not in contextual_skills
    ]
    if unsupported:
        quality.append(
            QualitySignal(
                code="skills_without_usage_evidence",
                message="Some explicitly listed skills have no usage context.",
                severity="info",
                evidence=unsupported,
            )
        )
    return inconsistencies, ambiguities, quality


def build_resume_intelligence(
    *,
    resume_id: str,
    resume_version: int,
    fingerprint: str,
    source_type: str,
    display_name: str,
    parsed: dict[str, Any],
    raw_text: str,
    sections: list[ResumeSection],
) -> SelectedResumeIntelligence:
    prov = ProvenanceBuilder()
    experiences = _experiences(parsed, prov)
    projects = _projects(parsed, prov)
    skills = _skills(parsed, experiences, projects, prov)
    education = _education(parsed, prov)
    certifications = _certifications(parsed, prov)
    summary = _text(parsed.get("summary")) or None
    if summary:
        prov.add("summary", summary, entry_id="professional-summary")
    metrics = [
        metric
        for entry in experiences
        for metric in entry.measurable_impact
    ] + [metric for project in projects for metric in project.measurable_outcomes]
    leadership = [
        signal for entry in experiences for signal in entry.leadership_evidence
    ]
    explicit_capabilities = [
        Capability(
            name=skill.normalized_name,
            status="explicit",
            supporting_evidence=skill.supporting_evidence,
            confidence=skill.confidence,
            source=skill.source,
        )
        for skill in skills
    ]
    intelligence = SelectedResumeIntelligence(
        resume_id=resume_id,
        resume_version=resume_version,
        resume_fingerprint=fingerprint,
        source_type=source_type,
        display_name=display_name,
        candidate=_candidate(parsed, raw_text, prov),
        professional_summary=summary,
        experience=experiences,
        projects=projects,
        skills=skills,
        education=education,
        certifications=certifications,
        achievements=metrics,
        leadership=leadership,
        publications=_list(parsed.get("publications")),
        languages=_list(parsed.get("languages")),
        links=URL_RE.findall(raw_text),
        custom_sections=[section for section in sections if section.canonical_type == "custom"],
        total_experience=calculate_experience(experiences),
        explicit_capabilities=explicit_capabilities,
        inferred_capabilities=[],
        measurable_impact=metrics,
        provenance=prov.records,
        confidence=confidence(
            0.9 if parsed.get("parse_status") == "parsed" else 0.72,
            "structured selected-resume representation",
        ),
    )
    inconsistencies, ambiguities, quality = consistency_checks(intelligence)
    return intelligence.model_copy(
        update={
            "inconsistencies": inconsistencies,
            "ambiguities": ambiguities,
            "quality_signals": quality,
            "warnings": intelligence.total_experience.warnings,
        },
        deep=True,
    )
