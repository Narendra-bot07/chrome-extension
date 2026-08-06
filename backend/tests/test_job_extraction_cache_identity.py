from api.v1.jobs import _is_disallowed_extraction_target, _job_extraction_cache_key


def test_spa_rendered_jobs_with_same_url_have_distinct_cache_keys():
    url = "https://jobs.example.com/careers?pid=old"
    first = _job_extraction_cache_key(url, {
        "job_title_hint": "Software Engineer",
        "capture": {"dom_fingerprint": "aaa111"},
    })
    second = _job_extraction_cache_key(url, {
        "job_title_hint": "Mechanical Data and PLM Specialist",
        "capture": {"dom_fingerprint": "bbb222"},
    })

    assert first != second


def test_same_rendered_job_keeps_stable_cache_key():
    evidence = {
        "job_title_hint": "Mechanical Data and PLM Specialist",
        "capture": {"dom_fingerprint": "bbb222"},
    }
    assert _job_extraction_cache_key("https://jobs.example.com/careers", evidence) == (
        _job_extraction_cache_key("https://jobs.example.com/careers/", evidence)
    )


def test_browser_store_console_is_not_an_extraction_target():
    assert _is_disallowed_extraction_target(
        "https://chrome.google.com/webstore/devconsole/account"
    )
    assert not _is_disallowed_extraction_target("https://example.com/jobs/123")
