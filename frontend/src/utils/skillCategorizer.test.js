import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categorizeSkill,
  categorizeSkills,
  normalizeSkillName
} from './skillCategorizer.js';

test('skill aliases normalize to one approved display name', () => {
  assert.equal(normalizeSkillName(' py spark '), 'PySpark');
  assert.equal(normalizeSkillName('postgres'), 'PostgreSQL');
  assert.equal(normalizeSkillName('scikit learn'), 'scikit-learn');
  assert.equal(normalizeSkillName('ms azure'), 'Microsoft Azure');
});

test('unknown skills use Other', () => {
  assert.equal(categorizeSkill('Special Internal Tool').category, 'Other');
});

test('categorized and flat AI skills merge without semantic duplicates', () => {
  const result = categorizeSkills(
    ['py spark', 'Pandas', 'Special Internal Tool'],
    { 'Data Engineering': ['PySpark'], Languages: ['Python'] }
  );
  assert.deepEqual(result['Data Engineering'], ['PySpark']);
  assert.deepEqual(result['Frameworks and Libraries'], ['Pandas']);
  assert.deepEqual(result.Other, ['Special Internal Tool']);
});
