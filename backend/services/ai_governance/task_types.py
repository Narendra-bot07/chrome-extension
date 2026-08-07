"""Explicit AI task registry.

Every LLM call anywhere in the backend must declare exactly one AITaskType.
There is no generic/unrestricted "chat" execution -- an unknown or missing
task type is rejected by the gateway, not silently defaulted.

`LIVE_TASK_TYPES` marks which of these actually have a call site today (per
the 2026-08-07 full-codebase audit, see docs/AI_GOVERNANCE.md). The others
are defined for spec-completeness / future features and MUST go through
register_task() (see docs/AI_GOVERNANCE.md "Adding a new AI feature") before
any code may use them for a real call.
"""
from enum import Enum


class AITaskType(str, Enum):
    # --- Resume pipeline ---
    RESUME_PARSE = "resume_parse"
    """Extract structured resume data from raw uploaded text. Covers both the
    explicit /resumes/{id}/parse endpoint and the background re-parse
    recovery job -- both call the same underlying operation."""

    RESUME_TAILOR = "resume_tailor"
    """Generate a tailoring patch (bullet rewrites, skill alignment, summary
    rewrite) against a specific job description."""

    RESUME_SEMANTIC_INSIGHTS = "resume_semantic_insights"
    """Phase-2 resume-intelligence semantic analysis (capabilities, domain
    experience, ambiguities) run over a locked, confirmed resume snapshot."""

    GAP_ANALYSIS = "gap_analysis"
    """Identify gaps between a resume and a job description."""

    # --- Editing ---
    EDIT_WITH_AI = "edit_with_ai"
    """Section/field-scoped rewrite driven by a free-text user instruction.
    Highest-risk task type -- see docs/AI_GOVERNANCE.md "Edit With AI"
    section. Must only ever touch the caller-declared target section/item."""

    SUMMARY_GENERATE = "summary_generate"
    """Standalone professional-summary generation/rewrite. No independent
    call site yet as of the 2026-08-07 audit -- currently subsumed by
    RESUME_TAILOR and EDIT_WITH_AI's section_type=="summary" branch."""

    GRAMMAR_REWRITE = "grammar_rewrite"
    """Grammar/tone/clarity-only rewrite with no factual changes permitted.
    No dedicated endpoint yet -- reserved for a future feature or an
    EDIT_WITH_AI sub-mode."""

    # --- Job description ---
    JD_ANALYZE = "jd_analyze"
    """Classify and extract structured job-posting data from a URL, scraped
    evidence, or pasted text."""

    SKILL_CLASSIFY = "skill_classify"
    """Categorize skill names into the fixed skill-taxonomy buckets."""

    # --- Cover letters ---
    COVER_LETTER_GENERATE = "cover_letter_generate"
    """Generate a cover letter draft from verified JD + canonical resume
    evidence + user preferences. Two implementations currently reach this
    task (docs/KNOWN_ISSUES.md ISSUE-014) -- both must route through the
    same policy once migrated, which is expected to surface the
    duplication for consolidation rather than hide it further."""

    COVER_LETTER_REVIEW = "cover_letter_review"
    """AI-mode review of a drafted cover letter (deterministic review mode
    is a separate, non-LLM code path and does not need a task type)."""

    COVER_LETTER_EDIT = "cover_letter_edit"
    """Paragraph-level patch editing of an existing cover letter draft."""

    # --- ATS / explanation ---
    ATS_EXPLANATION = "ats_explanation"
    """Plain-language explanation of an ATS/match score. No LLM call site
    yet -- ATS scoring itself is fully deterministic (ATSScoringEngine).
    Reserved for a future "explain my score" feature."""

    RESUME_RECOVERY = "resume_recovery"
    """Reserved alias matching the security-spec's task list. The existing
    ResumeRecoveryAgent (services/resume/recovery_engine.py) is fully
    deterministic/regex-based and makes no LLM call, so nothing currently
    needs to declare this task type. If recovery ever grows an LLM-backed
    fallback, it must register under this type, not RESUME_PARSE."""


# Task types with at least one live call site as of the 2026-08-07 audit.
# Kept as an explicit allowlist (rather than "all of them") so a newly added
# enum member is NOT usable until someone deliberately adds it here alongside
# a policy in policies.py -- see docs/AI_GOVERNANCE.md.
LIVE_TASK_TYPES: frozenset[AITaskType] = frozenset({
    AITaskType.RESUME_PARSE,
    AITaskType.RESUME_TAILOR,
    AITaskType.RESUME_SEMANTIC_INSIGHTS,
    AITaskType.GAP_ANALYSIS,
    AITaskType.EDIT_WITH_AI,
    AITaskType.JD_ANALYZE,
    AITaskType.SKILL_CLASSIFY,
    AITaskType.COVER_LETTER_GENERATE,
    AITaskType.COVER_LETTER_REVIEW,
    AITaskType.COVER_LETTER_EDIT,
})
