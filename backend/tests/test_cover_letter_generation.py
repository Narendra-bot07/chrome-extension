from schemas.cover_letter_context import CoverLetterContextRequest
from schemas.cover_letter_generation import CoverLetterGenerationRequest
from schemas.cover_letter_strategy import CoverLetterStrategyRequest
from services.cover_letter import (
    build_cover_letter_context,
    build_cover_letter_strategy,
)
from services.cover_letter.generation import (
    _GeneratedDraft,
    finalize_generated_cover_letter,
)


def generation_request():
    context = build_cover_letter_context(CoverLetterContextRequest.model_validate({
        "resume": {
            "personal_info": {"name": "Ada", "email": "ada@example.com"},
            "experience": [{
                "id": "exp-1",
                "description": ["Built Python services that improved reliability by 30%."],
            }],
            "projects": [{
                "id": "project-1",
                "description": ["Deployed an Azure cloud platform."],
            }],
        },
        "jd": {
            "title": "Cloud Engineer",
            "company": "Acme",
            "required_skills": ["Python", "Azure"],
            "responsibilities": ["Build reliable cloud systems"],
        },
        "user_answers": {
            "recipient_name": "Hiring Manager",
            "motivation": "The reliability challenges match my experience.",
            "emphasis": "experience",
            "tone": "professional",
            "length": "concise",
        },
        "skipped_questions": ["candidate_phone", "candidate_location"],
    }))
    strategy = build_cover_letter_strategy(
        CoverLetterStrategyRequest(context=context)
    )
    return CoverLetterGenerationRequest(context=context, strategy=strategy)


def test_finalizer_packages_one_draft_without_review_or_scoring():
    request = generation_request()
    draft = _GeneratedDraft(
        title="Cloud Engineer Cover Letter",
        content=(
            "July 26, 2026\n\nDear Hiring Manager,\n\n"
            "My experience building reliable Python services aligns with the Cloud Engineer role at Acme.\n\n"
            "I built Python services that improved reliability by 30% and deployed an Azure cloud platform.\n\n"
            "The role's cloud reliability challenges match the work I have already delivered.\n\n"
            "I would welcome the opportunity to discuss this alignment further.\n\n"
            "Sincerely,\nAda"
        ),
    )
    result = finalize_generated_cover_letter(draft, request)
    assert result.status == "generated"
    assert result.word_count > 0
    assert result.paragraph_count == 4
    assert {"Python", "Azure"}.issubset(set(result.used_keywords))
    assert result.selected_evidence == request.strategy.selected_evidence
    assert not hasattr(result, "score")
    assert not hasattr(result, "review")


def test_generation_contract_contains_only_context_and_strategy():
    fields = set(CoverLetterGenerationRequest.model_fields)
    assert fields == {"context", "strategy"}
