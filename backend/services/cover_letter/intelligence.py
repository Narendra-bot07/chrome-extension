from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from app.groq_service import get_llm
from schemas.cover_letter_generation import GeneratedCoverLetter
from schemas.cover_letter_intelligence import (
    CoverLetterEditRequest,
    CoverLetterEditResult,
    CoverLetterIssue,
    CoverLetterReviewRequest,
    CoverLetterReviewResult,
    ParagraphPatch,
)
from services.cover_letter.generation import _paragraph_count


class _PatchPlan(BaseModel):
    summary: str
    issues_found: list[CoverLetterIssue] = Field(default_factory=list)
    patches: list[ParagraphPatch] = Field(default_factory=list)
    score: int = Field(default=90, ge=0, le=100)


REVIEW_PROMPT = """You are the Cover Letter Intelligence Agent in automatic review mode.
Review only the supplied generated cover letter using its context and strategy.
Return minimal paragraph patches, not a rewritten letter. Paragraph indices refer to
blank-line-separated blocks and start at zero. The patch `before` must exactly equal
the existing block. Fix grammar, typos, repetition, weak transitions, long sentences,
awkward wording, passive voice, and formatting. Remove an unsupported claim.
Never add or change projects, experience, metrics, skills, achievements, dates,
company names, or personal information. If no safe fix is necessary, return no patches.
Avoid AI-sounding enthusiasm. Score recruiter-readiness from 0 to 100."""

EDIT_PROMPT = """You are the Cover Letter Intelligence Agent in interactive edit mode.
Obey the user's request by patching only affected blank-line-separated blocks.
Do not regenerate the whole letter. Preserve every untouched block byte-for-byte.
Each patch `before` must exactly equal the current block at its zero-based index.
Never introduce a project, skill, company, metric, certification, date, referral,
publication, or personal fact unless it is supported by the supplied context/strategy.
An explicit user request changes style or focus, but it does not prove a new fact.
Return no patch when the request needs unsupported information. Avoid AI-sounding
phrases unless explicitly requested."""


def split_blocks(content: str) -> list[str]:
    return [
        block.strip()
        for block in re.split(r"\n\s*\n", content.strip())
        if block.strip()
    ]


def apply_paragraph_patches(content: str, patches: list[ParagraphPatch]) -> str:
    blocks = split_blocks(content)
    seen: set[int] = set()
    for patch in sorted(patches, key=lambda item: item.paragraph_index, reverse=True):
        if patch.paragraph_index in seen:
            raise ValueError("Only one patch is allowed per paragraph.")
        seen.add(patch.paragraph_index)
        if patch.paragraph_index >= len(blocks):
            raise ValueError("A paragraph patch targets content outside the letter.")
        if blocks[patch.paragraph_index] != patch.before.strip():
            raise ValueError("A paragraph patch does not match the current letter.")
        if patch.after.strip():
            blocks[patch.paragraph_index] = patch.after.strip()
        else:
            blocks.pop(patch.paragraph_index)
    return "\n\n".join(blocks)


def _fact_markers(text: str) -> set[str]:
    markers = re.findall(
        r"(?:(?<!\w)\d+(?:[.,]\d+)?%?(?!\w)|[\w.+-]+@[\w.-]+\.\w+|https?://\S+)",
        text,
        re.I,
    )
    return {marker.lower().rstrip(".,;") for marker in markers}


def _assert_no_new_fact_markers(before: str, after: str, support: str) -> None:
    introduced = _fact_markers(after) - _fact_markers(before) - _fact_markers(support)
    if introduced:
        raise ValueError(
            "The edit introduced unsupported factual markers: "
            + ", ".join(sorted(introduced))
        )


def _updated_letter(
    letter: GeneratedCoverLetter,
    content: str,
    note: str,
) -> GeneratedCoverLetter:
    return letter.model_copy(update={
        "content": content,
        "word_count": len(re.findall(r"\b[\w'-]+\b", content)),
        "paragraph_count": max(1, _paragraph_count(content)),
        "generation_notes": [*letter.generation_notes, note],
    })


def _invoke_plan(system_prompt: str, payload: dict, api_key: str | None) -> _PatchPlan:
    llm = get_llm(api_key, temperature=0.1).with_structured_output(_PatchPlan)
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("human", "{payload_json}"),
    ])
    result = (prompt | llm).invoke({
        "payload_json": json.dumps(payload, indent=2, ensure_ascii=False)
    })
    return _PatchPlan.model_validate(result)


def review_cover_letter(
    request: CoverLetterReviewRequest,
    api_key: str | None = None,
) -> CoverLetterReviewResult:
    payload = request.model_dump(mode="json")
    payload["paragraphs"] = split_blocks(request.generated_cover_letter.content)
    plan = _invoke_plan(REVIEW_PROMPT, payload, api_key)
    final_content = apply_paragraph_patches(
        request.generated_cover_letter.content, plan.patches
    )
    support = json.dumps({
        "context": request.context.model_dump(mode="json"),
        "strategy": request.strategy.model_dump(mode="json"),
    })
    _assert_no_new_fact_markers(
        request.generated_cover_letter.content, final_content, support
    )
    fixed = [
        CoverLetterIssue(
            category="automatic_fix",
            description=patch.reason,
            paragraph_index=patch.paragraph_index,
        )
        for patch in plan.patches
    ]
    return CoverLetterReviewResult(
        review_summary=plan.summary,
        issues_found=plan.issues_found,
        issues_fixed=fixed,
        final_cover_letter=_updated_letter(
            request.generated_cover_letter,
            final_content,
            "Automatic recruiter review completed.",
        ),
        review_score=plan.score,
    )


def edit_cover_letter(
    request: CoverLetterEditRequest,
    api_key: str | None = None,
) -> CoverLetterEditResult:
    payload = request.model_dump(mode="json")
    payload["paragraphs"] = split_blocks(request.generated_cover_letter.content)
    plan = _invoke_plan(EDIT_PROMPT, payload, api_key)
    after = apply_paragraph_patches(
        request.generated_cover_letter.content, plan.patches
    )
    support = json.dumps({
        "context": request.context.model_dump(mode="json"),
        "strategy": request.strategy.model_dump(mode="json"),
    })
    _assert_no_new_fact_markers(
        request.generated_cover_letter.content, after, support
    )
    return CoverLetterEditResult(
        edit_id=str(uuid.uuid4()),
        user_prompt=request.user_prompt,
        before_content=request.generated_cover_letter.content,
        after_content=after,
        patches=plan.patches,
        review_summary=plan.summary,
        created_at=datetime.now(timezone.utc),
    )
