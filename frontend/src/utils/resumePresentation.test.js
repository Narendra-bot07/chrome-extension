import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDetailedRecords } from './resumePresentation.js';

test('certification metadata zero is not rendered as description text', () => {
  const records = normalizeDetailedRecords([{
    name: 'Databricks Certified Data Engineer Associate 2026',
    description: 0,
    issuing_organization: 0,
    issue_date: 0
  }], 'certification');

  assert.equal(records.length, 1);
  assert.equal(records[0].title, 'Databricks Certified Data Engineer Associate 2026');
  assert.equal(records[0].description, '');
  assert.equal(records[0].organization, '');
  assert.equal(records[0].date, '');
});
