from __future__ import annotations

import os
from typing import Any

from core.config import settings


def configure_langsmith() -> bool:
    """Configure LangChain tracing without ever logging the LangSmith key."""
    enabled = bool(settings.LANGSMITH_TRACING and settings.LANGSMITH_API_KEY)
    os.environ["LANGSMITH_TRACING"] = "true" if enabled else "false"
    if not enabled:
        return False

    os.environ["LANGSMITH_API_KEY"] = settings.LANGSMITH_API_KEY
    os.environ["LANGSMITH_PROJECT"] = settings.LANGSMITH_PROJECT
    os.environ["LANGSMITH_ENDPOINT"] = settings.LANGSMITH_ENDPOINT
    if settings.LANGSMITH_WORKSPACE_ID:
        os.environ["LANGSMITH_WORKSPACE_ID"] = settings.LANGSMITH_WORKSPACE_ID
    return True


def langsmith_status() -> dict[str, Any]:
    return {
        "enabled": bool(
            os.environ.get("LANGSMITH_TRACING", "").lower() == "true"
            and settings.LANGSMITH_API_KEY
        ),
        "project": settings.LANGSMITH_PROJECT,
        "endpoint": settings.LANGSMITH_ENDPOINT,
        "workspace_configured": bool(settings.LANGSMITH_WORKSPACE_ID),
        "token_tracking": (
            "LangChain model usage metadata"
            if settings.LANGSMITH_API_KEY and settings.LANGSMITH_TRACING
            else "disabled"
        ),
    }
