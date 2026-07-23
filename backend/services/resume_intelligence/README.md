# Phase 2 — Selected Resume Intelligence

This package builds a trusted, evidence-grounded representation of exactly one
resume selected and confirmed by the authenticated user.

It does not compare resumes, inspect a JD, calculate ATS scores, identify
JD-specific gaps, tailor content, rewrite text, or render documents.

## Trust boundary

The API accepts one `resume_id`. Every repository lookup uses:

```text
resume_id + authenticated user_id + deleted_at IS NULL
```

No Phase 2 component calls `list_by_user`. The selected source file is hashed
with SHA-256 and locked with its database version. Nodes revalidate this lock,
and finalization rehashes the source. Stale or changed identity blocks the
workflow and writes a sanitized checkpoint with downstream intelligence
removed.

## Workflow

```text
validate_selected_resume
-> lock_selected_resume
-> load_selected_resume
-> normalize_selected_resume
-> analyze_selected_resume
-> semantic_resume_reasoning (optional, one bounded call)
-> review_resume_intelligence
-> targeted repair when required
-> finalize_resume_intelligence
```

All nodes implement the Phase 1 `WorkflowNode` contract and run through its
validation, retry, repair, checkpoint, cancellation, and confirmation
infrastructure.

## Deterministic responsibilities

- Fingerprinting and version checks
- Text and bullet normalization
- Heading and section mapping
- Contact and URL detection
- Date parsing and duration calculation
- Overlap-safe total experience
- Exact metric extraction
- Skill alias normalization and deduplication
- Credential type classification
- Duplicate and chronology checks
- Provenance construction
- Output validation

## Semantic boundary

The optional semantic node receives only normalized text from the selected
resume. It may identify evidence-supported inferred capabilities, domains, and
ambiguities. Every returned quote must exist exactly in the selected resume or
the insight is discarded. Inferences never become explicit capabilities.

## API

```text
POST /api/v1/resumes/{resume_id}/intelligence
POST /api/v1/resumes/{resume_id}/intelligence/{workflow_id}/confirm
```

The stable response contains `selected_resume`, `resume_intelligence`,
`review`, workflow ID, status, warnings, and contract version. Raw workflow
state and original resume text are not returned.

## Database

Apply:

```powershell
py -3 migrate_workflow_orchestration.py
py -3 migrate_resume_intelligence.py
```

The migrations are idempotent. The first creates durable workflow runs and
checkpoints. The second adds resume version and fingerprint identity fields.

## Privacy

Logs contain safe identifiers, versions, counts, statuses, durations, review
outcomes, and workflow metadata. They exclude resume text, prompts, contact
details, addresses, tokens, and secrets.
