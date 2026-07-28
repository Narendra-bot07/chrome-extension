import test from 'node:test';
import assert from 'node:assert/strict';
import { toRenderableResume } from './renderableResume.js';

test('projects stored records into professional resume content only', () => {
  const result = toRenderableResume({
    id: 'db-id',
    created_at: '2026-01-01',
    file_name: 'private.pdf',
    personal_info: { name: 'Shravya', email: 's@example.com' },
    achievements: [
      { title: 'Competitive Programming', description: 'Solved 500+ problems.' },
      { title: 'Competitive Programming', description: 'Solved 500+ problems.' }
    ],
    certifications: [
      { name: 'Competitive Programming' },
      { name: 'Zero Trust Architecture', issuing_organization: 'Cloud Academy' }
    ],
    custom_sections: [{ title: 'Community', description: ['Mentored students.'] }]
  });

  for (const forbidden of ['id', 'created_at', 'file_name']) {
    assert.equal(forbidden in result, false);
  }
  assert.equal(result.achievements.length, 2);
  assert.deepEqual(
    result.certifications.map(item => item.name),
    ['Competitive Programming', 'Zero Trust Architecture']
  );
  assert.equal(result.custom_sections[0].description[0], 'Mentored students.');
});

test('keeps achievement and certification source arrays lossless', () => {
  const result = toRenderableResume({
    achievements: [
      { title: 'Competitive Programming', description: 'Solved 500+ problems.' },
      { title: 'Zero Trust Training', description: 'Completed security training.' }
    ],
    certifications: [
      'Hackathon Finalist - Selected among the top 25 participants.',
      'Cloud Certification - Completed cloud architecture training.'
    ]
  });
  assert.equal(result.achievements.length, 2);
  assert(result.achievements.some(item => item.includes('Competitive Programming')));
  assert(result.achievements.some(item => item.includes('Zero Trust Training')));
  assert(!result.achievements.some(item => item.includes('Hackathon Finalist')));
  assert.deepEqual(
    result.certifications.map(item => item.name),
    ['Hackathon Finalist', 'Cloud Certification']
  );
});
