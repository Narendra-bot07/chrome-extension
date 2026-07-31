from __future__ import annotations

import json
import re
import uuid
from datetime import date

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from app.gemini_service import get_llm
from schemas.cover_letter_generation import (
    CoverLetterGenerationRequest,
    GeneratedCoverLetter,
)


class _GeneratedDraft(BaseModel):
    title: str
    content: str
    generation_notes: list[str] = Field(default_factory=list)


SYSTEM_PROMPT = """You are the Phase 3 cover-letter generation engine.
Generate exactly one first draft using ONLY the supplied CoverLetterContext and
CoverLetterStrategy. Do not review, repair, score, compare, chat, or discuss the draft.

STRICT FACTUAL BOUNDARY:
- Candidate claims must come from strategy.allowed_claims and selected evidence.
- Company/role statements must come from the context role requirements, job data,
  motivation points, or strategy.
- Never invent experience, skills, metrics, projects, achievements, certifications,
  company knowledge, referrals, addresses, or recipient details.
- Never use uncertain_claims or prohibited_claims.

WRITING:
- Follow the strategy tone, opening approach, paragraph plan, evidence order,
  target word count, greeting, sign-off, and generation instructions.
- Include the supplied generation date, recipient block when available, greeting,
  body paragraphs, sign-off, and the candidate's actual name.
- Avoid "I am writing to apply" unless the strategy explicitly requires it.
- Use active, concise, natural language. Avoid robotic phrasing and keyword stuffing.
- Do not use generic traits such as passionate, hardworking, team player, or
  go-getter unless they are explicitly supported.
- Return only the structured draft fields. The content field must contain the
  complete cover letter with professional paragraph spacing."""


def _paragraph_count(content: str) -> int:
    blocks = [block.strip() for block in re.split(r"\n\s*\n", content) if block.strip()]
    # Exclude date, recipient, greeting, and sign-off/signature blocks.
    return len([
        block for block in blocks
        if len(block.split()) >= 5
        and not block.lower().startswith("dear ")
        and not re.match(
            r"^(sincerely|best regards|kind regards)[,\s]",
            block,
            re.I,
        )
    ])


def finalize_generated_cover_letter(
    draft: _GeneratedDraft,
    request: CoverLetterGenerationRequest,
) -> GeneratedCoverLetter:
    content = draft.content.strip()
    used_keywords = [
        keyword for keyword in request.strategy.keywords_to_use
        if re.search(rf"(?<!\w){re.escape(keyword)}(?!\w)", content, re.I)
    ]
    return GeneratedCoverLetter(
        cover_letter_id=str(uuid.uuid4()),
        title=draft.title.strip() or (
            f"Cover Letter — {request.context.job.get('title')} at "
            f"{request.context.job.get('company')}"
        ),
        content=content,
        word_count=len(re.findall(r"\b[\w’'-]+\b", content)),
        paragraph_count=max(1, _paragraph_count(content)),
        selected_evidence=request.strategy.selected_evidence,
        used_keywords=used_keywords,
        generation_notes=list(draft.generation_notes),
    )


def generate_cover_letter_draft(
    request: CoverLetterGenerationRequest,
    api_key: str | None = None,
) -> GeneratedCoverLetter:
    if not request.context.ready_for_generation:
        raise ValueError("CoverLetterContext is not ready for generation.")
    if not request.strategy.ready_for_generation:
        raise ValueError("CoverLetterStrategy is not ready for generation.")
    llm = get_llm(api_key, temperature=0.25).with_structured_output(_GeneratedDraft)
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", (
            "Generation date: {generation_date}\n\n"
            "CoverLetterContext:\n{context_json}\n\n"
            "CoverLetterStrategy:\n{strategy_json}"
        )),
    ])
    draft = (prompt | llm).invoke({
        "generation_date": date.today().strftime("%B %d, %Y"),
        "context_json": json.dumps(request.context.model_dump(mode="json"), indent=2),
        "strategy_json": json.dumps(request.strategy.model_dump(mode="json"), indent=2),
    })
    return finalize_generated_cover_letter(_GeneratedDraft.model_validate(draft), request)
