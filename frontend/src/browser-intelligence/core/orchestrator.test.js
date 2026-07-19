import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserIntelligenceOrchestrator } from './orchestrator.js';
import { LegacyExtractionAdapter } from '../adapters/legacyExtractionAdapter.js';

const silentTelemetry = { emit() {} };
const incomplete = () => ({ classification: 'uncertain', confidence: 0.15, pageState: 'extraction_incomplete', isJobPage: false, jobId: '42', title: '', company: '', description: '' });
const success = () => ({ classification: 'job_listing', confidence: 0.91, pageState: 'job_listing', isJobPage: true, jobId: '42', title: 'Platform Engineer', company: 'Acme', description: 'Responsibilities and requirements '.repeat(20) });

test('recovers a delayed selected-job panel and returns success', async () => {
  let attempts = 0;
  let recoveries = 0;
  const adapter = new LegacyExtractionAdapter({
    executeExtraction: async () => (++attempts < 2 ? incomplete() : success()),
    waitForProgress: async () => { recoveries += 1; }
  });
  const outcome = await new BrowserIntelligenceOrchestrator({ telemetry: silentTelemetry, maxAttempts: 3 }).run({ tabId: 1, url: 'https://example.test/?currentJobId=42', navigationKey: 'job:42' }, adapter);
  assert.equal(outcome.status, 'success');
  assert.equal(attempts, 2);
  assert.equal(recoveries, 1);
});

test('returns incomplete rather than non-target after recovery budget is exhausted', async () => {
  let attempts = 0;
  const adapter = new LegacyExtractionAdapter({ executeExtraction: async () => { attempts += 1; return incomplete(); }, waitForProgress: async () => {} });
  const outcome = await new BrowserIntelligenceOrchestrator({ telemetry: silentTelemetry, maxAttempts: 3 }).run({ tabId: 1, url: 'https://example.test/?currentJobId=42', navigationKey: 'job:42' }, adapter);
  assert.equal(outcome.status, 'incomplete');
  assert.equal(outcome.result.pageState, 'extraction_incomplete');
  assert.equal(outcome.result.classification, 'uncertain');
  assert.equal(attempts, 3);
});

test('a newer run cancels the older session', async () => {
  const orchestrator = new BrowserIntelligenceOrchestrator({ telemetry: silentTelemetry, maxAttempts: 2 });
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const slowAdapter = new LegacyExtractionAdapter({ executeExtraction: async () => { await blocked; return incomplete(); }, waitForProgress: async () => {} });
  const fastAdapter = new LegacyExtractionAdapter({ executeExtraction: async () => success(), waitForProgress: async () => {} });
  const oldRun = orchestrator.run({ tabId: 1, url: 'https://example.test/1', navigationKey: 'job:1' }, slowAdapter);
  const newRun = orchestrator.run({ tabId: 1, url: 'https://example.test/2', navigationKey: 'job:2' }, fastAdapter);
  release();
  const [oldOutcome, newOutcome] = await Promise.all([oldRun, newRun]);
  assert.equal(oldOutcome.status, 'cancelled');
  assert.equal(newOutcome.status, 'success');
});
