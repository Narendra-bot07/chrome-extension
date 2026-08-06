from unittest.mock import patch

from services.job_extraction.agents import extraction_agent, repair_agent
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
