from __future__ import annotations

import re

from schemas.cover_letter_strategy import (
    CoverLetterStrategy,
    CoverLetterStrategyRequest,
    StrategyEvidence,
    StrategyParagraph,
)


def _evidence_id(section: str, entry_id: str) -> str:
    return f"{section}:{entry_id}"


def _word_target(length: str) -> tuple[int, int]:
    return {
        "concise": (225, 3),
        "standard": (350, 4),
        "detailed": (450, 5),
    }.get(str(length or "").lower(), (350, 4))


def _opening(context, selected) -> str:
    preferences = context.user_preferences
    if preferences.get("referral"):
        return "referral_led"
    emphasis = preferences.get("emphasis", "ai_selected")
    if emphasis in {"project", "projects"} and any(
        item.source_section == "projects" for item in selected
    ):
        return "project_led"
    if emphasis == "achievement" and any(
        item.source_section == "achievements" for item in selected
    ):
        return "achievement_led"
    if emphasis == "experience" and any(
        item.source_section == "experience" for item in selected
    ):
        return "experience_led"
    if any(item.source_section == "experience" for item in selected):
        return "experience_led"
    if any(item.source_section == "projects" for item in selected):
        return "project_led"
    if preferences.get("motivation"):
        return "company_motivation_led"
    return "direct_role_interest"


def _rank_evidence(context) -> tuple[list, str | None]:
    evidence = list(context.selected_evidence)
    emphasis = str(context.user_preferences.get("emphasis", "ai_selected")).lower()
    section_for = {
        "experience": "experience",
        "project": "projects",
        "projects": "projects",
        "achievement": "achievements",
        "skills": "skills",
    }.get(emphasis)
    supported = section_for is None or any(item.source_section == section_for for item in evidence)
    def score(item):
        emphasis_bonus = 0.3 if section_for and item.source_section == section_for else 0
        metric_bonus = 0.15 if re.search(r"\d+(?:\.\d+)?(?:%|\+|x)?", item.exact_factual_evidence) else 0
        return item.confidence + emphasis_bonus + metric_bonus + len(item.relevance_to_jd) * 0.02
    evidence.sort(key=lambda item: (-score(item), item.source_section, item.source_entry_id))
    fallback = None if supported else (
        f"Requested emphasis '{emphasis}' had no approved evidence; strongest supported evidence was used."
    )
    return evidence[:4], fallback


def build_cover_letter_strategy(
    request: CoverLetterStrategyRequest,
) -> CoverLetterStrategy:
    context = request.context
    selected, emphasis_fallback = _rank_evidence(context)
    preferences = context.user_preferences
    tone = str(preferences.get("tone") or "professional").lower()
    if tone not in {"professional", "confident", "conversational", "enthusiastic"}:
        tone = "professional"
    target_words, paragraph_count = _word_target(preferences.get("length"))
    opening = _opening(context, selected)
    greeting = str(context.recipient.get("greeting") or "Dear Hiring Manager").strip()
    greeting = greeting.rstrip(",") + ","

    strategy_evidence = [
        StrategyEvidence(
            evidence_id=_evidence_id(item.source_section, item.source_entry_id),
            source_section=item.source_section,
            source_entry_id=item.source_entry_id,
            reason="; ".join(item.relevance_to_jd) or "Strongest approved transferable evidence",
            priority=index + 1,
            factual_constraints=[
                "Use only the exact factual evidence supplied by Phase 1.",
                "Do not strengthen, extrapolate, or invent metrics.",
            ],
        )
        for index, item in enumerate(selected)
    ]
    evidence_ids = [item.evidence_id for item in strategy_evidence]

    plan = [
        StrategyParagraph(
            paragraph=1, purpose="opening",
            key_points=[
                f"Identify the {context.job.get('title')} role and {context.job.get('company')}.",
                f"Use the {opening.replace('_', ' ')} approach.",
                "Position the candidate using the strongest approved evidence.",
            ],
        ),
        StrategyParagraph(
            paragraph=2, purpose="experience_and_evidence",
            evidence_ids=evidence_ids[:2],
            key_points=["Connect evidence to major responsibilities without repeating the resume."],
        ),
    ]
    if paragraph_count >= 4:
        plan.append(StrategyParagraph(
            paragraph=3, purpose="company_and_role_alignment",
            evidence_ids=evidence_ids[2:4],
            key_points=[
                "Connect demonstrated capabilities to the role.",
                "Use only provided motivation or JD-supported motivation.",
            ],
        ))
    if paragraph_count == 5:
        plan.append(StrategyParagraph(
            paragraph=4, purpose="additional_differentiator",
            evidence_ids=evidence_ids[3:4],
            key_points=["Add one distinct supported differentiator without duplicating prior evidence."],
        ))
    plan.append(StrategyParagraph(
        paragraph=len(plan) + 1, purpose="closing",
        key_points=[
            "Restate interest briefly.",
            "Reinforce supported value and invite further discussion.",
            "Avoid pleading or exaggerated enthusiasm.",
        ],
    ))

    evidence_text = " ".join(item.exact_factual_evidence.lower() for item in selected)
    role_terms = (
        context.role_requirements.get("skills", [])
        + context.role_requirements.get("keywords", [])
    )
    keywords: list[str] = []
    avoided: list[str] = []
    for term in role_terms:
        clean = str(term).strip()
        if not clean:
            continue
        if clean.lower() in evidence_text and clean.casefold() not in {
            value.casefold() for value in keywords
        }:
            keywords.append(clean)
        elif clean.casefold() not in {value.casefold() for value in avoided}:
            avoided.append(clean)

    uncertain = [
        item.exact_factual_evidence
        for item in context.selected_evidence
        if item.confidence < 0.6
    ]
    allowed = [item.exact_factual_evidence for item in selected if item.confidence >= 0.6]
    prohibited = [
        "Invented experience, metrics, projects, achievements, or skills",
        "Company knowledge, product usage, or admiration not present in the context",
        "Unverified referrals or recipient details",
        "Any claim outside allowed_claims",
    ]
    conflicts = len(selected) < 2 or bool(uncertain and len(allowed) < 2)
    ready = (
        context.ready_for_generation
        and len(strategy_evidence) >= 2
        and bool(plan)
        and bool(greeting)
        and bool(prohibited)
        and not conflicts
    )
    motivation = str(preferences.get("motivation") or "").strip()
    motivation_points = [motivation] if motivation else [
        f"Interest in the responsibilities and technical challenges of the {context.job.get('title')} role."
    ]
    instructions = [
        f"Maintain a {tone} tone throughout.",
        f"Target approximately {target_words} words.",
        "Use only selected evidence IDs and allowed claims.",
        "Distribute supported keywords naturally; never keyword-stuff.",
        "Do not include uncertain or prohibited claims.",
        "Do not use the generic opening 'I am writing to apply for' unless no stronger wording is possible.",
    ]
    if emphasis_fallback:
        instructions.append(emphasis_fallback)
    confidence = min(
        1.0,
        sum(item.confidence for item in selected) / max(1, len(selected))
        * (1.0 if context.ready_for_generation else 0.7),
    )
    return CoverLetterStrategy(
        session_id=request.session_id or context.scope_fingerprint,
        tone=tone,
        target_word_count=target_words,
        opening_approach=opening,
        narrative=(
            f"Position the candidate for {context.job.get('title')} at "
            f"{context.job.get('company')} through {len(selected)} approved evidence items, "
            "then connect demonstrated impact to the role and close with a professional invitation."
        ),
        paragraph_plan=plan,
        selected_evidence=strategy_evidence,
        keywords_to_use=keywords[:8],
        keywords_to_avoid=avoided[:12],
        company_motivation_points=motivation_points,
        allowed_claims=allowed,
        prohibited_claims=prohibited,
        uncertain_claims=uncertain,
        greeting=greeting,
        sign_off="Sincerely,",
        generation_instructions=instructions,
        strategy_confidence=round(confidence, 2),
        ready_for_generation=ready,
        strategy_status="strategy_ready" if ready else "needs_clarification",
    )
