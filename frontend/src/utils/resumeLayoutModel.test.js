import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLayoutChange,
  createResumeLayoutModel,
  reorderRegionComponents,
  validateSectionPlacement
} from './resumeLayoutModel.js';

const config = { layout: 'sidebar' };
const resume = {
  section_order: ['summary', 'experience', 'skills', 'education', 'certifications'],
  experience: [{ description: ['Built reliable systems.'] }]
};

test('one model preserves explicit column order without duplicates', () => {
  const model = createResumeLayoutModel({
    ...resume,
    layout_model: {
      main_column: ['summary', 'experience', 'skills', 'skills', 'bogus'],
      sidebar: ['education', 'certifications'],
      hidden_sections: []
    }
  }, 'AltaATS', config);

  assert.deepEqual(model.main_column, ['summary', 'experience', 'skills']);
  assert.deepEqual(model.sidebar, ['education', 'certifications']);
});

test('header components reorder inside the persisted layout tree', () => {
  const model = createResumeLayoutModel(resume, 'AltaATS', config);
  const nameIndex = model.layout_tree.header.components.indexOf('name');
  const githubIndex = model.layout_tree.header.components.indexOf('github');
  const result = reorderRegionComponents(model, 'header', githubIndex, nameIndex);

  assert.equal(result.valid, true);
  assert.equal(result.model.layout_tree.header.components[nameIndex], 'github');
  assert.equal(result.model.layout_tree.header.components.includes('name'), true);
});

test('experience and summary cannot enter the sidebar', () => {
  assert.equal(validateSectionPlacement('experience', 'sidebar', resume).valid, false);
  assert.equal(validateSectionPlacement('summary', 'sidebar', resume).valid, false);
});

test('supported sections move between columns through the model', () => {
  const model = createResumeLayoutModel(resume, 'AltaATS', config);
  const result = applyLayoutChange(resume, model, 'skills', 'main', 1);

  assert.equal(result.valid, true);
  assert.deepEqual(result.model.main_column.slice(0, 2), ['summary', 'skills']);
  assert.equal(result.model.sidebar.includes('skills'), false);
});
