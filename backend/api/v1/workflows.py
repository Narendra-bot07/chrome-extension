"""Generic workflow lifecycle endpoints."""

from contextlib import nullcontext
from fastapi import APIRouter, Depends, HTTPException, status

from core.database import get_db_connection
from core.security import verify_supabase_jwt
from schemas.workflows import (
    WorkflowConfirmationRequest,
    WorkflowCreateRequest,
    WorkflowResponse,
)
from services.workflow.errors import WorkflowError
from services.workflow.runtime import build_workflow_engine

router = APIRouter(prefix="/workflows", tags=["workflows"])


def _raise_http(exc: WorkflowError) -> None:
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": exc.code, "message": exc.message, "details": exc.details},
    ) from exc


@router.post("/", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
def create_workflow(
    payload: WorkflowCreateRequest,
    user=Depends(verify_supabase_jwt),
    connection=Depends(get_db_connection),
):
    # PostgresCheckpointStore now takes a connection factory rather than a
    # raw connection (see services/workflow/checkpoints.py); these routes
    # weren't part of this pass's connection-lifetime fix, so just wrap the
    # existing request-scoped connection to preserve current behavior exactly.
    engine = build_workflow_engine(lambda: nullcontext(connection), owner_id=user["id"])
    try:
        state = engine.create_state(
            payload.request_id, payload.requested_nodes, owner_id=user["id"]
        )
        return WorkflowResponse(workflow=engine.run(state))
    except WorkflowError as exc:
        _raise_http(exc)


@router.get("/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(
    workflow_id: str,
    user=Depends(verify_supabase_jwt),
    connection=Depends(get_db_connection),
):
    # PostgresCheckpointStore now takes a connection factory rather than a
    # raw connection (see services/workflow/checkpoints.py); these routes
    # weren't part of this pass's connection-lifetime fix, so just wrap the
    # existing request-scoped connection to preserve current behavior exactly.
    engine = build_workflow_engine(lambda: nullcontext(connection), owner_id=user["id"])
    try:
        checkpoint = engine.checkpoint_store.latest(workflow_id)
    except WorkflowError as exc:
        _raise_http(exc)
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return WorkflowResponse(workflow=checkpoint.state)


@router.post("/{workflow_id}/resume", response_model=WorkflowResponse)
def resume_workflow(
    workflow_id: str,
    checkpoint_id: str | None = None,
    user=Depends(verify_supabase_jwt),
    connection=Depends(get_db_connection),
):
    # PostgresCheckpointStore now takes a connection factory rather than a
    # raw connection (see services/workflow/checkpoints.py); these routes
    # weren't part of this pass's connection-lifetime fix, so just wrap the
    # existing request-scoped connection to preserve current behavior exactly.
    engine = build_workflow_engine(lambda: nullcontext(connection), owner_id=user["id"])
    try:
        return WorkflowResponse(
            workflow=engine.resume(workflow_id, checkpoint_id=checkpoint_id)
        )
    except WorkflowError as exc:
        _raise_http(exc)


@router.post("/{workflow_id}/confirm", response_model=WorkflowResponse)
def confirm_workflow(
    workflow_id: str,
    payload: WorkflowConfirmationRequest,
    user=Depends(verify_supabase_jwt),
    connection=Depends(get_db_connection),
):
    # PostgresCheckpointStore now takes a connection factory rather than a
    # raw connection (see services/workflow/checkpoints.py); these routes
    # weren't part of this pass's connection-lifetime fix, so just wrap the
    # existing request-scoped connection to preserve current behavior exactly.
    engine = build_workflow_engine(lambda: nullcontext(connection), owner_id=user["id"])
    try:
        checkpoint = engine.checkpoint_store.latest(workflow_id)
        if checkpoint is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return WorkflowResponse(
            workflow=engine.confirm(checkpoint.state, payload.confirmed)
        )
    except WorkflowError as exc:
        _raise_http(exc)


@router.post("/{workflow_id}/cancel", response_model=WorkflowResponse)
def cancel_workflow(
    workflow_id: str,
    user=Depends(verify_supabase_jwt),
    connection=Depends(get_db_connection),
):
    # PostgresCheckpointStore now takes a connection factory rather than a
    # raw connection (see services/workflow/checkpoints.py); these routes
    # weren't part of this pass's connection-lifetime fix, so just wrap the
    # existing request-scoped connection to preserve current behavior exactly.
    engine = build_workflow_engine(lambda: nullcontext(connection), owner_id=user["id"])
    try:
        checkpoint = engine.checkpoint_store.latest(workflow_id)
        if checkpoint is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        return WorkflowResponse(workflow=engine.cancel(checkpoint.state))
    except WorkflowError as exc:
        _raise_http(exc)
