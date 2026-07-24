import test from 'node:test';
import assert from 'node:assert/strict';
import { toRenderableResume } from './renderableResume.js';

test('projects stored records into professional resume content only', () => {
  const result = toRenderableResume({
    id: 'db-id',
    created_at: '2026-01-01',
    file_name: 'private.pdf',
    file_size: 1234,
    file_type: 'application/pdf',
    parse_status: 'complete',
    upload_source: 'dashboard',
    personal_info: { name: 'Shravya', email: 's@example.com' },
    achievements: [
      { title: 'Competitive Programming', description: 'Solved 500+ problems; LeetCode Top 18%.' },
      { title: 'Competitive Programming', description: 'Solved 500+ problems; LeetCode Top 18%.' }
    ],
    certifications: [
      { name: 'Competitive Programming' },
      { name: 'Zero Trust Architecture', issuing_organization: 'Cloud Academy' }
    ],
    custom_sections: [{ title: 'Community', description: ['Mentored students.'] }]
  });

  for (const forbidden of ['id', 'created_at', 'file_name', 'file_size', 'file_type', 'parse_status', 'upload_source']) {
    assert.equal(forbidden in result, false);
  }
  assert.deepEqual(result.achievements, [
    'Competitive Programming — Solved 500+ problems; LeetCode Top 18%.'
  ]);
  assert.deepEqual(result.certifications.map(item => item.name), ['Zero Trust Architecture']);
  assert.equal(result.custom_sections[0].description[0], 'Mentored students.');
});

test('keeps achievement evidence distinct from certification evidence', () => {
  const result = toRenderableResume({
    achievements: [
      { title: 'Competitive Programming', description: 'Solved 500+ problems.' },
      { title: 'Zero Trust Training', description: 'Completed security training.' }
    ],
    certifications: [
      'Hackathon Finalist — Selected among the top 25 participants.',
      'Cloud Certification — Completed cloud architecture training.'
    ]
  });
  assert(result.achievements.some(item => item.includes('Competitive Programming')));
  assert(result.achievements.some(item => item.includes('Hackathon Finalist')));
  assert(!result.achievements.some(item => item.includes('Cloud Certification')));
  assert(result.certifications.some(item => item.name === 'Zero Trust Training'));
  assert(result.certifications.some(item => item.name === 'Cloud Certification'));
});
