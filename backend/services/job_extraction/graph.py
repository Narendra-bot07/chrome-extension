"""Fresh LangGraph orchestrator for job intelligence; intentionally no checkpointer."""
from __future__ import annotations

import ipaddress
import socket
from typing import Any, Literal
from urllib.parse import urlparse

from langgraph.graph import END, START, StateGraph

from services.job_extraction.agents import (
    browser_agent, classification_review_agent, classifier_agent, discovery_agent,
    dom_cleaner_agent, evidence_planner_agent, extraction_agent,
    extraction_manual_review_agent, final_response_agent, jsonld_agent,
    markdown_agent, metadata_agent, planner_agent, repair_agent, reviewer_agent,
    source_builder_agent,
)
from services.job_extraction.schemas import JDState


def route_after_browser(state: JDState) -> Literal["jsonld", "final_response"]:
    return "final_response" if state.error and state.browser_attempts >= state.max_browser_attempts else "jsonld"


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
        "discovery": discovery_agent, "browser": browser_agent, "jsonld": jsonld_agent,
        "dom_cleaner": dom_cleaner_agent, "markdown": markdown_agent,
        "metadata": metadata_agent, "planner": planner_agent, "classifier": classifier_agent,
        "classification_review": classification_review_agent,
        "evidence_planner": evidence_planner_agent, "source_builder": source_builder_agent,
        "extraction": extraction_agent, "reviewer": reviewer_agent, "repair": repair_agent,
        "extraction_manual_review": extraction_manual_review_agent,
        "final_response": final_response_agent,
    }
    for name, node in nodes.items():
        graph.add_node(name, node)
    graph.add_edge(START, "discovery")
    graph.add_edge("discovery", "browser")
    graph.add_conditional_edges("browser", route_after_browser)
    graph.add_edge("jsonld", "dom_cleaner")
    graph.add_edge("dom_cleaner", "markdown")
    graph.add_edge("markdown", "metadata")
    graph.add_edge("metadata", "planner")
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


def validate_public_url(url: str) -> None:
    """Reject non-web and private-network targets before Playwright navigation."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("A complete HTTP or HTTPS URL is required.")
    host = parsed.hostname.lower()
    if host in {"localhost", "metadata.google.internal"}:
        raise ValueError("Private network URLs are not permitted.")
    try:
        addresses = [ipaddress.ip_address(host)]
    except ValueError:
        try:
            addresses = [ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(host, None)]
        except socket.gaierror as exc:
            raise ValueError("The job page hostname could not be resolved.") from exc
    if any(ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast for ip in addresses):
        raise ValueError("Private network URLs are not permitted.")


def run_job_intelligence(url: str, request_id: str) -> dict[str, Any]:
    validate_public_url(url)
    initial = JDState(request_id=request_id, url=url, original_url=url)
    result = build_job_intelligence_graph().invoke(initial)
    validated = JDState.model_validate(result)
    return validated.final_response
