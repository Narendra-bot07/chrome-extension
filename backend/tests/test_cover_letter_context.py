from schemas.cover_letter_context import CoverLetterContextRequest
from services.cover_letter import build_cover_letter_context


def request(**overrides):
    payload = {
        "resume_id": "resume-1",
        "jd_id": "jd-1",
        "resume": {
            "personal_info": {
                "name": "Ada Lovelace",
                "email": "ada@example.com",
                "phone": "123",
                "location": "London",
            },
            "experience": [{
                "id": "experience-1",
                "role": "Platform Engineer",
                "description": [
                    "Built Python cloud services that improved reliability by 30%."
                ],
            }],
            "projects": [{
                "id": "project-1",
                "name": "Incident Intelligence",
                "description": ["Designed an Azure incident response platform."],
            }],
        },
        "jd": {
            "title": "Senior Cloud Engineer",
            "company": "Acme",
            "required_skills": ["Python", "Azure"],
            "responsibilities": ["Build reliable cloud platforms"],
        },
    }
    payload.update(overrides)
    return CoverLetterContextRequest.model_validate(payload)


def test_builds_scoped_truthful_context_without_generating_prose():
    context = build_cover_letter_context(request())
    assert context.resume_id == "resume-1"
    assert context.jd_id == "jd-1"
    assert context.job["company"] == "Acme"
    assert len(context.selected_evidence) >= 2
    assert context.selected_evidence[0].source_entry_id in {
        "experience-1", "project-1"
    }
    assert all(item.exact_factual_evidence for item in context.selected_evidence)
    assert not hasattr(context, "body")
    assert "skills" in context.role_requirements


def test_missing_required_contact_is_asked_but_recipient_is_optional():
    value = request()
    value.resume["personal_info"]["email"] = ""
    context = build_cover_letter_context(value)
    questions = {question.id: question for question in context.questions}
    assert "candidate.email" in context.missing_fields
    assert questions["candidate_email"].required is True
    assert questions["recipient_name"].required is False
    assert context.recipient["greeting"] == "Dear Hiring Manager"
    assert not context.ready_for_generation


def test_answered_or_skipped_questions_enable_readiness():
    initial = build_cover_letter_context(request())
    answers = {
        "recipient_name": "Hiring Manager",
        "motivation": "The cloud reliability mission matches my experience.",
        "emphasis": "experience",
        "tone": "professional",
        "length": "standard",
    }
    context = build_cover_letter_context(request(
        user_answers=answers,
        skipped_questions=[question.id for question in initial.questions
                           if question.id not in answers],
    ))
    assert context.questions == []
    assert context.ready_for_generation
    assert context.status == "ready_for_generation"


def test_scope_changes_invalidate_context_fingerprint():
    first = build_cover_letter_context(request())
    second = build_cover_letter_context(request(jd_id="jd-2"))
    assert first.scope_fingerprint != second.scope_fingerprint
