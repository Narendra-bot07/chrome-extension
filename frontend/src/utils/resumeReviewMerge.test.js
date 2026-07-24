import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasReviewOperation,
  mergeReviewResume,
  validateWorkingResume
} from './resumeReviewMerge.js';
import { toRenderableResume } from './renderableResume.js';

const original = {
  personal_info: { name: 'Shravya', linkedin: 'https://linkedin.com/in/shravya' },
  experience: [{ role: 'Intern', description: ['Original one', 'Untouched sibling'] }],
  projects: [{ name: 'BRO', description: ['Project one', 'Project two'] }],
  achievements: ['Competitive Programming — Solved 500+ problems; Top 18%.'],
  certifications: [{ name: 'Zero Trust Training', credential_id: 'ZTA-1' }],
  custom_sections: [{ title: 'Leadership', description: ['Increased membership by 40%.'] }]
};

test('accepted change updates one bullet and preserves the complete immutable source', () => {
  const snapshot = structuredClone(original);
  const result = mergeReviewResume(original, [{
    id: 'change-1', sectionType: 'experience', itemIndex: 0, bulletIndex: 0,
    original: 'Original one', suggested: 'Improved original one', status: 'accepted'
  }]);
  assert.equal(result.workingResume.experience[0].description[0], 'Improved original one');
  assert.equal(result.workingResume.experience[0].description[1], 'Untouched sibling');
  assert.deepEqual(original, snapshot);
  assert.equal(result.workingResume.achievements.length, 1);
  assert.equal(result.workingResume.custom_sections.length, 1);
  assert(validateWorkingResume(original, result.workingResume, result.operations).valid);
});

test('rejected and reject-all decisions reconstruct the complete original', () => {
  const result = mergeReviewResume(original, [{
    id: 'change-1', sectionType: 'projects', itemIndex: 0, bulletIndex: 0,
    original: 'Project one', suggested: 'Changed', status: 'rejected'
  }]);
  assert.deepEqual(result.workingResume, toRenderableResume(original));
});

test('new summary and skill proposals remain review-visible before acceptance', () => {
  const suggestions = [
    {
      id: 'summary:0', sectionType: 'summary', itemIndex: 0, bulletIndex: 0,
      original: '', suggested: 'Proposed professional summary.', status: 'pending'
    },
    {
      id: 'skill:sql', sectionType: 'skills', skillName: 'SQL',
      suggested: 'SQL', status: 'rejected'
    }
  ];
  const result = mergeReviewResume(
    { personal_info: { name: 'Ada' }, summary: '', skills: [] },
    suggestions
  );
  assert.equal(result.workingResume.summary, '');
  assert.equal(hasReviewOperation(suggestions, 'summary'), true);
  assert.equal(hasReviewOperation(suggestions, 'skills'), true);
  assert.equal(result.operations[0].proposed_text, 'Proposed professional summary.');
});

test('invalid nested targets never replace or truncate arrays', () => {
  const result = mergeReviewResume(original, [{
    id: 'bad', sectionType: 'projects', itemIndex: 0, bulletIndex: 99,
    original: '', suggested: 'Invalid', status: 'accepted'
  }]);
  assert.equal(result.invalidOperations.length, 1);
  assert.deepEqual(result.workingResume.projects[0].description, ['Project one', 'Project two']);
});

test('parser aliases and string descriptions remain visible in the review model', () => {
  const result = mergeReviewResume({
    professional_summary: 'Complete source summary.',
    work_experience: [{
      role: 'Engineer',
      company: 'Example',
      responsibilities: 'Preserve this source description.'
    }],
    achievements: [{
      title: 'Competitive Programming',
      description: 'Solved 500+ problems and achieved a Top 18% ranking.'
    }]
  }, []);
  assert.equal(result.workingResume.summary, 'Complete source summary.');
  assert.deepEqual(
    result.workingResume.experience[0].description,
    ['Preserve this source description.']
  );
  assert.match(result.workingResume.achievements[0], /Solved 500\+ problems/);
});
