import json
from unittest.mock import patch

import pytest

from services.job_extraction.agents import (
    _deterministic_classification,
    dom_cleaner_agent,
    final_response_agent,
    jsonld_agent,
    markdown_agent,
    metadata_agent,
)
from services.job_extraction.graph import (
    route_after_classification_review,
    route_after_classifier,
    route_after_reviewer,
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
    reviewed = state("", page_type="non_job", classification_confidence=.55, browser_attempts=1,
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
