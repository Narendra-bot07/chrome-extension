import uuid
from unittest.mock import patch

from services.job_extraction.agents import (
    _deterministic_job_from_evidence,
    _focused_extension_panel,
    _infer_rendered_job_title,
    extraction_agent,
    repair_agent,
    reviewer_agent,
)
from services.job_extraction.schemas import ExtractedJob, JDState


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
        # extraction_agent now always routes through llm_cache.execute_with_cache
        # (real Redis in this dev environment), keyed by a fingerprint of this
        # evidence dict. A fixed evidence payload would cache-hit on the second
        # run of a test that mocks get_llm, silently skipping the mock and
        # failing assert_called(). A per-call nonce keeps every test run's
        # fingerprint unique. Tests that pass their own `evidence=` override
        # (exercising _deterministic_job_from_evidence/reviewer_agent directly,
        # not the cached LLM path) are unaffected.
        "evidence": {
            "source_text": "Build Python and SQL data pipelines on AWS using Docker.",
            "_test_nonce": uuid.uuid4().hex,
        },
    }
    values.update(updates)
    return JDState(**values)


@patch("services.job_extraction.agents.get_llm")
def test_complete_jobposting_jsonld_still_uses_llm(mock_get_llm):
    """JSON-LD having a title+description no longer skips the LLM -- that
    bar is low enough that most ATS platforms clear it while their JSON-LD
    `description` is still a shortened SEO summary missing real page content
    (e.g. a standalone skills widget). The LLM is now the primary organizer
    for every job page; source_builder_agent gives it the full rendered
    markdown alongside JSON-LD as supplementary evidence, and
    _deterministic_job_from_evidence is reserved for genuine LLM failures
    (see test_llm_failure_falls_back_to_deterministic_evidence below)."""
    mock_structured = mock_get_llm.return_value.with_structured_output.return_value
    mock_structured.invoke.return_value = ExtractedJob(
        job_title="Data Engineer",
        company_name="Example Corp",
        skills=["Python", "SQL", "AWS", "Docker"],
        suggested_skills=["Data Modeling", "ETL Design", "Monitoring", "Cost Optimization"],
        responsibilities=["Build APIs", "Review code & tests"],
        requirements=["6+ years in engineering", "Associate’s degree"],
    )

    result = extraction_agent(job_state())

    mock_get_llm.assert_called()
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
def test_llm_failure_falls_back_to_deterministic_evidence(mock_get_llm):
    """The deterministic JobPosting JSON-LD path is now reserved for genuine
    LLM failures/timeouts, not merely-complete-JSON-LD pages."""
    mock_get_llm.return_value.with_structured_output.return_value.invoke.side_effect = RuntimeError("boom")

    result = extraction_agent(job_state())

    assert result["extracted_job"]["job_title"] == "Data Engineer"
    assert result["extracted_job"]["company_name"] == "Example Corp"
    assert set(result["extracted_job"]["skills"]) >= {"Python", "SQL", "AWS", "Docker"}


@patch("services.job_extraction.agents.get_llm")
def test_github_unavailable_taxonomy_never_becomes_a_skill(mock_get_llm):
    mock_get_llm.return_value.with_structured_output.return_value.invoke.side_effect = ValueError("empty LLM content")
    state = job_state(
        jobposting_jsonld=[{
            "@type": "JobPosting",
            "title": "Product Security Engineer III",
            "hiringOrganization": {"name": "GitHub, Inc."},
            "description": (
                "Perform product security and application security reviews, threat modeling, "
                "vulnerability research, code reviews, and incident response."
            ),
            "occupationalCategory": "UNAVAILABLE",
        }],
        evidence={"source_text": "Product security, threat modeling, vulnerability research, code review and incident response."},
        markdown="Product security, threat modeling, vulnerability research, code review and incident response.",
    )

    result = extraction_agent(state)

    assert "UNAVAILABLE" not in result["extracted_job"]["skills"]
    assert set(result["extracted_job"]["skills"]) >= {
        "Product Security", "Application Security", "Threat Modeling",
        "Vulnerability Research", "Code Review", "Incident Response",
    }


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


def test_research_job_missing_llm_skills_is_recovered_without_manual_review():
    extracted = {
        "job_title": "Research Scientist, Gemini Data",
        "company_name": "DeepMind",
        "description": "Research machine learning methods for large language models.",
        "responsibilities": ["Develop JAX and Python experiments for distributed training."],
        "requirements": ["PhD and experience with deep learning and statistics."],
        "skills": [],
        "suggested_skills": ["Communication", "Collaboration", "Problem Solving", "Prioritization"],
    }
    result = reviewer_agent(job_state(
        extracted_job=extracted,
        jobposting_jsonld=[],
        markdown="Minimum qualifications: Python, JAX, deep learning, and statistics.",
        evidence={"source_text": extracted["description"]},
    ))

    assert result["is_valid"] is True
    assert result["needs_repair"] is False
    assert set(result["extracted_job"]["skills"]) >= {
        "Python", "JAX", "Machine Learning", "Deep Learning", "Statistics",
    }


def test_spa_hidden_generic_title_and_recommendations_are_excluded():
    evidence = {
        "job_title_hint": "Single Position",
        "selected_panel_text": """Upload Your Resume
View All Jobs
Senior Advanced Development Engineer, GPU Networking
Israel, Tel Aviv
Apply Now
Job Description
What You'll Be Doing
Build GPU networking systems.
What We Need To See
Strong C++ and Linux experience.
Similar jobs
Senior Software Engineer, Fabric Networking
JR2020447
""",
    }

    assert _infer_rendered_job_title(evidence) == (
        "Senior Advanced Development Engineer, GPU Networking"
    )
    focused = _focused_extension_panel(evidence)
    assert focused.startswith("Senior Advanced Development Engineer")
    assert "Build GPU networking systems." in focused
    assert "Similar jobs" not in focused
    assert "Fabric Networking" not in focused
