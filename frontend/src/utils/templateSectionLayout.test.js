import test from 'node:test';
import assert from 'node:assert/strict';
import { getTemplateSectionLayout } from './templateSectionLayout.js';

const sections = [
  'summary', 'experience', 'projects', 'skills', 'education',
  'achievements', 'certifications'
];

test('TwoColumnATS editor groups match the rendered resume columns', () => {
  const layout = getTemplateSectionLayout(
    { id: 'TwoColumnATS', layout: 'two-column' },
    sections
  );
  assert.equal(layout.split, true);
  assert.deepEqual(layout.primary, ['skills', 'education', 'certifications']);
  assert.deepEqual(layout.secondary, [
    'summary', 'experience', 'projects', 'achievements'
  ]);
  assert.equal(layout.primaryLabel, 'Left Column');
  assert.equal(layout.secondaryLabel, 'Right Column');
});

test('Alta sidebar keeps education in the main resume column', () => {
  const layout = getTemplateSectionLayout(
    { id: 'AltaATS', layout: 'sidebar' },
    sections
  );
  assert.deepEqual(layout.primary, ['skills', 'certifications']);
  assert.deepEqual(layout.secondary, [
    'summary', 'experience', 'projects', 'education', 'achievements'
  ]);
  assert.equal(layout.primaryLabel, 'Sidebar');
  assert.equal(layout.secondaryLabel, 'Main Column');
});

test('single-column editor preserves exact resume order', () => {
  const layout = getTemplateSectionLayout(
    { id: 'ExecutiveATS', layout: 'single-column' },
    sections
  );
  assert.equal(layout.split, false);
  assert.deepEqual(layout.primary, sections);
});

test('two-column layout moves a heavy supporting section into available space', () => {
  const resume = {
    summary: 'Data engineer.',
    experience: [{ role: 'Engineer', description: ['Built pipelines.'] }],
    projects: [{ name: 'Audit', description: ['Built an audit tool.'] }],
    skills: ['Python', 'SQL'],
    education: [{ institution: 'University', degree: 'BSc' }],
    achievements: ['Finalist'],
    certifications: Array.from({ length: 6 }, (_, index) => ({
      name: `Certification ${index + 1}`,
      description: 'Completed professional training with detailed practical coursework and assessment evidence.'
    }))
  };
  const layout = getTemplateSectionLayout(
    { id: 'TwoColumnATS', layout: 'two-column' },
    sections,
    resume
  );
  assert.equal(layout.primary.includes('certifications'), false);
  assert.equal(layout.secondary.includes('certifications'), true);
});
