import json
from unittest.mock import patch

import pytest

from services.job_extraction.agents import (
    _deterministic_classification,
    block_detection_agent,
    classifier_agent,
    dom_cleaner_agent,
    evidence_evaluation_agent,
    final_response_agent,
    jsonld_agent,
    markdown_agent,
    metadata_agent,
)
from services.job_extraction.graph import (
    route_after_classification_review,
    route_after_classifier,
    route_after_discovery,
    route_after_reviewer,
    route_after_evidence,
    validate_public_url,
)
from services.job_extraction.schemas import ExtractedJob, JDState


@pytest.mark.parametrize(
    ("source_value", "canonical"),
    [
        ("Full Time, Permanent", "full_time"),
        ("Part-time", "part_time"),
        ("Contract / Freelance", "contract"),
        ("Intern", "internship"),
    ],
)
def test_source_employment_labels_are_normalized(source_value, canonical):
    assert ExtractedJob(employment_type=source_value).employment_type == canonical


def test_null_benefits_are_accepted_at_tool_boundary_and_normalized():
    benefits_schema = ExtractedJob.model_json_schema()["properties"]["benefits"]

    assert {"type": "null"} in benefits_schema["anyOf"]
    assert ExtractedJob(benefits=None).benefits == []


def test_multi_office_pipe_separated_location_is_preserved():
    """Regression test: a real Anthropic posting listed "San Francisco, CA |
    New York City, NY | Seattle, WA" and location came back empty in the UI.
    "|" separates distinct offices for the SAME posting, each itself a
    "City, State" comma composite -- it must not be flattened into one
    comma list (which would lose which city pairs with which state) or
    dropped entirely."""
    job = ExtractedJob(location="San Francisco, CA | New York City, NY | Seattle, WA")
    assert job.location == "San Francisco, CA | New York City, NY | Seattle, WA"


def test_multi_office_location_drops_only_placeholder_offices():
    job = ExtractedJob(location="San Francisco, CA | Unavailable | Seattle, WA")
    assert job.location == "San Francisco, CA | Seattle, WA"


def test_backend_login_wall_recovers_with_extension_selected_panel():
    panel = (
        "Senior Engineer\nJob description\nResponsibilities\nBuild reliable systems.\n"
        "Requirements\nPython and SQL.\nFull-time\nApply now\n"
    ) * 3
    result = evidence_evaluation_agent(state(
        backend_raw_html="<html><h1>Sign in</h1><p>Sign in to continue</p></html>",
        backend_final_url="https://example.com/login?next=/jobs/123",
        backend_page_title="Sign in",
        extension_evidence={
            "url": "https://example.com/jobs/123",
            "title": "Senior Engineer",
            "selected_panel_text": panel,
            "job_title_hint": "Senior Engineer",
            "company_hint": "Example",
            "capture": {"portal_optimized_panel": False},
        },
    ))
    assert result["primary_source"] == "extension_selected_panel"
    assert result["page_access_status"] == "extension_accessible"
    assert result["extraction_readiness"] == "READY"
    assert "backend_playwright" in result["excluded_sources"]
    assert "Sign in to continue" not in result["raw_html"]


def test_verified_extension_evidence_skips_backend_browser():
    routed = state(extension_evidence={
        "selected_panel_text": "Responsibilities Build APIs. Requirements Python and SQL. " * 8,
        "client_assessment": {
            "readiness": "READY",
            "isLikelyJob": True,
            "requiresRecoveryEvaluation": False,
        },
    })
    assert route_after_discovery(routed) == "evidence_evaluation"


def test_rendered_job_dom_skips_browser_even_when_client_assessment_is_conservative():
    rendered = (
        "Senior Security Engineer\nApply now\nResponsibilities\n"
        "Build and review secure services.\nRequirements\nPython and cloud security experience.\n"
    ) * 8
    routed = state(extension_evidence={
        "url": "https://example.com/jobs/123",
        "selected_job_url": "https://example.com/jobs/123",
        "selected_panel_text": rendered,
        "visible_text": rendered,
        "job_title_hint": "Senior Security Engineer",
        "client_assessment": {
            "readiness": "PARTIAL",
            "isLikelyJob": True,
            "requiresRecoveryEvaluation": True,
        },
    })

    assert route_after_discovery(routed) == "evidence_evaluation"


def test_ats_iframe_generic_parent_evidence_forces_browser_fetch():
    """Regression test: a real LangChain careers posting
    (langchain.com/careers?ashby_jid=...) embeds jobs.ashbyhq.com in a
    cross-origin iframe the extension cannot read. The parent page's own
    generic marketing copy ("About Us") scored just high enough to look
    like usable job evidence, which skipped the backend Playwright fetch
    that's the only thing able to resolve the ATS iframe -- production
    result was title=None, company='LangChain', skills=0. Flagging the
    detected iframe must force a real browser fetch instead."""
    generic_marketing_copy = (
        "About Us\nWe build reliable, general-purpose AI infrastructure.\n"
        "Careers\nJoin our team and help us apply now on our mission.\n"
        "Requirements: we look for curious, collaborative people.\n"
    ) * 8
    routed = state(extension_evidence={
        "url": "https://www.langchain.com/careers",
        "selected_job_url": "https://www.langchain.com/careers",
        "selected_panel_text": generic_marketing_copy,
        "visible_text": generic_marketing_copy,
        "job_title_hint": "Careers",
        "ats_iframe_detected": True,
    })

    assert route_after_discovery(routed) == "browser"


def test_ats_iframe_flag_does_not_override_strong_jsonld_evidence():
    posting = {
        "@type": "JobPosting", "title": "Engineer",
        "description": "Build systems", "hiringOrganization": {"name": "Example"},
    }
    routed = state(extension_evidence={
        "url": "https://example.com/careers",
        "selected_job_url": "https://example.com/careers",
        "jsonld": [posting],
        "ats_iframe_detected": True,
    })

    assert route_after_discovery(routed) == "evidence_evaluation"


def test_short_spa_top_card_does_not_discard_full_visible_job_description():
    top_card = "Data Engineer Intern\nExample Corp\nHyderabad\nApply"
    visible = """Navigation
Data Engineer Intern
Example Corp
Hyderabad
Apply
Job description
Responsibilities
Build reliable Python and SQL data pipelines.
Requirements
Experience with AWS, Spark, and distributed systems.
Preferred qualifications
Experience with Kafka and Docker.
Similar jobs
Senior Data Engineer
"""
    initial = state(extension_evidence={
        "url": "https://example.com/jobs/123",
        "selected_job_url": "https://example.com/jobs/123",
        "selected_panel_text": top_card,
        "visible_text": visible,
        "job_title_hint": "Data Engineer Intern",
        "company_hint": "Example Corp",
        "html": "<html><body><div>" + ("application shell " * 40) + "</div></body></html>",
    })
    evaluated = evidence_evaluation_agent(initial)
    cleaned = dom_cleaner_agent(initial.model_copy(update=evaluated))
    markdown = markdown_agent(initial.model_copy(update={**evaluated, **cleaned}))
    classified = classifier_agent(initial.model_copy(update={**evaluated, **cleaned, **markdown}))

    assert "Build reliable Python and SQL data pipelines" in markdown["markdown"]
    assert "Similar jobs" not in markdown["markdown"]
    assert classified["page_type"] == "job_detail"


def test_usable_extension_dom_is_not_sent_to_browser_after_evidence_review():
    rendered = (
        "Data Engineer\nApply now\nJob description\nResponsibilities\n"
        "Build Python pipelines.\nQualifications\nSQL and AWS experience.\n"
    ) * 8
    routed = state(
        extension_evidence={
            "url": "https://example.com/jobs/123",
            "selected_panel_text": rendered,
            "visible_text": rendered,
            "job_title_hint": "Data Engineer",
        },
        extraction_readiness="NOT_READY",
        browser_attempts=0,
    )

    assert route_after_evidence(routed) == "final_response"


def test_classification_review_cannot_retry_browser_for_usable_extension_job():
    rendered = (
        "Data Engineer Intern\nApply\nJob description\nResponsibilities\n"
        "Build Python pipelines.\nRequirements\nSQL and AWS experience.\n"
    ) * 8
    routed = state(
        page_type="non_job",
        classification_confidence=.55,
        plan={"classification_review_action": "browser_retry"},
        extension_evidence={
            "url": "https://example.com/jobs/123",
            "visible_text": rendered,
            "job_title_hint": "Data Engineer Intern",
        },
    )

    assert route_after_classification_review(routed) == "evidence_planner"


def test_failed_bounded_browser_does_not_retry():
    routed = state(
        browser_attempts=1,
        error={"code": "BROWSER_FAILED", "message": "navigation timed out"},
        extraction_readiness="NOT_READY",
    )
    assert route_after_evidence(routed) == "final_response"


def test_backend_challenge_recovers_with_extension_jsonld():
    posting = {
        "@type": "JobPosting", "title": "Engineer",
        "description": "Build systems", "hiringOrganization": {"name": "Example"},
    }
    result = evidence_evaluation_agent(state(
        backend_raw_html="<html><p>Verify you are human</p></html>",
        backend_final_url="https://example.com/challenge",
        extension_evidence={"url": "https://example.com/jobs/1", "jsonld": [posting]},
    ))
    assert result["primary_source"] == "extension_jsonld"
    assert result["extraction_readiness"] == "READY"
    assert "Verify you are human" not in result["raw_html"]


def test_ats_iframe_conflict_with_real_backend_jsonld_does_not_block():
    """Regression test: once route_after_discovery forces a browser fetch
    for a detected ATS iframe (see test_ats_iframe_generic_parent_evidence_
    forces_browser_fetch), that fetch's real, structured backend_jsonld
    naturally outranks the extension's generic parent-page panel and
    becomes primary -- but its title ("AI Engineer, Enablement") then
    disagrees with the extension's generic job_title_hint ("Careers"),
    which used to hard-block to MANUAL_REVIEW via the "unresolved conflict
    on a non-extension primary" rule. That conflict is expected and safe
    here: ats_iframe_detected is a structural guarantee the extension's own
    title reflects the wrong (parent) page, not a real identity dispute."""
    posting = {
        "@type": "JobPosting", "title": "AI Engineer, Enablement",
        "description": "Own onboarding and education for new enterprise customers.",
        "hiringOrganization": {"name": "LangChain"},
    }
    html = (
        '<html><body><script type="application/ld+json">'
        + json.dumps(posting)
        + "</script></body></html>"
    )
    generic_marketing_copy = (
        "About Us\nAt LangChain, our mission is to make intelligent agents ubiquitous. "
        "Careers Join our team. Apply now to help us build. Requirements: curious people. "
    ) * 8
    result = evidence_evaluation_agent(state(
        backend_raw_html=html,
        backend_final_url="https://www.langchain.com/careers",
        extension_evidence={
            "url": "https://www.langchain.com/careers?ashby_jid=abc123",
            "selected_job_url": "https://www.langchain.com/careers?ashby_jid=abc123",
            "selected_panel_text": generic_marketing_copy,
            "visible_text": generic_marketing_copy,
            "job_title_hint": "Careers",
            "ats_iframe_detected": True,
        },
    ))
    assert result["primary_source"] == "backend_jsonld"
    assert result["extraction_readiness"] == "READY"


def test_all_restricted_sources_are_blocked_not_non_job():
    result = evidence_evaluation_agent(state(
        backend_raw_html="<html><p>Verify you are human captcha</p></html>",
        backend_final_url="https://example.com/challenge",
        extension_evidence={
            "url": "https://example.com/jobs/1",
            "visible_text": "Access denied. Verify you are human.",
            "html": "<html><p>Access denied. Verify you are human.</p></html>",
        },
    ))
    assert result["primary_source"] is None
    assert result["page_access_status"] == "fully_blocked"
    assert result["extraction_readiness"] == "BLOCKED"
    routed = state(**result)
    assert route_after_evidence(routed) == "final_response"
    response = final_response_agent(routed)["final_response"]
    assert response["status"] == "blocked"
    assert response["page_type"] == "unknown"


def test_normal_backend_jsonld_remains_extractable():
    html = job_html("Public Employer")
    result = evidence_evaluation_agent(state(
        backend_raw_html=html,
        backend_final_url="https://example.com/jobs/123",
        backend_page_title="Senior Software Engineer",
    ))
    assert result["primary_source"] in {"backend_jsonld", "backend_playwright"}
    assert result["page_access_status"] == "backend_accessible"
    assert result["extraction_readiness"] == "READY"


def test_conflicting_jobs_prefer_fresh_selected_panel_and_warn():
    backend = job_html("Backend Employer").replace(
        '"title": "Senior Software Engineer"',
        '"title": "Different Backend Role"',
    )
    panel = (
        "Selected Engineer\nJob description\nResponsibilities\nBuild APIs.\n"
        "Requirements\nPython and SQL.\nApply now\n"
    ) * 3
    result = evidence_evaluation_agent(state(
        url="https://example.com/jobs/11111",
        backend_raw_html=backend,
        backend_final_url="https://example.com/jobs/22222",
        extension_evidence={
            "url": "https://example.com/jobs/11111",
            "selected_job_url": "https://example.com/jobs/11111",
            "selected_panel_text": panel,
            "job_title_hint": "Selected Engineer",
            "capture": {"portal_optimized_panel": True, "dom_fingerprint": "abc"},
        },
    ))
    assert result["primary_source"] == "extension_selected_panel"
    assert result["extraction_readiness"] == "READY"
    assert result["evidence_conflicts"]


def test_conflicting_job_id_does_not_block_extension_primary_without_selected_signal():
    """Regression test: confirmed real-world false positives (2026-08-08) on
    a LinkedIn posting and a LangChain/Ashby-embedded posting, both with the
    full JD visibly present on the page. Backend Playwright's own
    navigation doesn't share the user's browser session/selection state --
    for a SPA search-results URL (LinkedIn's currentJobId=...) or an
    ATS-iframe-embedded posting (LangChain's ashby_jid=...), its own
    independent fetch can land on a final URL whose job ID differs from the
    extension's selected_job_url even though both are showing the SAME
    actual job, purely from how each one resolves/rewrites the URL. When
    the extension's captured panel also falls back to a generic
    (non-portal-optimized) region with lower job-signal density --
    selected_job_signal comes back False -- that ID mismatch used to
    escalate straight to MANUAL_REVIEW, skipping jsonld/extraction/
    everything before the LLM ever ran. It must not, as long as the
    extension is still the primary evidence source."""
    # Deliberately low job-signal density (one section keyword, no "apply
    # now"/employment-type phrase) so extension_panel_selected's OR
    # condition fails on both branches: no portal_optimized_panel AND
    # _job_signal_score below the .35 threshold -- reproducing a generic,
    # non-portal-optimized capture fallback rather than a clean one.
    panel = (
        "Backend Engineer Intern\n"
        "We are looking for a backend engineer intern to join our growing team.\n"
        "Responsibilities include building APIs and working with databases.\n"
        "Strong Python fundamentals required.\n"
    ) * 3
    result = evidence_evaluation_agent(state(
        url="https://example.com/jobs/11111",
        backend_raw_html="",
        backend_final_url="https://example.com/jobs/22222",
        extension_evidence={
            "url": "https://example.com/jobs/11111",
            "selected_job_url": "https://example.com/jobs/11111",
            "selected_panel_text": panel,
            "job_title_hint": "Backend Engineer Intern",
            "capture": {"portal_optimized_panel": False, "dom_fingerprint": "abc"},
        },
    ))
    assert result["primary_source"] == "extension_selected_panel"
    assert result["evidence_conflicts"]
    assert result["extraction_readiness"] != "MANUAL_REVIEW"


def test_restricted_primary_invariant_routes_to_manual_review():
    invalid = state(
        primary_source="backend_playwright",
        selected_evidence_source="backend_playwright",
        page_access_status="extension_accessible",
        extraction_readiness="READY",
        evidence_sources=[{
            "source_type": "backend_playwright",
            "restricted": True,
            "usable": False,
        }],
    )
    update = block_detection_agent(invalid)
    assert update["needs_manual_review"] is True
    assert update["extraction_readiness"] == "MANUAL_REVIEW"


def state(html="", url="https://example.com/jobs/123", **updates):
    value = JDState(request_id="test-request", url=url, original_url=url, raw_html=html)
    return value.model_copy(update=updates)


def job_html(portal="Example", malformed=False, graph=False):
    posting = {
        "@type": "JobPosting", "title": "Senior Software Engineer",
        "hiringOrganization": {"name": portal},
        "description": "Build reliable services.",
    }
    payload = {"@context": "https://schema.org", "@graph": [posting]} if graph else posting
    script = "{broken" if malformed else json.dumps(payload)
    return f"""<html lang="en"><head><title>Senior Software Engineer | {portal}</title>
    <meta name="description" content="Engineering role"><script type="application/ld+json">{script}</script>
    </head><body><header>Navigation</header><main><h1>Senior Software Engineer</h1>
    <h2>Responsibilities</h2><ul><li>Build Python services</li></ul>
    <h2>Requirements</h2><p>Five years experience with AWS and SQL.</p>
    <h2>Benefits</h2><p>Health insurance</p><a href="/apply">Apply now</a></main>
    <footer>Related jobs</footer></body></html>"""


@pytest.mark.parametrize("portal", [
    "Amazon Jobs", "LinkedIn", "Workday", "Greenhouse", "Lever", "Indeed",
    "Glassdoor", "Generic Company",
])
def test_portal_job_detail_fixtures(portal):
    first = jsonld_agent(state(job_html(portal)))
    classified = _deterministic_classification(state(job_html(portal), jobposting_jsonld=first["jobposting_jsonld"]))
    assert classified.page_type == "job_detail"
    assert classified.confidence >= .9


def test_jsonld_graph_multiple_and_malformed_are_safe():
    html = job_html("Graph", graph=True) + '<script type="application/ld+json">{bad</script>' + \
        '<script type="application/ld+json">[{"@type":"Organization","name":"X"}]</script>'
    result = jsonld_agent(state(html))
    assert len(result["jobposting_jsonld"]) == 1
    assert len(result["jsonld"]) >= 2


def test_missing_jsonld_uses_job_sections():
    html = job_html().replace('<script type="application/ld+json">' + json.dumps({
        "@type": "JobPosting", "title": "Senior Software Engineer",
        "hiringOrganization": {"name": "Example"}, "description": "Build reliable services."
    }) + "</script>", "")
    cleaned = dom_cleaner_agent(state(html))["cleaned_html"]
    markdown = markdown_agent(state(html, cleaned_html=cleaned))["markdown"]
    decision = _deterministic_classification(state(html, markdown=markdown))
    assert decision.page_type == "job_detail"


@pytest.mark.parametrize(("html", "url", "expected"), [
    ("<html><h1>Open positions</h1>" + "<a>View job</a>" * 5 + "</html>", "https://example.com/jobs", "job_list"),
    ("<html><h1>Company blog</h1><p>" + "news " * 150 + "</p></html>", "https://example.com/blog", "non_job"),
    ("<html><h1>Careers</h1><p>" + "Join our team " * 80 + "</p></html>", "https://example.com/careers", "non_job"),
    ("<html><h1>Sign in</h1><p>Sign in to continue</p></html>", "https://example.com/login", "non_job"),
])
def test_non_detail_classification(html, url, expected):
    cleaned = dom_cleaner_agent(state(html, url))["cleaned_html"]
    markdown = markdown_agent(state(html, url, cleaned_html=cleaned))["markdown"]
    assert _deterministic_classification(state(html, url, markdown=markdown)).page_type == expected


def test_empty_html_requests_bounded_retry():
    decision = _deterministic_classification(state(""))
    assert decision.action == "browser_retry"
    # browser_attempts=0: no real browser fetch has happened yet, so budget
    # (max_browser_attempts defaults to 1 -- a single bounded browser
    # attempt, deliberately not retried further to keep worst-case latency
    # bounded, see browser_agent's own docstring) is still available and a
    # retry should be allowed. Previously this fixture used
    # browser_attempts=1, which is already AT the one-attempt budget, so a
    # retry is correctly refused -- that was testing the exhausted-budget
    # case while asserting the has-budget outcome.
    reviewed = state("", page_type="non_job", classification_confidence=.55, browser_attempts=0,
                     plan={"classification_action": "browser_retry"})
    from services.job_extraction.agents import classification_review_agent
    update = classification_review_agent(reviewed)
    assert update["plan"]["classification_review_action"] == "browser_retry"
    assert route_after_classification_review(reviewed.model_copy(update=update)) == "browser"


def test_tesla_style_job_sections_classify_as_job_detail_without_jsonld():
    html = """<html><head><title>Site Reliability Engineer, HPC / AI Infrastructure</title></head>
    <body><main><h1>Site Reliability Engineer, HPC / AI Infrastructure</h1>
    <p>Full-time | AI &amp; Robotics | India</p><button>Apply now</button>
    <h2>Job description</h2><h3>What to Expect</h3>
    <p>Maintain and improve high-performance computing and machine learning infrastructure.</p>
    <h3>What You'll Do</h3><p>Operate infrastructure, monitoring, Linux, networking,
    automation, deployment, alerting, and GPU compute systems for production engineering.</p>
    <h3>What You'll Bring</h3><p>Experience with reliable distributed infrastructure,
    incident response, scripting, observability, and performance tuning.</p>
    </main></body></html>"""
    cleaned = dom_cleaner_agent(state(html))["cleaned_html"]
    markdown = markdown_agent(state(html, cleaned_html=cleaned))["markdown"]
    metadata = metadata_agent(state(html, cleaned_html=cleaned))["metadata"]
    decision = _deterministic_classification(
        state(
            html,
            cleaned_html=cleaned,
            markdown=markdown,
            metadata=metadata,
            page_title=metadata["title"],
        )
    )
    assert decision.page_type == "job_detail"
    assert decision.confidence >= .9


def test_metadata_partial_and_dom_noise_cleanup():
    html = '<html lang="fr"><head><title>Role</title></head><body><nav>Noise</nav><main><h1>Role</h1></main></body></html>'
    cleaned = dom_cleaner_agent(state(html))["cleaned_html"]
    assert "Noise" not in cleaned
    meta = metadata_agent(state(html, cleaned_html=cleaned))["metadata"]
    assert meta["title"] == "Role"
    assert meta["language"] == "fr"
    assert meta["description"] is None


def test_routing_high_low_confidence_and_repair_limits():
    assert route_after_classifier(state(page_type="job_detail", classification_confidence=.9)) == "evidence_planner"
    assert route_after_classifier(state(page_type="job_detail", classification_confidence=.5)) == "classification_review"
    assert route_after_reviewer(state(is_valid=True)) == "final_response"
    assert route_after_reviewer(state(needs_repair=True, repair_attempts=0)) == "repair"
    assert route_after_reviewer(state(needs_repair=True, repair_attempts=2)) == "extraction_manual_review"


def test_stable_success_blocked_and_manual_response_shapes():
    job = {"job_title": "Engineer", "company_name": "Example", "description": "Role"}
    success_state = state(page_type="job_detail", classification_confidence=.96, extracted_job=job, is_valid=True)
    response = final_response_agent(success_state)["final_response"]
    assert response["success"] is True
    assert response["request_id"] == "test-request"
    assert response["extracted_job"]["job_title"] == "Engineer"
    assert response["job"]["title"] == "Engineer"
    manual = final_response_agent(success_state.model_copy(update={"needs_manual_review": True}))["final_response"]
    assert manual["needs_manual_review"] is True
    blocked = final_response_agent(state(blocked_reason="captcha"))["final_response"]
    assert blocked["success"] is False
    assert blocked["error"]["code"] == "PAGE_BLOCKED"


def test_sensitive_values_are_not_written_to_execution_log():
    secret = "secret-token-value"
    result = dom_cleaner_agent(state(f"<html><body>{secret}</body></html>"))
    assert secret not in json.dumps(result["execution_log"])


@pytest.mark.parametrize("url", ["file:///etc/passwd", "http://localhost/jobs/1", "http://127.0.0.1/jobs/1"])
def test_private_or_non_web_urls_are_rejected(url):
    with pytest.raises(ValueError):
        validate_public_url(url)


def test_missing_company_name_falls_back_to_page_title_and_succeeds():
    from services.job_extraction.agents import reviewer_agent, repair_agent
    extracted_job = {
        "job_title": "Python Developer",
        "company_name": None,
        "description": "Develop high performance backend Python microservices.",
        "responsibilities": ["Develop Python microservices", "Code review"],
        "requirements": ["5+ years Python"],
        "skills": ["Python"],
        "suggested_skills": ["Software Development", "Design Patterns", "Cloud Computing", "Agile Methodologies"],
    }
    s = state(
        extracted_job=extracted_job,
        extension_evidence={
            "title": "Python Developer | Remote | Crossing Hurdles",
            "company_hint": "",
            "job_title_hint": "Python Developer",
        },
        repair_attempts=1,
    )
    result = reviewer_agent(s)
    assert result["is_valid"] is True
    assert result["extracted_job"]["company_name"] == "Crossing Hurdles"

