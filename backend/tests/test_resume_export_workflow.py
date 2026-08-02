import copy
import asyncio

import pytest

import services.resume.export_workflow as workflow
from services.resume.preservation import inventory_resume


def resume():
    return {
        "personal_info": {"name": "Ada"},
        "summary": "Engineer",
        "experience": [{
            "company": "Acme",
            "description": ["Reduced latency by 40%."],
        }],
        "projects": [{
            "name": "Compiler",
            "description": ["Built compiler tooling."],
        }],
        "skills": ["Python"],
        "education": [{"institution": "University", "degree": "BS"}],
        "achievements": [
            "Hackathon Finalist - Won a place among 25 participants."
        ],
        "certifications": [{
            "name": "Cloud Credential",
            "description": "Completed professional cloud training.",
        }],
    }


class Report:
    def __init__(self, valid=True, issues=None):
        self.valid = valid
        self.issues = issues or []


def test_composition_metadata_is_not_semantic_resume_content():
    original = resume()
    composed = copy.deepcopy(original)
    composed["section_order"] = ["summary", "experience", "projects"]
    composed["layout_level"] = 3
    paths = {element.path for element in inventory_resume(composed)}
    assert not any(path.startswith("section_order") for path in paths)
    assert "layout_level" not in paths
    assert workflow.ResumeContentModel.from_document(composed).content == original


def test_invalid_section_order_is_repaired_to_valid_unique_references():
    content = workflow.ResumeContentModel(content=resume())
    plan = workflow.ResumeCompositionPlan(
        section_order=["summary", "ghost", "summary"],
        page_assignment={"ghost": 0},
    )
    assert not workflow.validate_composition(content, plan).valid
    repaired, changed = workflow.repair_composition(content, plan)
    assert workflow.validate_composition(content, repaired).valid
    assert len(repaired.section_order) == len(set(repaired.section_order))
    assert "ghost" not in repaired.section_order
    assert "section_order" in changed


def test_missing_content_and_unsupported_skill_are_target_repaired(monkeypatch):
    original = resume()
    composed = copy.deepcopy(original)
    composed["experience"][0]["description"] = ["Reduced latency."]
    composed["skills"].append("Fabricated Quantum Skill")
    rendered_payloads = []

    monkeypatch.setattr(
        workflow, "validate_generated_pdf", lambda *_: Report(valid=True)
    )

    async def renderer(payload, _template):
        rendered_payloads.append(payload)
        return b"valid-pdf"

    pdf, final, state = asyncio.run(workflow.export_resume_pdf(
        original_resume=original,
        composed_resume=composed,
        approved_additions=[],
        intentional_removals=[],
        template_name="modern",
        renderer=renderer,
    ))
    assert pdf == b"valid-pdf"
    assert final.content.content["experience"][0]["description"][0].endswith("40%.")
    assert "Fabricated Quantum Skill" not in final.content.content["skills"]
    assert state.final_resume_ready
    assert rendered_payloads


def test_rendering_retries_are_bounded_and_error_is_safe(monkeypatch):
    calls = 0

    def invalid_pdf(*_args):
        return Report(valid=False, issues=["clickable PDF annotation missing: secret"])

    monkeypatch.setattr(workflow, "validate_generated_pdf", invalid_pdf)

    async def renderer(_payload, _template):
        nonlocal calls
        calls += 1
        return b"invalid"

    with pytest.raises(workflow.ExportWorkflowError) as captured:
        asyncio.run(workflow.export_resume_pdf(
            original_resume=resume(),
            composed_resume=resume(),
            approved_additions=[],
            intentional_removals=[],
            template_name="modern",
            renderer=renderer,
            request_id="support-123",
        ))
    assert calls >= 3
    detail = captured.value.safe_detail()
    assert detail["request_id"] == "support-123"
    assert "clickable PDF annotation" not in detail["message"]
    assert "original resume data is safe" in detail["message"].lower()


def test_pdf_is_returned_only_after_render_validation_passes(monkeypatch):
    validations = iter([
        Report(valid=False, issues=["orphan page content"]),
        Report(valid=True),
    ])
    monkeypatch.setattr(
        workflow, "validate_generated_pdf", lambda *_: next(validations)
    )
    payloads = []

    async def renderer(payload, _template):
        payloads.append(copy.deepcopy(payload))
        return b"pdf"

    _, _, state = asyncio.run(workflow.export_resume_pdf(
        original_resume=resume(),
        composed_resume=resume(),
        approved_additions=[],
        intentional_removals=[],
        template_name="modern",
        renderer=renderer,
    ))
    assert len(payloads) == 2
    assert payloads[1]["layout_level"] == payloads[0]["layout_level"] + 1
    assert state.final_resume_ready
    assert state.repair_logs[-1].repair_type == workflow.RepairType.REPAIRABLE_RENDERING_ERROR


def test_export_error_never_exposes_internal_paths():
    error = workflow.ExportWorkflowError(
        "request-1", workflow.RepairType.REPAIRABLE_COMPOSITION_ERROR
    )
    rendered = str(error.safe_detail())
    assert "section_order.0" not in rendered
    assert "validation" not in rendered.lower()


def test_source_native_sparse_records_do_not_block_truthful_export(monkeypatch):
    source = resume()
    source["certifications"] = [{"name": "AWS Cloud Practitioner"}]
    monkeypatch.setattr(
        workflow, "validate_generated_pdf", lambda *_: Report(valid=True)
    )

    async def renderer(_payload, _template):
        return b"pdf"

    pdf, final, state = asyncio.run(workflow.export_resume_pdf(
        original_resume=source,
        composed_resume=copy.deepcopy(source),
        approved_additions=[],
        intentional_removals=[],
        template_name="modern",
        renderer=renderer,
    ))
    assert pdf == b"pdf"
    assert final.content.content["certifications"][0]["name"] == "AWS Cloud Practitioner"
    assert state.final_resume_ready


def test_renderer_failure_retries_with_safe_ats_template(monkeypatch):
    templates = []
    monkeypatch.setattr(
        workflow, "validate_generated_pdf", lambda *_: Report(valid=True)
    )

    async def renderer(_payload, template):
        templates.append(template)
        if len(templates) == 1:
            raise ValueError("selected layout overflowed")
        return b"pdf"

    pdf, _, state = asyncio.run(workflow.export_resume_pdf(
        original_resume=resume(),
        composed_resume=resume(),
        approved_additions=[],
        intentional_removals=[],
        template_name="PortfolioPhotoATS",
        renderer=renderer,
    ))
    assert pdf == b"pdf"
    assert templates == ["PortfolioPhotoATS", "ExecutiveATS"]
    assert state.final_resume_ready
