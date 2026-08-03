"""Bounded Phase 2 nodes registered through the generic workflow registry."""

from __future__ import annotations

import json
from typing import Any, Callable

from services.workflow.contracts import NodeMetadata, RepairPolicy, RetryPolicy, WorkflowNode
from services.workflow.errors import (
    BlockedWorkflowError,
    RepairableError,
    RetryableError,
)
from services.workflow.models import FuturePayloads, WorkflowState

from .analyzer import ProvenanceBuilder, build_resume_intelligence
from .models import (
    AmbiguityRecord,
    Capability,
    DomainExperience,
    Phase2Output,
    ResumeReview,
    ReviewIssue,
    SelectedResumeIntelligence,
    SelectedResumeLock,
    SourceReference,
    confidence,
)
from .normalization import canonical_fingerprint, normalize_resume_text
from .semantic import SemanticAnalyzer


PHASE_KEY = "selected_resume_phase2"


def phase_data(state: WorkflowState) -> dict[str, Any]:
    return dict(state.future_payloads.extensions.get(PHASE_KEY) or {})


def phase_patch(
    state: WorkflowState,
    node_name: str,
    data: dict[str, Any],
    *,
    status: str = "completed",
) -> dict[str, Any]:
    payloads = state.future_payloads.model_copy(
        update={
            "extensions": {
                **state.future_payloads.extensions,
                PHASE_KEY: data,
            },
            "resume_intelligence": data.get("final_output"),
        },
        deep=True,
    )
    return {
        "future_payloads": payloads,
        "node_outputs": {
            **state.node_outputs,
            node_name: {"status": status},
        },
    }


class SelectedResumeNode(WorkflowNode):
    def __init__(self, repository, storage, metadata: NodeMetadata) -> None:
        self.repository = repository
        self.storage = storage
        self.metadata = metadata

    def _snapshot(self, state: WorkflowState) -> dict[str, Any]:
        data = phase_data(state)
        request = data.get("request") or {}
        resume_id = request.get("selected_resume_id")
        if not resume_id:
            raise BlockedWorkflowError("A selected resume ID is required")
        record = self.repository.get_selected_snapshot(resume_id, state.owner_id)
        if not record:
            raise BlockedWorkflowError(
                "Selected resume is unavailable, deleted, or not owned by the user"
            )
        return record

    def _assert_lock(self, state: WorkflowState, *, verify_bytes: bool = False) -> dict[str, Any]:
        data = phase_data(state)
        lock = SelectedResumeLock.model_validate(data.get("lock"))
        record = self._snapshot(state)
        if (
            str(record["id"]) != lock.resume_id
            or int(record.get("resume_version") or 1) != lock.version
            or record.get("source_fingerprint") != lock.fingerprint
        ):
            raise BlockedWorkflowError(
                "Selected resume identity changed; restart and reconfirm the resume",
                details={"reason": "selected_resume_stale"},
            )
        if verify_bytes:
            try:
                content = self.storage.download_file("original-resumes", record["file_path"])
            except Exception as exc:
                raise BlockedWorkflowError(
                    "Selected resume source file is inaccessible",
                    details={"reason": "selected_resume_file_missing"},
                ) from exc
            if canonical_fingerprint(content) != lock.fingerprint:
                raise BlockedWorkflowError(
                    "Selected resume content changed; restart and reconfirm the resume",
                    details={"reason": "selected_resume_fingerprint_changed"},
                )
        return record


class ValidateSelectedResumeNode(SelectedResumeNode):
    def __init__(self, repository, storage) -> None:
        super().__init__(
            repository,
            storage,
            NodeMetadata(
                name="validate_selected_resume",
                version="1.0.0",
                supported_inputs=("selected_resume_id", "user_confirmed"),
                produced_outputs=("status",),
            ),
        )

    def execute(self, state: WorkflowState):
        data = phase_data(state)
        request = data.get("request") or {}
        confirmed = request.get("user_confirmed") or state.user_confirmation is True
        if not confirmed:
            return {
                **phase_patch(state, self.metadata.name, data, status="waiting"),
                "user_confirmation_required": True,
                "waiting_reason": "Confirm the selected resume before intelligence processing",
            }
        record = self._snapshot(state)
        parsed = record.get("parsed_content") or {}
        if isinstance(parsed, str):
            try:
                parsed = json.loads(parsed)
            except Exception as exc:
                raise BlockedWorkflowError("Selected resume parsed content is corrupted") from exc
        if not parsed.get("raw_text") and not any(
            parsed.get(key) for key in ("experience", "projects", "education", "skills")
        ):
            raise BlockedWorkflowError("Selected resume has no parseable content")
        data["validated_identity"] = {
            "resume_id": str(record["id"]),
            "version": int(record.get("resume_version") or 1),
            "display_name": record.get("file_name") or "Selected resume",
            "source_type": (record.get("file_type") or "stored_resume").lower(),
        }
        return {
            **phase_patch(state, self.metadata.name, data),
            "user_confirmation_required": False,
            "waiting_reason": None,
            "user_confirmation": None,
        }


class LockSelectedResumeNode(SelectedResumeNode):
    def __init__(self, repository, storage) -> None:
        super().__init__(
            repository,
            storage,
            NodeMetadata(
                name="lock_selected_resume",
                version="1.0.0",
                dependencies=("validate_selected_resume",),
                supported_inputs=("validated_identity",),
                produced_outputs=("status",),
            ),
        )

    def execute(self, state: WorkflowState):
        data = phase_data(state)
        record = self._snapshot(state)
        try:
            content = self.storage.download_file("original-resumes", record["file_path"])
        except Exception as exc:
            raise BlockedWorkflowError("Selected resume source file is inaccessible") from exc
        actual = canonical_fingerprint(content)
        stored = record.get("source_fingerprint")
        if stored and stored != actual:
            raise BlockedWorkflowError(
                "Stored resume fingerprint does not match the selected source file",
                details={"reason": "selected_resume_corrupted"},
            )
        if not stored:
            record = self.repository.set_source_fingerprint_if_missing(
                str(record["id"]), state.owner_id, actual
            )
            stored = record.get("source_fingerprint")
        identity = data["validated_identity"]
        lock = SelectedResumeLock(
            resume_id=str(record["id"]),
            version=int(record.get("resume_version") or 1),
            fingerprint=stored,
            display_name=identity["display_name"],
            source_type=identity["source_type"],
        )
        expected_version = (data.get("request") or {}).get("selected_resume_version")
        expected_fingerprint = (data.get("request") or {}).get("selected_resume_fingerprint")
        if expected_version is not None and int(expected_version) != lock.version:
            raise BlockedWorkflowError("Selected resume version changed before locking")
        if expected_fingerprint and expected_fingerprint != lock.fingerprint:
            raise BlockedWorkflowError("Selected resume fingerprint changed before locking")
        data["lock"] = lock.model_dump(mode="json")
        return phase_patch(state, self.metadata.name, data)


class LoadSelectedResumeNode(SelectedResumeNode):
    def __init__(
        self,
        repository,
        storage,
        structured_parser: Callable[[str], Any] | None = None,
    ) -> None:
        super().__init__(
            repository,
            storage,
            NodeMetadata(
                name="load_selected_resume",
                version="1.0.0",
                dependencies=("lock_selected_resume",),
                supported_inputs=("lock",),
                produced_outputs=("status",),
                retry_policy=RetryPolicy(max_attempts=1),
                timeout_seconds=60,
            ),
        )
        self.structured_parser = structured_parser

    def execute(self, state: WorkflowState):
        data = phase_data(state)
        record = self._assert_lock(state, verify_bytes=True)
        parsed = record.get("parsed_content") or {}
        if isinstance(parsed, str):
            parsed = json.loads(parsed)
        raw_text = str(parsed.get("raw_text") or "")
        has_structure = any(parsed.get(key) for key in ("experience", "projects", "education", "skills"))
        parse_source = "validated_structured_json" if has_structure else "stored_raw_text"
        if not has_structure and self.structured_parser and raw_text:
            try:
                result = self.structured_parser(raw_text)
                parsed_result = (
                    result.model_dump() if hasattr(result, "model_dump") else dict(result)
                )
                parsed = {**parsed_result, "raw_text": raw_text, "parse_status": "parsed_in_workflow"}
                parse_source = "selected_resume_structured_parser"
            except Exception as exc:
                raise RetryableError("Selected resume structured parsing failed") from exc
        data["original"] = {
            "raw_text": raw_text,
            "parsed_content": parsed,
            "parse_source": parse_source,
        }
        return phase_patch(state, self.metadata.name, data)


class NormalizeSelectedResumeNode(SelectedResumeNode):
    def __init__(self, repository, storage) -> None:
        super().__init__(
            repository,
            storage,
            NodeMetadata(
                name="normalize_selected_resume",
                version="1.0.0",
                dependencies=("load_selected_resume",),
                supported_inputs=("original",),
                produced_outputs=("status",),
            ),
        )

    def execute(self, state: WorkflowState):
        data = phase_data(state)
        self._assert_lock(state)
        normalized, sections = normalize_resume_text(data["original"]["raw_text"])
        data["normalized"] = {
            "text": normalized,
            "sections": [section.model_dump(mode="json") for section in sections],
        }
        return phase_patch(state, self.metadata.name, data)


class AnalyzeSelectedResumeNode(SelectedResumeNode):
    def __init__(self, repository, storage) -> None:
        super().__init__(
            repository,
            storage,
            NodeMetadata(
                name="analyze_selected_resume",
                version="1.0.0",
                dependencies=("normalize_selected_resume",),
                supported_inputs=("original", "normalized", "lock"),
                produced_outputs=("status",),
                timeout_seconds=45,
            ),
        )

    def execute(self, state: WorkflowState):
        data = phase_data(state)
        self._assert_lock(state)
        lock = SelectedResumeLock.model_validate(data["lock"])
        intelligence = build_resume_intelligence(
            resume_id=lock.resume_id,
            resume_version=lock.version,
            fingerprint=lock.fingerprint,
            source_type=lock.source_type,
            display_name=lock.display_name,
            parsed=data["original"]["parsed_content"],
            raw_text=data["original"]["raw_text"],
            sections=[
                __import__(
                    "services.resume_intelligence.models",
                    fromlist=["ResumeSection"],
                ).ResumeSection.model_validate(item)
                for item in data["normalized"]["sections"]
            ],
        )
        data["intelligence"] = intelligence.model_dump(mode="json")
        return phase_patch(state, self.metadata.name, data)


class SemanticResumeNode(SelectedResumeNode):
    def __init__(self, repository, storage, analyzer: SemanticAnalyzer | None) -> None:
        super().__init__(
            repository,
            storage,
            NodeMetadata(
                name="semantic_resume_reasoning",
                version="1.0.0",
                dependencies=("analyze_selected_resume",),
                supported_inputs=("normalized", "intelligence"),
                produced_outputs=("status",),
                retry_policy=RetryPolicy(max_attempts=1),
                timeout_seconds=50,
            ),
        )
        self.analyzer = analyzer

    def should_run(self, state: WorkflowState) -> bool:
        return self.analyzer is not None

    def execute(self, state: WorkflowState):
        data = phase_data(state)
        self._assert_lock(state)
        normalized = data["normalized"]["text"]
        try:
            insights = self.analyzer.analyze(normalized)
        except Exception as exc:
            raise RetryableError("Selected-resume semantic analysis failed") from exc
        intelligence = SelectedResumeIntelligence.model_validate(data["intelligence"])
        provenance = dict(intelligence.provenance)
        inferred = list(intelligence.inferred_capabilities)
        domains = list(intelligence.domain_experience)
        for index, item in enumerate(insights.inferred_capabilities):
            if item.supporting_quote not in normalized:
                continue
            prov = ProvenanceBuilder()
            source = prov.add(
                "semantic_evidence",
                item.supporting_quote,
                entry_id=f"inference-{index + 1}",
                method="llm",
                score=item.confidence,
            )
            provenance.update(prov.records)
            inferred.append(
                Capability(
                    name=item.name,
                    status="inferred",
                    supporting_evidence=[item.supporting_quote],
                    inference_reason=item.inference_reason,
                    limitations=item.limitations,
                    confirmation_status="unconfirmed",
                    confidence=confidence(item.confidence, "bounded semantic inference"),
                    source=source,
                )
            )
        for index, item in enumerate(insights.domains):
            if item.supporting_quote not in normalized:
                continue
            prov = ProvenanceBuilder()
            source = prov.add(
                "domain_evidence",
                item.supporting_quote,
                entry_id=f"domain-{index + 1}",
                method="llm",
                score=item.confidence,
            )
            provenance.update(prov.records)
            domains.append(
                DomainExperience(
                    domain=item.domain,
                    supporting_entries=[item.supporting_quote],
                    evidence_strength=(
                        "strong" if item.confidence >= 0.85 else "moderate"
                        if item.confidence >= 0.6 else "weak"
                    ),
                    status="explicit" if item.explicit else "inferred",
                    confidence=confidence(item.confidence, "semantic domain interpretation"),
                    source=source,
                )
            )
        ambiguities = [
            *intelligence.ambiguities,
            *[
                AmbiguityRecord(
                    field="semantic_analysis",
                    issue_type="semantic_ambiguity",
                    affected_content=value,
                    severity="warning",
                    evidence=[value],
                    recommended_resolution="Review selected-resume source evidence.",
                )
                for value in insights.ambiguities
            ],
        ]
        intelligence = intelligence.model_copy(
            update={
                "inferred_capabilities": inferred,
                "domain_experience": domains,
                "ambiguities": ambiguities,
                "provenance": provenance,
            },
            deep=True,
        )
        data["intelligence"] = intelligence.model_dump(mode="json")
        return phase_patch(state, self.metadata.name, data)


def review_intelligence(
    intelligence: SelectedResumeIntelligence, normalized_text: str
) -> ResumeReview:
    issues: list[ReviewIssue] = []
    provenance = intelligence.provenance
    major_sources = [
        *(entry.source for entry in intelligence.experience),
        *(entry.source for entry in intelligence.projects),
        *(entry.source for entry in intelligence.education),
        *(entry.source for entry in intelligence.certifications),
        *(entry.source for entry in intelligence.skills),
    ]
    if any(
        not source.provenance_ids
        or any(identifier not in provenance for identifier in source.provenance_ids)
        for source in major_sources
    ):
        issues.append(
            ReviewIssue(
                code="missing_provenance",
                message="A major resume fact lacks provenance.",
                severity="critical",
                repairable=False,
            )
        )
    unsupported_skills = []
    for skill in intelligence.skills:
        supported = any(
            mention.lower() in normalized_text.lower()
            for mention in skill.original_mentions
        )
        if not supported:
            unsupported_skills.append(skill.normalized_name)
    if unsupported_skills:
        issues.append(
            ReviewIssue(
                code="unsupported_skills",
                message="Structured skills were not found in selected-resume evidence.",
                severity="critical",
                field="skills",
                repairable=True,
            )
        )
    if any(item.severity == "critical" for item in intelligence.inconsistencies):
        issues.append(
            ReviewIssue(
                code="critical_consistency_issue",
                message="Critical resume consistency issues require manual review.",
                severity="critical",
                repairable=False,
            )
        )
    if any(issue.repairable for issue in issues):
        return ResumeReview(status="NEEDS_REPAIR", issues=issues)
    if any(issue.severity == "critical" for issue in issues):
        return ResumeReview(status="MANUAL_REVIEW", issues=issues)
    warnings = bool(intelligence.warnings or intelligence.inconsistencies or intelligence.ambiguities)
    return ResumeReview(
        status="PASSED_WITH_WARNINGS" if warnings else "PASSED",
        issues=issues,
    )


class ReviewSelectedResumeNode(SelectedResumeNode):
    def __init__(self, repository, storage) -> None:
        super().__init__(
            repository,
            storage,
            NodeMetadata(
                name="review_resume_intelligence",
                version="1.0.0",
                dependencies=("analyze_selected_resume",),
                supported_inputs=("intelligence", "normalized"),
                produced_outputs=("status",),
                repair_policy=RepairPolicy(enabled=True, max_attempts=1),
            ),
        )

    def execute(self, state: WorkflowState):
        data = phase_data(state)
        self._assert_lock(state)
        review = review_intelligence(
            SelectedResumeIntelligence.model_validate(data["intelligence"]),
            data["normalized"]["text"],
        )
        if review.status == "NEEDS_REPAIR":
            raise RepairableError(
                "Resume intelligence requires targeted repair",
                details={"issue_codes": [item.code for item in review.issues]},
            )
        data["review"] = review.model_dump(mode="json")
        if review.status == "MANUAL_REVIEW":
            data["manual_review"] = True
        return phase_patch(state, self.metadata.name, data)

    def repair(self, state: WorkflowState):
        data = phase_data(state)
        intelligence = SelectedResumeIntelligence.model_validate(data["intelligence"])
        normalized = data["normalized"]["text"].lower()
        supported_skills = []
        removed = []
        for skill in intelligence.skills:
            if any(mention.lower() in normalized for mention in skill.original_mentions):
                supported_skills.append(skill)
            else:
                removed.append(skill.normalized_name)
        explicit = [
            capability
            for capability in intelligence.explicit_capabilities
            if capability.name not in set(removed)
        ]
        intelligence = intelligence.model_copy(
            update={
                "skills": supported_skills,
                "explicit_capabilities": explicit,
                "warnings": [
                    *intelligence.warnings,
                    f"Removed unsupported structured skills: {', '.join(removed)}",
                ] if removed else intelligence.warnings,
            },
            deep=True,
        )
        review = review_intelligence(intelligence, data["normalized"]["text"])
        data["intelligence"] = intelligence.model_dump(mode="json")
        data["review"] = review.model_dump(mode="json")
        return phase_patch(state, self.metadata.name, data, status="repaired")


class FinalizeSelectedResumeNode(SelectedResumeNode):
    def __init__(self, repository, storage) -> None:
        super().__init__(
            repository,
            storage,
            NodeMetadata(
                name="finalize_resume_intelligence",
                version="1.0.0",
                dependencies=("review_resume_intelligence",),
                supported_inputs=("lock", "intelligence", "review"),
                produced_outputs=("status",),
            ),
        )

    def execute(self, state: WorkflowState):
        data = phase_data(state)
        self._assert_lock(state, verify_bytes=True)
        lock = SelectedResumeLock.model_validate(data["lock"])
        intelligence = SelectedResumeIntelligence.model_validate(data["intelligence"])
        review = ResumeReview.model_validate(data["review"])
        output = Phase2Output(
            status="manual_review" if review.status == "MANUAL_REVIEW" else "completed",
            selected_resume=lock,
            resume_intelligence=intelligence,
            review=review,
            workflow_id=state.workflow_id,
            warnings=intelligence.warnings,
        )
        data["final_output"] = output.model_dump(mode="json")
        # Original and normalized source stay in checkpoints for provenance and
        # recovery, but never enter the stable frontend response.
        return phase_patch(state, self.metadata.name, data)


PHASE2_NODE_ORDER = [
    "validate_selected_resume",
    "lock_selected_resume",
    "load_selected_resume",
    "normalize_selected_resume",
    "analyze_selected_resume",
    "semantic_resume_reasoning",
    "review_resume_intelligence",
    "finalize_resume_intelligence",
]
