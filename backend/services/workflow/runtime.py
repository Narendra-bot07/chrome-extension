"""Application-level workflow registry and engine factory."""

from .checkpoints import PostgresCheckpointStore
from .engine import WorkflowEngine
from .registry import NodeRegistry


# Future phases register nodes here during application startup.
workflow_node_registry = NodeRegistry()


def build_workflow_engine(connection_factory, *, owner_id: str) -> WorkflowEngine:
    """connection_factory: zero-arg callable returning a context manager that
    yields a connection -- see PostgresCheckpointStore for why."""
    return WorkflowEngine(
        registry=workflow_node_registry,
        checkpoint_store=PostgresCheckpointStore(connection_factory, owner_id=owner_id),
    )
