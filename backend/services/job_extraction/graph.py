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


def _timed(name: str, node: Callable) -> Callable:
    """Wrap a graph node with duration logging. Temporary-but-cheap
    instrumentation to find which of the ~15 sequential nodes is actually
    responsible for the 45s average on /jobs/extract-url, instead of
    guessing -- only the browser fetch and the overall request were timed
    before this, nothing in between (planner/classifier/extraction/reviewer
    LLM calls included)."""
    def wrapped(value):
        started = time.perf_counter()
        result = node(value)
        duration_ms = round((time.perf_counter() - started) * 1000)
        request_id = getattr(value, "request_id", None) or (value.get("request_id") if isinstance(value, dict) else None)
        logger.info(
            "%s node=%s duration_ms=%s request_id=%s",
            LOG_PREFIX, name, duration_ms, request_id,
        )
        return result
    return wrapped


def route_after_discovery(state: JDState) -> Literal["browser", "evidence_evaluation"]:
    """Skip the Playwright fetch when the extension already captured strong
    evidence from the user's own logged-in page — a cold browser launch plus
    navigation typically costs 5-15s and is redundant when we already have a
    usable job panel or structured JobPosting JSON-LD."""
    evidence = state.extension_evidence or {}
    client_assessment = evidence.get("client_assessment") or {}
    if (
        client_assessment.get("readiness") == "NOT_READY"
        and not bool(client_assessment.get("requiresRecoveryEvaluation"))
    ):
        # The user's rendered page is authoritative here. A clearly non-job
        # browser page must not trigger an unrelated backend navigation.
        return "evidence_evaluation"
    panel_text = str(evidence.get("selected_panel_text") or "").strip()
    visible_text = str(evidence.get("visible_text") or "").strip()
    strong_panel = bool(panel_text) and len(panel_text) >= 200 and (
        bool((evidence.get("capture") or {}).get("portal_optimized_panel"))
        or _job_signal_score(panel_text) >= .35
    )
    has_job_jsonld = _job_signal_score(evidence.get("jsonld") or [], structured=True) >= .9
    client_ready = (
        client_assessment.get("readiness") in {"READY", "PARTIAL"}
        and bool(client_assessment.get("isLikelyJob"))
        and not bool(client_assessment.get("requiresRecoveryEvaluation"))
        and len(panel_text or visible_text) >= 200
    )
    if client_ready or strong_panel or has_job_jsonld:
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
    if not client_rejected_non_job and state.browser_attempts < state.max_browser_attempts and (
        (state.browser_attempts == 0 and state.extraction_readiness in {"BLOCKED", "NOT_READY"})
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
    if action == "browser_retry":
        return "browser"
    if state.page_type == "job_detail" and action != "manual_review":
        return "evidence_planner"
    return "final_response"


def route_after_reviewer(state: JDState) -> Literal["repair", "extraction_manual_review", "final_response"]:
    if state.is_valid and not state.needs_repair:
        return "final_response"
    if state.needs_repair and state.repair_attempts < state.max_repair_attempts:
        return "repair"
    return "extraction_manual_review"


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
    graph.add_edge("planner", "classifier")
    graph.add_conditional_edges("classifier", route_after_classifier)
    graph.add_conditional_edges("classification_review", route_after_classification_review)
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
    url: str, request_id: str, browser_evidence: dict[str, Any] | None = None
) -> dict[str, Any]:
    validate_public_url(url)
    initial = JDState(
        request_id=request_id,
        url=url,
        original_url=url,
        extension_evidence=browser_evidence or {},
    )
    result = get_job_intelligence_graph().invoke(initial)
    validated = JDState.model_validate(result)
    return validated.final_response
