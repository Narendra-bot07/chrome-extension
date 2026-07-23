"""Deterministic LangGraph shell for registered workflow nodes."""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from typing import Any, Literal

from langgraph.graph import END, START, StateGraph

from .checkpoints import CheckpointStore
from .config import WorkflowSettings, workflow_settings
from .errors import (
    BlockedWorkflowError,
    FatalWorkflowError,
    NodeExecutionError,
    RepairableError,
    RetryableError,
    WorkflowError,
)
from .models import (
    EventType,
    RepairRecord,
    RetryRecord,
    RouteOutcome,
    TimelineEvent,
    WorkflowErrorRecord,
    WorkflowState,
    WorkflowStatus,
    utc_now,
)
from .observability import log_workflow_event
from .orchestrator import MasterOrchestrator
from .registry import NodeRegistry
from .validation import StateValidator


class WorkflowEngine:
    def __init__(
        self,
        registry: NodeRegistry,
        checkpoint_store: CheckpointStore,
        settings: WorkflowSettings | None = None,
    ) -> None:
        self.registry = registry
        self.checkpoint_store = checkpoint_store
        self.settings = settings or workflow_settings
        self.orchestrator = MasterOrchestrator(registry)
        self.validator = StateValidator(
            registry,
            graph_version=self.settings.graph_version,
            workflow_version=self.settings.workflow_version,
            state_version=self.settings.state_version,
        )
        self.graph = self._build_graph()

    def create_state(
        self,
        request_id: str,
        requested_nodes: list[str],
        *,
        owner_id: str | None = None,
    ) -> WorkflowState:
        self.registry.validate_plan(requested_nodes)
        now = utc_now()
        state = WorkflowState(
            request_id=request_id,
            owner_id=owner_id,
            requested_nodes=requested_nodes,
            max_retry_count=self.settings.default_max_retries,
            max_repair_count=self.settings.default_max_repairs,
            graph_version=self.settings.graph_version,
            workflow_version=self.settings.workflow_version,
            state_version=self.settings.state_version,
            started_at=now,
            execution_log=[
                TimelineEvent(
                    event=EventType.WORKFLOW_STARTED,
                    status=WorkflowStatus.PENDING,
                )
            ],
        )
        return self.validator.validate(state)

    def run(self, state: WorkflowState) -> WorkflowState:
        validated = self.validator.validate(state)
        recursion_limit = max(
            50,
            len(validated.requested_nodes) * 6
            + validated.max_retry_count * 2
            + validated.max_repair_count * 2
            + 10,
        )
        result = self.graph.invoke(
            validated, config={"recursion_limit": recursion_limit}
        )
        return self.validator.validate(result)

    def resume(
        self, workflow_id: str, checkpoint_id: str | None = None
    ) -> WorkflowState:
        checkpoint = (
            self.checkpoint_store.get(workflow_id, checkpoint_id)
            if checkpoint_id
            else self.checkpoint_store.latest(workflow_id)
        )
        if checkpoint is None:
            raise FatalWorkflowError("Workflow checkpoint was not found")
        state = self.validator.validate(checkpoint.state)
        if state.workflow_status == WorkflowStatus.CANCELLED:
            raise FatalWorkflowError("Cancelled workflows cannot be resumed")
        resumed = state.model_copy(
            update={
                "workflow_status": WorkflowStatus.RUNNING,
                "finished_at": None,
                "route_outcome": RouteOutcome.CONTINUE,
                "updated_at": utc_now(),
                "execution_log": [
                    *state.execution_log,
                    TimelineEvent(
                        event=EventType.WORKFLOW_RESUMED,
                        status=WorkflowStatus.RUNNING,
                        checkpoint_id=checkpoint.checkpoint_id,
                    ),
                ],
            },
            deep=True,
        )
        return self.run(resumed)

    def confirm(self, state: WorkflowState, confirmed: bool) -> WorkflowState:
        if state.workflow_status != WorkflowStatus.WAITING_FOR_USER:
            raise FatalWorkflowError("Workflow is not waiting for user confirmation")
        updated = state.model_copy(
            update={"user_confirmation": confirmed, "updated_at": utc_now()}, deep=True
        )
        return self.run(updated)

    def cancel(self, state: WorkflowState) -> WorkflowState:
        if state.workflow_status in {
            WorkflowStatus.COMPLETED,
            WorkflowStatus.FAILED,
            WorkflowStatus.CANCELLED,
        }:
            return state
        return self.run(
            state.model_copy(
                update={"cancellation_requested": True, "updated_at": utc_now()},
                deep=True,
            )
        )

    def restart_from_checkpoint(
        self, workflow_id: str, checkpoint_id: str
    ) -> WorkflowState:
        checkpoint = self.checkpoint_store.get(workflow_id, checkpoint_id)
        if checkpoint is None:
            raise FatalWorkflowError("Workflow checkpoint was not found")
        self.checkpoint_store.invalidate_after(workflow_id, checkpoint.revision)
        return self.resume(workflow_id, checkpoint_id)

    def _build_graph(self):
        graph = StateGraph(WorkflowState)
        graph.add_node("validate_workflow", self._validate_node)
        graph.add_node("master_orchestrator", self._orchestrate_node)
        graph.add_node("execute_next", self._execute_node)
        graph.add_node("repair_current", self._repair_node)
        graph.add_node("validate_output", self._validate_output_node)
        graph.add_node("checkpoint", self._checkpoint_node)
        graph.add_node("finish", self._finish_node)
        graph.add_edge(START, "validate_workflow")
        graph.add_edge("validate_workflow", "master_orchestrator")
        graph.add_conditional_edges(
            "master_orchestrator",
            self._route_orchestrator,
            {"execute": "execute_next", "finish": "finish"},
        )
        graph.add_conditional_edges(
            "execute_next",
            self._route_execution,
            {
                "validate": "validate_output",
                "retry": "execute_next",
                "repair": "repair_current",
                "finish": "finish",
            },
        )
        graph.add_conditional_edges(
            "repair_current",
            self._route_execution,
            {
                "validate": "validate_output",
                "retry": "execute_next",
                "repair": "repair_current",
                "finish": "finish",
            },
        )
        graph.add_conditional_edges(
            "validate_output",
            self._route_validation,
            {
                "checkpoint": "checkpoint",
                "orchestrate": "master_orchestrator",
                "finish": "finish",
            },
        )
        graph.add_edge("checkpoint", "master_orchestrator")
        graph.add_edge("finish", END)
        return graph.compile()

    def _validate_node(self, state: WorkflowState) -> WorkflowState:
        return self.validator.validate(state)

    def _orchestrate_node(self, state: WorkflowState) -> WorkflowState:
        try:
            return self.validator.validate(self.orchestrator.decide(state))
        except WorkflowError as exc:
            return self._terminal_error(state, exc)

    def _execute_node(self, state: WorkflowState) -> WorkflowState:
        node_name = state.current_node
        if not node_name:
            return self._terminal_error(
                state, NodeExecutionError("No current node is selected")
            )
        self.registry.validate_prerequisites(node_name, state)
        node = self.registry.get(node_name)
        started = time.perf_counter()
        running = self._append_event(
            state,
            TimelineEvent(
                event=EventType.NODE_STARTED,
                node=node_name,
                status=WorkflowStatus.RUNNING,
            ),
        )
        try:
            timeout = node.metadata.timeout_seconds or self.settings.node_timeout_seconds
            pool = ThreadPoolExecutor(max_workers=1)
            future = pool.submit(node.execute, running.model_copy(deep=True))
            try:
                result = future.result(timeout=timeout)
            finally:
                pool.shutdown(wait=False, cancel_futures=True)
            updated = self._apply_result(running, result)
            duration = (time.perf_counter() - started) * 1000
            completed = list(updated.completed_nodes)
            if not updated.user_confirmation_required and node_name not in completed:
                completed.append(node_name)
            updated = updated.model_copy(
                update={
                    "completed_nodes": completed,
                    "last_successful_node": (
                        node_name
                        if not updated.user_confirmation_required
                        else state.last_successful_node
                    ),
                    "route_outcome": RouteOutcome.CONTINUE,
                    "updated_at": utc_now(),
                    "execution_time_ms": updated.execution_time_ms + duration,
                },
                deep=True,
            )
            updated = self._append_event(
                updated,
                TimelineEvent(
                    event=EventType.NODE_COMPLETED,
                    node=node_name,
                    status=WorkflowStatus.RUNNING,
                    duration_ms=duration,
                ),
            )
            log_workflow_event(
                updated, event="node_completed", node=node_name, duration_ms=duration
            )
            return updated
        except FutureTimeoutError:
            return self._handle_node_error(
                running,
                RetryableError(f"Node '{node_name}' exceeded its timeout"),
                node_name,
                started,
            )
        except Exception as exc:
            error = exc if isinstance(exc, WorkflowError) else NodeExecutionError(str(exc))
            return self._handle_node_error(running, error, node_name, started)

    def _repair_node(self, state: WorkflowState) -> WorkflowState:
        node_name = state.current_node
        if not node_name:
            return self._terminal_error(
                state, NodeExecutionError("No node is available for repair")
            )
        node = self.registry.get(node_name)
        attempt = state.repair_count + 1
        repairing = state.model_copy(
            update={
                "workflow_status": WorkflowStatus.REPAIRING,
                "repair_count": attempt,
                "repair_history": [
                    *state.repair_history,
                    RepairRecord(
                        attempt=attempt,
                        node=node_name,
                        status="requested",
                        reason=state.errors[-1].message if state.errors else None,
                    ),
                ],
                "route_outcome": RouteOutcome.CONTINUE,
                "updated_at": utc_now(),
            },
            deep=True,
        )
        try:
            result = node.repair(repairing.model_copy(deep=True))
            updated = self._apply_result(repairing, result)
            completed = list(updated.completed_nodes)
            if node_name not in completed:
                completed.append(node_name)
            return self._append_event(
                updated.model_copy(
                    update={
                        "workflow_status": WorkflowStatus.RUNNING,
                        "completed_nodes": completed,
                        "last_successful_node": node_name,
                        "route_outcome": RouteOutcome.CONTINUE,
                        "repair_history": [
                            *repairing.repair_history[:-1],
                            repairing.repair_history[-1].model_copy(
                                update={"status": "completed"}
                            ),
                        ],
                        "updated_at": utc_now(),
                    },
                    deep=True,
                ),
                TimelineEvent(
                    event=EventType.REPAIR_COMPLETED,
                    node=node_name,
                    status=WorkflowStatus.RUNNING,
                ),
            )
        except Exception as exc:
            error = exc if isinstance(exc, WorkflowError) else NodeExecutionError(str(exc))
            return self._handle_node_error(repairing, error, node_name, time.perf_counter())

    def _validate_output_node(self, state: WorkflowState) -> WorkflowState:
        try:
            validated = self.validator.validate(state)
            if validated.last_successful_node:
                self.validator.validate_node_output(
                    validated.last_successful_node, validated
                )
            return validated
        except WorkflowError as exc:
            return self._terminal_error(state, exc)

    def _checkpoint_node(self, state: WorkflowState) -> WorkflowState:
        validated = self.validator.validate(state)
        checkpoint = self.checkpoint_store.save(
            validated, expected_revision=validated.revision
        )
        updated = checkpoint.state.model_copy(
            update={
                "execution_log": [
                    *checkpoint.state.execution_log,
                    TimelineEvent(
                        event=EventType.CHECKPOINT_CREATED,
                        node=checkpoint.node_name,
                        status=checkpoint.state.workflow_status,
                        checkpoint_id=checkpoint.checkpoint_id,
                    ),
                ]
            },
            deep=True,
        )
        log_workflow_event(
            updated,
            event="checkpoint_created",
            node=checkpoint.node_name,
            checkpoint_id=checkpoint.checkpoint_id,
        )
        return updated

    def _finish_node(self, state: WorkflowState) -> WorkflowState:
        event = (
            EventType.WORKFLOW_CANCELLED
            if state.workflow_status == WorkflowStatus.CANCELLED
            else EventType.WORKFLOW_FINISHED
        )
        updated = self._append_event(
            state,
            TimelineEvent(event=event, status=state.workflow_status),
        )
        checkpoint = self.checkpoint_store.save(
            updated, expected_revision=updated.revision
        )
        updated = checkpoint.state
        log_workflow_event(updated, event=event.value.lower())
        return updated

    @staticmethod
    def _route_orchestrator(state: WorkflowState) -> Literal["execute", "finish"]:
        return (
            "execute"
            if state.route_outcome == RouteOutcome.CONTINUE and state.current_node
            else "finish"
        )

    @staticmethod
    def _route_execution(
        state: WorkflowState,
    ) -> Literal["validate", "retry", "repair", "finish"]:
        return {
            RouteOutcome.CONTINUE: "validate",
            RouteOutcome.RETRY: "retry",
            RouteOutcome.REPAIR: "repair",
        }.get(state.route_outcome, "finish")

    def _route_validation(
        self, state: WorkflowState
    ) -> Literal["checkpoint", "orchestrate", "finish"]:
        if state.workflow_status == WorkflowStatus.FAILED:
            return "finish"
        if not self.settings.checkpoint_every_successful_node:
            return "orchestrate"
        if len(state.completed_nodes) % self.settings.checkpoint_interval:
            return "orchestrate"
        return "checkpoint"

    @staticmethod
    def _apply_result(
        state: WorkflowState, result: WorkflowState | dict[str, Any]
    ) -> WorkflowState:
        if isinstance(result, WorkflowState):
            protected_values = {
                "request_id": state.request_id,
                "workflow_id": state.workflow_id,
                "owner_id": state.owner_id,
                "created_at": state.created_at,
                "graph_version": state.graph_version,
                "workflow_version": state.workflow_version,
                "state_version": state.state_version,
                "revision": state.revision,
            }
            if any(getattr(result, key) != value for key, value in protected_values.items()):
                raise NodeExecutionError("A node cannot replace protected workflow state")
            return result
        if not isinstance(result, dict):
            raise NodeExecutionError("Node must return WorkflowState or a state patch")
        protected = {
            "request_id",
            "workflow_id",
            "owner_id",
            "created_at",
            "graph_version",
            "workflow_version",
            "state_version",
            "revision",
            "workflow_status",
            "current_node",
            "next_node",
            "completed_nodes",
            "failed_nodes",
            "skipped_nodes",
            "retry_count",
            "repair_count",
            "retry_history",
            "repair_history",
            "errors",
            "execution_log",
            "execution_time_ms",
            "last_checkpoint_id",
            "route_outcome",
            "last_successful_node",
            "cancellation_requested",
        }
        if protected & set(result):
            raise NodeExecutionError("Node attempted to mutate protected workflow fields")
        return WorkflowState.model_validate(
            {**state.model_dump(), **result, "updated_at": utc_now()}
        )

    def _handle_node_error(
        self,
        state: WorkflowState,
        error: WorkflowError,
        node_name: str,
        started: float,
    ) -> WorkflowState:
        duration = max(0, (time.perf_counter() - started) * 1000)
        record = WorkflowErrorRecord(
            code=error.code,
            message=error.message,
            node=node_name,
            retryable=error.retryable,
            repairable=error.repairable,
            details=error.details,
        )
        node = self.registry.get(node_name)
        if isinstance(error, BlockedWorkflowError):
            outcome = RouteOutcome.STOP
            status = WorkflowStatus.BLOCKED
            retry_history = state.retry_history
        elif (
            error.retryable
            and state.retry_count < min(
                state.max_retry_count, node.metadata.retry_policy.max_attempts
            )
        ):
            count = state.retry_count + 1
            outcome = RouteOutcome.RETRY
            status = WorkflowStatus.RUNNING
            retry_history = [
                *state.retry_history,
                RetryRecord(
                    attempt=count, node=node_name, reason=error.message
                ),
            ]
        elif (
            error.repairable
            and node.metadata.repair_policy.enabled
            and state.repair_count < min(
                state.max_repair_count, node.metadata.repair_policy.max_attempts
            )
        ):
            outcome = RouteOutcome.REPAIR
            status = WorkflowStatus.REPAIRING
            retry_history = state.retry_history
        else:
            outcome = RouteOutcome.FAIL
            status = WorkflowStatus.FAILED
            retry_history = state.retry_history
        failed_nodes = list(state.failed_nodes)
        if status in {WorkflowStatus.FAILED, WorkflowStatus.BLOCKED} and node_name not in failed_nodes:
            failed_nodes.append(node_name)
        updated = state.model_copy(
            update={
                "workflow_status": status,
                "route_outcome": outcome,
                "retry_count": state.retry_count + (1 if outcome == RouteOutcome.RETRY else 0),
                "retry_history": retry_history,
                "errors": [*state.errors, record],
                "failed_nodes": failed_nodes,
                "finished_at": (
                    utc_now()
                    if status in {WorkflowStatus.FAILED, WorkflowStatus.BLOCKED}
                    else None
                ),
                "updated_at": utc_now(),
                "execution_time_ms": state.execution_time_ms + duration,
            },
            deep=True,
        )
        return self._append_event(
            updated,
            TimelineEvent(
                event=EventType.NODE_FAILED,
                node=node_name,
                status=status,
                duration_ms=duration,
                message=error.code,
            ),
        )

    def _terminal_error(
        self, state: WorkflowState, error: WorkflowError
    ) -> WorkflowState:
        failed_nodes = list(state.failed_nodes)
        completed_nodes = list(state.completed_nodes)
        if state.current_node:
            completed_nodes = [
                name for name in completed_nodes if name != state.current_node
            ]
            if state.current_node not in failed_nodes:
                failed_nodes.append(state.current_node)
        blocked = isinstance(error, BlockedWorkflowError)
        return state.model_copy(
            update={
                "workflow_status": (
                    WorkflowStatus.BLOCKED if blocked else WorkflowStatus.FAILED
                ),
                "route_outcome": RouteOutcome.STOP if blocked else RouteOutcome.FAIL,
                "finished_at": utc_now(),
                "updated_at": utc_now(),
                "errors": [
                    *state.errors,
                    WorkflowErrorRecord(
                        code=error.code,
                        message=error.message,
                        node=state.current_node,
                        retryable=error.retryable,
                        repairable=error.repairable,
                        details=error.details,
                    ),
                ],
                "completed_nodes": completed_nodes,
                "failed_nodes": failed_nodes,
            },
            deep=True,
        )

    @staticmethod
    def _append_event(state: WorkflowState, event: TimelineEvent) -> WorkflowState:
        return state.model_copy(
            update={"execution_log": [*state.execution_log, event]}, deep=True
        )
