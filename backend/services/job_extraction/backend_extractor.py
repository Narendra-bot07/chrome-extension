"""Compatibility entry point for the existing JD URL endpoint."""
from services.job_extraction.graph import run_job_intelligence


def extract_job_from_url(url: str, request_id: str = "no-req-id", browser_evidence=None, user_id=None):
    return run_job_intelligence(
        url=url, request_id=request_id, browser_evidence=browser_evidence or {}, user_id=user_id
    )
