"""HTTP contracts for the generic orchestration foundation."""

from pydantic import BaseModel, Field

from services.workflow.models import WorkflowState


class WorkflowCreateRequest(BaseModel):
    request_id: str = Field(min_length=1)
    requested_nodes: list[str] = Field(default_factory=list)


class WorkflowConfirmationRequest(BaseModel):
    confirmed: bool


class WorkflowResponse(BaseModel):
    status: str = "success"
    workflow: WorkflowState
