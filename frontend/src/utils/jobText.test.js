import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeJobItems } from './jobText.js';

test('normalizes HTML-rich JSON-LD lists to plain list items', () => {
  const value = '<p><strong>Required Qualifications:&nbsp;</strong></p><ul>'
    + '<li><p>6+ years in C++ &amp; Python</p></li>'
    + '<li>Associate&rsquo;s degree</li></ul>';

  assert.deepEqual(normalizeJobItems(value), [
    '6+ years in C++ & Python',
    'Associate’s degree'
  ]);
});

test('flattens and deduplicates mixed stored job values', () => {
  assert.deepEqual(normalizeJobItems(['<ul><li>Build APIs</li></ul>', 'Build APIs']), ['Build APIs']);
});
