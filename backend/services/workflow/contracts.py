"""Common contract implemented by every future workflow node."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field

from .models import WorkflowState


class RetryPolicy(BaseModel):
    max_attempts: int = Field(default=2, ge=0)
    retryable_error_codes: set[str] = Field(default_factory=lambda: {"retryable_error"})


class RepairPolicy(BaseModel):
    enabled: bool = False
    max_attempts: int = Field(default=1, ge=0)
    repairable_error_codes: set[str] = Field(default_factory=lambda: {"repairable_error"})


class NodeMetadata(BaseModel):
    name: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    dependencies: tuple[str, ...] = ()
    supported_inputs: tuple[str, ...] = ()
    produced_outputs: tuple[str, ...] = ()
    retry_policy: RetryPolicy = Field(default_factory=RetryPolicy)
    repair_policy: RepairPolicy = Field(default_factory=RepairPolicy)
    timeout_seconds: float | None = Field(default=None, gt=0)


class WorkflowNode(ABC):
    metadata: NodeMetadata

    @abstractmethod
    def execute(self, state: WorkflowState) -> WorkflowState | dict[str, Any]:
        """Return a new state or an explicit state patch."""

    def repair(self, state: WorkflowState) -> WorkflowState | dict[str, Any]:
        raise NotImplementedError(f"{self.metadata.name} does not implement repair")

    def should_run(self, state: WorkflowState) -> bool:
        """Allow a node to be skipped without putting business logic in the orchestrator."""
        return True
