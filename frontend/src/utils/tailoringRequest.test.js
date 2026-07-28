import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTailoringComparePayload,
  canonicalTailoringSelections
} from './tailoringRequest.js';

test('selected patchable fields survive the compare request', () => {
  const payload = buildTailoringComparePayload({
    resumeId: 'resume-1',
    resume: { summary: 'Source summary' },
    job: { id: 'job-1' },
    selectedSections: ['projects', 'summary', 'experience']
  });
  assert.deepEqual(
    payload.selected_sections,
    ['experience', 'projects', 'summary']
  );
});

test('locked review-only fields do not alter automatic patch identity', () => {
  assert.deepEqual(
    canonicalTailoringSelections([
      'summary', 'achievements', 'education', 'certifications'
    ]),
    ['summary']
  );
});
