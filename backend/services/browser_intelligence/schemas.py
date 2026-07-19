from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

class AstraPlanOperation(BaseModel):
    op: Literal["jsonLdPath", "semanticQuery", "nearEvidence", "composeTextBlocks", "readAttribute"]
    field: Literal["title", "company", "location", "description", "employmentType", "experienceLevel", "salary", "skills", "jobId", "postedDate", "validThrough", "applicationUrl"]
    nodeHandle: Optional[str] = None
    path: List[str] = Field(default_factory=list)
    roles: List[str] = Field(default_factory=list)
    labels: List[str] = Field(default_factory=list)
    evidenceKind: Optional[str] = None
    radius: Optional[int] = Field(default=None, ge=0, le=10)
    startLabels: List[str] = Field(default_factory=list)
    stopLabels: List[str] = Field(default_factory=list)
    attribute: Optional[Literal["href", "content", "datetime"]] = None

class AstraExtractionPlan(BaseModel):
    schemaVersion: str = "astra-plan-1"
    domain: Literal["job"] = "job"
    pageKind: Literal["JOB_DETAIL", "JOB_SEARCH", "PRODUCT", "ARTICLE", "NEWS", "COMPANY", "LANDING_PAGE", "LOGIN", "PROFILE", "UNKNOWN"]
    # Some tool-calling models occasionally omit confidence even when the rest
    # of the plan is valid. Keep it optional in the provider tool schema and
    # apply a conservative value instead of failing the whole request.
    confidence: float = Field(default=0.5, ge=0, le=1)
    operations: List[AstraPlanOperation] = Field(default_factory=list, max_length=30)
    rationale: List[str] = Field(default_factory=list, max_length=12)
    requiresRecovery: bool = False
    recoveryReason: Optional[str] = None

class AstraPlannerRequest(BaseModel):
    context: Dict[str, Any]
    evidence: List[Dict[str, Any]] = Field(default_factory=list, max_length=60)
    classification: Dict[str, Any] = Field(default_factory=dict)
    dom_fingerprint: str = ""
    request_id: Optional[str] = None

class AstraPlannerResponse(BaseModel):
    success: bool = True
    model: str
    plan: AstraExtractionPlan
    request_id: Optional[str] = None
