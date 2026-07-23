"""Phase 2 orchestration entrypoint and stable output mapping."""

from __future__ import annotations

from typing import Any, Callable

from core.logging import logger
from services.workflow.checkpoints import CheckpointStore
from services.workflow.engine import WorkflowEngine
from services.workflow.models import WorkflowStatus
from services.workflow.registry import NodeRegistry

from .models import Phase2Output
from .nodes import (
    PHASE2_NODE_ORDER,
    PHASE_KEY,
    AnalyzeSelectedResumeNode,
    FinalizeSelectedResumeNode,
    LoadSelectedResumeNode,
    LockSelectedResumeNode,
    NormalizeSelectedResumeNode,
    ReviewSelectedResumeNode,
    SemanticResumeNode,
    ValidateSelectedResumeNode,
    phase_data,
)
from .semantic import SemanticAnalyzer


class SelectedResumeIntelligenceService:
    def __init__(
        self,
        *,
        repository,
        storage,
        checkpoint_store: CheckpointStore,
        structured_parser: Callable[[str], Any] | None = None,
        semantic_analyzer: SemanticAnalyzer | None = None,
    ) -> None:
        registry = NodeRegistry()
        for node in (
            ValidateSelectedResumeNode(repository, storage),
            LockSelectedResumeNode(repository, storage),
            LoadSelectedResumeNode(repository, storage, structured_parser),
            NormalizeSelectedResumeNode(repository, storage),
            AnalyzeSelectedResumeNode(repository, storage),
            SemanticResumeNode(repository, storage, semantic_analyzer),
            ReviewSelectedResumeNode(repository, storage),
            FinalizeSelectedResumeNode(repository, storage),
        ):
            registry.register(node)
        self.engine = WorkflowEngine(registry, checkpoint_store)

    def run(
        self,
        *,
        request_id: str,
        user_id: str,
        selected_resume_id: str,
        user_confirmed: bool,
        selected_resume_version: int | None = None,
        selected_resume_fingerprint: str | None = None,
    ) -> Phase2Output:
        logger.info(
            "[RESUME-INTELLIGENCE][BACKEND] Phase 2 started "
            "request_id=%s selected_resume_id=%s expected_version=%s",
            request_id,
            selected_resume_id,
            selected_resume_version,
        )
        state = self.engine.create_state(
            request_id,
            PHASE2_NODE_ORDER,
            owner_id=user_id,
        )
        phase = {
            "request": {
                "selected_resume_id": selected_resume_id,
                "selected_resume_version": selected_resume_version,
                "selected_resume_fingerprint": selected_resume_fingerprint,
                "user_confirmed": user_confirmed,
            }
        }
        state = state.model_copy(
            update={
                "future_payloads": state.future_payloads.model_copy(
                    update={
                        "extensions": {
                            **state.future_payloads.extensions,
                            PHASE_KEY: phase,
                        }
                    },
                    deep=True,
                )
            },
            deep=True,
        )
        result = self.engine.run(state)
        result = self._invalidate_blocked_payload(result)
        output = self._output_from_state(result)
        self._log_finished(request_id, selected_resume_id, result, output)
        return output

    def confirm(
        self,
        *,
        workflow_id: str,
        selected_resume_id: str,
        confirmed: bool,
    ) -> Phase2Output:
        checkpoint = self.engine.checkpoint_store.latest(workflow_id)
        if checkpoint is None:
            from services.workflow.errors import FatalWorkflowError
            raise FatalWorkflowError("Selected resume workflow was not found")
        data = phase_data(checkpoint.state)
        request = data.get("request") or {}
        if request.get("selected_resume_id") != selected_resume_id:
            from services.workflow.errors import BlockedWorkflowError
            raise BlockedWorkflowError("Workflow does not belong to the selected resume")
        result = self.engine.confirm(checkpoint.state, confirmed)
        result = self._invalidate_blocked_payload(result)
        output = self._output_from_state(result)
        self._log_finished(
            checkpoint.state.request_id, selected_resume_id, result, output
        )
        return output

    def _invalidate_blocked_payload(self, state):
        if state.workflow_status != WorkflowStatus.BLOCKED:
            return state
        data = phase_data(state)
        sanitized = {
            "request": data.get("request") or {},
            "invalidated": True,
            "invalidation_reason": (
                state.errors[-1].details.get("reason")
                if state.errors and state.errors[-1].details
                else state.errors[-1].code if state.errors else "blocked"
            ),
        }
        updated = state.model_copy(
            update={
                "future_payloads": state.future_payloads.model_copy(
                    update={
                        "resume_intelligence": None,
                        "extensions": {
                            **state.future_payloads.extensions,
                            PHASE_KEY: sanitized,
                        },
                    },
                    deep=True,
                )
            },
            deep=True,
        )
        return self.engine.checkpoint_store.save(
            updated, expected_revision=updated.revision
        ).state

    @staticmethod
    def _output_from_state(result) -> Phase2Output:
        data = phase_data(result)
        if data.get("final_output"):
            output = Phase2Output.model_validate(data["final_output"])
        else:
            status = {
                WorkflowStatus.WAITING_FOR_USER: "waiting_for_user",
                WorkflowStatus.BLOCKED: "blocked",
                WorkflowStatus.FAILED: "failed",
            }.get(result.workflow_status, "failed")
            output = Phase2Output(
                status=status,
                selected_resume=data.get("lock"),
                review=data.get("review"),
                workflow_id=result.workflow_id,
                warnings=[
                    *result.warnings,
                    *[error.message for error in result.errors],
                ],
            )
        return output

    @staticmethod
    def _log_finished(request_id, selected_resume_id, result, output) -> None:
        intelligence = output.resume_intelligence
        logger.info(
            "[RESUME-INTELLIGENCE][BACKEND] Phase 2 finished "
            "request_id=%s workflow_id=%s selected_resume_id=%s status=%s "
            "experience_count=%s project_count=%s explicit_skill_count=%s "
            "inferred_skill_count=%s ambiguity_count=%s warning_count=%s "
            "review_status=%s",
            request_id,
            result.workflow_id,
            selected_resume_id,
            output.status,
            len(intelligence.experience) if intelligence else 0,
            len(intelligence.projects) if intelligence else 0,
            len([s for s in intelligence.skills if s.status == "explicit"]) if intelligence else 0,
            len([s for s in intelligence.skills if s.status == "inferred"]) if intelligence else 0,
            len(intelligence.ambiguities) if intelligence else 0,
            len(output.warnings),
            output.review.status if output.review else None,
        )
