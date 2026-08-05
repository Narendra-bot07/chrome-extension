import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateJDMatchScore } from './matchScore.js';
import { mergeReviewResume } from './resumeReviewMerge.js';

const resume = {
  personal_info: { email: 'dev@example.com', phone: '+1 555 0100', linkedin: 'linkedin.com/in/dev' },
  summary: 'Data engineer building reliable pipelines.',
  skills: ['Python'],
  experience: [{ role: 'Data Engineer', start_date: '2023', end_date: 'Present', description: ['Developed reliable Python pipelines for analytics.'] }],
  projects: [],
  education: [{ degree: 'BTech' }],
  certifications: []
};
const job = {
  title: 'Data Engineer',
  required_skills: ['Python', 'Spark'],
  keywords: ['pipelines'],
  qualifications: ['2 years experience'],
  responsibilities: []
};
const suggestions = [{
  id: 'skill-spark',
  sectionType: 'skills',
  original: '',
  suggested: 'Spark',
  status: 'pending'
}];

test('rejecting edits preserves the exact deterministic original ATS values', () => {
  const original = calculateJDMatchScore(resume, job);
  const rejected = mergeReviewResume(resume, suggestions.map(item => ({ ...item, status: 'rejected' }))).workingResume;
  assert.deepEqual(calculateJDMatchScore(rejected, job), original);
});

test('accepted and potential scores use the same deterministic rules', () => {
  const accepted = mergeReviewResume(resume, suggestions.map(item => ({ ...item, status: 'accepted' }))).workingResume;
  const first = calculateJDMatchScore(accepted, job);
  const second = calculateJDMatchScore(structuredClone(accepted), structuredClone(job));
  assert.deepEqual(first, second);
  assert.ok(first.atsScore >= calculateJDMatchScore(resume, job).atsScore);
});
