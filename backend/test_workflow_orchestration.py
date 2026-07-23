"""Regression tests for the business-agnostic workflow runtime."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from services.workflow.checkpoints import InMemoryCheckpointStore
from services.workflow.contracts import (
    NodeMetadata,
    RepairPolicy,
    RetryPolicy,
    WorkflowNode,
)
from services.workflow.engine import WorkflowEngine
from services.workflow.errors import (
    DependencyError,
    RepairableError,
    RetryableError,
    VersionConflictError,
    WorkflowValidationError,
)
from services.workflow.models import WorkflowState, WorkflowStatus
from services.workflow.registry import NodeRegistry


class OutputNode(WorkflowNode):
    def __init__(
        self,
        name: str,
        *,
        dependencies: tuple[str, ...] = (),
        output_name: str = "value",
    ) -> None:
        self.output_name = output_name
        self.metadata = NodeMetadata(
            name=name,
            version="1.0.0",
            dependencies=dependencies,
            produced_outputs=(output_name,),
        )

    def execute(self, state: WorkflowState):
        outputs = {**state.node_outputs, self.metadata.name: {self.output_name: True}}
        return {"node_outputs": outputs}


class FlakyNode(OutputNode):
    def __init__(self) -> None:
        super().__init__("flaky")
        self.calls = 0
        self.metadata = self.metadata.model_copy(
            update={"retry_policy": RetryPolicy(max_attempts=2)}
        )

    def execute(self, state: WorkflowState):
        self.calls += 1
        if self.calls == 1:
            raise RetryableError("temporary failure")
        return super().execute(state)


class AlwaysFailingNode(OutputNode):
    def __init__(self) -> None:
        super().__init__("always_fails")
        self.metadata = self.metadata.model_copy(
            update={"retry_policy": RetryPolicy(max_attempts=1)}
        )

    def execute(self, state: WorkflowState):
        raise RetryableError("still unavailable")


class RepairNode(OutputNode):
    def __init__(self) -> None:
        super().__init__("repairable")
        self.metadata = self.metadata.model_copy(
            update={
                "repair_policy": RepairPolicy(enabled=True, max_attempts=1),
            }
        )

    def execute(self, state: WorkflowState):
        raise RepairableError("output needs repair")

    def repair(self, state: WorkflowState):
        return super().execute(state)


class ConfirmationNode(WorkflowNode):
    metadata = NodeMetadata(name="confirmation", version="1.0.0")

    def execute(self, state: WorkflowState):
        return {
            "user_confirmation_required": True,
            "waiting_reason": "Approval is required to continue",
        }


class SkippedNode(OutputNode):
    def should_run(self, state: WorkflowState) -> bool:
        return False


@pytest.fixture
def runtime():
    registry = NodeRegistry()
    store = InMemoryCheckpointStore()
    return registry, store


def test_workflow_creation_and_completion(runtime):
    registry, store = runtime
    registry.register(OutputNode("first"))
    registry.register(OutputNode("second", dependencies=("first",)))
    engine = WorkflowEngine(registry, store)

    result = engine.run(engine.create_state("req-1", ["first", "second"]))

    assert result.workflow_status == WorkflowStatus.COMPLETED
    assert result.completed_nodes == ["first", "second"]
    assert result.revision == 3  # two node checkpoints plus terminal checkpoint
    assert store.latest(result.workflow_id).state.workflow_status == WorkflowStatus.COMPLETED


def test_empty_workflow_completes_safely(runtime):
    registry, store = runtime
    engine = WorkflowEngine(registry, store)
    result = engine.run(engine.create_state("req-empty", []))
    assert result.workflow_status == WorkflowStatus.COMPLETED
    assert result.completed_nodes == []


def test_registry_rejects_duplicates_and_unknown_nodes(runtime):
    registry, _ = runtime
    registry.register(OutputNode("first"))
    with pytest.raises(WorkflowValidationError):
        registry.register(OutputNode("first"))
    with pytest.raises(WorkflowValidationError):
        registry.validate_plan(["unknown"])


def test_unnecessary_node_is_skipped(runtime):
    registry, store = runtime
    registry.register(SkippedNode("optional"))
    engine = WorkflowEngine(registry, store)
    result = engine.run(engine.create_state("req-skip", ["optional"]))
    assert result.workflow_status == WorkflowStatus.COMPLETED
    assert result.skipped_nodes == ["optional"]
    assert result.completed_nodes == []


def test_dependency_validation_rejects_missing_or_misordered_dependency(runtime):
    registry, _ = runtime
    registry.register(OutputNode("first"))
    registry.register(OutputNode("second", dependencies=("first",)))
    with pytest.raises(DependencyError):
        registry.validate_plan(["second"])
    with pytest.raises(DependencyError):
        registry.validate_plan(["second", "first"])


def test_retry_is_bounded_and_recorded(runtime):
    registry, store = runtime
    node = FlakyNode()
    registry.register(node)
    result = WorkflowEngine(registry, store).run(
        WorkflowEngine(registry, store).create_state("req-retry", ["flaky"])
    )
    assert result.workflow_status == WorkflowStatus.COMPLETED
    assert result.retry_count == 1
    assert result.retry_history[0].node == "flaky"
    assert node.calls == 2


def test_retry_limit_transitions_to_failed(runtime):
    registry, store = runtime
    registry.register(AlwaysFailingNode())
    engine = WorkflowEngine(registry, store)
    result = engine.run(engine.create_state("req-fail", ["always_fails"]))
    assert result.workflow_status == WorkflowStatus.FAILED
    assert result.retry_count == 1
    assert result.failed_nodes == ["always_fails"]


def test_repair_routing_and_limit(runtime):
    registry, store = runtime
    registry.register(RepairNode())
    engine = WorkflowEngine(registry, store)
    result = engine.run(engine.create_state("req-repair", ["repairable"]))
    assert result.workflow_status == WorkflowStatus.COMPLETED
    assert result.repair_count == 1
    assert result.repair_history[-1].status == "completed"


def test_wait_for_user_then_confirm(runtime):
    registry, store = runtime
    registry.register(ConfirmationNode())
    registry.register(OutputNode("after", dependencies=("confirmation",)))
    engine = WorkflowEngine(registry, store)
    waiting = engine.run(
        engine.create_state("req-wait", ["confirmation", "after"])
    )
    assert waiting.workflow_status == WorkflowStatus.WAITING_FOR_USER
    assert waiting.user_confirmation_required is True

    completed = engine.confirm(waiting, True)
    assert completed.workflow_status == WorkflowStatus.COMPLETED
    assert completed.completed_nodes == ["confirmation", "after"]


def test_declined_confirmation_blocks_workflow(runtime):
    registry, store = runtime
    registry.register(ConfirmationNode())
    engine = WorkflowEngine(registry, store)
    waiting = engine.run(engine.create_state("req-decline", ["confirmation"]))
    blocked = engine.confirm(waiting, False)
    assert blocked.workflow_status == WorkflowStatus.BLOCKED


def test_workflow_cancellation(runtime):
    registry, store = runtime
    registry.register(ConfirmationNode())
    engine = WorkflowEngine(registry, store)
    waiting = engine.run(engine.create_state("req-cancel", ["confirmation"]))
    cancelled = engine.cancel(waiting)
    assert cancelled.workflow_status == WorkflowStatus.CANCELLED
    assert cancelled.finished_at is not None


def test_checkpoint_restore_does_not_rerun_completed_nodes(runtime):
    registry, store = runtime
    first = OutputNode("first")
    registry.register(first)
    engine = WorkflowEngine(registry, store)
    completed = engine.run(engine.create_state("req-restore", ["first"]))
    restored = engine.resume(completed.workflow_id)
    assert restored.workflow_status == WorkflowStatus.COMPLETED
    assert restored.completed_nodes == ["first"]


def test_checkpoint_optimistic_version_conflict(runtime):
    _, store = runtime
    state = WorkflowState(request_id="req-version")
    store.save(state, expected_revision=0)
    with pytest.raises(VersionConflictError):
        store.save(state, expected_revision=0)


def test_checkpoint_invalidation(runtime):
    _, store = runtime
    state = WorkflowState(request_id="req-invalidate")
    first = store.save(state, expected_revision=0)
    second = store.save(first.state, expected_revision=1)
    assert second.revision == 2
    assert store.invalidate_after(state.workflow_id, 1) == 1
    assert store.latest(state.workflow_id).revision == 1


def test_invalid_state_is_rejected_early():
    with pytest.raises(ValidationError):
        WorkflowState(
            request_id="req-invalid",
            retry_count=2,
            max_retry_count=1,
        )
    with pytest.raises(ValidationError):
        WorkflowState(
            request_id="req-invalid",
            workflow_status=WorkflowStatus.WAITING_FOR_USER,
        )


def test_node_cannot_mutate_workflow_identity(runtime):
    class IdentityMutator(OutputNode):
        def execute(self, state: WorkflowState):
            return {"workflow_id": "replacement"}

    registry, store = runtime
    registry.register(IdentityMutator("mutator"))
    engine = WorkflowEngine(registry, store)
    result = engine.run(engine.create_state("req-protected", ["mutator"]))
    assert result.workflow_status == WorkflowStatus.FAILED
    assert result.errors[-1].code == "node_execution_error"


def test_missing_declared_output_fails_validation(runtime):
    class MissingOutputNode(OutputNode):
        def execute(self, state: WorkflowState):
            return {"node_outputs": {**state.node_outputs, self.metadata.name: {}}}

    registry, store = runtime
    registry.register(MissingOutputNode("missing_output"))
    engine = WorkflowEngine(registry, store)
    result = engine.run(
        engine.create_state("req-missing-output", ["missing_output"])
    )
    assert result.workflow_status == WorkflowStatus.FAILED
    assert result.failed_nodes == ["missing_output"]
    assert result.errors[-1].code == "state_invariant_error"
