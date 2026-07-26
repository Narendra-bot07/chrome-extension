from schemas.cover_letter_context import CoverLetterContextRequest
from schemas.cover_letter_strategy import CoverLetterStrategyRequest
from services.cover_letter import (
    build_cover_letter_context,
    build_cover_letter_strategy,
)


def ready_context(emphasis="experience", length="standard"):
    request = CoverLetterContextRequest.model_validate({
        "resume_id": "resume-1",
        "jd_id": "jd-1",
        "resume": {
            "personal_info": {"name": "Ada", "email": "ada@example.com"},
            "experience": [{
                "id": "exp-1",
                "role": "Engineer",
                "description": ["Built Python services and improved reliability by 30%."],
            }],
            "projects": [{
                "id": "project-1",
                "name": "Cloud Platform",
                "description": ["Designed and deployed an Azure data platform."],
            }],
        },
        "jd": {
            "title": "Cloud Engineer",
            "company": "Acme",
            "required_skills": ["Python", "Azure", "Kubernetes"],
            "responsibilities": ["Build reliable cloud services"],
        },
        "user_answers": {
            "motivation": "The role's reliability challenges match my experience.",
            "emphasis": emphasis,
            "tone": "confident",
            "length": length,
            "recipient_name": "Hiring Manager",
        },
        "skipped_questions": ["candidate_phone", "candidate_location"],
    })
    return build_cover_letter_context(request)


def test_strategy_is_a_plan_not_cover_letter_prose():
    strategy = build_cover_letter_strategy(
        CoverLetterStrategyRequest(context=ready_context(), session_id="session-1")
    )
    assert strategy.session_id == "session-1"
    assert strategy.strategy_version == "cover_letter_strategy_v1"
    assert strategy.ready_for_generation
    assert strategy.strategy_status == "strategy_ready"
    assert len(strategy.selected_evidence) >= 2
    assert len(strategy.paragraph_plan) == 4
    assert not hasattr(strategy, "body")


def test_strategy_uses_only_keywords_supported_by_selected_evidence():
    strategy = build_cover_letter_strategy(
        CoverLetterStrategyRequest(context=ready_context())
    )
    assert {"Python", "Azure"}.issubset(set(strategy.keywords_to_use))
    assert "Kubernetes" in strategy.keywords_to_avoid
    assert all(claim in strategy.allowed_claims for claim in [
        item.exact_factual_evidence for item in ready_context().selected_evidence
    ])


def test_unsupported_emphasis_falls_back_and_records_reason():
    strategy = build_cover_letter_strategy(CoverLetterStrategyRequest(
        context=ready_context(emphasis="achievement")
    ))
    assert strategy.ready_for_generation
    assert any("no approved evidence" in item for item in strategy.generation_instructions)
    assert strategy.opening_approach in {"experience_led", "project_led"}


def test_detailed_length_builds_five_paragraph_plan():
    strategy = build_cover_letter_strategy(CoverLetterStrategyRequest(
        context=ready_context(length="detailed")
    ))
    assert strategy.target_word_count == 450
    assert len(strategy.paragraph_plan) == 5
