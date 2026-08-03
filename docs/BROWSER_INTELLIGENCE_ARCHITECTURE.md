# Browser Intelligence Engine Architecture

> ⚠️ **Status: Design document, not implemented.** The modular pipeline below (Collector / Evidence Engine / Classification Engine / Strategy Planner / Recovery / Learning) was scaffolded as empty directories under `frontend/src/browser-intelligence/` (`adapters/`, `cache/`, `classification/`, `collector/`, `core/`, `domains/`, `evidence/`, `planning/`, `recovery/`, `telemetry/`) but no files were ever added to them — the folders have since been removed as dead scaffolding.
>
> **What actually ships today** is a single, much simpler generic heuristic collector: `frontend/src/services/jdExtractionFlow.js::captureActiveTabJobEvidence()`, invoked via one `chrome.scripting.executeScript` call from the side panel. It scores candidate DOM containers by job-signal keyword density, checks `application/ld+json` for `JobPosting` markup, reads a few LinkedIn-specific top-card selectors with a generic fallback for everything else, and returns a flat evidence object — no session/evidence/classification/planning module boundary, no AI-proposed extraction plans, no learned strategy registry, no domain adapter framework. `assessBrowserJobEvidence()` in the same file does a simple weighted-signal readiness score (`READY` / `PARTIAL` / `NOT_READY`) in place of the classifier described in §3.3 below.
>
> This document is retained as a design reference for a more sophisticated architecture the team considered, in case that direction is revisited — it should not be read as describing current behavior. If you're debugging extraction issues, start in `jdExtractionFlow.js`, not here.

## 1. Architectural intent

The Browser Intelligence Engine (BIE) is a domain-neutral browser-native system. Its first domain package understands job listings, but the core does not know about LinkedIn, Glassdoor, jobs, products, or articles.

The governing pipeline is:

```text
Observe -> Build evidence -> Classify -> Plan -> Discover candidates
        -> Extract deterministically -> Validate -> Recover -> Learn
```

AI may propose a constrained plan. It never reads the live DOM, executes JavaScript, chooses final values without validation, or overrides deterministic security policy.

### Non-negotiable invariants

1. Empty extraction is `EXTRACTION_INCOMPLETE`, never proof of `NON_JOB`.
2. A page classification and an extraction result are separate decisions.
3. Every accepted field has provenance, confidence, and validation evidence.
4. Page text is untrusted data and cannot provide executable instructions.
5. A stale navigation/session result can never update UI or reach tailoring.
6. No full page snapshot or JD is logged by default.
7. Domain adapters contribute evidence and candidates; they do not bypass the generic engine.

## 2. Runtime topology

```text
Chrome side panel (orchestrator)
  |-- creates ExtractionSession + AbortController
  |-- observes tab/navigation lifecycle
  |-- renders progress, verification, and recovery states
  |
  +-- injected MAIN-FRAME collector (read-only)
  |     |-- DOM/ARIA/metadata/JSON-LD collection
  |     |-- open Shadow DOM traversal
  |     |-- bounded MutationObserver readiness monitoring
  |     +-- deterministic plan execution
  |
  +-- service worker
  |     |-- session ownership across side-panel lifecycle
  |     |-- cache coordination
  |     +-- cancellation and tab event routing
  |
  +-- backend
        |-- optional AI strategy planning
        |-- schema/policy validation
        |-- redacted telemetry and strategy outcomes
        +-- learned strategy registry
```

Collection and deterministic extraction run locally. Only compact, sanitized summaries are eligible for backend planning. Passwords, inputs, private-message containers, hidden text, full DOM HTML, scripts, and unrelated page content are excluded.

## 3. Module boundaries

### 3.1 Browser Context Collector

Single responsibility: observe browser state without interpreting it.

It collects bounded snapshots of URL, title, safe meta tags, JSON-LD types, headings, landmarks, buttons, links, selected states, visible text blocks, open shadow roots, accessible same-origin frames, viewport, scroll containers, loading indicators, and mutation activity.

The collector assigns stable local node handles for the lifetime of one extraction session. Raw DOM nodes never cross the serialization boundary.

### 3.2 Page Evidence Engine

Single responsibility: convert observations into independent evidence facts. Evidence producers are small deterministic functions, such as `JsonLdJobPostingProducer`, `ApplyActionProducer`, `SelectedDetailPanelProducer`, `RepeatedCardProducer`, and `LoadingStateProducer`.

Evidence never directly declares the final page type. A selected job ID is positive evidence; repeated cards are search-shell evidence; both may coexist in split-pane layouts.

### 3.3 Page Classification Engine

Single responsibility: classify the semantic page type from evidence.

The classifier produces a distribution, not only a label. Supported core labels are `JOB`, `PRODUCT`, `ARTICLE`, `NEWS`, `FORUM`, `COMPANY`, `SEARCH_RESULTS`, `LOGIN`, and `UNKNOWN`. A domain policy maps this to UI states such as `job_listing`, `search_results`, `uncertain`, or `non_job`.

Classification rules explicitly model composite pages. For example, `SEARCH_RESULTS shell + selected JOB detail` is classified as `JOB` when the selected detail evidence is internally consistent.

### 3.4 Extraction Strategy Planner

Single responsibility: propose a declarative extraction plan when deterministic built-in plans and cached plans are insufficient.

The planner receives a compact context summary, evidence, candidate summaries, and allowed operations. It returns JSON conforming to `ExtractionPlan`. It cannot return arbitrary JavaScript, XPath evaluation code, prompts, or extracted final values.

Allowed operations include scoped semantic queries, proximity ranking, JSON-LD paths, landmark traversal, attribute reads from an allowlist, and bounded text-block composition.

### 3.5 Candidate Discovery Engine

Single responsibility: find multiple candidates for every field.

Candidate providers include structured data, semantic headings, ARIA relationships, proximity graphs, metadata, repeated-label/value pairs, selected panels, and optional platform hints. Candidate discovery should prefer semantic relationships over class names.

### 3.6 Deterministic Extraction Engine

Single responsibility: execute a validated plan against the current immutable snapshot/session.

It applies normalization for whitespace, Unicode, entities, paragraph/list structure, dates, salary, locations, and employment type. It never evaluates page-provided code and never reads form values.

### 3.7 Validation Engine

Single responsibility: validate fields individually and the object as a whole.

It rejects navigation labels, generic titles, recommendation content, duplicated boilerplate, implausible dates, inconsistent company/title relationships, short descriptions, and result-list composites. Validation returns violations and recovery hints rather than a Boolean alone.

### 3.8 Confidence Engine

Single responsibility: compute calibrated page-level and field-level confidence.

Confidence is derived from independent evidence families, agreement among candidates, proximity, visibility, semantic role, validation results, and source reliability. Correlated selectors do not count as independent confirmation.

### 3.9 Recovery Engine

Single responsibility: diagnose incomplete extraction and select one bounded recovery action.

Recovery reasons include `DOM_LOADING`, `DETAIL_PANEL_NOT_MOUNTED`, `LAZY_CONTENT`, `SPA_TRANSITION`, `ACTIVE_SELECTION_CHANGED`, `FRAME_UNAVAILABLE`, `LAYOUT_DRIFT`, and `NETWORK_INTERRUPTION`.

Actions include waiting for DOM stability, observing a target subtree, scrolling the identified detail container, re-collecting after selection stability, trying a cached alternative plan, invoking the planner, or requesting manual input. Retries have a deadline, attempt budget, and progress condition. An attempt is repeated only if observable state changed.

### 3.10 Strategy Cache

Single responsibility: store successful declarative plans and measured outcomes.

Keys use hostname, page-type family, DOM fingerprint, layout version, and engine/schema version. Cache entries decay, record success/failure counts, and are invalidated when validation confidence drops, node resolution fails, the DOM fingerprint diverges, or a newer engine schema is deployed.

### 3.11 Telemetry

Single responsibility: produce correlated, redacted events.

Every event carries `sessionId`, `attemptId`, `tabId`, navigation identity, engine version, phase, elapsed time, and outcome. Text is represented by length, bounded semantic labels, or a salted content hash. Production telemetry never includes complete descriptions or DOM snapshots.

## 4. Core TypeScript contracts

```ts
export type PageKind =
  | 'JOB' | 'PRODUCT' | 'ARTICLE' | 'NEWS' | 'FORUM'
  | 'COMPANY' | 'SEARCH_RESULTS' | 'LOGIN' | 'UNKNOWN';

export interface ExtractionSession {
  sessionId: string;
  attemptId: string;
  tabId: number;
  frameId: number;
  navigationKey: string;
  url: string;
  startedAt: string;
  deadlineAt: string;
  engineVersion: string;
  signal: AbortSignal;
}

export interface BrowserContext {
  url: URLContext;
  document: DocumentContext;
  viewport: ViewportContext;
  metadata: SafeMetadata;
  jsonLd: JsonLdSummary[];
  landmarks: ObservedNode[];
  headings: ObservedNode[];
  actions: ObservedNode[];
  textBlocks: TextBlock[];
  selectedNodes: ObservedNode[];
  scrollContainers: ScrollContainer[];
  frames: FrameSummary[];
  shadowRoots: ShadowRootSummary[];
  loading: LoadingObservation[];
  mutationEpoch: number;
  domFingerprint: string;
}

export interface Evidence {
  id: string;
  kind: string;
  polarity: 'positive' | 'negative' | 'neutral';
  weight: number;
  confidence: number;
  source: 'json-ld' | 'dom' | 'aria' | 'metadata' | 'browser' | 'adapter';
  nodeHandle?: string;
  field?: JobField;
  reason: string;
  correlationGroup: string;
}

export interface ClassificationResult {
  primary: PageKind;
  probabilities: Record<PageKind, number>;
  confidence: number;
  evidenceIds: string[];
  composite?: { shell: PageKind; detail: PageKind };
  reason: string;
}

export type JobField =
  | 'title' | 'company' | 'location' | 'description' | 'employmentType'
  | 'experienceLevel' | 'salary' | 'skills' | 'jobId' | 'postedDate'
  | 'validThrough' | 'applicationUrl';

export interface FieldCandidate<T = string> {
  candidateId: string;
  field: JobField;
  value: T;
  normalizedValue: T;
  source: Evidence['source'];
  nodeHandle?: string;
  confidence: number;
  evidenceIds: string[];
  reasons: string[];
  visibility: 'visible' | 'offscreen' | 'hidden';
}

export type PlanOperation =
  | { op: 'jsonLdPath'; field: JobField; path: string[] }
  | { op: 'semanticQuery'; field: JobField; roles: string[]; labels: string[] }
  | { op: 'nearEvidence'; field: JobField; evidenceKind: string; radius: number }
  | { op: 'composeTextBlocks'; field: 'description'; startLabels: string[]; stopLabels: string[] }
  | { op: 'readAttribute'; field: JobField; nodeHandle: string; attribute: 'href' | 'content' | 'datetime' };

export interface ExtractionPlan {
  planId: string;
  schemaVersion: string;
  domain: 'job';
  source: 'builtin' | 'cache' | 'adapter' | 'ai';
  preconditions: PlanPrecondition[];
  operations: PlanOperation[];
  stopConditions: StopCondition[];
  maxCost: number;
  rationale: string[];
}

export interface FieldResult<T = string> {
  value: T | null;
  confidence: number;
  candidateId?: string;
  evidenceIds: string[];
  method: string;
  reasons: string[];
  validation: ValidationIssue[];
}

export interface NormalizedJob {
  schemaVersion: string;
  title: FieldResult;
  company: FieldResult;
  location: FieldResult;
  description: FieldResult;
  employmentType: FieldResult;
  experienceLevel: FieldResult;
  salary: FieldResult;
  skills: FieldResult<string[]>;
  jobId: FieldResult;
  postedDate: FieldResult;
  validThrough: FieldResult;
  applicationUrl: FieldResult;
  sourceUrl: string;
  extractedAt: string;
  contentHash: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  requiredFieldsPresent: boolean;
  consistencyScore: number;
  recoveryHints: RecoveryReason[];
}

export interface ExtractionOutcome {
  sessionId: string;
  status: 'success' | 'partial' | 'uncertain' | 'non_target' | 'failed' | 'cancelled';
  classification: ClassificationResult;
  job?: NormalizedJob;
  validation: ValidationResult;
  attempts: AttemptSummary[];
  telemetryId: string;
}
```

All contracts use runtime schema validation (Zod in the extension, Pydantic on the backend). Types alone are not a security boundary.

## 5. Module communication

Modules communicate through immutable values and typed ports:

```ts
interface CollectorPort { collect(session: ExtractionSession): Promise<BrowserContext>; }
interface EvidencePort { evaluate(context: BrowserContext): Evidence[]; }
interface ClassifierPort { classify(context: BrowserContext, evidence: Evidence[]): ClassificationResult; }
interface CandidatePort { discover(context: BrowserContext, evidence: Evidence[], plan?: ExtractionPlan): CandidateSet; }
interface PlannerPort { plan(input: PlannerInput): Promise<ExtractionPlan>; }
interface ExecutorPort { execute(plan: ExtractionPlan, context: BrowserContext, candidates: CandidateSet): RawExtraction; }
interface ValidatorPort { validate(raw: RawExtraction, context: BrowserContext, evidence: Evidence[]): ValidationResult; }
interface RecoveryPort { next(input: RecoveryInput): RecoveryDecision; }
interface StrategyStore { get(key: StrategyKey): Promise<CachedStrategy[]>; record(outcome: StrategyOutcome): Promise<void>; }
interface TelemetryPort { emit(event: TelemetryEvent): void; }
```

The orchestrator is the only component allowed to sequence modules. Modules cannot call each other implicitly or mutate global state.

## 6. Extraction state machine

```text
CREATED
 -> WAITING_FOR_ACCESS
 -> OBSERVING
 -> BUILDING_EVIDENCE
 -> CLASSIFYING
 -> DISCOVERING_CANDIDATES
 -> PLANNING (only if needed)
 -> EXTRACTING
 -> VALIDATING
 -> SUCCESS | PARTIAL_REVIEW
 -> RECOVERING -> OBSERVING (bounded)
 -> NON_TARGET | MANUAL_REQUIRED | FAILED | CANCELLED
```

Every transition checks the active `navigationKey` and abort signal. Tab updates increment the navigation epoch and abort all earlier sessions.

## 7. Recovery design

Readiness is based on stability, not `document.readyState`:

- Target subtree mutation quiet period: normally 400–800 ms.
- Selected item and job ID stable across two observations.
- Loading indicator absent or unchanged beyond a bounded timeout.
- Meaningful progress defined as new candidate nodes, increased description length, changed selection, or resolved plan operations.

Default budget: three recovery actions and an 8-second interactive deadline. Each action must address the diagnosed cause. Blindly repeating the same DOM query is prohibited.

Split-pane recovery identifies the selected card, maps its job ID/ARIA selection to the detail panel, observes that panel, scrolls its actual scroll container, and re-collects only the affected subtree.

## 8. Strategy caching and learning

### Cache layers

1. Memory cache per service-worker lifetime.
2. `chrome.storage.local` cache for successful local plans.
3. Backend registry for anonymized strategy performance across versions.

### Cache record

```ts
interface CachedStrategy {
  key: StrategyKey;
  plan: ExtractionPlan;
  createdAt: string;
  lastSuccessAt: string;
  successCount: number;
  failureCount: number;
  meanConfidence: number;
  engineVersion: string;
  expiresAt: string;
}
```

Learning promotes strategies only from verified successful outcomes. User corrections become labeled candidate-ranking feedback, never executable selector code. Promotion requires sufficient samples, cross-session success, no security violations, and validation confidence above policy thresholds. Rollouts are versioned and canary-controlled.

## 9. Telemetry model

Recommended event names:

- `extraction.session.started`
- `context.snapshot.completed`
- `evidence.generated`
- `classification.completed`
- `strategy.cache.hit|miss|invalidated`
- `planner.requested|completed|rejected`
- `candidates.discovered`
- `field.selected|rejected`
- `validation.completed`
- `recovery.diagnosed|attempted|progressed|exhausted`
- `extraction.completed|cancelled|failed`

Telemetry includes counts, confidence, timings, evidence IDs/kinds, method names, retry causes, schema versions, and hashes. URLs should be normalized and query parameters allowlisted; tokens and tracking parameters must be removed.

## 10. Security model

- Traverse text nodes and allowlisted attributes; never serialize or execute scripts.
- Exclude `input`, `textarea`, password fields, editable regions, private-message landmarks, and hidden nodes.
- Treat all page text as quoted untrusted content in planner requests.
- Planner system policy states that webpage instructions are data and cannot alter the plan schema or allowed operations.
- Validate AI plans with a strict schema, operation allowlist, node-handle scope, maximum cost, and URL policy.
- Backend page fetching is disabled by default. If introduced, use an egress allowlist, DNS/IP revalidation, redirect limits, size limits, and private-address rejection.
- Store hashes instead of content in telemetry. Apply retention limits and user-level deletion.

## 11. Recommended folder structure

```text
frontend/src/browser-intelligence/
  core/
    orchestrator.ts
    stateMachine.ts
    contracts.ts
    schemas.ts
    policy.ts
  collector/
    browserContextCollector.ts
    domWalker.ts
    shadowDomCollector.ts
    frameCollector.ts
    readinessObserver.ts
    sanitization.ts
  evidence/
    evidenceEngine.ts
    producers/
  classification/
    classifier.ts
    calibration.ts
  planning/
    plannerClient.ts
    planValidator.ts
    builtinPlans.ts
  candidates/
    candidateDiscovery.ts
    providers/
  extraction/
    deterministicExecutor.ts
    operations/
    normalization/
  validation/
    validationEngine.ts
    fieldValidators/
    objectValidators/
  confidence/
    confidenceEngine.ts
  recovery/
    recoveryEngine.ts
    diagnostics.ts
    actions/
  cache/
    strategyCache.ts
    fingerprint.ts
  telemetry/
    telemetry.ts
    redaction.ts
  domains/job/
    jobPolicy.ts
    jobSchema.ts
    evidence/
    validators/
    adapters/
  testing/
    fixtures/
    harness/

backend/services/browser_intelligence/
  planner_service.py
  plan_policy.py
  strategy_registry.py
  telemetry_service.py
  schemas.py
```

## 12. Extension integration

The service worker owns extraction sessions because the side panel can close or rerender. A side-panel command creates a session; the worker injects the collector/executor, relays typed progress events, and cancels on `tabs.onUpdated`, `tabs.onActivated`, frame navigation, or a newer request.

The injected bundle should be a small, self-contained compiled artifact. Avoid serializing a large function with `chrome.scripting.executeScript({ func })`; use a versioned content/injected script and message contracts. This makes module splitting, source maps, CSP behavior, testing, and telemetry reliable.

The current `runJobExtractionInPage` remains behind a compatibility adapter until the new outcome reaches parity. Do not perform a big-bang replacement.

## 13. Testing strategy

### Unit tests

Test every evidence producer, normalizer, field validator, confidence rule, plan validator, cache invalidation rule, and recovery decision using pure fixtures.

### DOM contract fixtures

Maintain sanitized fixtures for LinkedIn split panes, Glassdoor detail/results, Workday, Greenhouse, Lever, Ashby, SmartRecruiters, Google Careers, custom sites, Shadow DOM, same-origin frames, loading skeletons, and layout drift. Include multiple historic variants per platform.

### Browser integration tests

Use Playwright with the unpacked extension to test SPA navigation, tab changes, back/forward, delayed DOM insertion, infinite scroll, cancellation, stale results, side-panel close/reopen, and network throttling.

### Adversarial tests

Test prompt injection, hidden malicious text, fake JSON-LD, conflicting visible/structured data, oversized pages, DOM mutation storms, CAPTCHA, login pages, private messages, and deceptive Apply buttons.

### Quality gates

- Job-detail recall by platform and unknown-site cohort.
- Search/non-job false-positive rate.
- Field exactness and provenance correctness.
- Calibration error by confidence band.
- P50/P95 latency and DOM traversal cost.
- Recovery success and stale-result rate.
- Planner invocation and cache-hit rates.

Production release requires fixture regression, extension E2E, schema compatibility, security tests, and calibration evaluation—not only successful compilation.

## 14. Implementation roadmap

### Phase 1 — Foundation

- Introduce TypeScript contracts, Zod schemas, session IDs, navigation epochs, abort handling, telemetry interface, and redaction.
- Wrap the existing extractor behind `LegacyExtractionAdapter`.
- Establish golden fixtures and quality metrics.
- Exit criterion: identical current behavior through the new orchestrator with reliable cancellation and correlated telemetry.

### Phase 2 — Browser Intelligence

- Build bounded collector, semantic DOM walker, accessible-name reader, open Shadow DOM traversal, frame inventory, selected-state detection, scroll-container detection, and mutation-based readiness.
- Exit criterion: deterministic snapshots for dynamic and split-pane fixtures without sensitive data collection.

### Phase 3 — Page Classification

- Build evidence registry, independent evidence producers, composite-page model, calibrated classifier, and domain mapping.
- Separate `UNKNOWN/INCOMPLETE` from `NON_TARGET`.
- Exit criterion: agreed recall/false-positive thresholds across target and adversarial datasets.

### Phase 4 — AI Planner

- Define constrained plan DSL, backend planner, prompt-injection isolation, schema validation, cost limits, timeouts, and deterministic fallback.
- Invoke only after cache/built-in plans fail with sufficient context.
- Exit criterion: planner can improve candidate discovery but cannot execute code or supply final values.

### Phase 5 — Deterministic Extraction

- Implement candidate providers, plan executor, provenance graph, normalization, field selection, and job domain schema.
- Convert platform code into optional evidence/candidate adapters.
- Exit criterion: normalized jobs include field-level provenance and confidence.

### Phase 6 — Validation

- Implement field and cross-field validators, conflict policy, description structure preservation, duplicate removal, and confidence calibration.
- Add mandatory user verification before tailoring.
- Exit criterion: invalid or low-confidence objects cannot reach tailoring.

### Phase 7 — Recovery

- Implement diagnostic reasons, targeted mutation observers, selected-panel tracking, intelligent scroll actions, bounded retries, deadlines, and manual recovery.
- Exit criterion: delayed/SPAs recover when observable progress occurs and terminate clearly otherwise.

### Phase 8 — Strategy Learning

- Add local/backend strategy caches, DOM fingerprints, outcome recording, invalidation, user-correction feedback, offline evaluation, and canary promotion.
- Exit criterion: cache improves latency without reducing validation confidence or increasing false positives.

### Phase 9 — Production Hardening

- Complete privacy/security review, load tests, chaos/network tests, observability dashboards, SLOs, alerting, feature flags, staged rollout, rollback, retention/deletion controls, and incident runbooks.
- Suggested SLOs: >=99% crash-free sessions, <0.5% stale commits, P95 deterministic attempt <2 seconds excluding deliberate readiness waits, and zero unvalidated tailoring requests.

## 15. Immediate migration priorities

1. **Critical:** Stop treating empty extraction as `non_job`; represent it as incomplete and invoke recovery.
2. **Critical:** Move session ownership/cancellation to a stable orchestrator and eliminate duplicate competing scans.
3. **Critical:** Enforce field/object schema validation at the tailoring boundary. Page classification is evidence-based; confidence is diagnostic and does not override a structurally confirmed job page. Tailoring still requires a meaningful title and validated JD.
4. **High:** Replace first-match selector behavior with candidate discovery and provenance.
5. **High:** Add mutation-based selected-panel readiness and targeted lazy-load recovery.
6. **High:** Convert the injected monolith into versioned modules with typed messaging.
7. **Medium:** Add strategy caching and DOM fingerprint invalidation.
8. **Medium:** Add constrained AI planning only after deterministic foundations are measured.
9. **Medium:** Establish calibration datasets, dashboards, and strategy promotion workflow.

This sequence addresses the observed LinkedIn failure correctly: an empty, still-loading detail panel becomes a recoverable incomplete observation, not evidence that the page is unrelated to jobs.
