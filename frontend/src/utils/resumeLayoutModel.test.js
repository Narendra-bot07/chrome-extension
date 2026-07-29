import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLayoutChange,
  createResumeLayoutModel,
  reorderRegionComponents,
  validateSectionPlacement
} from './resumeLayoutModel.js';

const config = {
  layout: 'sidebar',
  profilePhoto: false,
  borders: { headerDivider: true }
};
const resume = {
  section_order: ['summary', 'experience', 'skills', 'education', 'certifications'],
  personal_info: { name: 'Ada', email: 'ada@example.com' },
  candidate_links: [{
    owner_type: 'candidate', platform: 'github',
    validation_status: 'VALID', url: 'https://github.com/ada'
  }],
  summary: 'Engineer.',
  experience: [{ description: ['Built reliable systems.'] }],
  skills: ['Python'],
  education: [{ institution: 'University' }],
  certifications: [{ name: 'Cloud' }]
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

test('header and body expose only components backed by current content', () => {
  const model = createResumeLayoutModel(resume, 'AltaATS', config);
  assert.deepEqual(model.layout_tree.header.components, [
    'name', 'email', 'github', 'header_divider'
  ]);
  assert.equal(model.layout_tree.header.components.includes('photo'), false);
  assert.equal(model.layout_tree.header.components.includes('portfolio'), false);
  assert.equal(model.layout_tree.footer.components.length, 0);
  assert.ok(Object.values(model.component_metadata).every(
    component => component.visible && component.content_available
  ));
});

test('project links never enable candidate header components', () => {
  const model = createResumeLayoutModel({
    personal_info: { name: 'Ada' },
    projects: [{
      name: 'Project',
      links: [{ owner_type: 'project', platform: 'github', url: 'https://github.com/ada/project' }]
    }]
  }, 'AltaATS', config);
  assert.equal(model.layout_tree.header.components.includes('github'), false);
  assert.equal(model.layout_tree.header.components.includes('other_links'), false);
});

test('stale hidden metadata cannot remove populated reviewed sections', () => {
  const model = createResumeLayoutModel({
    ...resume,
    section_order: [...resume.section_order, 'achievements'],
    achievements: ['Improved processing reliability.'],
    layout_model: {
      main_column: ['summary', 'experience'],
      sidebar: ['skills', 'education', 'certifications'],
      hidden_sections: ['achievements']
    }
  }, 'AltaATS', config);

  assert.equal(model.hidden_sections.length, 0);
  assert.equal(
    [...model.main_column, ...model.sidebar].includes('achievements'),
    true
  );
});
