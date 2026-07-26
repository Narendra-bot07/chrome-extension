from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from schemas.cover_letter_context import (
    ClarificationQuestion,
    CoverLetterContext,
    CoverLetterContextRequest,
    CoverLetterEvidence,
)

WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+#.-]{1,}")
STOP = {
    "and", "the", "with", "for", "from", "that", "this", "your", "you",
    "are", "our", "will", "have", "has", "role", "work", "team",
}


def _text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _list(*values: Any) -> list[str]:
    result: list[str] = []
    for value in values:
        items = value if isinstance(value, list) else [value]
        for item in items:
            if isinstance(item, dict):
                item = item.get("name") or item.get("skill") or item.get("text")
            item = _text(item)
            if item and item.casefold() not in {existing.casefold() for existing in result}:
                result.append(item)
    return result


def _tokens(value: Any) -> set[str]:
    return {
        token.casefold() for token in WORD_RE.findall(_text(value))
        if token.casefold() not in STOP
    }


def _job_value(primary: dict[str, Any], intelligence: dict[str, Any], *keys: str) -> Any:
    for source in (intelligence, primary):
        for key in keys:
            value = source.get(key)
            if value not in (None, "", [], {}):
                return value
    return None


def _evidence_candidates(resume: dict[str, Any]) -> list[tuple[str, str, str]]:
    candidates: list[tuple[str, str, str]] = []
    field_map = {
        "experience": ("id", "role", "company", "description", "achievements", "measurable_impact"),
        "projects": ("id", "name", "title", "description", "technology_stack", "measurable_outcomes"),
        "achievements": ("id", "name", "title", "description"),
        "certifications": ("id", "name", "title", "issuing_organization"),
    }
    for section, fields in field_map.items():
        for index, item in enumerate(resume.get(section) or []):
            if isinstance(item, str):
                factual = _text(item)
                entry_id = f"{section}_{index}"
            elif isinstance(item, dict):
                entry_id = _text(item.get("id")) or f"{section}_{index}"
                parts: list[str] = []
                for field in fields:
                    value = item.get(field)
                    if isinstance(value, list):
                        parts.extend(_text(child) for child in value if _text(child))
                    elif _text(value):
                        parts.append(_text(value))
                factual = " — ".join(dict.fromkeys(parts))
            else:
                continue
            if factual:
                candidates.append((section, entry_id, factual))
    return candidates


def _select_evidence(resume: dict[str, Any], role_terms: list[str]) -> list[CoverLetterEvidence]:
    target = _tokens(" ".join(role_terms))
    ranked: list[tuple[float, CoverLetterEvidence]] = []
    for section, entry_id, factual in _evidence_candidates(resume):
        overlap = sorted(_tokens(factual) & target)
        metric = bool(re.search(r"(?<!\w)(?:\d+(?:\.\d+)?%|\d+\+|\d+x)(?!\w)", factual, re.I))
        score = min(1.0, 0.45 + len(overlap) * 0.09 + (0.12 if metric else 0))
        relevance = overlap[:8] or (["transferable candidate evidence"] if factual else [])
        ranked.append((score, CoverLetterEvidence(
            source_section=section,
            source_entry_id=entry_id,
            exact_factual_evidence=factual,
            relevance_to_jd=relevance,
            confidence=round(score, 2),
        )))
    ranked.sort(key=lambda item: (-item[0], item[1].source_section, item[1].source_entry_id))
    return [item for _, item in ranked[:6]]


def build_cover_letter_context(request: CoverLetterContextRequest) -> CoverLetterContext:
    resume = request.resume
    jd = request.jd
    ri = request.resume_intelligence or {}
    ji = request.jd_intelligence or {}
    answers = request.user_answers
    skipped = set(request.skipped_questions)
    personal = resume.get("personal_info") or {}
    candidate_info = ri.get("candidate_information") or ri.get("candidate") or {}

    title = _text(answers.get("job_title") or _job_value(jd, ji, "job_title", "title"))
    company = _text(answers.get("company_name") or _job_value(jd, ji, "company_name", "company"))
    location = _text(_job_value(jd, ji, "location", "company_location"))
    required = _list(_job_value(jd, ji, "required_skills", "skills"))
    preferred = _list(_job_value(jd, ji, "preferred_skills", "preferred_qualifications"))
    responsibilities = _list(_job_value(jd, ji, "responsibilities"))
    keywords = _list(
        _job_value(jd, ji, "keywords"),
        _job_value(jd, ji, "ats_keywords"),
    )
    culture = _list(_job_value(jd, ji, "culture_signals", "company_values"))
    role_terms = required + preferred + responsibilities + keywords + [title]
    evidence = _select_evidence(resume, role_terms)

    recipient_name = _text(
        answers.get("recipient_name")
        or _job_value(jd, ji, "hiring_manager_name", "recruiter_name")
    ) or None
    recipient_email = _text(
        answers.get("recipient_email")
        or _job_value(jd, ji, "recruiter_email", "hiring_manager_email")
    ) or None
    greeting = _text(answers.get("greeting")) or (
        f"Dear {recipient_name}" if recipient_name else "Dear Hiring Manager"
    )
    candidate = {
        "name": _text(personal.get("name") or candidate_info.get("full_name")),
        "email": _text(answers.get("candidate_email") or personal.get("email") or candidate_info.get("email")),
        "phone": _text(answers.get("candidate_phone") or personal.get("phone") or candidate_info.get("phone")),
        "location": _text(
            answers.get("candidate_location")
            or personal.get("location")
            or ", ".join(filter(None, [
                candidate_info.get("city"), candidate_info.get("state"), candidate_info.get("country")
            ]))
        ),
    }
    preferences = {
        "tone": answers.get("tone", "professional"),
        "length": answers.get("length", "standard"),
        "motivation": _text(answers.get("motivation")),
        "emphasis": answers.get("emphasis", "ai_selected"),
        "relocation": answers.get("relocation"),
        "availability": answers.get("availability"),
        "referral": answers.get("referral"),
    }

    missing: list[str] = []
    for field, value in (
        ("selected_resume", resume),
        ("selected_jd", jd),
        ("candidate.name", candidate["name"]),
        ("candidate.email", candidate["email"]),
        ("job.title", title),
        ("job.company", company),
    ):
        if not value:
            missing.append(field)
    if len(evidence) < 2:
        missing.append("selected_evidence")

    questions: list[ClarificationQuestion] = []
    def ask(question: ClarificationQuestion) -> None:
        if question.id not in answers and question.id not in skipped and len(questions) < 5:
            questions.append(question)

    if not candidate["email"]:
        ask(ClarificationQuestion(
            id="candidate_email", prompt="What email should appear on your application?",
            kind="text", required=True, material_reason="Candidate email is required for readiness."
        ))
    if not candidate["phone"]:
        ask(ClarificationQuestion(
            id="candidate_phone", prompt="Would you like to add a phone number?",
            kind="optional_text", options=["Skip"], required=False,
            material_reason="A phone number is useful contact information but optional."
        ))
    if not candidate["location"]:
        ask(ClarificationQuestion(
            id="candidate_location", prompt="Would you like to add your location?",
            kind="optional_text", options=["Skip"], required=False,
            material_reason="Location can add application context but is optional."
        ))
    if not title:
        ask(ClarificationQuestion(
            id="job_title", prompt="What is the exact target job title?",
            kind="text", required=True, material_reason="The JD did not provide a usable title."
        ))
    if not company:
        ask(ClarificationQuestion(
            id="company_name", prompt="What company is this application for?",
            kind="text", required=True, material_reason="The JD did not provide a usable company."
        ))
    if not recipient_name and not recipient_email:
        ask(ClarificationQuestion(
            id="recipient_name", prompt="Who should the letter be addressed to?",
            kind="optional_text", options=["Hiring Manager", "Skip"],
            material_reason="A known recipient improves personalization but is optional."
        ))
    if not preferences["motivation"]:
        ask(ClarificationQuestion(
            id="motivation", prompt="Why are you interested in this company or role?",
            kind="optional_text", options=["Skip"],
            material_reason="Motivation helps avoid a generic future letter."
        ))
    ask(ClarificationQuestion(
        id="emphasis", prompt="What should receive the most emphasis?",
        kind="choice", options=["ai_selected", "experience", "projects", "skills", "achievement", "custom"],
        material_reason="Controls which truthful evidence the next phase prioritizes."
    ))
    ask(ClarificationQuestion(
        id="tone", prompt="What tone should the letter use?", kind="choice",
        options=["professional", "confident", "conversational", "enthusiastic"],
        material_reason="Defines the strategy voice."
    ))
    ask(ClarificationQuestion(
        id="length", prompt="What length do you prefer?", kind="choice",
        options=["concise", "standard", "detailed"], material_reason="Defines the strategy word-count range."
    ))

    unanswered_required = any(question.required for question in questions)
    ready = not missing and not unanswered_required
    fingerprint = hashlib.sha256(json.dumps({
        "resume_id": request.resume_id,
        "jd_id": request.jd_id,
        "resume": resume,
        "jd": jd,
    }, sort_keys=True, default=str).encode()).hexdigest()
    return CoverLetterContext(
        resume_id=request.resume_id,
        jd_id=request.jd_id,
        job={
            "title": title, "company": company, "location": location,
            "seniority": _text(_job_value(jd, ji, "seniority")),
        },
        recipient={
            "name": recipient_name,
            "email": recipient_email,
            "greeting": greeting,
        },
        candidate=candidate,
        role_requirements={
            "skills": _list(required, preferred),
            "responsibilities": responsibilities,
            "keywords": keywords,
            "culture_signals": culture,
        },
        selected_evidence=evidence,
        user_preferences=preferences,
        missing_fields=missing,
        questions=questions,
        ready_for_generation=ready,
        status="ready_for_generation" if ready else (
            "awaiting_user_input" if questions else "collecting_context"
        ),
        scope_fingerprint=fingerprint,
    )
