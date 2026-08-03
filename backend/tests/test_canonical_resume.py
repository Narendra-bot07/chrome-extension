"""Unit tests for canonical resume data snapshot, adapter, and consistency validator."""

import pytest
from schemas.canonical_resume import CanonicalResumeSnapshot, calculate_content_hash
from services.resume.canonical_adapter import build_canonical_snapshot, canonical_to_dict
from services.resume.consistency_validator import validate_template_consistency


def test_build_canonical_snapshot_deterministic_hash():
    resume_data = {
        "id": "res_123",
        "personal_info": {
            "name": "Bandi Narendra",
            "email": "narendra@example.com",
            "phone": "+91 9999999999",
            "linkedin": "https://linkedin.com/in/bandi-narendra-138a5b256",
            "github": "https://github.com/Narendra-bot07"
        },
        "summary": "Experienced Data & Software Engineer.",
        "experience": [
            {
                "role": "Senior Engineer",
                "company": "Tech Corp",
                "start_date": "2022",
                "end_date": "Present",
                "description": ["Architected distributed data pipelines.", "Optimized query latency by 40%."]
            }
        ],
        "education": [
            {
                "degree": "B.Tech Computer Science",
                "institution": "State University",
                "gpa": "3.9"
            }
        ],
        "skills": ["Python", "FastAPI", "React", "PostgreSQL"]
    }

    snapshot = build_canonical_snapshot(resume_data, resume_id="res_123")
    assert snapshot.schema_version == "2.0_canonical"
    assert snapshot.header.full_name == "Bandi Narendra"
    assert snapshot.summary == "Experienced Data & Software Engineer."
    assert len(snapshot.sections) == 4
    
    hash1 = snapshot.generate_hash()
    hash2 = calculate_content_hash(snapshot)
    assert hash1 == hash2
    assert len(hash1) == 64  # SHA-256 hex string


def test_canonical_bi_directional_conversion():
    original = {
        "id": "res_456",
        "personal_info": {
            "name": "Alice Smith",
            "email": "alice@example.com",
            "phone": "555-0199",
            "linkedin": "https://linkedin.com/in/alicesmith"
        },
        "summary": "Full Stack Developer.",
        "experience": [
            {
                "role": "Software Engineer",
                "company": "Acme Inc",
                "location": "Remote",
                "start_date": "2020",
                "end_date": "2023",
                "description": ["Built REST APIs.", "Reduced page load by 50%."]
            }
        ]
    }

    snapshot = build_canonical_snapshot(original, resume_id="res_456")
    converted = canonical_to_dict(snapshot)

    assert converted["personal_info"]["name"] == "Alice Smith"
    assert converted["summary"] == "Full Stack Developer."
    assert len(converted["experience"]) == 1
    assert converted["experience"][0]["company"] == "Acme Inc"


def test_consistency_validator_pass_and_fail():
    original = {
        "id": "res_789",
        "personal_info": {
            "name": "Bob Jones",
            "email": "bob@example.com"
        },
        "summary": "AI Specialist.",
        "experience": [
            {"role": "AI Lead", "company": "AI Co", "description": ["Trained LLM models."]}
        ]
    }
    snapshot = build_canonical_snapshot(original, resume_id="res_789")
    rendered = canonical_to_dict(snapshot)

    val_res = validate_template_consistency(snapshot, rendered, expected_content_hash=snapshot.content_hash)
    assert val_res.valid is True
    assert val_res.content_hash_matches is True
    assert len(val_res.issues) == 0

    # Simulate content loss in rendered output (e.g. dropped experience)
    corrupted_rendered = dict(rendered)
    corrupted_rendered["experience"] = []
    val_corrupt = validate_template_consistency(snapshot, corrupted_rendered)
    assert val_corrupt.valid is False
    assert "experience" in val_corrupt.missing_sections
