import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

@patch("app.groq_service.get_llm")
def test_streaming_endpoint_success(mock_get_llm):
    mock_llm = MagicMock()
    async def async_stream(*args, **kwargs):
        yield MagicMock(content="Developed end-to-end ")
        yield MagicMock(content="retail sales analytics.")
    mock_llm.astream = async_stream
    mock_get_llm.return_value = mock_llm

    payload = {
        "section_type": "summary",
        "section_data": {"original": "Original text", "current_suggested": "Original text"},
        "prompt": "Make it better",
        "job": {
            "title": "Software Engineer",
            "company": "Tech Corp",
            "description": "Python",
            "requirements": ["Python"],
            "required_skills": ["Python"]
        }
    }
    
    with patch("app.groq_service.is_prompt_out_of_scope", return_value=None):
        response = client.post("/api/refine-section/stream", json=payload)
        assert response.status_code == 200
        lines = [line if isinstance(line, str) else line.decode("utf-8") for line in response.iter_lines()]
        assert "data: Developed end-to-end " in lines
        assert "data: retail sales analytics." in lines

@patch("app.groq_service.get_llm")
def test_streaming_endpoint_out_of_scope(mock_get_llm):
    mock_llm = MagicMock()
    mock_get_llm.return_value = mock_llm

    payload = {
        "section_type": "summary",
        "section_data": {"original": "Original text", "current_suggested": "Original text"},
        "prompt": "Explain Kubernetes",
        "job": {
            "title": "Software Engineer",
            "company": "Tech Corp",
            "description": "Python",
            "requirements": ["Python"],
            "required_skills": ["Python"]
        }
    }
    
    # Simulate guard detecting out of scope
    with patch("app.groq_service.is_prompt_out_of_scope", return_value="This AI assistant is dedicated to improving the currently selected resume."):
        response = client.post("/api/refine-section/stream", json=payload)
        assert response.status_code == 200
        lines = [line if isinstance(line, str) else line.decode("utf-8") for line in response.iter_lines()]
        assert "data: [ERROR] This AI assistant is dedicated to improving the currently selected resume." in lines
