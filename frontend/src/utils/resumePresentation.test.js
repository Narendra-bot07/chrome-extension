import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalContactIdentity,
  normalizeDetailedRecords,
  normalizePersonName,
  professionalLink
} from './resumePresentation.js';

test('normalizes each achievement into one independent title-description record', () => {
  const records = normalizeDetailedRecords([
    'Competitive Programming — Solved 500+ problems and reached Top 18%.',
    { title: 'Hackathon Finalist', description: 'Selected among the top 25 participants.' }
  ]);
  assert.deepEqual(records.map(item => item.title), [
    'Competitive Programming', 'Hackathon Finalist'
  ]);
  assert.equal(records[0].description, 'Solved 500+ problems and reached Top 18%.');
  assert.equal(records[1].description, 'Selected among the top 25 participants.');
});

test('deduplicates exact records without sharing descriptions across entries', () => {
  const records = normalizeDetailedRecords([
    'EPAM Scholarship — Selected among the top 100 candidates.',
    'EPAM Scholarship — Selected among the top 100 candidates.'
  ]);
  assert.equal(records.length, 1);
});

test('maps raw professional URLs to concise labels', () => {
  assert.equal(professionalLink('source', 'https://leetcode.com/u/test').label, 'LeetCode');
  assert.equal(professionalLink('github', 'https://github.com/test').label, 'GitHub');
  assert.equal(professionalLink('certificate', 'https://drive.google.com/x').label, 'Certificates');
});

test('preserves the candidate name without extraction whitespace artifacts', () => {
  assert.equal(
    normalizePersonName('  Manthravadi\u200b   Vani  '),
    'Manthravadi Vani'
  );
  assert.equal(
    normalizePersonName('MANTHRA V ADI VANI'),
    'MANTHRAVADI VANI'
  );
  assert.equal(
    normalizePersonName('MANTHR A VADI VANI'),
    'MANTHRAVADI VANI'
  );
  assert.equal(normalizePersonName('John A Smith'), 'John A Smith');
});

test('canonicalizes duplicate contact links and mailto email values', () => {
  assert.equal(
    canonicalContactIdentity('linkedin', 'https://www.linkedin.com/in/vani/'),
    canonicalContactIdentity('LinkedIn profile', 'linkedin.com/in/vani')
  );
  assert.equal(
    canonicalContactIdentity('github', 'https://github.com/vani/?tab=repositories'),
    canonicalContactIdentity('GitHub', 'github.com/vani')
  );
  assert.equal(
    canonicalContactIdentity('email', 'vani306m@gmail.com'),
    canonicalContactIdentity('mail', 'mailto:VANI306M@gmail.com')
  );
});
