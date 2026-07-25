"""Deterministic Phase 1 layout recommendation agents.

These agents make structured decisions only. They never produce HTML or CSS.
"""

from __future__ import annotations

from typing import Any

from schemas.layout_intelligence import (
    LayoutConstraints,
    LayoutIntelligenceRequest,
    LayoutIntelligenceResponse,
    LayoutPlan,
    LayoutStrategyRecommendation,
    SectionPriorityRecommendation,
)


SUPPORTED_SECTIONS = (
    "summary", "objective", "experience", "internships", "projects", "education",
    "skills", "certifications", "achievements", "volunteer", "publications",
    "languages", "awards", "interests", "open_source", "leadership",
    "extracurricular_activities", "custom_sections",
)
RESEARCH_TERMS = ("research", "scientist", "phd", "doctoral", "postdoc", "academic")
ENGINEERING_TERMS = (
    "engineer", "developer", "software", "data", "devops", "platform",
    "security", "machine learning", "cloud",
)
EXECUTIVE_TERMS = ("chief", "director", "head of", "vice president", "vp", "executive")


def _present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return bool(value)


def _count(resume: dict[str, Any], section: str) -> int:
    value = resume.get(section)
    if isinstance(value, (list, dict)):
        return len(value)
    return int(_present(value))


def _text_size(value: Any) -> int:
    if isinstance(value, str):
        return len(value)
    if isinstance(value, dict):
        return sum(_text_size(item) for item in value.values())
    if isinstance(value, list):
        return sum(_text_size(item) for item in value)
    return len(str(value or ""))


class SectionPriorityAgent:
    def recommend(
        self, resume: dict[str, Any], context: LayoutIntelligenceRequest
    ) -> SectionPriorityRecommendation:
        role = context.target_role.lower()
        present = [section for section in SUPPORTED_SECTIONS if _present(resume.get(section))]

        if any(term in role for term in RESEARCH_TERMS):
            preferred = [
                "summary", "publications", "projects", "education", "experience",
                "skills", "certifications", "achievements",
            ]
            basis = "Research roles prioritize evidence of research and academic grounding."
        elif any(term in role for term in EXECUTIVE_TERMS):
            preferred = [
                "summary", "experience", "leadership", "achievements", "skills",
                "education", "certifications", "projects",
            ]
            basis = "Executive roles prioritize leadership scope and demonstrated outcomes."
        elif any(term in role for term in ENGINEERING_TERMS):
            preferred = [
                "summary", "experience", "projects", "skills", "education",
                "achievements", "certifications", "open_source",
            ]
            basis = "Engineering roles prioritize delivered work and technical evidence."
        else:
            preferred = [
                "summary", "experience", "skills", "projects", "education",
                "achievements", "certifications",
            ]
            basis = "General ATS ordering puts qualifications and recent evidence first."

        source_order = resume.get("section_order") or SUPPORTED_SECTIONS
        ordered = [section for section in preferred if section in present]
        ordered.extend(section for section in source_order if section in present and section not in ordered)
        ordered.extend(section for section in present if section not in ordered)
        return SectionPriorityRecommendation(
            section_order=ordered,
            reasoning={section: basis for section in ordered},
        )


class LayoutIntelligenceAgent:
    def recommend(
        self, resume: dict[str, Any], context: LayoutIntelligenceRequest
    ) -> LayoutStrategyRecommendation:
        role = context.target_role.lower()
        experience_count = _count(resume, "experience")
        project_count = _count(resume, "projects")
        publication_count = _count(resume, "publications")
        skills_count = _count(resume, "skills") + _count(resume, "skills_categories")
        content_size = sum(_text_size(resume.get(section)) for section in SUPPORTED_SECTIONS)
        has_portfolio = _present(resume.get("portfolio")) or bool(
            (resume.get("links") or {}).get("portfolio")
        )

        reasons: list[str] = []
        if publication_count or any(term in role for term in RESEARCH_TERMS):
            strategy = "research"
            reasons.append("Research signals make publications and academic evidence primary.")
        elif any(term in role for term in EXECUTIVE_TERMS) or experience_count >= 5:
            strategy = "executive_ats"
            reasons.append("Leadership or extensive experience benefits from a linear ATS narrative.")
        elif has_portfolio and project_count >= 3:
            strategy = "portfolio"
            reasons.append("A strong project set and portfolio link deserve visible emphasis.")
        elif content_size > 6500 or experience_count >= 4:
            strategy = "compact_ats"
            reasons.append("High content density requires a compact, single-column strategy.")
        elif any(term in role for term in ENGINEERING_TERMS) or project_count >= 2:
            strategy = "engineering"
            reasons.append("Technical evidence supports an engineering-focused hierarchy.")
        elif skills_count >= 12 and content_size < 4500:
            strategy = "modern_sidebar"
            reasons.append("Dense skills and moderate content can use a restrained sidebar safely.")
        else:
            strategy = "compact_ats"
            reasons.append("A compact ATS layout is the safest default for the available evidence.")

        ats_score = context.ats_score
        ats_caution = ats_score is not None and ats_score < 70
        allow_sidebar = strategy in {"modern_sidebar", "portfolio"} and not ats_caution
        if ats_caution:
            reasons.append("The current ATS score favors conservative single-column reading order.")
        confidence = min(0.95, 0.62 + 0.05 * len(reasons) + (0.08 if context.target_role else 0))
        effective = context.user_strategy_override or strategy
        if context.user_strategy_override:
            reasons.append("The user's explicit strategy override is applied to the effective plan.")

        required = [
            section for section in ("experience", "education", "skills")
            if _present(resume.get(section))
        ]
        return LayoutStrategyRecommendation(
            recommended_strategy=strategy,
            effective_strategy=effective,
            confidence=round(confidence, 2),
            reasoning=reasons,
            constraints=LayoutConstraints(
                maximum_columns=2 if allow_sidebar else 1,
                allow_sidebar=allow_sidebar,
                show_photo=False,
                required_sections=required,
            ),
            overridden_by_user=context.user_strategy_override is not None,
        )


class LayoutIntelligenceService:
    def __init__(self) -> None:
        self.layout_agent = LayoutIntelligenceAgent()
        self.priority_agent = SectionPriorityAgent()

    def build_plan(
        self, resume: dict[str, Any], context: LayoutIntelligenceRequest
    ) -> LayoutIntelligenceResponse:
        strategy = self.layout_agent.recommend(resume, context)
        priority = self.priority_agent.recommend(resume, context)
        columns = [{"id": "main", "width": 12, "sections": priority.section_order}]
        plan = LayoutPlan(
            strategy=strategy.effective_strategy,
            header={
                "show_photo": strategy.constraints.show_photo,
                "links_emphasis": strategy.effective_strategy == "portfolio",
                "reading_order": ["name", "headline", "email", "phone", "location", "links"],
            },
            columns=columns,
            section_order=priority.section_order,
            spacing={"density": "compact" if strategy.effective_strategy == "compact_ats" else "standard"},
            page_rules={
                "prefer_one_page": True,
                "preserve_entry_boundaries": True,
                "balance_pages": True,
            },
        )
        return LayoutIntelligenceResponse(
            layout_strategy=strategy,
            section_priority=priority,
            layout_plan=plan,
        )

