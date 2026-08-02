import pytest
from unittest.mock import patch, MagicMock
from app.ai_service import refine_section_with_ai, is_prompt_out_of_scope
from app.schemas import JobAnalysis

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

@patch("app.ai_service.get_llm")
def test_scope_guard_in_scope(mock_get_llm):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="IN_SCOPE")
    mock_get_llm.return_value = mock_llm

    assert is_prompt_out_of_scope("Make summary shorter.") is None

@patch("app.ai_service.get_llm")
def test_scope_guard_out_of_scope(mock_get_llm):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="This AI assistant is dedicated to improving the currently selected resume. Please return to resume-related requests.")
    mock_get_llm.return_value = mock_llm

    res = is_prompt_out_of_scope("Explain Kubernetes.")
    assert res is not None
    assert "dedicated to improving" in res.lower()

@patch("app.ai_service.get_llm")
def test_refine_section_raises_value_error_out_of_scope(mock_get_llm):
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = MagicMock(content="This AI assistant is dedicated to improving the currently selected resume. Please return to resume-related requests.")
    mock_get_llm.return_value = mock_llm

    job = sample_job()
    with pytest.raises(ValueError) as exc:
        refine_section_with_ai(
            section_type="summary",
            section_data={"original": "Original Summary"},
            prompt="Write Python code for quicksort.",
            job=job
        )
    assert "dedicated to improving" in str(exc.value).lower()
