"""Structured exceptions raised by the workflow runtime."""

from __future__ import annotations

from typing import Any


class WorkflowError(Exception):
    code = "workflow_error"
    retryable = False
    repairable = False

    def __init__(self, message: str, *, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class WorkflowValidationError(WorkflowError):
    code = "validation_error"


class RetryableError(WorkflowError):
    code = "retryable_error"
    retryable = True


class RepairableError(WorkflowError):
    code = "repairable_error"
    repairable = True


class FatalWorkflowError(WorkflowError):
    code = "fatal_workflow_error"


class CheckpointError(WorkflowError):
    code = "checkpoint_error"


class StateInvariantError(WorkflowValidationError):
    code = "state_invariant_error"


class NodeExecutionError(WorkflowError):
    code = "node_execution_error"


class DependencyError(WorkflowValidationError):
    code = "dependency_error"


class VersionConflictError(CheckpointError):
    code = "version_conflict"


# Public workflow-domain name requested by the orchestration contract. The
# longer internal name avoids confusion with pydantic.ValidationError.
ValidationError = WorkflowValidationError
