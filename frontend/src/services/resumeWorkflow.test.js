import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createResumeWorkflowState,
  finalizeTailoredResume,
  resumeWorkflowRepository,
  selectRenderableResume
} from './resumeWorkflow.js';

const original = {
  personal_info: { name: 'Ada' },
  summary: 'Original summary',
  skills: ['SQL'],
  experience: [{
    id: 'exp-1',
    company: 'Example',
    role: 'Engineer',
    description: ['Original bullet']
  }],
  projects: [],
  education: [],
  certifications: [],
  achievements: []
};

const edits = [
  {
    id: 'summary:update:professional-summary',
    sectionType: 'summary',
    original: 'Original summary',
    suggested: 'Accepted tailored summary',
    status: 'accepted'
  },
  {
    id: 'skill:add:python',
    sectionType: 'skills',
    original: '',
    suggested: 'Python',
    skillName: 'Python',
    status: 'rejected'
  },
  {
    id: 'skill:add:pyspark',
    sectionType: 'skills',
    original: '',
    suggested: 'PySpark',
    skillName: 'PySpark',
    status: 'accepted'
  },
  {
    id: 'experience-bullet:update:exp-1:original-bullet',
    sectionType: 'experience',
    itemIndex: 0,
    bulletIndex: 0,
    original: 'Original bullet',
    suggested: 'Accepted tailored bullet',
    status: 'accepted'
  }
];

const finalize = overrides => finalizeTailoredResume({
  originalResume: original,
  tailoredDraft: null,
  edits,
  reviewDecisions: {},
  ...overrides
});

test('accepted skills, summaries, and bullets are applied while rejected skills are excluded', () => {
  const result = finalize();
  assert.equal(result.summary, 'Accepted tailored summary');
  assert.deepEqual(result.skills, ['SQL', 'PySpark']);
  assert.equal(result.skills.includes('Python'), false);
  assert.equal(result.experience[0].description[0], 'Accepted tailored bullet');
});

test('rejected summary and bullet preserve original values', () => {
  const decisions = Object.fromEntries(edits.map(edit => [
    edit.id,
    { editId: edit.id, status: ['summary', 'experience'].includes(edit.sectionType) ? 'rejected' : edit.status }
  ]));
  const result = finalize({ reviewDecisions: decisions });
  assert.equal(result.summary, 'Original summary');
  assert.equal(result.experience[0].description[0], 'Original bullet');
});

test('finalization is immutable, deterministic, and idempotent', () => {
  const before = structuredClone(original);
  const first = finalize();
  const second = finalize();
  const reapplied = finalizeTailoredResume({
    originalResume: first,
    tailoredDraft: first,
    edits,
    reviewDecisions: {}
  });
  assert.deepEqual(original, before);
  assert.deepEqual(first, second);
  assert.deepEqual(reapplied.skills, first.skills);
});

test('templates and download selector receive the exact persisted finalized object', () => {
  const finalizedTailoredResume = finalize();
  const workflow = createResumeWorkflowState({
    originalResume: original,
    tailoredDraft: { ...original, skills: ['SQL', 'Python', 'PySpark'] },
    edits,
    finalizedTailoredResume
  });
  assert.deepEqual(selectRenderableResume(workflow), finalizedTailoredResume);
  assert.equal(selectRenderableResume(workflow).skills.includes('Python'), false);
});

test('rejected decision survives repository reload', async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  await resumeWorkflowRepository.clear();
  const state = createResumeWorkflowState({
    originalResume: original,
    tailoredDraft: null,
    edits,
    finalizedTailoredResume: finalize()
  });
  const saved = await resumeWorkflowRepository.save(state);
  const reloaded = await resumeWorkflowRepository.load();
  assert.equal(reloaded.reviewDecisions['skill:add:python'].status, 'rejected');
  assert.equal(selectRenderableResume(reloaded).skills.includes('Python'), false);
  assert.equal(reloaded.workflowVersion, saved.workflowVersion);
});
