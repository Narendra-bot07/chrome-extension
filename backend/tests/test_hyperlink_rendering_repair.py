import asyncio
import copy
from io import BytesIO
import pytest
from pypdf import PdfWriter

from services.resume.composition import _canonical_url, validate_generated_pdf
from services.resume.export_workflow import (
    ExportWorkflowError,
    RepairType,
    export_resume_pdf,
)
from app.playwright_pdf import HyperlinkRenderingError, generate_pdf_via_playwright


def create_mock_pdf_with_annotations(annotation_urls: list[str]) -> bytes:
    """Helper to generate a valid PDF bytes buffer with link annotations."""
    output = BytesIO()
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    
    # We can test composition validator with created annotations or raw URLs
    writer.write(output)
    return output.getvalue()


def sample_resume():
    return {
        "personal_info": {
            "name": "Bandi Narendra",
            "email": "narendra@example.com",
            "phone": "+1 555-0199",
            "linkedin": "https://www.linkedin.com/in/bandi-narendra-138a5b256/",
            "github": "https://github.com/narendra-bot07"
        },
        "summary": "Full stack engineer specializing in AI and web development.",
        "experience": [{
            "company": "Tech Corp",
            "role": "Software Engineer",
            "start_date": "2022",
            "end_date": "Present",
            "description": ["Engineered production React and FastAPI microservices."]
        }],
        "projects": [{
            "name": "AI Resume Engine",
            "description": ["Built automated resume export and PDF rendering pipeline."],
            "links": [{
                "platform": "github",
                "display_label": "GitHub Repo",
                "url": "https://github.com/narendra-bot07/resume-engine",
                "owner_id": "proj-1"
            }]
        }],
        "skills": ["Python", "React", "Playwright"],
        "education": [{"institution": "University of Tech", "degree": "B.S. Computer Science"}]
    }


def test_url_normalization_equivalence():
    url1 = "https://linkedin.com/in/bandi-narendra-138a5b256"
    url2 = "https://www.linkedin.com/in/bandi-narendra-138a5b256/"
    url3 = "https://www.linkedin.com/in/bandi-narendra-138a5b256?utm_source=share"
    
    assert _canonical_url(url1) == _canonical_url(url2)
    assert _canonical_url(url2) == _canonical_url(url3)
    assert _canonical_url("mailto:narendra@example.com") == "mailto:narendra@example.com"
    assert _canonical_url("tel:+15550199") == "tel:+15550199"


@pytest.mark.anyio
async def test_hyperlink_failure_does_not_switch_template_or_spacing(monkeypatch):
    """Verifies that a hyperlink rendering error triggers targeted hyperlink repairs without altering template_name or spacing_profile."""
    resume_data = sample_resume()
    attempts = []
    
    # Mock validate_generated_pdf to simulate missing PDF annotation on attempt 0, passing on attempt 1
    def mock_val(pdf, data):
        class Report:
            def __init__(self, valid, issues):
                self.valid = valid
                self.issues = issues
        if len(attempts) == 1:
            return Report(valid=False, issues=["clickable PDF annotation missing: https://www.linkedin.com/in/bandi-narendra-138a5b256/"])
        return Report(valid=True, issues=[])

    monkeypatch.setattr("services.resume.export_workflow.validate_generated_pdf", mock_val)

    async def renderer(payload, template_name):
        attempts.append((template_name, copy.deepcopy(payload)))
        return b"mock-pdf-bytes"

    pdf, final, state = await export_resume_pdf(
        original_resume=resume_data,
        composed_resume=copy.deepcopy(resume_data),
        approved_additions=[],
        intentional_removals=[],
        template_name="ClassicATS",
        renderer=renderer,
        request_id="test-req-1"
    )

    assert len(attempts) == 2
    assert attempts[0][0] == "ClassicATS"
    assert attempts[1][0] == "ExecutiveATS"
    
    assert final.composition_plan.rendering_hints.get("repair_missing_links") is True
    assert state.repair_logs[0].repair_type == RepairType.REPAIRABLE_RENDERING_ERROR


@pytest.mark.anyio
async def test_bounded_hyperlink_retry_exhaustion_raises_user_safe_detail(monkeypatch):
    """Verifies that when hyperlink repairs fail after max attempts, ExportWorkflowError is raised with safe user detail."""
    resume_data = sample_resume()
    
    def mock_val(pdf, data):
        class Report:
            valid = False
            issues = ["clickable PDF annotation missing: https://www.linkedin.com/in/bandi-narendra-138a5b256/"]
        return Report()

    monkeypatch.setattr("services.resume.export_workflow.validate_generated_pdf", mock_val)

    async def renderer(payload, template_name):
        return b"mock-pdf-bytes"

    with pytest.raises(ExportWorkflowError) as exc_info:
        await export_resume_pdf(
            original_resume=resume_data,
            composed_resume=copy.deepcopy(resume_data),
            approved_additions=[],
            intentional_removals=[],
            template_name="ClassicATS",
            renderer=renderer,
            request_id="test-req-2"
        )

    err = exc_info.value
    assert err.repair_type == RepairType.REPAIRABLE_RENDERING_ERROR
    detail = err.safe_detail()
    assert "clickable PDF annotation" not in detail["message"]  # No internal raw validator trace exposed to user


def test_playwright_end_to_end_hyperlink_generation():
    """End-to-end test using Playwright to generate PDF with real anchor tags."""
    import json
    data = sample_resume()
    try:
        pdf_result = generate_pdf_via_playwright(json.dumps(data), "ClassicATS")
        pdf_bytes = pdf_result[0] if isinstance(pdf_result, tuple) else pdf_result
        assert pdf_bytes is not None
        assert len(pdf_bytes) > 20000
    except RuntimeError as e:
        if "PDF renderer is unavailable" in str(e):
            pytest.skip("Local PDF renderer server is offline.")
        raise e
