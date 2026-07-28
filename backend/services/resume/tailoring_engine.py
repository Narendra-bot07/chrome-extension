"""Strict minimal-diff resume tailoring engine.

The LLM proposes edits. This module owns authority: it classifies sections,
validates every proposed edit, applies only high-confidence changes, and
returns a structured audit diff. It never regenerates a resume.
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any

from schemas.jobs import JobAnalysis
from schemas.resume import ResumeStructure
from schemas.tailoring import ResumePatch

STATIC_SECTIONS = frozenset({
    "personal_info", "education", "achievements", "certifications", "languages",
    "volunteer_experience", "awards", "scholarships", "links",
})
DEFAULT_EDITABLE_SECTIONS = frozenset({
    "summary", "experience", "projects", "skills", "open_source", "research",
})
NUMBER_RE = re.compile(r"(?:\$\s*)?\d[\d,.]*(?:%|\+|x|k|m|b)?", re.I)
URL_RE = re.compile(r"(?:https?://|www\.)[^\s<>\])},;]+", re.I)
WORD_RE = re.compile(r"[a-z0-9+#.]+", re.I)
EDITORIAL_WORDS = frozenset({
    "built", "created", "developed", "designed", "engineered", "implemented",
    "improved", "optimized", "delivered", "led", "managed", "analyzed",
    "collaborated", "using", "with", "for", "to", "and", "the", "a", "an",
})


@dataclass(frozen=True)
class TailoringDecision:
    path: str
    original: Any
    proposed: Any
    accepted: bool
    reason: str
    ats_benefit: str
    confidence: float


@dataclass
class TailoringPipelineResult:
    patch: ResumePatch
    editable_sections: list[str]
    classifications: dict[str, str]
    edits: list[TailoringDecision] = field(default_factory=list)
    rejected_edits: list[TailoringDecision] = field(default_factory=list)

    def audit_payload(self) -> dict[str, Any]:
        serialize = lambda edit: {
            "path": edit.path,
            "original": edit.original,
            "modified": edit.proposed,
            "accepted": edit.accepted,
            "reason": edit.reason,
            "ats_benefit": edit.ats_benefit,
            "confidence": round(edit.confidence * 100, 1),
        }
        return {
            "editable_sections": self.editable_sections,
            "section_classifications": self.classifications,
            "edits": [serialize(edit) for edit in self.edits],
            "rejected_edits": [serialize(edit) for edit in self.rejected_edits],
        }


class TailoringPlanner:
    def plan(
        self,
        resume: ResumeStructure,
        requested_sections: set[str] | None = None,
    ) -> list[str]:
        requested = (
            set(DEFAULT_EDITABLE_SECTIONS)
            if requested_sections is None
            else set(requested_sections)
        )
        present = {
            section for section in DEFAULT_EDITABLE_SECTIONS
            if getattr(resume, section, None) not in (None, "", [], {})
        }
        # Summary is the sole generatable section and only when explicitly
        # selected. Inclusion is independent of whether other patches exist.
        if requested_sections is not None and "summary" in requested:
            present.add("summary")
        return sorted((requested & present) - STATIC_SECTIONS)


class SectionClassifier:
    def classify(self, resume: ResumeStructure, editable: list[str]) -> dict[str, str]:
        editable_set = set(editable)
        return {
            section: ("EDITABLE" if section in editable_set else "STATIC")
            for section in resume.model_fields
            if section != "raw_text"
        }


class FormattingGuardian:
    def validate(self, original: str, proposed: str) -> list[str]:
        violations: list[str] = []
        if NUMBER_RE.findall(original) != NUMBER_RE.findall(proposed):
            violations.append("numbers or metrics changed")
        if URL_RE.findall(original) != URL_RE.findall(proposed):
            violations.append("hyperlinks changed")
        signature = lambda text: (
            text.count("\n"),
            len(text) - len(text.lstrip()),
            bool(re.match(r"^\s*[•*\-]", text)),
        )
        if signature(original) != signature(proposed):
            violations.append("formatting or spacing changed")
        return violations


class TruthValidator:
    def validate(
        self,
        proposed: str,
        resume_tokens: set[str],
    ) -> list[str]:
        # Grammar and action verbs are wording, not facts. Rejecting every new
        # ordinary word made all useful edits impossible. Factual integrity is
        # enforced separately by immutable metrics/URLs and by allowing newly
        # introduced technical-looking terms only when grounded in the source.
        technical = {
            token.lower() for token in WORD_RE.findall(proposed)
            if any(char.isupper() for char in token[1:])
            or any(char.isdigit() for char in token)
            or token.lower() in {"aws", "gcp", "azure", "react", "python", "java",
                                 "kubernetes", "docker", "sql", "llm", "rag"}
        }
        unsupported = technical - resume_tokens
        return [f"unsupported technical terms: {', '.join(sorted(unsupported)[:5])}"] if unsupported else []


class ATSValidator:
    def validate(self, proposed: str, jd_tokens: set[str]) -> list[str]:
        words = [token.lower() for token in WORD_RE.findall(proposed)]
        if not words:
            return ["empty proposed text"]
        counts = {word: words.count(word) for word in set(words)}
        stuffed = [
            word for word, count in counts.items()
            if word in jd_tokens and count >= 4 and count / len(words) > 0.15
        ]
        return [f"keyword stuffing detected: {', '.join(sorted(stuffed))}"] if stuffed else []


class LayoutValidator:
    @staticmethod
    def _signature(resume: ResumeStructure) -> dict[str, Any]:
        return {
            "experience_items": len(resume.experience),
            "experience_bullets": [len(item.description or []) for item in resume.experience],
            "project_items": len(resume.projects),
            "project_bullets": [len(item.description or []) for item in resume.projects],
            "education_items": len(resume.education),
            "achievement_items": len(resume.achievements),
            "certification_items": len(resume.certifications),
            "section_order": copy.deepcopy(resume.section_order),
            "layout_level": resume.layout_level,
            "layout_model": copy.deepcopy(resume.layout_model),
        }

    def validate(self, original: ResumeStructure, tailored: ResumeStructure) -> list[str]:
        return [] if self._signature(original) == self._signature(tailored) else [
            "layout or structural signature changed"
        ]


class DiffGenerator:
    def create(
        self,
        *,
        path: str,
        original: Any,
        proposed: Any,
        violations: list[str],
        confidence: float,
        ats_benefit: str,
    ) -> TailoringDecision:
        accepted = not violations and proposed != original
        return TailoringDecision(
            path=path,
            original=original,
            proposed=proposed,
            accepted=accepted,
            reason=(
                "Minimal wording improvement."
                if accepted else "Rejected: " + "; ".join(violations or ["no material change"]) + "."
            ),
            ats_benefit=ats_benefit,
            confidence=confidence,
        )


class StrictTailoringEngine:
    MIN_CONFIDENCE = 0.90

    def __init__(self) -> None:
        self.planner = TailoringPlanner()
        self.classifier = SectionClassifier()
        self.formatting_guardian = FormattingGuardian()
        self.truth_validator = TruthValidator()
        self.ats_validator = ATSValidator()
        self.layout_validator = LayoutValidator()
        self.diff_generator = DiffGenerator()

    @staticmethod
    def _tokens(value: Any) -> set[str]:
        return {token.lower() for token in WORD_RE.findall(str(value or ""))}

    @staticmethod
    def _numbers(value: Any) -> list[str]:
        return NUMBER_RE.findall(str(value or ""))

    @staticmethod
    def _urls(value: Any) -> list[str]:
        return URL_RE.findall(str(value or ""))

    @staticmethod
    def _format_signature(value: str) -> tuple[Any, ...]:
        text = str(value or "")
        return (
            text.count("\n"),
            len(text) - len(text.lstrip()),
            bool(re.match(r"^\s*[•*\-]", text)),
        )

    def _confidence(
        self,
        original: str,
        proposed: str,
        resume_tokens: set[str],
        jd_tokens: set[str],
    ) -> float:
        if not proposed.strip():
            return 0.0
        proposed_tokens = self._tokens(proposed)
        similarity = SequenceMatcher(None, original.lower(), proposed.lower()).ratio()
        original_tokens = self._tokens(original)
        overlap = len(proposed_tokens & original_tokens) / max(1, len(original_tokens))
        length_ratio = len(proposed) / max(1, len(original))
        # Confidence represents preservation, not exact vocabulary equality.
        # Small, evidence-preserving rewrites pass; redrafts still fail.
        if similarity < 0.62 or overlap < 0.60 or not 0.65 <= length_ratio <= 1.25:
            return min(0.89, similarity)
        return min(0.99, 0.90 + (similarity * 0.06) + (overlap * 0.03))

    def _validate_text_edit(
        self,
        path: str,
        original: str,
        proposed: str,
        resume_tokens: set[str],
        jd_tokens: set[str],
        *,
        summary: bool = False,
    ) -> TailoringDecision:
        generated_summary = summary and not original.strip()
        confidence = (
            0.94 if generated_summary and proposed.strip() and len(proposed) <= 500
            else self._confidence(original, proposed, resume_tokens, jd_tokens)
        )
        violations = self.formatting_guardian.validate(original, proposed)
        violations.extend(self.truth_validator.validate(proposed, resume_tokens))
        violations.extend(self.ats_validator.validate(proposed, jd_tokens))
        if summary and original and len(proposed) > max(len(original), int(len(original) * 1.20)):
            violations.append("summary exceeds the 20% growth limit")
        if confidence < self.MIN_CONFIDENCE:
            violations.append("confidence below 90%")
        return self.diff_generator.create(
            path=path,
            original=original,
            proposed=proposed,
            violations=violations,
            confidence=confidence,
            ats_benefit="Improves wording and natural keyword alignment without changing evidence.",
        )

    def validate_patch(
        self,
        resume: ResumeStructure,
        job: JobAnalysis,
        candidate: ResumePatch,
        requested_sections: set[str] | None = None,
    ) -> TailoringPipelineResult:
        editable = self.planner.plan(resume, requested_sections)
        classifications = self.classifier.classify(resume, editable)
        accepted = ResumePatch()
        decisions: list[TailoringDecision] = []
        rejected: list[TailoringDecision] = []
        resume_tokens = self._tokens(resume.model_dump_json())
        jd_tokens = self._tokens(job.model_dump_json())

        if candidate.summary is not None and "summary" in editable:
            decision = self._validate_text_edit(
                "summary", resume.summary, candidate.summary,
                resume_tokens, jd_tokens, summary=True,
            )
            (decisions if decision.accepted else rejected).append(decision)
            if decision.accepted:
                accepted.summary = candidate.summary

        for section in ("experience", "projects"):
            if section not in editable:
                continue
            source_items = getattr(resume, section)
            source_patch = getattr(candidate, section) or {}
            accepted_section: dict[str, dict[str, str]] = {}
            for item_key, bullet_changes in source_patch.items():
                try:
                    item_index = int(item_key)
                except (TypeError, ValueError):
                    continue
                if not 0 <= item_index < len(source_items):
                    continue
                bullets = source_items[item_index].description or []
                for bullet_key, proposed in (bullet_changes or {}).items():
                    try:
                        bullet_index = int(bullet_key)
                    except (TypeError, ValueError):
                        continue
                    if not 0 <= bullet_index < len(bullets):
                        continue
                    decision = self._validate_text_edit(
                        f"{section}.{item_index}.description.{bullet_index}",
                        bullets[bullet_index], proposed, resume_tokens, jd_tokens,
                    )
                    (decisions if decision.accepted else rejected).append(decision)
                    if decision.accepted:
                        accepted_section.setdefault(str(item_index), {})[
                            str(bullet_index)
                        ] = proposed
            setattr(accepted, section, accepted_section)

        if "skills" in editable:
            corpus_without_skills = resume.model_dump_json(exclude={"skills", "skills_categories"})
            evidence_tokens = self._tokens(corpus_without_skills)
            existing = {skill.lower() for skill in resume.skills}
            for skill in candidate.skills_append or []:
                grounded = skill.lower() in existing or self._tokens(skill) <= evidence_tokens
                decision = TailoringDecision(
                    path="skills",
                    original=list(resume.skills),
                    proposed=skill,
                    accepted=grounded,
                    reason=(
                        "Skill already exists elsewhere in the source resume."
                        if grounded else "Rejected: skill is not supported by source evidence."
                    ),
                    ats_benefit="Surfaces an existing skill for ATS matching.",
                    confidence=0.98 if grounded else 0.0,
                )
                (decisions if decision.accepted else rejected).append(decision)
                if grounded and skill.lower() not in existing:
                    accepted.skills_append.append(skill)
                    existing.add(skill.lower())

        result = TailoringPipelineResult(
            patch=accepted,
            editable_sections=editable,
            classifications=classifications,
            edits=decisions,
            rejected_edits=rejected,
        )
        materialized = self.apply_patch(resume, result.patch)
        layout_issues = self.layout_validator.validate(resume, materialized)
        if layout_issues:
            result.rejected_edits.extend(result.edits)
            result.edits = []
            result.patch = ResumePatch()
        return result

    def apply_patch(self, resume: ResumeStructure, patch: ResumePatch) -> ResumeStructure:
        result = resume.model_copy(deep=True)
        if patch.summary is not None:
            result.summary = patch.summary
        for skill in patch.skills_append or []:
            if skill.lower() not in {value.lower() for value in result.skills}:
                result.skills.append(skill)
        for section in ("experience", "projects"):
            for item_key, bullet_changes in (getattr(patch, section) or {}).items():
                item_index = int(item_key)
                bullets = getattr(result, section)[item_index].description
                for bullet_key, value in bullet_changes.items():
                    bullets[int(bullet_key)] = value
        return result
