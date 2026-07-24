from services.resume.composition import (
    _canonical_url,
    audit_resume_preservation,
    validate_resume_presentation,
)
from services.resume.renderable import project_renderable_resume
from schemas.resume import RenderableResume
from pydantic import ValidationError
import pytest
import json
from pathlib import Path


def sample_resume():
    return {
        "personal_info": {
            "name": "Ada",
            "linkedin": "https://linkedin.com/in/ada",
        },
        "summary": "Engineer",
        "experience": [{"company": "Acme", "description": ["One", "Two"]}],
        "projects": [{
            "name": "Compiler",
            "link": "https://example.com/compiler",
            "description": ["Built it", "Shipped it"],
        }],
        "certifications": [{"name": "Cloud", "credential_url": "https://example.com/cert"}],
        "leadership": [{"title": "Mentor"}],
        "custom_field": [{"title": "Patents"}],
    }


def test_accepts_text_rewrites_without_structural_loss():
    original = sample_resume()
    composed = sample_resume()
    composed["summary"] = "Senior engineer"
    composed["projects"][0]["description"][0] = "Designed the compiler"
    assert audit_resume_preservation(original, composed).valid


def test_rejects_bullet_section_and_link_loss():
    original = sample_resume()
    composed = sample_resume()
    composed["projects"][0]["description"] = ["Built it"]
    composed["certifications"] = []
    composed["personal_info"]["linkedin"] = ""
    report = audit_resume_preservation(original, composed)
    assert not report.valid
    assert any("projects: bullets decreased" in issue for issue in report.issues)
    assert any("certifications: entries decreased" in issue for issue in report.issues)
    assert any("hyperlink removed" in issue for issue in report.issues)


def test_pdf_audit_repairs_lost_metric_and_allows_explicitly_approved_skill():
    original = sample_resume()
    original["experience"][0]["description"][0] = "Reduced latency by 40%."
    composed = sample_resume()
    composed["experience"][0]["description"][0] = "Reduced latency."
    composed["skills"] = ["Python"]
    blocked = audit_resume_preservation(original, composed)
    assert not blocked.valid

    repaired = audit_resume_preservation(
        original,
        composed,
        approved_additions=["Python"],
        auto_repair=True,
    )
    assert repaired.valid
    assert repaired.lossless_resume["experience"][0]["description"][0] == "Reduced latency by 40%."
    assert repaired.lossless_resume["skills"] == ["Python"]


def test_rejects_unknown_field_loss_and_records_explicit_removal():
    original = sample_resume()
    composed = sample_resume()
    composed.pop("custom_field")
    assert not audit_resume_preservation(original, composed).valid
    assert audit_resume_preservation(original, composed, ["custom_field"]).valid


def test_storage_metadata_is_not_renderable_and_achievement_evidence_survives():
    projected = project_renderable_resume({
        "id": "database-id",
        "created_at": "2026-07-24",
        "file_name": "Shravya.pdf",
        "file_size": 1234,
        "file_type": "application/pdf",
        "parse_status": "complete",
        "upload_source": "dashboard",
        "personal_info": {"name": "Shravya"},
        "achievements": [{
            "title": "Competitive Programming",
            "description": "Solved 500+ problems and achieved LeetCode Top 18%.",
        }],
        "certifications": [
            {"name": "Competitive Programming"},
            {"name": "Zero Trust Architecture", "issuing_organization": "Academy"},
        ],
        "custom_sections": [{"title": "Community", "description": ["Mentored students."]}],
    })
    serialized = str(projected).lower()
    for forbidden in ("database-id", "shravya.pdf", "file_size", "parse_status", "upload_source"):
        assert forbidden not in serialized
    assert projected["achievements"] == [
        "Competitive Programming — Solved 500+ problems and achieved LeetCode Top 18%."
    ]
    assert [item["name"] for item in projected["certifications"]] == ["Zero Trust Architecture"]
    assert projected["custom_sections"][0]["description"] == ["Mentored students."]


def test_renderable_schema_forbids_unknown_top_level_fields():
    with pytest.raises(ValidationError):
        RenderableResume.model_validate({
            "personal_info": {"name": "Ada"},
            "created_at": "must never render",
        })


def test_shravya_fixture_preserves_metrics_and_classifies_combined_section():
    fixture = json.loads(
        (Path(__file__).parent / "fixtures" / "shravya_resume_record.json").read_text(encoding="utf-8")
    )
    projected = project_renderable_resume(fixture)
    serialized = json.dumps(projected, ensure_ascii=False)

    for forbidden in (
        "internal-resume-id", "internal-user-id", "created_at", "updated_at",
        "Shravya_6641_Resume.pdf", "216335", "application/pdf",
        "parse_status", "parsing_status", "upload_source",
    ):
        assert forbidden not in serialized

    evidence = " ".join(projected["achievements"])
    for expected in ("25 participants", "500+ problems", "Top 18%", "40%", "top 100", "2024 and 2025"):
        assert expected in evidence
    assert [item["name"] for item in projected["certifications"]] == [
        "$300 Zscaler voucher for completing Zero Trust Architecture training and related learning resources."
    ]
    assert len(projected["projects"][0]["description"]) == 3
    assert projected["custom_sections"][0]["description"]


def test_presentation_gate_accepts_distinct_detailed_records():
    report = validate_resume_presentation({
        "achievements": [
            "Competitive Programming — Solved 500+ problems and reached Top 18%."
        ],
        "certifications": [{
            "name": "Zero Trust Architecture Training",
            "description": "Completed ZTA training and received a $300 learning voucher.",
        }],
    })
    assert report.valid


def test_presentation_gate_rejects_titles_only_and_reused_descriptions():
    report = validate_resume_presentation({
        "achievements": [
            "Competitive Programming",
            "Hackathon Finalist — Shared description.",
        ],
        "certifications": [{
            "name": "Training",
            "description": "Shared description.",
        }],
    })
    assert not report.valid
    assert any("missing a distinct professional title" in issue for issue in report.issues)
    assert any("reuses the description" in issue for issue in report.issues)


def test_pdf_link_identity_ignores_cosmetic_url_variants():
    assert _canonical_url("https://www.linkedin.com/in/vani/") == _canonical_url(
        "linkedin.com/in/vani?trk=profile"
    )
