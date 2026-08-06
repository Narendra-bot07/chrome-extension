import pytest
from unittest.mock import patch, MagicMock
from app.ai_service import refine_section_with_ai, is_prompt_out_of_scope
from app.schemas import BulletEditorOutput, JobAnalysis, ScopeCheckResult

def sample_job():
    return JobAnalysis(**{
        "title": "Software Engineer",
        "company": "Tech Corp",
        "description": "Looking for a Software Engineer with Python and SQL experience.",
        "requirements": ["Python", "SQL"],
        "min_experience_years": 2,
        "keywords": ["Python", "SQL"],
        "skills": ["Python", "SQL"]
    })

@patch("app.ai_service.get_provider")
def test_scope_guard_in_scope(mock_get_provider):
    mock_provider = MagicMock()
    mock_provider.invoke_structured.return_value = ScopeCheckResult(in_scope=True)
    mock_get_provider.return_value = mock_provider

    assert is_prompt_out_of_scope("Make summary shorter.") is None

@patch("app.ai_service.get_provider")
def test_scope_guard_out_of_scope(mock_get_provider):
    mock_provider = MagicMock()
    mock_provider.invoke_structured.return_value = ScopeCheckResult(
        in_scope=False,
        reason="This AI assistant is dedicated to improving the currently selected resume. Please return to resume-related requests.",
    )
    mock_get_provider.return_value = mock_provider

    res = is_prompt_out_of_scope("Explain Kubernetes.")
    assert res is not None
    assert "dedicated to improving" in res.lower()

@patch("app.ai_service.get_provider")
def test_refine_section_raises_value_error_out_of_scope(mock_get_provider):
    mock_provider = MagicMock()
    mock_provider.invoke_structured.return_value = ScopeCheckResult(
        in_scope=False,
        reason="This AI assistant is dedicated to improving the currently selected resume. Please return to resume-related requests.",
    )
    mock_get_provider.return_value = mock_provider

    job = sample_job()
    with pytest.raises(ValueError) as exc:
        refine_section_with_ai(
            section_type="summary",
            section_data={"original": "Original Summary"},
            prompt="Write Python code for quicksort.",
            job=job
        )
    assert "dedicated to improving" in str(exc.value).lower()


@patch("app.ai_service.llm_cache.execute_with_cache")
@patch("app.ai_service.is_prompt_out_of_scope", return_value=None)
def test_experience_edit_uses_structure_preserving_bullet_schema(mock_scope, mock_cache):
    mock_cache.return_value = BulletEditorOutput(updated_bullets=[
        "Built reliable Python services.",
        "Reduced deployment time by 30%.",
    ])

    result = refine_section_with_ai(
        section_type="experience",
        section_data=["Built Python services.", "Reduced deployment time by 30%."],
        prompt="Use stronger action verbs.",
        job=sample_job(),
    )

    assert result.splitlines() == [
        "Built reliable Python services.",
        "Reduced deployment time by 30%.",
    ]
    assert mock_cache.call_args.kwargs["expected_schema"] is BulletEditorOutput
