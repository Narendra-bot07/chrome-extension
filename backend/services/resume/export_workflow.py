"""Bounded self-healing validation and PDF export workflow."""

from __future__ import annotations

import copy
import logging
import uuid
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any, Awaitable, Callable

from pydantic import BaseModel, ConfigDict, Field

from services.resume.composition import (
    audit_resume_preservation,
    validate_generated_pdf,
    validate_resume_presentation,
)
from services.resume.preservation import inventory_resume

logger = logging.getLogger(__name__)

COMPOSITION_KEYS = {
    "section_order", "page_assignment", "page_breaks", "layout_mode",
    "spacing_profile", "margin_profile", "font_scale",
    "column_configuration", "rendering_hints", "compactness_level",
    "visual_priority", "layout_level",
}
KNOWN_SECTIONS = (
    "summary", "objective", "experience", "internships", "projects", "skills",
    "skills_categories", "education", "achievements", "awards",
    "certifications", "publications", "languages", "volunteer_experience",
    "open_source", "leadership", "extracurricular_activities",
    "custom_sections", "interests",
)
REQUIRED_WHEN_POPULATED = {"experience", "projects", "skills", "education"}


class RepairType(StrEnum):
    REPAIRABLE_CONTENT_ERROR = "REPAIRABLE_CONTENT_ERROR"
    REPAIRABLE_COMPOSITION_ERROR = "REPAIRABLE_COMPOSITION_ERROR"
    REPAIRABLE_RENDERING_ERROR = "REPAIRABLE_RENDERING_ERROR"
    REQUIRES_USER_CONFIRMATION = "REQUIRES_USER_CONFIRMATION"
    FATAL_SYSTEM_ERROR = "FATAL_SYSTEM_ERROR"


class ResumeContentModel(BaseModel):
    model_config = ConfigDict(extra="allow")
    content: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_document(cls, document: dict[str, Any]) -> "ResumeContentModel":
        return cls(content={
            key: copy.deepcopy(value)
            for key, value in document.items()
            if key not in COMPOSITION_KEYS
        })


class ResumeCompositionPlan(BaseModel):
    section_order: list[str] = Field(default_factory=list)
    page_assignment: dict[str, int] = Field(default_factory=dict)
    page_breaks: list[str] = Field(default_factory=list)
    layout_mode: str = "single_column"
    spacing_profile: str = "balanced"
    margin_profile: str = "standard"
    font_scale: float = 1.0
    column_configuration: dict[str, Any] = Field(default_factory=dict)
    rendering_hints: dict[str, Any] = Field(default_factory=dict)
    compactness_level: int = 0
    visual_priority: list[str] = Field(default_factory=list)

    @classmethod
    def from_document(
        cls, document: dict[str, Any], content: "ResumeContentModel"
    ) -> "ResumeCompositionPlan":
        values = {
            key: copy.deepcopy(value)
            for key, value in document.items()
            if key in cls.model_fields and value is not None
        }
        if "compactness_level" not in values:
            values["compactness_level"] = int(document.get("layout_level") or 0)
        values.setdefault(
            "section_order",
            list(document.get("section_order") or _populated_sections(content.content)),
        )
        return cls(**values)


class FinalResumeDocument(BaseModel):
    content: ResumeContentModel
    composition_plan: ResumeCompositionPlan
    rendering_configuration: dict[str, Any] = Field(default_factory=dict)

    def render_payload(self) -> dict[str, Any]:
        result = copy.deepcopy(self.content.content)
        result["section_order"] = list(self.composition_plan.section_order)
        result["layout_level"] = self.composition_plan.compactness_level
        return result


@dataclass
class ValidationReport:
    valid: bool
    issues: list[str] = field(default_factory=list)


@dataclass
class RepairLog:
    attempt: int
    repair_type: RepairType
    failures: list[str]
    repair_strategy: str
    fields_changed: list[str]
    preserved_content_count: int
    unresolved_issues: list[str]
    result: str


@dataclass
class ExportWorkflowState:
    request_id: str
    composition_plan: ResumeCompositionPlan
    content_validation_report: Any = None
    composition_validation_report: ValidationReport | None = None
    rendering_validation_report: Any = None
    repair_type: RepairType | None = None
    repair_attempt: int = 0
    max_repair_attempts: dict[str, int] = field(default_factory=lambda: {
        "content": 2, "composition": 3, "rendering": 2,
    })
    unresolved_issues: list[str] = field(default_factory=list)
    last_valid_resume_content: dict[str, Any] | None = None
    last_valid_composition_plan: ResumeCompositionPlan | None = None
    final_resume_ready: bool = False
    repair_logs: list[RepairLog] = field(default_factory=list)


class ExportWorkflowError(Exception):
    def __init__(self, request_id: str, repair_type: RepairType):
        self.request_id = request_id
        self.repair_type = repair_type
        super().__init__("Resume export could not be finalized.")

    def safe_detail(self) -> dict[str, str]:
        if self.repair_type == RepairType.REQUIRES_USER_CONFIRMATION:
            message = (
                "We need your confirmation to resolve conflicting resume details. "
                "Your original resume data is safe."
            )
        elif self.repair_type == RepairType.FATAL_SYSTEM_ERROR:
            message = (
                "The PDF service is temporarily unavailable. Your original resume "
                "data is safe. Please retry shortly."
            )
        else:
            message = (
                "We could not finalize the resume layout automatically. Your "
                "original resume data is safe. Please retry or review the "
                "highlighted sections."
            )
        return {"message": message, "request_id": self.request_id}


def _meaningful(value: Any) -> bool:
    return value not in (None, "", [], {})


def _populated_sections(content: dict[str, Any]) -> list[str]:
    return [name for name in KNOWN_SECTIONS if _meaningful(content.get(name))]


def validate_composition(
    content: ResumeContentModel, plan: ResumeCompositionPlan
) -> ValidationReport:
    populated = _populated_sections(content.content)
    issues: list[str] = []
    seen: set[str] = set()
    for section in plan.section_order:
        if section not in populated:
            issues.append(f"invalid section reference: {section}")
        if section in seen:
            issues.append(f"duplicate section reference: {section}")
        seen.add(section)
    for section in REQUIRED_WHEN_POPULATED:
        if section in populated and section not in seen:
            issues.append(f"required populated section omitted: {section}")
    for section, page in plan.page_assignment.items():
        if section not in populated:
            issues.append(f"page assignment references unknown section: {section}")
        if not isinstance(page, int) or page < 1:
            issues.append(f"invalid page assignment for: {section}")
    for section in plan.page_breaks:
        if section not in populated:
            issues.append(f"page break references unknown section: {section}")
    if not 0.75 <= plan.font_scale <= 1.25:
        issues.append("font scale is outside supported limits")
    return ValidationReport(not issues, issues)


def repair_composition(
    content: ResumeContentModel, previous: ResumeCompositionPlan
) -> tuple[ResumeCompositionPlan, list[str]]:
    populated = _populated_sections(content.content)
    order: list[str] = []
    for section in previous.section_order + populated:
        if section in populated and section not in order:
            order.append(section)
    repaired = previous.model_copy(deep=True)
    repaired.section_order = order
    repaired.page_assignment = {
        section: max(1, page)
        for section, page in previous.page_assignment.items()
        if section in populated and isinstance(page, int)
    }
    repaired.page_breaks = [
        section for section in previous.page_breaks if section in populated
    ]
    repaired.font_scale = min(1.25, max(0.75, previous.font_scale))
    return repaired, [
        "section_order", "page_assignment", "page_breaks", "font_scale"
    ]


def _delete_path(document: dict[str, Any], path: str) -> bool:
    parts = path.split(".")
    current: Any = document
    try:
        for part in parts[:-1]:
            current = current[int(part)] if isinstance(current, list) else current[part]
        if isinstance(current, list):
            current.pop(int(parts[-1]))
        else:
            current.pop(parts[-1], None)
        return True
    except (KeyError, IndexError, TypeError, ValueError):
        return False


def _repair_unsupported(document: dict[str, Any], report: Any) -> list[str]:
    paths = sorted(
        {
            issue["path"] for issue in report.structured_issues
            if issue.get("code", "").startswith("unsupported_")
        },
        key=lambda value: (value.count("."), value),
        reverse=True,
    )
    return [path for path in paths if _delete_path(document, path)]


def _record(
    state: ExportWorkflowState,
    repair_type: RepairType,
    failures: list[str],
    strategy: str,
    changed: list[str],
    content: dict[str, Any],
    unresolved: list[str],
    result: str,
) -> None:
    item = RepairLog(
        state.repair_attempt, repair_type, list(failures), strategy, changed,
        len(inventory_resume(content)), list(unresolved), result,
    )
    state.repair_logs.append(item)
    logger.info(
        "[RESUME-EXPORT] request_id=%s attempt=%s type=%s strategy=%s "
        "changed=%s preserved=%s unresolved=%s result=%s",
        state.request_id, item.attempt, repair_type.value, strategy, changed,
        item.preserved_content_count, unresolved, result,
    )


async def export_resume_pdf(
    *,
    original_resume: dict[str, Any],
    composed_resume: dict[str, Any],
    approved_additions: list[str],
    intentional_removals: list[str],
    template_name: str,
    renderer: Callable[[dict[str, Any], str], Awaitable[bytes]],
    request_id: str | None = None,
) -> tuple[bytes, FinalResumeDocument, ExportWorkflowState]:
    """Validate, repair, render, and revalidate with bounded targeted retries."""

    request_id = request_id or str(uuid.uuid4())
    immutable_source = copy.deepcopy(original_resume)
    content = ResumeContentModel.from_document(composed_resume)
    plan = ResumeCompositionPlan.from_document(composed_resume, content)
    state = ExportWorkflowState(request_id=request_id, composition_plan=plan)

    for attempt in range(state.max_repair_attempts["content"] + 1):
        state.repair_attempt = attempt
        report = audit_resume_preservation(
            ResumeContentModel.from_document(immutable_source).content,
            content.content,
            intentional_removals,
            approved_additions,
            auto_repair=attempt > 0,
        )
        state.content_validation_report = report
        if report.valid:
            content = ResumeContentModel(content=copy.deepcopy(report.lossless_resume))
            state.last_valid_resume_content = copy.deepcopy(content.content)
            break
        if attempt >= state.max_repair_attempts["content"]:
            state.unresolved_issues = list(report.issues)
            state.repair_type = RepairType.REPAIRABLE_CONTENT_ERROR
            _record(state, state.repair_type, report.issues, "exhausted", [], content.content, report.issues, "failed")
            raise ExportWorkflowError(request_id, state.repair_type)
        repaired = copy.deepcopy(report.lossless_resume or content.content)
        changed = _repair_unsupported(repaired, report)
        content = ResumeContentModel(content=repaired)
        _record(state, RepairType.REPAIRABLE_CONTENT_ERROR, report.issues, "targeted_restore_and_remove", changed, content.content, [], "retry")

    presentation = validate_resume_presentation(content.content)
    if not presentation.valid:
        changed: list[str] = []
        source_content = ResumeContentModel.from_document(immutable_source).content
        source_presentation = validate_resume_presentation(source_content)
        for section in ("achievements", "certifications"):
            if any(issue.startswith(f"{section}.") for issue in presentation.issues):
                content.content[section] = copy.deepcopy(source_content.get(section, []))
                changed.append(section)
        repaired_presentation = validate_resume_presentation(content.content)
        # A sparse title-only record or other limitation already present in
        # the immutable source is not composition damage. Preserve it rather
        # than blocking a truthful export that cannot be improved without
        # fabricating evidence.
        unresolved_presentation = [
            issue for issue in repaired_presentation.issues
            if issue not in source_presentation.issues
        ]
        presentation_valid = not unresolved_presentation
        _record(state, RepairType.REPAIRABLE_CONTENT_ERROR, presentation.issues, "restore_source_sections", changed, content.content, unresolved_presentation, "passed" if presentation_valid else "failed")
        if not presentation_valid:
            state.unresolved_issues = unresolved_presentation
            raise ExportWorkflowError(request_id, RepairType.REPAIRABLE_CONTENT_ERROR)
        state.last_valid_resume_content = copy.deepcopy(content.content)

    for attempt in range(state.max_repair_attempts["composition"] + 1):
        state.repair_attempt = attempt
        composition_report = validate_composition(content, plan)
        state.composition_validation_report = composition_report
        if composition_report.valid:
            state.last_valid_composition_plan = plan.model_copy(deep=True)
            break
        if attempt >= state.max_repair_attempts["composition"]:
            state.unresolved_issues = composition_report.issues
            raise ExportWorkflowError(request_id, RepairType.REPAIRABLE_COMPOSITION_ERROR)
        plan, changed = repair_composition(content, plan)
        _record(state, RepairType.REPAIRABLE_COMPOSITION_ERROR, composition_report.issues, "rebuild_valid_references", changed, content.content, [], "retry")

    final = FinalResumeDocument(content=content, composition_plan=plan)
    for attempt in range(state.max_repair_attempts["rendering"] + 1):
        state.repair_attempt = attempt
        active_template = template_name if attempt == 0 else "ExecutiveATS"
        try:
            pdf = await renderer(final.render_payload(), active_template)
        except Exception as exc:
            logger.exception(
                "[RESUME-EXPORT] renderer failure request_id=%s attempt=%s template=%s",
                request_id, attempt, active_template,
            )
            if attempt >= state.max_repair_attempts["rendering"]:
                raise ExportWorkflowError(
                    request_id, RepairType.FATAL_SYSTEM_ERROR
                ) from exc
            plan.spacing_profile = "compact"
            plan.compactness_level = min(5, plan.compactness_level + 1)
            final.composition_plan = plan
            _record(
                state, RepairType.REPAIRABLE_RENDERING_ERROR,
                [str(exc)], "switch_to_safe_ats_template",
                ["template_name", "spacing_profile", "compactness_level"],
                content.content, [], "retry",
            )
            continue
        if not pdf:
            raise ExportWorkflowError(request_id, RepairType.FATAL_SYSTEM_ERROR)
        rendered = validate_generated_pdf(pdf, final.render_payload())
        state.rendering_validation_report = rendered
        if rendered.valid:
            state.final_resume_ready = True
            return pdf, final, state
        if attempt >= state.max_repair_attempts["rendering"]:
            state.unresolved_issues = rendered.issues
            raise ExportWorkflowError(request_id, RepairType.REPAIRABLE_RENDERING_ERROR)
        plan.spacing_profile = "compact"
        plan.compactness_level = min(5, plan.compactness_level + 1)
        plan.rendering_hints["repair_missing_links"] = True
        final.composition_plan = plan
        _record(state, RepairType.REPAIRABLE_RENDERING_ERROR, rendered.issues, "compact_and_repair_links", ["spacing_profile", "compactness_level", "rendering_hints"], content.content, [], "retry")

    raise ExportWorkflowError(request_id, RepairType.FATAL_SYSTEM_ERROR)
