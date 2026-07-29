import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTailoringCount,
  mapTailoringSeries,
  totalTailoredInSeries,
} from './tailoringTrend.js';

test('maps backend daily series directly without redistributing totals', () => {
  const source = [
    { date: '2026-07-23', count: 1 },
    { date: '2026-07-24', count: 0 },
    { date: '2026-07-25', count: 2 },
    { date: '2026-07-26', count: 3 },
    { date: '2026-07-27', count: 0 },
    { date: '2026-07-28', count: 1 },
    { date: '2026-07-29', count: 0 },
  ];
  assert.deepEqual(mapTailoringSeries(source).map(item => item.count), [1, 0, 2, 3, 0, 1, 0]);
});

test('range total is the sum of daily buckets', () => {
  assert.equal(totalTailoredInSeries([{ count: 2 }, { count: 0 }, { count: 3 }]), 5);
});

test('tooltip count uses correct singular and plural wording', () => {
  assert.equal(formatTailoringCount(1), '1 JD extracted');
  assert.equal(formatTailoringCount(2), '2 JDs extracted');
});

test('preserves zero-filled 7-day and 30-day backend series lengths', () => {
  const makeSeries = length => Array.from({ length }, (_, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, '0')}`,
    count: 0,
  }));
  assert.equal(mapTailoringSeries(makeSeries(7)).length, 7);
  assert.equal(mapTailoringSeries(makeSeries(30)).length, 30);
});
