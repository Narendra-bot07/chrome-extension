import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { collectBrowserContextInPage } from './collector/browserContextCollector.js';
import { validateExtractionPlan } from './planning/planValidator.js';
import { StrategyCache } from './cache/strategyCache.js';
import { buildPageEvidence } from './evidence/evidenceEngine.js';
import { classifyPage } from './classification/pageClassifier.js';
import { fingerprintContext } from './cache/fingerprint.js';
import { discoverJobCandidates, selectJobFields } from './domains/job/jobCandidateEngine.js';
import { normalizeJobOutcome, validateNormalizedJob } from './domains/job/jobValidationEngine.js';
import { requestAstraPlan } from './planning/plannerClient.js';

function withPage(html, url, callback) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  const previous = { window: globalThis.window, document: globalThis.document, location: globalThis.location, getComputedStyle: globalThis.getComputedStyle, innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight, scrollX: globalThis.scrollX, scrollY: globalThis.scrollY, devicePixelRatio: globalThis.devicePixelRatio };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, location: dom.window.location, getComputedStyle: dom.window.getComputedStyle, innerWidth: 1200, innerHeight: 800, scrollX: 0, scrollY: 0, devicePixelRatio: 1 });
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 500, height: 100, top: 0, left: 0, right: 500, bottom: 100 });
  try { return callback(dom); } finally { Object.assign(globalThis, previous); dom.window.close(); }
}

test('ASTRA context is bounded and excludes sensitive form values', () => withPage(`
  <main><h1>Platform Engineer</h1><p>${'Responsibilities and qualifications. '.repeat(1000)}</p>
  <input type="password" value="secret-password"><textarea>private message</textarea><button>Apply now</button></main>`,
  'https://careers.example.test/jobs/42', () => {
    const context = collectBrowserContextInPage({ maxTextChars: 1000, maxTextBlocks: 10 });
    const serialized = JSON.stringify(context);
    assert.ok(context.stats.textChars <= 1000);
    assert.ok(context.textBlocks.length <= 10);
    assert.equal(serialized.includes('secret-password'), false);
    assert.equal(serialized.includes('private message'), false);
    assert.equal(context.url.queryKeys.length, 0);
  }));

test('ASTRA plan validator permits declarative operations and rejects executable content', () => {
  const context = { candidates: [{ handle: 'main:0' }], headings: [], actions: [] };
  const valid = validateExtractionPlan({ operations: [{ op: 'semanticQuery', field: 'title', roles: ['heading'], labels: ['job title'] }] }, context);
  assert.equal(valid.valid, true);
  const malicious = validateExtractionPlan({ operations: [{ op: 'readAttribute', field: 'title', nodeHandle: 'main:0', attribute: 'onclick', payload: 'javascript:alert(1)' }] }, context);
  assert.equal(malicious.valid, false);
  assert.ok(malicious.errors.length >= 1);
});

test('ASTRA strategy cache invalidates repeatedly failing strategies', async () => {
  const cache = new StrategyCache();
  const key = { hostname: 'example.test', domFingerprint: 'abc', pageKind: 'JOB_DETAIL' };
  await cache.recordSuccess(key, { operations: [{ op: 'semanticQuery', field: 'title' }] }, 0.9);
  assert.ok(await cache.get(key));
  await cache.recordFailure(key); await cache.recordFailure(key); await cache.recordFailure(key);
  assert.equal(await cache.get(key), null);
});

test('ASTRA classifies a selected detail inside a search shell as a composite JOB_DETAIL', () => {
  const context = {
    url: { hostname: 'jobs.example.test', pathname: '/jobs/12345/engineer', href: 'https://jobs.example.test/jobs/12345/engineer' },
    headings: [{ tag: 'h1', text: 'Platform Engineer' }],
    actions: [{ text: 'Apply now', hrefPath: '/apply' }, { text: 'Role A', hrefPath: '/jobs/11111' }, { text: 'Role B', hrefPath: '/jobs/22222' }],
    textBlocks: [{ text: 'Responsibilities Requirements Qualifications Skills Experience' }],
    candidates: [{ textLength: 1000, text: 'Responsibilities Requirements Qualifications Skills Experience', score: 0.9 }], jsonLd: [], forms: [], loading: []
  };
  const evidence = buildPageEvidence(context);
  const classification = classifyPage(context, evidence);
  assert.equal(classification.primary, 'JOB_DETAIL');
  assert.deepEqual(classification.composite, { shell: 'JOB_SEARCH', detail: 'JOB_DETAIL' });
  assert.ok(fingerprintContext(context).startsWith('astra-'));
});

test('ASTRA classifies repeated unselected jobs as JOB_SEARCH', () => {
  const context = {
    url: { hostname: 'jobs.example.test', pathname: '/locations/hyderabad', href: 'https://jobs.example.test/locations/hyderabad' },
    headings: [{ tag: 'h1', text: 'Hyderabad jobs' }],
    actions: [{ text: 'Role A', hrefPath: '/jobs/11111' }, { text: 'Role B', hrefPath: '/jobs/22222' }],
    textBlocks: [{ text: 'Open jobs Filter jobs' }], candidates: [], jsonLd: [], forms: [], loading: []
  };
  assert.equal(classifyPage(context, buildPageEvidence(context)).primary, 'JOB_SEARCH');
});

test('ASTRA job fields retain provenance and fail validation without a complete description', () => {
  const context = { url: { pathname: '/jobs/12345/engineer', href: 'https://example.test/jobs/12345/engineer' }, headings: [{ tag: 'h1', text: 'Platform Engineer', handle: 'main/h1' }], actions: [], candidates: [], jsonLd: [] };
  const fields = selectJobFields(discoverJobCandidates(context));
  const job = normalizeJobOutcome(fields, context, { primary: 'JOB_DETAIL' }, 'astra-abc');
  const validation = validateNormalizedJob(job);
  assert.equal(job.title.method, 'dom');
  assert.equal(job.jobId.value, '12345');
  assert.equal(validation.valid, false);
  assert.ok(validation.recoveryHints.includes('DETAIL_PANEL_NOT_MOUNTED'));
});

test('ASTRA planner client accepts only a schema-valid declarative plan', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ model: 'openai/gpt-oss-20b', plan: { pageKind: 'JOB_DETAIL', confidence: 0.9, operations: [{ op: 'semanticQuery', field: 'title', roles: ['heading'], labels: ['job title'] }], rationale: ['Specific title and job sections'] } })
  });
  try {
    const result = await requestAstraPlan({ apiUrl: 'http://localhost:8000', token: 'test', context: { candidates: [], headings: [], actions: [] }, evidence: [], classification: { primary: 'UNKNOWN' }, fingerprint: 'astra-1', requestId: 'test-1' });
    assert.equal(result.plan.pageKind, 'JOB_DETAIL');
    assert.equal(result.plan.operations[0].op, 'semanticQuery');
  } finally { globalThis.fetch = previousFetch; }
});

test('ASTRA planner client rejects an AI plan containing executable content', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ model: 'openai/gpt-oss-20b', plan: { pageKind: 'UNKNOWN', confidence: 0.5, operations: [{ op: 'semanticQuery', field: 'title', labels: ['javascript:alert(1)'] }] } }) });
  try {
    await assert.rejects(() => requestAstraPlan({ apiUrl: 'http://localhost:8000', context: { candidates: [], headings: [], actions: [] }, evidence: [], classification: {}, fingerprint: 'x' }), /ASTRA_PLAN_REJECTED/);
  } finally { globalThis.fetch = previousFetch; }
});
