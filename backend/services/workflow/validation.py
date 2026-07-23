"""State and node-output invariant validation."""

from __future__ import annotations

from pydantic import ValidationError as PydanticValidationError

from .errors import StateInvariantError
from .models import WorkflowState
from .registry import NodeRegistry


class StateValidator:
    def __init__(
        self,
        registry: NodeRegistry,
        *,
        graph_version: str,
        workflow_version: str,
        state_version: int,
    ) -> None:
        self.registry = registry
        self.graph_version = graph_version
        self.workflow_version = workflow_version
        self.state_version = state_version

    def validate(self, state: WorkflowState | dict) -> WorkflowState:
        try:
            validated = WorkflowState.model_validate(state)
        except PydanticValidationError as exc:
            raise StateInvariantError(
                "Workflow state failed schema validation",
                details={"errors": exc.errors(include_input=False)},
            ) from exc
        if validated.graph_version != self.graph_version:
            raise StateInvariantError("Unsupported graph version")
        if validated.workflow_version != self.workflow_version:
            raise StateInvariantError("Unsupported workflow version")
        if validated.state_version != self.state_version:
            raise StateInvariantError("Unsupported state version")
        self.registry.validate_plan(validated.requested_nodes)
        known = set(validated.requested_nodes)
        referenced = (
            set(validated.completed_nodes)
            | set(validated.failed_nodes)
            | set(validated.skipped_nodes)
        )
        if not referenced <= known:
            raise StateInvariantError("State references nodes outside its execution plan")
        if validated.current_node and validated.current_node not in known:
            raise StateInvariantError("current_node is outside the execution plan")
        return validated

    def validate_node_output(self, node_name: str, state: WorkflowState) -> None:
        node = self.registry.get(node_name)
        expected = set(node.metadata.produced_outputs)
        actual = set(state.node_outputs.get(node_name, {}))
        missing = expected - actual
        if missing:
            raise StateInvariantError(
                f"Node '{node_name}' did not produce declared outputs",
                details={"missing_outputs": sorted(missing)},
            )
