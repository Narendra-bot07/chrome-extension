"""Business-agnostic master orchestrator."""

from __future__ import annotations

from .models import (
    EventType,
    RouteOutcome,
    TimelineEvent,
    WorkflowState,
    WorkflowStatus,
    utc_now,
)
from .registry import NodeRegistry


class MasterOrchestrator:
    def __init__(self, registry: NodeRegistry) -> None:
        self.registry = registry

    def decide(self, state: WorkflowState) -> WorkflowState:
        now = utc_now()
        if state.workflow_status in {
            WorkflowStatus.FAILED,
            WorkflowStatus.COMPLETED,
            WorkflowStatus.BLOCKED,
            WorkflowStatus.CANCELLED,
        }:
            return state.model_copy(
                update={
                    "route_outcome": (
                        RouteOutcome.COMPLETE
                        if state.workflow_status == WorkflowStatus.COMPLETED
                        else RouteOutcome.STOP
                    ),
                    "current_node": None,
                    "next_node": None,
                    "updated_at": now,
                },
                deep=True,
            )
        if state.cancellation_requested:
            return state.model_copy(
                update={
                    "workflow_status": WorkflowStatus.CANCELLED,
                    "route_outcome": RouteOutcome.STOP,
                    "finished_at": now,
                    "updated_at": now,
                    "current_node": None,
                    "next_node": None,
                },
                deep=True,
            )
        if state.user_confirmation_required and state.user_confirmation is None:
            return state.model_copy(
                update={
                    "workflow_status": WorkflowStatus.WAITING_FOR_USER,
                    "route_outcome": RouteOutcome.WAIT_FOR_USER,
                    "updated_at": now,
                },
                deep=True,
            )
        if state.user_confirmation_required and state.user_confirmation is False:
            return state.model_copy(
                update={
                    "workflow_status": WorkflowStatus.BLOCKED,
                    "route_outcome": RouteOutcome.STOP,
                    "finished_at": now,
                    "updated_at": now,
                    "current_node": None,
                    "next_node": None,
                },
                deep=True,
            )

        working = state
        while True:
            processed = (
                set(working.completed_nodes)
                | set(working.failed_nodes)
                | set(working.skipped_nodes)
            )
            next_node = next(
                (
                    name
                    for name in working.requested_nodes
                    if name not in processed
                ),
                None,
            )
            if next_node is None or self.registry.get(next_node).should_run(working):
                break
            working = working.model_copy(
                update={
                    "skipped_nodes": [*working.skipped_nodes, next_node],
                    "execution_log": [
                        *working.execution_log,
                        TimelineEvent(
                            event=EventType.NODE_SKIPPED,
                            node=next_node,
                            status=WorkflowStatus.RUNNING,
                        ),
                    ],
                    "updated_at": now,
                },
                deep=True,
            )
        if next_node is None:
            return working.model_copy(
                update={
                    "workflow_status": WorkflowStatus.COMPLETED,
                    "workflow_stage": "FINISHED",
                    "route_outcome": RouteOutcome.COMPLETE,
                    "finished_at": now,
                    "updated_at": now,
                    "current_node": None,
                    "next_node": None,
                },
                deep=True,
            )
        self.registry.validate_prerequisites(next_node, working)
        return working.model_copy(
            update={
                "workflow_status": WorkflowStatus.RUNNING,
                "workflow_stage": "EXECUTING",
                "route_outcome": RouteOutcome.CONTINUE,
                "current_node": next_node,
                "next_node": next_node,
                "updated_at": now,
            },
            deep=True,
        )
