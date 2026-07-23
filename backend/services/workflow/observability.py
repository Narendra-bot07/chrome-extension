"""Safe structured workflow logging."""

from __future__ import annotations

import json
from typing import Any

from core.logging import logger

from .models import WorkflowState


def log_workflow_event(
    state: WorkflowState,
    *,
    event: str,
    node: str | None = None,
    duration_ms: float | None = None,
    checkpoint_id: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    record = {
        "event": event,
        "request_id": state.request_id,
        "workflow_id": state.workflow_id,
        "node": node,
        "status": state.workflow_status.value,
        "duration_ms": round(duration_ms, 2) if duration_ms is not None else None,
        "retry_count": state.retry_count,
        "repair_count": state.repair_count,
        "warning_count": len(state.warnings),
        "error_codes": [item.code for item in state.errors],
        "checkpoint_id": checkpoint_id or state.last_checkpoint_id,
        "graph_version": state.graph_version,
        "workflow_version": state.workflow_version,
        "state_version": state.state_version,
        **(extra or {}),
    }
    logger.info("[WORKFLOW] %s", json.dumps(record, default=str, separators=(",", ":")))
