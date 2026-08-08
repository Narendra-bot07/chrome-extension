"""Fresh LangGraph orchestrator for job intelligence; intentionally no checkpointer."""
from __future__ import annotations

import threading
import time
from typing import Any, Callable, Literal

from langgraph.graph import END, START, StateGraph

from core.logging import logger
from services.job_extraction.agents import (
    block_detection_agent, browser_agent, classification_review_agent, classifier_agent,
    discovery_agent, evidence_evaluation_agent,
    dom_cleaner_agent, evidence_planner_agent, extraction_agent,
    extraction_manual_review_agent, final_response_agent, jsonld_agent,
    markdown_agent, metadata_agent, planner_agent, repair_agent, reviewer_agent,
    source_builder_agent, _job_signal_score,
)
from services.job_extraction.schemas import JDState
from services.job_extraction.ssrf_guard import validate_public_url

LOG_PREFIX = "[JD-EXTRACTION][GRAPH]"
_compiled_graph = None
_compiled_graph_lock = threading.Lock()

# Request supersession: a single Uvicorn worker (see Dockerfile -- no
# --workers flag) handles every request, each running this graph on its own
# thread via asyncio.to_thread. Without this, rapidly re-triggering
# extraction (e.g. clicking through several LinkedIn job cards in a row)
# left every earlier, now-useless request running all the way to
# completion -- each still burning an LLM call that can take 30-160s+ (see
# extraction_agent/repair_agent) and, worse, still competing with the
# CURRENT request for the same scarce shared resources (the
# _MAX_CONCURRENT_AI_REQUESTS semaphore, browser_pool's single worker). Only
# the single latest request_id per user is kept; registering a new one
# implicitly supersedes whatever this user's previous request_id was.
_active_requests: dict[str, str] = {}
_active_requests_lock = threading.Lock()


class ExtractionSuperseded(Exception):
    """Raised between graph nodes once a newer request from the same user
    has started -- unwinds immediately instead of running the remaining
    (often the slowest, LLM-calling) nodes for a result nobody will read."""


def register_active_request(user_id: str | None, request_id: str) -> None:
    if not user_id:
        return
    with _active_requests_lock:
        _active_requests[user_id] = request_id


def _is_superseded(user_id: str | None, request_id: str) -> bool:
    if not user_id:
        return False
    with _active_requests_lock:
        return _active_requests.get(user_id) not in (None, request_id)


def _timed(name: str, node: Callable) -> Callable:
    """Wrap a graph node with duration logging. Temporary-but-cheap
    instrumentation to find which of the ~15 sequential nodes is actually
    responsible for the 45s average on /jobs/extract-url, instead of
    guessing -- only the browser fetch and the overall request were timed
    before this, nothing in between (planner/classifier/extraction/reviewer
    LLM calls included)."""
    def wrapped(value):
        request_id = getattr(value, "request_id", None) or (value.get("request_id") if isinstance(value, dict) else None)
        user_id = getattr(value, "user_id", None) or (value.get("user_id") if isinstance(value, dict) else None)
        if _is_superseded(user_id, request_id):
            logger.info(
                "%s node=%s request_id=%s skipped: superseded by a newer request from the same user",
                LOG_PREFIX, name, request_id,
            )
            raise ExtractionSuperseded(request_id)
        started = time.perf_counter()
        result = node(value)
        duration_ms = round((time.perf_counter() - started) * 1000)
        logger.info(
            "%s node=%s duration_ms=%s request_id=%s",
            LOG_PREFIX, name, duration_ms, request_id,
        )
        return result
    return wrapped


def _has_usable_extension_evidence(state: JDState) -> bool:
    """Whether the user's already-rendered tab can drive extraction alone.

    Backend Chromium is a recovery source, not a second opinion on DOM the
    extension can already see (including authenticated and SPA-only pages).
    """
    evidence = state.extension_evidence or {}
    evidence_url = str(evidence.get("selected_job_url") or evidence.get("url") or "").rstrip("/")
    request_url = str(state.url or "").rstrip("/")
    if evidence_url and request_url and evidence_url != request_url:
        return False
    panel = str(evidence.get("selected_panel_text") or "").strip()
    visible = str(evidence.get("visible_text") or "").strip()
    has_jsonld = _job_signal_score(evidence.get("jsonld") or [], structured=True) >= .9
    panel_is_job = len(panel) >= 200 and _job_signal_score(panel) >= .25
    page_is_job = (
        len(visible) >= 500
        and bool(str(evidence.get("job_title_hint") or "").strip())
        and _job_signal_score(visible[:50000]) >= .25
    )
    if bool(evidence.get("ats_iframe_detected")) and not has_jsonld:
        # The extension can see a cross-origin ATS iframe's `src` attribute
        # (that's not blocked by browser policy) but never its rendered
        # content -- confirmed real-world case: langchain.com/careers embeds
        # jobs.ashbyhq.com in an iframe, and the parent page's OWN generic
        # marketing copy ("About Us", mission statement) scores just high
        # enough on job_signal_score to look "usable" and skip the backend
        # Playwright fetch entirely. Only a real browser fetch can resolve
        # the iframe (see _find_ats_iframe_url), so unless JSON-LD already
        # proves the parent page itself carries the full job data, force it.
        return False
    return has_jsonld or panel_is_job or page_is_job


def route_after_discovery(state: JDState) -> Literal["browser", "evidence_evaluation"]:
    """Skip the Playwright fetch when the extension already captured strong
    evidence from the user's own logged-in page — a cold browser launch plus
    navigation typically costs 5-15s and is redundant when we already have a
    usable job panel or structured JobPosting JSON-LD."""
    evidence = state.extension_evidence or {}
    has_job_jsonld = _job_signal_score(evidence.get("jsonld") or [], structured=True) >= .9
    if bool(evidence.get("ats_iframe_detected")) and not has_job_jsonld:
        # A detected cross-origin ATS iframe (langchain.com/careers embedding
        # jobs.ashbyhq.com is the confirmed real-world case) means whatever
        # text the extension captured is the PARENT page's own generic
        # marketing copy, not the job -- it can still be long/keyword-rich
        # enough to pass every other check below. Only a real browser fetch
        # can resolve the iframe (see _find_ats_iframe_url), so route there
        # unconditionally unless JSON-LD already proves the parent page
        # itself carries the full job data.
        return "browser"
    client_assessment = evidence.get("client_assessment") or {}
    panel_text = str(evidence.get("selected_panel_text") or "").strip()
    visible_text = str(evidence.get("visible_text") or "").strip()
    strong_panel = bool(panel_text) and len(panel_text) >= 200 and (
        bool((evidence.get("capture") or {}).get("portal_optimized_panel"))
        or _job_signal_score(panel_text) >= .35
    )
    client_ready = (
        client_assessment.get("readiness") in {"READY", "PARTIAL"}
        and bool(client_assessment.get("isLikelyJob"))
        and not bool(client_assessment.get("requiresRecoveryEvaluation"))
        and len(panel_text or visible_text) >= 200
    )
    captured_length = max(
        len(str(evidence.get("selected_panel_text") or "").strip()),
        len(str(evidence.get("visible_text") or "").strip()),
        len(str(evidence.get("html") or "").strip()),
    )
    if captured_length >= 200 or client_ready or strong_panel or has_job_jsonld or _has_usable_extension_evidence(state):
        return "evidence_evaluation"
    return "browser"


def route_after_evidence(state: JDState) -> Literal["browser", "jsonld", "final_response"]:
    # If we skipped the Playwright fetch (browser_attempts == 0) and the
    # extension evidence alone turned out insufficient, fall back to a real
    # browser fetch once rather than failing outright. Also retry when the
    # Playwright fetch itself failed (navigation timeout, launch error, etc.)
    # and attempts remain — a single timeout on a slow-loading portal (e.g.
    # amazon.jobs) previously failed the whole extraction on the first try
    # even though max_browser_attempts budgets for a second one.
    client_assessment = (state.extension_evidence or {}).get("client_assessment") or {}
    client_rejected_non_job = (
        client_assessment.get("readiness") == "NOT_READY"
        and not bool(client_assessment.get("requiresRecoveryEvaluation"))
    )
    # A genuinely detected restriction (captcha, access-denied, employee-only,
    # rate-limited, etc.) will still be there on a second fetch -- retrying
    # the browser just burns the extra attempt for the same result. Only
    # "network_failure" (a transient navigation timeout/launch error, not a
    # page-level block) or plain insufficient evidence are worth a retry.
    non_transient_restriction = any(
        (info or {}).get("restriction_type") not in (None, "network_failure")
        for info in (state.source_restrictions or {}).values()
    )
    if (
        not client_rejected_non_job
        and not non_transient_restriction
        and not _has_usable_extension_evidence(state)
        and state.browser_attempts < state.max_browser_attempts
        and (state.browser_attempts == 0 and state.extraction_readiness in {"BLOCKED", "NOT_READY"})
    ):
        return "browser"
    if state.error or state.extraction_readiness in {"BLOCKED", "NOT_READY", "MANUAL_REVIEW"}:
        return "final_response"
    return "jsonld"


def route_after_block_detection(state: JDState) -> Literal["planner", "final_response"]:
    return "final_response" if state.extraction_readiness == "MANUAL_REVIEW" else "planner"


def route_after_classifier(state: JDState) -> Literal["classification_review", "evidence_planner", "final_response"]:
    if state.page_type != "job_detail" and state.classification_confidence >= .65:
        return "final_response"
    if state.classification_confidence < .65:
        return "classification_review"
    return "evidence_planner"


def route_after_classification_review(state: JDState) -> Literal["browser", "evidence_planner", "final_response"]:
    action = state.plan.get("classification_review_action")
    if action == "browser_retry" and not _has_usable_extension_evidence(state):
        return "browser"
    if (state.page_type == "job_detail" or _has_usable_extension_evidence(state)) and action != "manual_review":
        return "evidence_planner"
    return "final_response"


def route_after_reviewer(state: JDState) -> Literal["repair", "extraction_manual_review", "final_response"]:
    # Each semantic worker already owns one targeted retry. Never rerun all
    # successful fields through a giant-schema repair call.
    return "final_response" if state.extracted_job else "extraction_manual_review"


def build_job_intelligence_graph():
    graph = StateGraph(JDState)
    nodes = {
        "discovery": discovery_agent, "browser": browser_agent,
        "evidence_evaluation": evidence_evaluation_agent, "jsonld": jsonld_agent,
        "dom_cleaner": dom_cleaner_agent, "markdown": markdown_agent,
        "metadata": metadata_agent, "block_detection": block_detection_agent,
        "planner": planner_agent, "classifier": classifier_agent,
        "classification_review": classification_review_agent,
        "evidence_planner": evidence_planner_agent, "source_builder": source_builder_agent,
        "extraction": extraction_agent, "reviewer": reviewer_agent, "repair": repair_agent,
        "extraction_manual_review": extraction_manual_review_agent,
        "final_response": final_response_agent,
    }
    for name, node in nodes.items():
        graph.add_node(name, _timed(name, node))
    graph.add_edge(START, "discovery")
    graph.add_conditional_edges("discovery", route_after_discovery)
    graph.add_edge("browser", "evidence_evaluation")
    graph.add_conditional_edges("evidence_evaluation", route_after_evidence)
    graph.add_edge("jsonld", "dom_cleaner")
    graph.add_edge("dom_cleaner", "markdown")
    graph.add_edge("markdown", "metadata")
    graph.add_edge("metadata", "block_detection")
    graph.add_conditional_edges("block_detection", route_after_block_detection)
    # Once evidence evaluation has selected a coherent rendered job source,
    # send the complete cleansed Markdown to the extraction LLM. The former
    # regex classifier could contradict that decision and route real Disney,
    # LinkedIn, or JPMC postings into browser/manual-review detours.
    graph.add_edge("planner", "evidence_planner")
    graph.add_edge("evidence_planner", "source_builder")
    graph.add_edge("source_builder", "extraction")
    graph.add_edge("extraction", "reviewer")
    graph.add_conditional_edges("reviewer", route_after_reviewer)
    graph.add_edge("repair", "reviewer")
    graph.add_edge("extraction_manual_review", "final_response")
    graph.add_edge("final_response", END)
    return graph.compile()


def get_job_intelligence_graph():
    """Compile the stable graph once rather than rebuilding it per JD."""
    global _compiled_graph
    if _compiled_graph is None:
        with _compiled_graph_lock:
            if _compiled_graph is None:
                _compiled_graph = build_job_intelligence_graph()
    return _compiled_graph


def run_job_intelligence(
    url: str, request_id: str, browser_evidence: dict[str, Any] | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    validate_public_url(url)
    initial = JDState(
        request_id=request_id,
        url=url,
        original_url=url,
        extension_evidence=browser_evidence or {},
        user_id=user_id,
    )
    try:
        result = get_job_intelligence_graph().invoke(initial)
    except ExtractionSuperseded:
        # Not a failure -- caught here (rather than left to propagate to
        # api/v1/jobs.py's generic exception handler) so it comes back as an
        # ordinary, quiet response instead of a 500 with a scary stack trace
        # for something that was always expected to happen.
        logger.info(
            "%s request_id=%s superseded by a newer request from the same user; stopped early",
            LOG_PREFIX, request_id,
        )
        return {
            "success": False, "status": "superseded", "request_id": request_id,
            "page_type": None, "extracted_job": None,
            "error": {
                "code": "SUPERSEDED_BY_NEWER_REQUEST",
                "message": "A newer extraction request from the same session took priority.",
            },
        }
    validated = JDState.model_validate(result)
    return validated.final_response
