"""Application-level workflow registry and engine factory."""

from .checkpoints import PostgresCheckpointStore
from .engine import WorkflowEngine
from .registry import NodeRegistry


# Future phases register nodes here during application startup.
workflow_node_registry = NodeRegistry()


def build_workflow_engine(connection, *, owner_id: str) -> WorkflowEngine:
    return WorkflowEngine(
        registry=workflow_node_registry,
        checkpoint_store=PostgresCheckpointStore(connection, owner_id=owner_id),
    )
