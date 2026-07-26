import test from 'node:test';
import assert from 'node:assert/strict';
import {
  A4_PAGE, COMPOSITION_LIMITS, DENSITY_PROFILES,
  buildMeasuredCompositionPlan, waitForRenderableFonts
} from './finalCompositionPlan.js';

const sections = [
  { id: 'summary', offset: 80, height: 100 },
  { id: 'experience', offset: 200, height: 360 },
  { id: 'projects', offset: 590, height: 300 },
  { id: 'skills', offset: 920, height: 180 },
  { id: 'education', offset: 1130, height: 220 }
];

test('measured content determines real A4 page count and a balanced break', () => {
  const plan = buildMeasuredCompositionPlan({
    contentHeight: 1354, sectionMeasurements: sections,
    layoutLevel: 4, templateName: 'ExecutiveATS'
  });
  assert.equal(A4_PAGE.heightPx, 1122);
  assert.equal(plan.page_count, 2);
  assert.equal(plan.page_breaks[0], 'projects');
  assert.equal(plan.pages[0].sections.includes('projects'), false);
  assert.match(plan.plan_hash, /^fcp-/);
});

test('prefer one page cannot override measured overflow', () => {
  const plan = buildMeasuredCompositionPlan({
    contentHeight: 1354, sectionMeasurements: sections,
    layoutLevel: 4, templateName: 'ExecutiveATS', preference: 'one'
  });
  assert.equal(plan.page_count, 2);
  assert.match(plan.explanation, /needs 2 pages/);
});

test('small resume remains readable on one page', () => {
  const plan = buildMeasuredCompositionPlan({
    contentHeight: 760,
    sectionMeasurements: sections.slice(0, 3),
    layoutLevel: 8
  });
  assert.equal(plan.page_count, 1);
  assert.equal(plan.density, 'comfortable');
  assert.equal(plan.validation_report.valid, true);
});

test('bare overflow uses compact one-page measurement when it actually fits', () => {
  const plan = buildMeasuredCompositionPlan({
    contentHeight: A4_PAGE.heightPx - 1,
    sectionMeasurements: sections.slice(0, 4),
    layoutLevel: 5,
    optimizationActions: ['reduced_section_spacing']
  });
  assert.equal(plan.page_count, 1);
  assert.equal(plan.density, 'compact');
  assert.deepEqual(plan.optimization_actions, ['reduced_section_spacing']);
});

test('unsafe clipping invalidates a composition', () => {
  const plan = buildMeasuredCompositionPlan({
    contentHeight: 700,
    sectionMeasurements: sections.slice(0, 3),
    measurementFlags: { hasClipping: true }
  });
  assert.equal(plan.validation_report.valid, false);
  assert.equal(plan.validation_report.clipping, true);
});

test('compact density uses compact layouts for supporting sections', () => {
  const plan = buildMeasuredCompositionPlan({
    contentHeight: 900,
    sectionMeasurements: sections,
    layoutLevel: 5
  });
  assert.equal(plan.section_layouts.skills.representation, 'compact');
  assert.equal(plan.section_layouts.education.representation, 'compact');
  assert.equal(plan.typography.body_font_size, DENSITY_PROFILES.compact.body_font_size);
});

test('every measured section is preserved in the page plan', () => {
  const plan = buildMeasuredCompositionPlan({
    contentHeight: 1354,
    sectionMeasurements: sections,
    layoutLevel: 4
  });
  assert.deepEqual(plan.pages.flatMap(page => page.sections), sections.map(section => section.id));
  assert.equal(plan.validation_report.content_preserved, true);
});

test('prefer two pages does not create a nearly empty second page', () => {
  const plan = buildMeasuredCompositionPlan({
    contentHeight: 500,
    sectionMeasurements: sections.slice(0, 2),
    preference: 'two'
  });
  assert.equal(plan.page_count, 1);
});

test('repeated composition is deterministic', () => {
  const input = {
    contentHeight: 1354,
    sectionMeasurements: sections,
    layoutLevel: 4,
    templateName: 'ClassicATS'
  };
  assert.deepEqual(buildMeasuredCompositionPlan(input), buildMeasuredCompositionPlan(input));
});

test('optimization actions are bounded', () => {
  const actions = Array.from({ length: 20 }, (_, index) => `action-${index}`);
  const plan = buildMeasuredCompositionPlan({
    contentHeight: 800,
    sectionMeasurements: sections.slice(0, 3),
    optimizationActions: actions
  });
  assert.equal(plan.optimization_actions.length, COMPOSITION_LIMITS.maxOnePageAttempts);
});

test('font readiness is awaited before measurement', async () => {
  let resolved = false;
  const ready = Promise.resolve().then(() => { resolved = true; });
  await waitForRenderableFonts({ fonts: { ready } });
  assert.equal(resolved, true);
});

test('divider lines remain thin at every density', () => {
  Object.values(DENSITY_PROFILES).forEach(profile => {
    assert.ok(profile.divider_width <= 1);
  });
});

test('a section continuing onto page two is not treated as a blank page', () => {
  const plan = buildMeasuredCompositionPlan({
    contentHeight: 1400,
    sectionMeasurements: [
      { id: 'experience', offset: 80, height: 1250 }
    ],
    layoutLevel: 4
  });
  assert.equal(plan.page_count, 2);
  assert.equal(plan.pages[1].continued_from_previous_page, true);
  assert.equal(plan.validation_report.blank_trailing_page, false);
  assert.equal(plan.validation_report.valid, true);
});

test('a tiny education-only second page is rejected for repair', () => {
  const plan = buildMeasuredCompositionPlan({
    contentHeight: 1200,
    sectionMeasurements: [
      { id: 'experience', offset: 40, height: 990, bottom: 1030 },
      { id: 'education', offset: 1130, height: 70, bottom: 1200 }
    ],
    layoutLevel: 0
  });
  assert.equal(plan.page_count, 2);
  assert.equal(plan.validation_report.education_orphaned, true);
  assert.equal(plan.validation_report.valid, false);
});

test('final plan contains physical spacing and measured utilization', () => {
  const plan = buildMeasuredCompositionPlan({
    contentHeight: 900,
    sectionMeasurements: sections.slice(0, 3),
    layoutLevel: 5
  });
  assert.ok(plan.section_spacing.gap_px <= 8);
  assert.ok(plan.entry_spacing.gap_px <= 5);
  assert.ok(plan.divider_style.thickness_px <= 0.8);
  assert.equal(plan.page_utilization.length, 1);
  assert.ok(plan.section_measurements.experience.height_px > 0);
});
