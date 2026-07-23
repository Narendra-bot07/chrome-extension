"""Versioned registry for generic workflow nodes."""

from __future__ import annotations

from .contracts import WorkflowNode
from .errors import DependencyError, WorkflowValidationError


class NodeRegistry:
    def __init__(self) -> None:
        self._nodes: dict[str, WorkflowNode] = {}

    def register(self, node: WorkflowNode) -> None:
        name = node.metadata.name
        if name in self._nodes:
            raise WorkflowValidationError(f"Node '{name}' is already registered")
        self._nodes[name] = node

    def unregister(self, name: str) -> None:
        if name not in self._nodes:
            raise WorkflowValidationError(f"Node '{name}' is not registered")
        del self._nodes[name]

    def get(self, name: str) -> WorkflowNode:
        try:
            return self._nodes[name]
        except KeyError as exc:
            raise WorkflowValidationError(f"Unknown workflow node '{name}'") from exc

    def names(self) -> tuple[str, ...]:
        return tuple(self._nodes)

    def validate_plan(self, requested_nodes: list[str]) -> None:
        unknown = [name for name in requested_nodes if name not in self._nodes]
        if unknown:
            raise WorkflowValidationError(f"Unknown workflow nodes: {unknown}")
        positions = {name: index for index, name in enumerate(requested_nodes)}
        for name in requested_nodes:
            for dependency in self.get(name).metadata.dependencies:
                if dependency not in positions:
                    raise DependencyError(
                        f"Node '{name}' requires missing dependency '{dependency}'"
                    )
                if positions[dependency] >= positions[name]:
                    raise DependencyError(
                        f"Dependency '{dependency}' must run before '{name}'"
                    )

    def validate_prerequisites(self, name: str, state: object) -> None:
        node = self.get(name)
        completed = set(getattr(state, "completed_nodes", []))
        missing = [dep for dep in node.metadata.dependencies if dep not in completed]
        if missing:
            raise DependencyError(
                f"Node '{name}' prerequisites are incomplete: {missing}"
            )
