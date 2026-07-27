import test from 'node:test';
import assert from 'node:assert/strict';
import { getPageLayout } from './pageLayout.js';

test('application routes use centralized width modes', () => {
  assert.deepEqual(getPageLayout('/dashboard'), { mode: 'wide', workspace: false });
  assert.deepEqual(getPageLayout('/resume-detect'), { mode: 'wide', workspace: false });
  assert.deepEqual(getPageLayout('/job-tracker'), { mode: 'full', workspace: false });
  assert.deepEqual(getPageLayout('/settings/job-preferences'), { mode: 'full', workspace: false });
  assert.deepEqual(getPageLayout('/download'), { mode: 'full', workspace: true });
  assert.deepEqual(getPageLayout('/support/faq'), { mode: 'reading', workspace: false });
});
