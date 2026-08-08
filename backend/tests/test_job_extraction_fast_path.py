import time
import uuid
from unittest.mock import MagicMock, patch

from services.job_extraction.agents import (
    _deterministic_job_from_evidence,
    _focused_extension_panel,
    _infer_rendered_job_title,
    extraction_agent,
    repair_agent,
    reviewer_agent,
)
from services.job_extraction.schemas import (
    ExtractedJob, JDState, JDRoleWorkerResult, JDSkillsWorkerResult,
    JDResponsibilitiesWorkerResult, JDRequirementsWorkerResult,
)

# Legacy fixture names retained below while assertions migrate from the old
# two-worker split to the new four-worker contract.
ExtractedJobFacts = ExtractedJob
ExtractedJobContent = ExtractedJob


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


def _split_with_structured_output(facts_result=None, content_result=None, sleep_seconds=0.0):
    """Compatibility helper for the four concurrent DeepSeek Pro workers."""
    def fake_with_structured_output(schema_cls, **kwargs):
        assert kwargs["model_override"] == "deepseek-v4-pro"
        assert kwargs["escalate_on_error"] is False
        assert kwargs["max_tokens"] <= 900
        mock_structured = MagicMock()

        def invoke(*_args, **_kwargs):
            if sleep_seconds:
                time.sleep(sleep_seconds)
            if schema_cls is JDRoleWorkerResult:
                if isinstance(facts_result, Exception):
                    raise facts_result
                source = facts_result or ExtractedJob()
                return JDRoleWorkerResult(
                    seniority=getattr(source, "seniority", None),
                    role_family=getattr(source, "role_family", None),
                )
            if schema_cls is JDSkillsWorkerResult:
                if isinstance(content_result, Exception):
                    raise content_result
                source = content_result or ExtractedJob()
                return JDSkillsWorkerResult(
                    skills=getattr(source, "skills", []),
                    suggested_skills=getattr(source, "suggested_skills", []),
                )
            if schema_cls is JDResponsibilitiesWorkerResult:
                if isinstance(content_result, Exception):
                    raise content_result
                return JDResponsibilitiesWorkerResult(
                    responsibilities=getattr(content_result, "responsibilities", [])
                )
            if schema_cls is JDRequirementsWorkerResult:
                if isinstance(content_result, Exception):
                    raise content_result
                return JDRequirementsWorkerResult(
                    requirements=getattr(content_result, "requirements", []),
                    preferred_qualifications=getattr(content_result, "preferred_qualifications", []),
                    benefits=getattr(content_result, "benefits", []),
                )
            raise AssertionError(f"unexpected schema_cls passed to with_structured_output: {schema_cls}")

        mock_structured.invoke.side_effect = invoke
        return mock_structured
    return fake_with_structured_output


@patch("services.job_extraction.agents.get_llm")
def test_extraction_splits_into_four_concurrent_pro_workers(mock_get_llm):
    """extraction_agent now makes FOUR independent DeepSeek-Pro-only calls
    (role/skills/responsibilities/requirements, see JDRoleWorkerResult etc.
    in job_schemas.py) instead of one combined call. job_title/company_name
    are never part of any worker schema -- they always come from the
    deterministic JSON-LD/DOM baseline computed up front -- so this asserts
    each worker's OWN fields land in the merged record."""
    mock_get_llm.return_value.with_structured_output.side_effect = _split_with_structured_output(
        facts_result=ExtractedJob(seniority="Staff", role_family="Engineering"),
        content_result=ExtractedJob(
            skills=["Python", "Go"], responsibilities=["Own the platform"],
            requirements=["5+ years experience"], preferred_qualifications=["Rust"],
        ),
    )

    result = extraction_agent(job_state())

    # Always deterministic -- no worker schema carries these fields.
    assert result["extracted_job"]["job_title"] == "Data Engineer"
    assert result["extracted_job"]["company_name"] == "Example Corp"
    # Role worker.
    assert result["extracted_job"]["seniority"] == "Staff"
    assert result["extracted_job"]["role_family"] == "Engineering"
    # Skills / Responsibilities / Requirements workers.
    assert result["extracted_job"]["skills"] == ["Python", "Go"]
    assert result["extracted_job"]["responsibilities"] == ["Own the platform"]
    assert result["extracted_job"]["requirements"] == ["5+ years experience"]
    assert result["extracted_job"]["preferred_qualifications"] == ["Rust"]
    assert result["used_deterministic_extraction"] is False


@patch("services.job_extraction.agents.get_llm")
def test_one_failed_worker_does_not_discard_other_successful_workers(mock_get_llm):
    """A worker that fails its initial attempt AND its one targeted retry
    must fall back to the deterministic baseline for ONLY its own fields --
    the other three workers' already-successful results must survive
    untouched (spec: "One failed worker does not discard successful
    workers")."""
    mock_get_llm.return_value.with_structured_output.side_effect = _split_with_structured_output(
        facts_result=RuntimeError("role worker boom"),
        content_result=ExtractedJob(
            skills=["Rust"], responsibilities=["Ship services"],
            requirements=["Own the on-call rotation"],
        ),
    )

    result = extraction_agent(job_state())

    # Role worker failed twice (initial + retry) -> falls back to whatever
    # the deterministic baseline has for its fields (nothing, here) rather
    # than losing the rest of the extraction.
    assert result["extracted_job"]["seniority"] is None
    # The other three workers are NOT discarded just because role failed.
    assert result["extracted_job"]["skills"] == ["Rust"]
    assert result["extracted_job"]["responsibilities"] == ["Ship services"]
    assert result["extracted_job"]["requirements"] == ["Own the on-call rotation"]
    # job_title/company_name are unaffected either way -- always deterministic.
    assert result["extracted_job"]["job_title"] == "Data Engineer"
    assert result["extracted_job"]["company_name"] == "Example Corp"
    assert result["used_deterministic_extraction"] is True


@patch("services.job_extraction.agents.get_llm")
def test_four_workers_run_concurrently_not_sequentially(mock_get_llm):
    """The whole point of the split: wall-clock time should be roughly ONE
    worker's duration, not four workers' durations added together."""
    mock_get_llm.return_value.with_structured_output.side_effect = _split_with_structured_output(
        facts_result=ExtractedJob(seniority="Staff"),
        content_result=ExtractedJob(skills=["Python"]),
        sleep_seconds=0.3,
    )

    started = time.perf_counter()
    extraction_agent(job_state())
    elapsed = time.perf_counter() - started

    # Sequential (4x0.3s) would be ~1.2s+; concurrent should land close to ~0.3s.
    assert elapsed < 0.6


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
def test_repair_calls_llm_first_and_uses_its_result(mock_get_llm):
    """repair_agent's primary path is a real LLM re-read of the evidence
    (matching how extraction_agent itself works) -- not a deterministic
    keyword-matched patch. See test_repair_falls_back_to_deterministic_
    evidence_only_when_llm_repair_fails below for the safety-net path."""
    mock_structured = mock_get_llm.return_value.with_structured_output.return_value
    mock_structured.invoke.return_value = ExtractedJob(
        job_title="Data Engineer",
        company_name="Example Corp",
        description="Build data pipelines.",
        skills=["Python"],
        suggested_skills=["Data Modeling", "ETL Design", "Monitoring", "Cost Optimization"],
    )
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

    mock_get_llm.assert_called()
    assert result["extracted_job"]["suggested_skills"] == [
        "Data Modeling", "ETL Design", "Monitoring", "Cost Optimization",
    ]
    assert result["repair_attempts"] == 1


@patch("services.job_extraction.agents.get_llm")
def test_repair_falls_back_to_deterministic_evidence_only_when_llm_repair_fails(mock_get_llm):
    """repair_agent used to have NO fallback at all -- an LLM failure at the
    repair stage (both flash attempts and the pro escalation exhausted, or a
    timeout) propagated straight out as an unhandled exception, turning a
    single DeepSeek hiccup into a full 500 for the whole /jobs/extract-url
    request instead of a degraded-but-usable result. This must still resolve
    to a usable job, not raise."""
    mock_get_llm.return_value.with_structured_output.return_value.invoke.side_effect = RuntimeError("boom")
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


def test_research_job_missing_llm_skills_triggers_repair():
    """reviewer_agent no longer silently patches a missing-but-evidenced
    skills list in place with a deterministic keyword match -- it flags
    "skills" for repair (see field_issues below) and lets repair_agent's
    real LLM re-read fill it in, same as any other incomplete field."""
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

    assert result["is_valid"] is False
    assert result["needs_repair"] is True
    assert "skills" in result["repair_fields"]


@patch("services.job_extraction.agents.get_llm")
def test_research_job_missing_llm_skills_is_recovered_by_repair(mock_get_llm):
    extracted = {
        "job_title": "Research Scientist, Gemini Data",
        "company_name": "DeepMind",
        "description": "Research machine learning methods for large language models.",
        "responsibilities": ["Develop JAX and Python experiments for distributed training."],
        "requirements": ["PhD and experience with deep learning and statistics."],
        "skills": [],
        "suggested_skills": ["Communication", "Collaboration", "Problem Solving", "Prioritization"],
    }
    mock_structured = mock_get_llm.return_value.with_structured_output.return_value
    mock_structured.invoke.return_value = ExtractedJob(
        job_title=extracted["job_title"],
        company_name=extracted["company_name"],
        description=extracted["description"],
        responsibilities=extracted["responsibilities"],
        requirements=extracted["requirements"],
        skills=["Python", "JAX", "Machine Learning", "Deep Learning", "Statistics"],
        suggested_skills=extracted["suggested_skills"],
    )
    state = job_state(
        extracted_job=extracted,
        jobposting_jsonld=[],
        markdown="Minimum qualifications: Python, JAX, deep learning, and statistics.",
        evidence={"source_text": extracted["description"]},
        repair_fields=["skills"],
        field_issues={"skills": ["The source contains skill signals but the LLM returned no explicit skills."]},
    )

    result = repair_agent(state)

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


def test_linkedin_split_view_panel_with_no_title_hint_keeps_full_body():
    """Regression test: a real LinkedIn split-view search-results job panel
    (jobs/search-results/?currentJobId=...) with no job_title_hint at all
    (production case, 2026-08-08) truncated to a 363-char header, discarding
    the entire "About the job"/"About the role"/requirements body. Two
    compounding bugs: (1) _infer_rendered_job_title's longest-candidate pick
    let a full body sentence beat the real ~44-char title purely by length,
    so the title-anchor jumped past all the real leading content; (2)
    PLATFORM_UPSELL_BOILERPLATE's "how you match" phrase matches LinkedIn's
    standard, always-shown qualifications-match feature (not a Premium
    upsell), truncating everything after it even when the title anchor was
    otherwise correct."""
    evidence = {
        "job_title_hint": "",
        "selected_panel_text": """Software Engineering & AI Technology Intern
Zexovo
Software Engineering & AI Technology Intern
DATAMAZE . AI
Tirumalgiri

How you match
You have 3 of 5 preferred qualifications

About the job
Location: Remote (India)
Experience: 1+ Year
Employment Type: Paid Internship

About the role
We are building a next-generation AI product where the frontend and backend foundations are already in place.
We are now looking for an Agentic AI Engineer Intern to focus specifically on building the intelligence layer of the product.

What you will build
- Autonomous AI agents with tool calling capabilities
- Multistep reasoning workflows

Requirements
- 1+ years of experience with Python
""",
    }

    assert _infer_rendered_job_title(evidence) == "Software Engineering & AI Technology Intern"
    focused = _focused_extension_panel(evidence)
    assert "Location: Remote (India)" in focused
    assert "Experience: 1+ Year" in focused
    assert "We are building a next-generation AI product" in focused
    assert "Autonomous AI agents with tool calling capabilities" in focused
    assert "1+ years of experience with Python" in focused
