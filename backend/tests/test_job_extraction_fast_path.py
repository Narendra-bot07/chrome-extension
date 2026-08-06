from unittest.mock import patch

from services.job_extraction.agents import (
    _deterministic_job_from_evidence,
    extraction_agent,
    repair_agent,
)
from services.job_extraction.schemas import JDState


def job_state(**updates):
    values = {
        "request_id": "jd-fast-test",
        "url": "https://example.com/jobs/123",
        "original_url": "https://example.com/jobs/123",
        "final_url": "https://example.com/jobs/123",
        "extraction_readiness": "READY",
        "jobposting_jsonld": [{
            "@type": "JobPosting",
            "title": "Data Engineer",
            "hiringOrganization": {
                "name": "Example Corp",
                "sameAs": "https://example.com",
            },
            "description": "Build Python and SQL data pipelines on AWS using Docker.",
            "responsibilities": "<ul><li>Build APIs</li><li>Review code &amp; tests</li></ul>",
            "qualifications": "<p><strong>Required Qualifications:&nbsp;</strong></p><ul><li>6+ years in engineering</li><li>Associate&rsquo;s degree</li></ul>",
            "jobLocation": {"address": {"addressLocality": "Hyderabad", "addressCountry": "IN"}},
            "employmentType": "FULL_TIME",
            "skills": "Python, SQL, AWS, Docker",
            "url": "https://example.com/jobs/123",
        }],
        "evidence": {"source_text": "Build Python and SQL data pipelines on AWS using Docker."},
    }
    values.update(updates)
    return JDState(**values)


@patch("services.job_extraction.agents.get_llm")
def test_complete_jobposting_jsonld_skips_llm(mock_get_llm):
    result = extraction_agent(job_state())

    mock_get_llm.assert_not_called()
    assert result["extracted_job"]["job_title"] == "Data Engineer"
    assert result["extracted_job"]["company_name"] == "Example Corp"
    assert set(result["extracted_job"]["skills"]) >= {"Python", "SQL", "AWS", "Docker"}
    assert len(result["extracted_job"]["suggested_skills"]) == 4
    assert result["extracted_job"]["responsibilities"] == ["Build APIs", "Review code & tests"]
    assert result["extracted_job"]["requirements"] == [
        "6+ years in engineering",
        "Associate’s degree",
    ]
    assert "<" not in " ".join(result["extracted_job"]["requirements"])


@patch("services.job_extraction.agents.get_llm")
def test_repair_is_deterministic_and_never_starts_second_llm_call(mock_get_llm):
    state = job_state(
        extracted_job={
            "job_title": "Data Engineer",
            "company_name": "Example Corp",
            "description": "Build data pipelines.",
            "skills": ["Python"],
            "suggested_skills": [],
        },
        repair_fields=["suggested_skills"],
    )

    result = repair_agent(state)

    mock_get_llm.assert_not_called()
    assert len(result["extracted_job"]["suggested_skills"]) == 4
    assert result["repair_attempts"] == 1


def test_rendered_spa_sections_survive_llm_timeout_fallback():
    state = job_state(
        jobposting_jsonld=[],
        extension_evidence={
            "job_title_hint": "Mechanical Data and PLM Specialist",
            "company_hint": "NVIDIA",
        },
        markdown="""# Mechanical Data and PLM Specialist

What You'll Be Doing
- Own mechanical product lifecycle data.
- Collaborate with engineering teams.

What We Need To See
- 6+ years of relevant experience.
- Experience with PLM systems.

Ways To Stand Out
- Experience with enterprise data governance.
""",
        evidence={"source_text": "Mechanical product lifecycle role at NVIDIA."},
    )

    job = _deterministic_job_from_evidence(state)

    assert job.job_title == "Mechanical Data and PLM Specialist"
    assert job.company_name == "NVIDIA"
    assert job.responsibilities == [
        "Own mechanical product lifecycle data.",
        "Collaborate with engineering teams.",
    ]
    assert job.requirements == [
        "6+ years of relevant experience.",
        "Experience with PLM systems.",
    ]
    assert job.preferred_qualifications == [
        "Experience with enterprise data governance."
    ]
