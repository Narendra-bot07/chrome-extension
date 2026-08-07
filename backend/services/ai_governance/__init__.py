"""Centralized AI Governance and Guardrail Layer.

Every LLM call in Tailr4U must pass through AIGovernanceGateway.execute().
No feature may import DeepSeekProvider or call the LLM directly -- see
docs/AI_GOVERNANCE.md for the full architecture and the mandatory process
for adding a new AI feature.

Public surface: import from this package only.
"""
from services.ai_governance.task_types import AITaskType
from services.ai_governance.permissions import (
    AIPermissions,
    SafeUserContext,
    AIExecutionOptions,
    AIExecutionResult,
)
from services.ai_governance.gateway import AIGovernanceGateway, get_gateway
from services.ai_governance.errors import (
    AIGovernanceError,
    AIGovernanceBlockedError,
    AIGovernanceQuotaError,
    AIGovernanceValidationError,
)

__all__ = [
    "AITaskType",
    "AIPermissions",
    "SafeUserContext",
    "AIExecutionOptions",
    "AIExecutionResult",
    "AIGovernanceGateway",
    "get_gateway",
    "AIGovernanceError",
    "AIGovernanceBlockedError",
    "AIGovernanceQuotaError",
    "AIGovernanceValidationError",
]
