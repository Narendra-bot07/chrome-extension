"""Central workflow runtime configuration."""

from pydantic import Field
from pydantic_settings import BaseSettings


class WorkflowSettings(BaseSettings):
    graph_version: str = Field(default="1.0.0", alias="WORKFLOW_GRAPH_VERSION")
    workflow_version: str = Field(default="1.0.0", alias="WORKFLOW_VERSION")
    state_version: int = Field(default=1, alias="WORKFLOW_STATE_VERSION")
    default_max_retries: int = Field(default=2, ge=0, alias="WORKFLOW_MAX_RETRIES")
    default_max_repairs: int = Field(default=1, ge=0, alias="WORKFLOW_MAX_REPAIRS")
    node_timeout_seconds: float = Field(default=60.0, gt=0, alias="WORKFLOW_NODE_TIMEOUT_SECONDS")
    checkpoint_every_successful_node: bool = Field(
        default=True, alias="WORKFLOW_CHECKPOINT_EVERY_NODE"
    )
    checkpoint_interval: int = Field(
        default=1, ge=1, alias="WORKFLOW_CHECKPOINT_INTERVAL"
    )
    log_timeline_events: bool = Field(default=True, alias="WORKFLOW_LOG_TIMELINE")

    model_config = {"env_file": ".env", "extra": "ignore", "populate_by_name": True}


workflow_settings = WorkflowSettings()
