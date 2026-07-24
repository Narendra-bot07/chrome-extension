import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeResumeQuality, createCompositionPlan } from './resumeComposition.js';

test('composition plan prioritizes professional sections without losing content', () => {
  const resume = {
    personal_info: { name: 'Ada', email: 'ada@example.com' },
    education: [{ institution: 'London' }],
    projects: [{ name: 'Engine', description: ['Improved throughput by 40%.'] }],
    experience: [{ role: 'Engineer', description: ['Served 10,000+ users.'] }],
    skills: ['Python'],
    achievements: ['Award — Selected among top 100 candidates.']
  };
  const plan = createCompositionPlan(resume);
  assert.deepEqual(plan.sectionOrder.slice(0, 4), ['experience', 'projects', 'skills', 'education']);
  assert.equal(plan.resume.achievements.length, 1);
  assert.equal(plan.quality.metrics.quantifiedBulletCount, 2);
});

test('quality analysis reports critical completeness and duplicate problems', () => {
  const quality = analyzeResumeQuality({
    personal_info: {},
    achievements: ['Hackathon Finalist'],
    awards: [{ title: 'Hackathon Finalist' }]
  });
  assert.equal(quality.status, 'needs-attention');
  assert(quality.issues.some(issue => issue.code === 'missing-name'));
  assert(quality.issues.some(issue => issue.code === 'duplicates'));
});
