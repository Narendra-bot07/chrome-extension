# Resume Preservation Intelligence Engine (Phase 7.1)

`preservation.py` is a deterministic integrity boundary. It does not call an
LLM and does not tailor, rewrite, score ATS relevance, lay out, or render a
resume.

## Flow

1. Inventory the original and current resume.
2. Assign stable semantic IDs to sections, entries, bullets, descriptions,
   links, and fields.
3. Match exact identities, then bounded semantic continuity.
4. Classify elements as unchanged, modified, reordered, hidden, removed, or
   new.
5. Detect missing descriptions, bullets, metrics, URLs, major entries,
   duplicates, unsupported additions, and metadata leakage.
6. Apply targeted restoration to missing paths when repair is enabled.
7. Block continuation when a critical issue remains.

The lossless result always starts as a deep copy. Nested lists are repaired at
the affected path; complete sections are not replaced merely because one
bullet changed.

## Integration points

- `services.resume.composition.audit_resume_preservation` delegates to the
  engine while retaining its legacy report interface.
- PDF generation already calls that composition gate.
- `TailoringService.execute_tailoring_flow` runs preservation before saving a
  tailored version and returns `preservation_report`.
- `POST /api/v1/tailor/preservation` exposes the standalone authenticated
  validation/repair contract.

An HTTP 422 from the endpoint means composition must stop.

## Output

- `lossless_resume`
- preservation score and confidence
- stable element states
- structured issues
- targeted repair actions with timestamp and responsible agent
- counts for modified, reordered, lost, recovered, duplicated, and
  hallucinated elements

The preservation score is diagnostic only. `valid` is the pipeline gate.

