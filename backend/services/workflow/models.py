"""Strongly typed state shared by every orchestration node."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class WorkflowStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    WAITING_FOR_USER = "WAITING_FOR_USER"
    REPAIRING = "REPAIRING"
    FAILED = "FAILED"
    COMPLETED = "COMPLETED"
    BLOCKED = "BLOCKED"
    CANCELLED = "CANCELLED"


class RouteOutcome(StrEnum):
    CONTINUE = "CONTINUE"
    RETRY = "RETRY"
    REPAIR = "REPAIR"
    WAIT_FOR_USER = "WAIT_FOR_USER"
    STOP = "STOP"
    FAIL = "FAIL"
    COMPLETE = "COMPLETE"


class EventType(StrEnum):
    WORKFLOW_STARTED = "WORKFLOW_STARTED"
    NODE_STARTED = "NODE_STARTED"
    NODE_COMPLETED = "NODE_COMPLETED"
    NODE_FAILED = "NODE_FAILED"
    NODE_SKIPPED = "NODE_SKIPPED"
    RETRY_REQUESTED = "RETRY_REQUESTED"
    REPAIR_REQUESTED = "REPAIR_REQUESTED"
    REPAIR_COMPLETED = "REPAIR_COMPLETED"
    CHECKPOINT_CREATED = "CHECKPOINT_CREATED"
    WORKFLOW_WAITING = "WORKFLOW_WAITING"
    WORKFLOW_RESUMED = "WORKFLOW_RESUMED"
    WORKFLOW_CANCELLED = "WORKFLOW_CANCELLED"
    WORKFLOW_FINISHED = "WORKFLOW_FINISHED"
    REPAIR_FAILED = "REPAIR_FAILED"
    REPAIR_LIMIT_EXCEEDED = "REPAIR_LIMIT_EXCEEDED"


class WorkflowErrorRecord(BaseModel):
    code: str
    message: str
    node: str | None = None
    timestamp: datetime = Field(default_factory=utc_now)
    retryable: bool = False
    repairable: bool = False
    details: dict[str, Any] = Field(default_factory=dict)


class RetryRecord(BaseModel):
    attempt: int = Field(ge=1)
    node: str
    timestamp: datetime = Field(default_factory=utc_now)
    reason: str


class RepairRecord(BaseModel):
    attempt: int = Field(ge=1)
    node: str
    status: str
    timestamp: datetime = Field(default_factory=utc_now)
    reason: str | None = None


class TimelineEvent(BaseModel):
    event: EventType
    timestamp: datetime = Field(default_factory=utc_now)
    node: str | None = None
    status: WorkflowStatus | None = None
    duration_ms: float | None = Field(default=None, ge=0)
    checkpoint_id: str | None = None
    message: str | None = None


class FuturePayloads(BaseModel):
    """Reserved typed slots. Their schemas will be introduced in later phases."""

    jd_intelligence: dict[str, Any] | None = None
    resume_intelligence: dict[str, Any] | None = None
    compatibility: dict[str, Any] | None = None
    ats: dict[str, Any] | None = None
    tailoring: dict[str, Any] | None = None
    extensions: dict[str, Any] = Field(default_factory=dict)


class WorkflowState(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)

    request_id: str = Field(min_length=1)
    workflow_id: str = Field(default_factory=lambda: str(uuid4()))
    owner_id: str | None = None
    workflow_stage: str = "INITIALIZED"
    workflow_status: WorkflowStatus = WorkflowStatus.PENDING
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    current_node: str | None = None
    requested_nodes: list[str] = Field(default_factory=list)
    completed_nodes: list[str] = Field(default_factory=list)
    failed_nodes: list[str] = Field(default_factory=list)
    skipped_nodes: list[str] = Field(default_factory=list)
    retry_count: int = Field(default=0, ge=0)
    max_retry_count: int = Field(default=2, ge=0)
    repair_count: int = Field(default=0, ge=0)
    max_repair_count: int = Field(default=1, ge=0)
    retry_history: list[RetryRecord] = Field(default_factory=list)
    repair_history: list[RepairRecord] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    errors: list[WorkflowErrorRecord] = Field(default_factory=list)
    user_confirmation_required: bool = False
    waiting_reason: str | None = None
    user_confirmation: bool | None = None
    execution_log: list[TimelineEvent] = Field(default_factory=list)
    execution_time_ms: float = Field(default=0, ge=0)
    graph_version: str = "1.0.0"
    workflow_version: str = "1.0.0"
    state_version: int = Field(default=1, ge=1)
    revision: int = Field(default=0, ge=0)
    last_checkpoint_id: str | None = None
    route_outcome: RouteOutcome = RouteOutcome.CONTINUE
    next_node: str | None = None
    last_successful_node: str | None = None
    cancellation_requested: bool = False
    node_outputs: dict[str, dict[str, Any]] = Field(default_factory=dict)
    future_payloads: FuturePayloads = Field(default_factory=FuturePayloads)

    @field_validator(
        "requested_nodes", "completed_nodes", "failed_nodes", "skipped_nodes"
    )
    @classmethod
    def node_names_must_be_unique(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("node collections cannot contain duplicates")
        if any(not name.strip() for name in value):
            raise ValueError("node names cannot be blank")
        return value

    @model_validator(mode="after")
    def validate_invariants(self) -> "WorkflowState":
        terminal = {
            WorkflowStatus.FAILED,
            WorkflowStatus.COMPLETED,
            WorkflowStatus.BLOCKED,
            WorkflowStatus.CANCELLED,
        }
        if self.retry_count > self.max_retry_count:
            raise ValueError("retry_count exceeds max_retry_count")
        if self.repair_count > self.max_repair_count:
            raise ValueError("repair_count exceeds max_repair_count")
        if self.workflow_status == WorkflowStatus.WAITING_FOR_USER:
            if not self.user_confirmation_required or not self.waiting_reason:
                raise ValueError("waiting workflows require confirmation and a reason")
        if self.user_confirmation_required and not self.waiting_reason:
            raise ValueError("user confirmation requires a waiting reason")
        if self.workflow_status in terminal and self.finished_at is None:
            raise ValueError("terminal workflows require finished_at")
        memberships = [
            set(self.completed_nodes),
            set(self.failed_nodes),
            set(self.skipped_nodes),
        ]
        if memberships[0] & memberships[1] or memberships[0] & memberships[2] or memberships[1] & memberships[2]:
            raise ValueError("a node cannot be completed, failed, and skipped")
        return self
