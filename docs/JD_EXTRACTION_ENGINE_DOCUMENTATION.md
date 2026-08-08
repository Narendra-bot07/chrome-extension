# tailr4u Job Description Extraction Engine

## End-to-End Engineering Documentation

**Document status:** Evidence acquisition/ranking/session sections (§2-§7, §10-§14, §16-§19, §21-§22) are current. The extraction/review/repair sections (§8.18-8.20, §15) describe an **architecture replaced 2026-08-09** — read the correction below before trusting any "one Groq/DeepSeek call" or "flash → pro escalation" claim in this document.  
**Scope:** Chrome extension JD capture, hybrid evidence acquisition, backend Job Intelligence graph, extraction, review, session management, ATS comparison integration, frontend states, observability, testing, and operations.

> ⚠️ **Provider correction**: every mention of **Groq** throughout this document (the "one structured Groq call" pattern, `Groq rate limiting`, `Groq's tool_use_failed`, §15 "Groq call management", §18.5, etc.) should be read as **DeepSeek**. Per [ADR_DEEPSEEK_SOLE_PROVIDER.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/ADR_DEEPSEEK_SOLE_PROVIDER.md), Groq was fully removed from the codebase (`groq_service.py` deleted, `groq` package not in `requirements.txt`).

> ⚠️ **Architecture correction (2026-08-09)**: §8.18-8.20 and §15 below describe the OLD extraction model — "one structured call using `ExtractedJob`", "flash → pro escalation", "at most one repair call". That model is gone for JD extraction. As of the [3.17.0](CHANGELOG.md) rewrite: **DeepSeek Pro only, no Flash, no racing, no escalation** (`DEEPSEEK_JD_MODEL`, hard-validated at startup to equal `"deepseek-v4-pro"`); deterministic extraction (JSON-LD/DOM/regex, zero LLM calls) runs first and unconditionally; the single `ExtractedJob` call is decomposed into **four independent, concurrently-run Pro workers** (role, skills, responsibilities, requirements) under a 15s hard deadline via `asyncio.TaskGroup`; each worker gets its own single targeted retry instead of a whole-schema repair pass; and DeepSeek Pro's reasoning phase is explicitly disabled for these calls (`disable_reasoning=True` → `reasoning_effort: "none"`) since it was silently consuming small per-worker token budgets and returning empty content. See §8.18-8.20 (updated in place below) and [CHANGELOG.md](CHANGELOG.md) 3.17.0 for the full rationale and measured before/after latency.

---

## 1. Executive summary

tailr4u's Job Description Extractor is no longer a simple webpage scraper. It is a hybrid Job Intelligence Engine that combines:

- Evidence rendered inside the user's legitimate Chrome session.
- A backend Playwright browser for public pages.
- JSON-LD, rendered DOM, visible text, selected job panels, metadata, cleaned HTML, and Markdown.
- Source-by-source restriction detection.
- Deterministic evidence ranking and invariant repair.
- Semantic page classification.
- Extraction-readiness evaluation.
- Deterministic (LLM-free) extraction as the baseline, then up to four concurrent DeepSeek-Pro-only workers filling in what deterministic extraction couldn't (see §8.18).
- Deterministic validation and, per worker, at most one targeted retry when required — no whole-schema repair call.
- Session-scoped JD persistence across the extension workflow.
- Stable frontend outcomes for extracted, partial, selection-required, non-job, blocked, manual-review, and insufficient-evidence states.

The key design principle is:

> A failed or restricted evidence source is not the same as a failed or blocked page.

If backend Playwright sees a login wall but the extension can see the authenticated selected job, the extension evidence is selected and extraction continues. A page is considered fully blocked only after every safe evidence source has been evaluated and no usable source remains.

---

## 2. Why the original approach was replaced

### 2.1 Original behavior

The original implementation primarily:

1. Scraped content in the frontend.
2. Used portal selectors and broad DOM text.
3. Sent extracted text to a backend analysis endpoint.
4. Asked the LLM to infer the structured job.

This was effective for some pages but created several problems:

- Frontend extraction logic became portal-dependent.
- Backend behavior depended on incomplete client text.
- Split-pane job pages could mix several job cards with the selected job.
- Protected platforms returned different content to backend Playwright than the user saw.
- Login pages and security challenges were sometimes classified as non-job pages.
- Structured LLM output failed when source-native labels did not exactly match enums.
- Skills embedded in qualifications or examples were omitted.
- Inferred skills were mixed with explicitly stated skills.
- Salary objects were rendered directly by React and caused runtime crashes.
- Job sessions leaked between job pages.
- Permanent storage restored stale JDs.
- ATS comparison could block the extraction screen indefinitely.
- Multiple effects triggered repeated API calls and Groq rate limiting.

### 2.2 What was removed or replaced

The following concepts were removed, consolidated, or replaced:

| Previous concept | Current replacement |
|---|---|
| Frontend-only JD scraper as primary intelligence | Hybrid extension evidence plus backend Job Intelligence graph |
| Multiple independent extraction endpoints | `POST /api/v1/jobs/extract-url` as the active URL extraction endpoint |
| Backend browser assumed to be authoritative | Independently ranked evidence sources |
| Global `blocked` state | Source-level restrictions plus page-level access status |
| Backend failure → non-job | Recovery router evaluates all remaining sources |
| Permanent JD persistence | `chrome.storage.session` job-scoped persistence |
| Fixed selected source | Deterministic evidence scoring and invariant repair |
| Strict LLM enums at tool boundary | Permissive source labels followed by deterministic normalization |
| Explicit skills only | Separate explicit and suggested ATS skills |
| Comparison required before rendering | Background, non-blocking ATS comparison |
| Raw backend errors in UI | Stable error/status contracts and user-facing recovery states |
| Repeated effects and polling requests | In-flight deduplication, identity checks, refs, and readiness-aware scanning |

Legacy compatibility aliases remain where existing tailoring and comparison code still expects the older job schema.

---

## 3. Current high-level architecture

```text
Active browser tab
        |
        v
Client page gate
  - browser URL type
  - local non-job confidence
  - security challenge bypass to backend recovery
        |
        v
Extension evidence capture
  - selected panel
  - rendered DOM
  - visible text
  - JSON-LD
  - title/company/location hints
  - accessible iframe/shadow-root evidence
        |
        v
POST /api/v1/jobs/extract-url
        |
        v
LangGraph Job Intelligence Engine
  discovery
    -> backend browser acquisition
    -> universal evidence evaluation/ranking
    -> JSON-LD
    -> DOM cleanup
    -> Markdown
    -> metadata
    -> restriction invariant validation
    -> planning
    -> semantic classification
    -> evidence planning/source building
    -> structured extraction
    -> deterministic review
    -> optional single repair
    -> stable final response
        |
        v
Frontend result mapping
  - extracted
  - partial
  - selection required
  - non-job
  - blocked
  - manual review
  - insufficient evidence
```

---

## 4. Important files

### Backend

| File | Responsibility |
|---|---|
| `backend/api/v1/jobs.py` | Authenticated URL extraction endpoint |
| `backend/schemas/jobs.py` | Request contract, including `browser_evidence` |
| `backend/services/job_extraction/backend_extractor.py` | Compatibility entry point |
| `backend/services/job_extraction/graph.py` | LangGraph topology and routing |
| `backend/services/job_extraction/agents.py` | Acquisition, evaluation, classification, extraction, review, repair, response |
| `backend/services/job_extraction/schemas/job_schemas.py` | `JDState`, `EvidenceSource`, `ExtractedJob`, review contracts |
| `backend/app/routers/api.py` | Compatibility normalization for legacy compare/tailoring endpoints |
| `backend/test_job_intelligence.py` | Backend intelligence and recovery regressions |

### Frontend

| File | Responsibility |
|---|---|
| `frontend/src/services/jdExtractionFlow.js` | Browser capture, page gate, response helpers, skill/salary normalization |
| `frontend/src/context/AppContext.jsx` | Extraction orchestration, state, session lifecycle, comparison |
| `frontend/src/components/Layout.jsx` | Active-tab monitoring and route synchronization |
| `frontend/src/pages/JobExtractPage.jsx` | Extraction page, readiness-aware scanning, background compare |
| `frontend/src/pages/NoJobDetectedPage.jsx` | Non-job, blocked, login, challenge, and recovery UI |
| `frontend/src/components/JobReviewView.jsx` | Extracted job, skills, and ATS match rendering |
| `frontend/src/components/JobSummaryCard.jsx` | Compact job rendering |
| `frontend/src/services/jdExtractionFlow.test.js` | Frontend extraction regression tests |
| `frontend/public/manifest.json` | Required Chrome permissions |

---

## 5. Frontend page lifecycle

### 5.1 Readiness-aware startup

Scanning does not begin until:

- Authentication hydration is complete.
- Resume hydration is complete.
- Job-preference hydration is complete.
- A valid user session, completed preferences, and active resume are available.

This prevents the startup race where a URL was marked as scanned before the application was ready to scan it.

### 5.2 Global active-tab monitoring

`Layout.jsx` monitors:

- Initial active tab.
- `chrome.tabs.onUpdated`.
- `chrome.tabs.onActivated`.
- A bounded local URL check for SPA history changes.

The listener:

- Ignores full extension workflow pages.
- Sends normal web pages to extraction.
- Sends browser New Tab and inaccessible browser pages to the local page gate.
- Debounces scans.
- Does not call the backend unless the active URL requires evaluation.

### 5.3 Browser URL classification

`classifyBrowserPageUrl()` distinguishes:

- `web`
- `extension-internal`
- `browser-new-tab`
- `page-inaccessible`

Examples:

- `chrome-extension://...` retains the current workflow session.
- `chrome://newtab/` ends a stale JD session and displays “No Job Page Open.”
- `chrome://settings/`, `file:`, and similar pages produce “Page Inaccessible.”
- HTTP(S) pages proceed to browser evidence capture.

### 5.4 Local evidence gate

`assessBrowserJobEvidence()` evaluates ordinary web pages before a backend call.

Signals include:

- `JobPosting` JSON-LD.
- Job identity in the URL.
- Responsibilities and qualification sections.
- Apply actions.
- Employment metadata.
- Hiring context.
- Focused selected-panel evidence.
- Job title and company hints.

Possible local readiness:

- `READY`: coherent job evidence.
- `PARTIAL`: ambiguous or incomplete evidence; backend must investigate.
- `NOT_READY`: clearly unrelated content; return a local non-job result.

Security challenges never use the local non-job shortcut. CAPTCHA, human verification, access denial, Cloudflare, and security-check evidence are forwarded to the backend recovery framework.

This reduces unnecessary Groq calls without hardcoding arbitrary non-job websites.

---

## 6. Extension evidence acquisition

`captureActiveTabJobEvidence()` executes inside the active tab using `chrome.scripting.executeScript`.

### 6.1 Captured fields

The browser evidence envelope contains:

```json
{
  "url": "https://...",
  "selected_job_url": "https://...",
  "title": "Document title",
  "job_title_hint": "Visible job title",
  "company_hint": "Visible employer",
  "location_hint": "Visible location",
  "visible_text": "...",
  "selected_panel_text": "...",
  "selected_panel_selector": "...",
  "html": "...",
  "jsonld": [],
  "active_tab_id": 123,
  "capture": {
    "candidate_count": 5,
    "selected_score": 17000,
    "portal_optimized_panel": false,
    "captured_at": "...",
    "viewport": {},
    "portal_hint": "example.com",
    "accessible_iframe_count": 0,
    "shadow_root_count": 2,
    "dom_fingerprint": "..."
  }
}
```

### 6.2 Selected-region discovery

Generic candidate regions include:

- `[role="dialog"]`
- `[role="main"]`
- `article`
- `main`
- `aside`
- `section`

Candidates are scored using:

- Visibility and dimensions.
- Job-section signals.
- Apply actions.
- Content length and density.
- Selected-job specificity.

Portal selectors may be used as optional optimizations, but the generic region discovery remains available for every site.

### 6.3 Employer identity hints

Job title, employer, and location are captured separately from description text.

This fixed the issue where:

- The selected LinkedIn description was correct.
- The top card was not included.
- Document metadata said `LinkedIn`.
- The LLM incorrectly returned LinkedIn as the company.

The extraction prompt now explicitly treats marketplaces and hosting platforms as different from the actual employer.

### 6.4 Iframes and shadow DOM

The extension captures:

- Same-origin iframe text when browser policy permits it.
- Open shadow-root text.
- JSON-LD available inside accessible roots.

It does not bypass:

- Cross-origin iframe restrictions.
- Closed shadow roots.
- CAPTCHA.
- Login controls.
- Security policies.

### 6.5 Privacy and sanitization

The extension does not intentionally capture:

- Cookies.
- Authorization headers.
- Browser storage.
- Passwords.
- Input values.
- Textarea values.
- Select values.

Scripts other than JSON-LD, styles, iframes, canvases, inputs, textareas, and selects are removed from the captured DOM clone.

Raw evidence is not written to application logs.

---

## 7. Backend API contract

### 7.1 Endpoint

```http
POST /api/v1/jobs/extract-url
Authorization: Bearer <token>
Content-Type: application/json
```

### 7.2 Request

```json
{
  "url": "https://example.com/jobs/123",
  "request_id": "uuid",
  "browser_evidence": {
    "url": "https://example.com/jobs/123",
    "visible_text": "...",
    "selected_panel_text": "...",
    "html": "...",
    "jsonld": []
  }
}
```

`browser_evidence` is optional. Public pages can still be extracted using backend Playwright only.

### 7.3 URL security

Before Playwright navigation, `validate_public_url()` rejects:

- Non-HTTP(S) schemes.
- Missing hostnames.
- Localhost.
- Loopback addresses.
- Private addresses.
- Link-local addresses.
- Reserved and multicast addresses.

This prevents server-side requests to private network resources.

### 7.4 Result caching (added 2026-08-07)

Before running the pipeline, the endpoint checks a Redis cache keyed by normalized URL (+ a rendered-DOM identity fingerprint for SPA portals that keep a generic URL across postings), shared across every user, not scoped to any one account — a job posting's URL is a public resource, so a second user hitting a trending posting gets an instant cached result instead of re-running the full scrape+LLM pipeline. Only genuinely complete successes (`success: true` and `status: "extracted"`) are cached, for 24h. Usage quota is still consumed on a cache hit. Full details, key construction, and the write-gating rationale: [CACHING.md](CACHING.md) §8.

---

## 8. LangGraph execution flow

### 8.1 Discovery agent

Determines:

- URL scheme, host, and path.
- Portal hint.
- Whether the path resembles a job path.
- Whether the portal is likely an SPA.
- Initial browser strategy.

Portal detection is an optimization, not the primary classification mechanism.

### 8.2 Browser acquisition agent

Backend Playwright:

- Opens the URL.
- Waits for `domcontentloaded`.
- Attempts a short `networkidle` wait.
- Records page errors.
- Captures final URL, title, HTML, matched selector, and duration.

The browser agent is acquisition-only. It does not decide whether backend evidence is better than extension evidence.

### 8.3 Universal evidence evaluation agent

This is the core blocked-page recovery layer.

It creates independent `EvidenceSource` records for:

- `extension_selected_panel`
- `extension_jsonld`
- `extension_dom`
- `extension_visible_text`
- `backend_jsonld`
- `backend_playwright`
- `backend_metadata`
- `cleaned_html`
- `markdown`
- `manual_input`

Each source records:

```json
{
  "source_type": "extension_selected_panel",
  "access_status": "usable",
  "available": true,
  "usable": true,
  "restricted": false,
  "restriction_type": null,
  "restriction_confidence": 0,
  "restriction_signals": [],
  "content_length": 12000,
  "job_signal_score": 0.94,
  "quality_score": 0.96,
  "freshness_score": 1,
  "specificity_score": 0.98,
  "selected_job_signal": true,
  "contains_security_challenge": false,
  "contains_login_wall": false,
  "warnings": []
}
```

### 8.4 Source restriction detection

Restrictions are attached to the source that experienced them.

Detected restrictions include:

- `login_required`
- `session_expired`
- `captcha`
- `security_challenge`
- `cloudflare`
- `access_denied`
- `rate_limited`
- `geo_restricted`
- `employee_only`
- `cookie_wall`
- `consent_wall`
- `javascript_shell`
- `empty_shell`
- `network_failure`

Detection combines:

- Final redirected URL.
- Authentication/challenge URL paths.
- Page text.
- Password forms.
- CAPTCHA and security phrases.
- Content-length anomalies.
- Script-only shells.
- Empty rendered bodies.
- Browser acquisition failures.

Restricted evidence is:

- Preserved in state for diagnostics.
- Added to `excluded_sources`.
- Never selected as primary.
- Never passed to semantic classification.
- Never passed to the extraction prompt.

### 8.5 Evidence ranking

Usable sources are ranked using:

```text
rank =
  job_signal_score * 0.34
  + quality_score * 0.27
  + specificity_score * 0.25
  + freshness_score * 0.14
  + selected_job_bonus
  + agreement_bonus
```

The ranking is evidence-driven rather than backend-first.

Important behavior:

- A strong selected panel usually outranks a noisy job-list DOM.
- Complete `JobPosting` JSON-LD can outrank incomplete text.
- A restricted source always receives an invalid rank.
- A failed or empty source cannot become primary.
- Authenticated extension evidence can outrank a backend login wall.

### 8.6 Page access status

Page access is calculated only after all sources are evaluated.

Possible values:

- `fully_accessible`
- `partially_accessible`
- `extension_accessible`
- `backend_accessible`
- `evidence_available`
- `fully_blocked`
- `insufficient_evidence`
- `unknown`

Examples:

| Backend | Extension | Page access |
|---|---|---|
| Public job usable | Not available | `backend_accessible` |
| Login wall | Selected panel usable | `extension_accessible` |
| Security challenge | JSON-LD usable | `extension_accessible` |
| All sources restricted | None usable | `fully_blocked` |
| No meaningful evidence, no restriction | None usable | `insufficient_evidence` |

### 8.7 Selected-job identity and conflict handling

Selected-job identity may include:

- URL.
- Explicit job ID.
- Title.
- Company.
- DOM fingerprint.

Conflicts are recorded when:

- Extension title disagrees with backend structured title.
- Extension and backend refer to different explicit job IDs.

Resolution rules:

- Fresh, selected-region evidence can safely resolve a conflict.
- Evidence from two different jobs is not concatenated.
- **(Corrected 2026-08-08)** A conflict escalates to `MANUAL_REVIEW` — which
  `route_after_evidence` sends straight to `final_response`, skipping
  `jsonld`/`extraction`/everything before the LLM ever runs — **only when
  the primary source is NOT extension evidence** and lacks a confirmed
  `selected_job_signal`. When the primary source IS extension evidence
  (the common, most trustworthy case — it reflects what the user is
  actually looking at), a conflicting backend read no longer blocks the
  pipeline; it's recorded as a warning only. Confirmed real-world false
  positives on a LinkedIn posting and a LangChain/Ashby-embedded posting,
  both with the full JD visibly present on the page: backend Playwright's
  own navigation doesn't share the user's browser session/selection state,
  so for SPA search-results or ATS-iframe-embedded URLs its independently
  resolved final URL/title routinely differs from the extension's even when
  both are looking at the same job — that mismatch was previously treated
  as a genuine identity conflict rather than an artifact of two unrelated
  navigations. See `test_conflicting_job_id_does_not_block_extension_primary_without_selected_signal`
  in `test_job_intelligence.py`.
- **(Corrected 2026-08-08) ATS cross-origin iframe evidence.** Some ATS
  platforms (Ashby chief among them) are embedded via a cross-origin
  `<iframe>` on the company's own careers page rather than hosted directly —
  confirmed real-world case: `langchain.com/careers` embeds
  `jobs.ashbyhq.com/...`. The extension can read the iframe's `src`
  attribute (not blocked by browser policy) but never its rendered content,
  so whatever DOM it captures is the PARENT page's own generic marketing
  copy ("About Us", mission statement) — text that routinely scores high
  enough on keyword-based `job_signal_score` to look like usable job
  evidence. Before this fix that meant three separate places trusted it as
  if it were the real job:
  1. `route_after_discovery` skipped the Playwright fetch entirely (the only
     thing that can resolve the iframe via `_find_ats_iframe_url`) because
     the generic text alone cleared `captured_length >= 200` / `strong_panel`.
  2. Even when the fetch did run, `_source_rank` still ranked the generic
     extension panel above the real re-navigated Ashby content because
     `extension_panel_selected` (a `job_signal_score >= .35` keyword check)
     granted it a `selected_job_signal` quality/specificity boost the real
     backend evidence didn't get.
  3. Once the real backend evidence finally won, its correct title
     ("AI Engineer, Enablement") disagreed with the extension's generic
     title hint ("Careers"), tripping the 8.7 conflict-escalation rule
     above and hard-blocking to `MANUAL_REVIEW` anyway.
  The frontend capture (`captureActiveTabJobEvidence` in
  `jdExtractionFlow.js`) now flags `ats_iframe_detected: true` whenever a
  same-page iframe's `src` hostname matches a known ATS needle
  (`ashbyhq.com`, `greenhouse.io`, `lever.co`, `myworkdayjobs.com`, etc.) and
  differs from the page's own hostname. The backend treats that flag as a
  structural (not keyword-based) signal that extension evidence is
  untrustworthy for this page, unless `extension_jsonld` already carries
  confirmed job data: `_has_usable_extension_evidence` and
  `route_after_discovery` both force a real browser fetch, `evidence_
  evaluation_agent` withholds the `selected_job_signal` boost from the
  extension panel, and the 8.7 conflict-escalation rule is exempted so the
  now-correctly-ranked backend primary isn't blocked by a mismatch against
  evidence already known to be looking at the wrong content. See
  `test_ats_iframe_generic_parent_evidence_forces_browser_fetch`,
  `test_ats_iframe_flag_does_not_override_strong_jsonld_evidence`, and
  `test_ats_iframe_conflict_with_real_backend_jsonld_does_not_block` in
  `test_job_intelligence.py`.

### 8.8 Invariant validation

Before classification:

- Restricted primary sources are rejected.
- Unusable primary sources are rejected.
- `READY` without a usable source is corrected.
- Invalid plans generate warnings instead of crashing production.
- Unrepairable invariant violations route to manual review.

### 8.9 JSON-LD agent

The JSON-LD agent:

- Parses all `application/ld+json` blocks.
- Supports arrays and `@graph`.
- Extracts `JobPosting`.
- Ignores malformed blocks safely.
- Preserves the evidence evaluator's source selection.

### 8.10 DOM cleaner

Removes:

- Scripts.
- Styles.
- SVG.
- Noscript.
- Navigation.
- Headers and footers.
- Iframes and canvases.
- Common consent, advertisement, recommendation, newsletter, modal, popup, social, and tracking noise.

### 8.11 Markdown agent

Converts cleaned HTML to Markdown, then:

- Normalizes whitespace.
- Removes repeated lines.
- Preserves headings and bullets.
- Caps the content size.

### 8.12 Metadata agent

Extracts:

- Page title.
- Meta description.
- Canonical URL.
- Language.
- Open Graph and Twitter metadata.
- Headings.
- Apply links.
- Portal hint.

### 8.13 Block/invariant agent

The later block-detection node no longer globally reclassifies the page.

It validates that:

- The selected primary evidence is usable.
- The selected primary evidence is not restricted.
- Source restrictions remain diagnostics when another usable source exists.

### 8.14 Planner

The planner:

- Preserves readiness from evidence evaluation.
- Can promote partial evidence to ready when complete `JobPosting` JSON-LD is confirmed.
- Never promotes evidence based only on text length.
- Chooses structured-first or evidence-fusion processing.

### 8.15 Semantic classifier

Semantic page types remain independent of access:

- `job_detail`
- `job_list`
- `non_job`

The classifier uses:

- JobPosting JSON-LD.
- Apply actions.
- Job-section headings.
- Employment metadata.
- Listing/search signals.
- Repeated job-card signals.
- Content completeness.
- Specific page title.

Blocked sources have already been excluded, so a security challenge cannot contaminate the classifier.

### 8.16 Classification review and bounded retry

Low-confidence classification can request one bounded browser retry. As of 2026-08-04, a hard Playwright navigation failure (timeout, launch error) on the initial fetch is *also* retried against the same budget — previously `route_after_evidence` only routed back to `browser` when the fetch had been deliberately skipped (extension evidence looked sufficient but wasn't), so an actual `BROWSER_FAILED` exception short-circuited straight to `final_response` on the first attempt without ever spending the retry budget below. On retry, `browser_agent` also escalates the navigation timeout (30s → 45s, capped at 60s) rather than reusing the same window that already proved insufficient — relevant for slow-loading portals such as `amazon.jobs`. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) ISSUE-008.

Limits:

- `max_browser_attempts = 2`
- `max_classification_attempts = 1`
- `max_repair_attempts = 1`

The graph cannot retry indefinitely.

### 8.17 Evidence planner and source builder

The source builder:

- Preserves primary and supplementary source names.
- Records source boundaries and quality values.
- Includes conflicts and warnings.
- Excludes restricted sources.
- Does not concatenate every source blindly.
- Caps primary extraction text at 30,000 characters.
- Includes browser-session title/company/location hints.
- Provides field source hints for identity, description, and application URL.

### 8.18 Structured extraction (rewritten 2026-08-09 — see [CHANGELOG.md](CHANGELOG.md) 3.17.0)

`extraction_agent` (`services/job_extraction/agents.py`) no longer makes one call for the whole `ExtractedJob` schema. It runs, in order:

1. **Deterministic extraction first, unconditionally.** `_deterministic_job_from_evidence` (JSON-LD structured fields, regex heading-detection over rendered markdown via `_JD_SECTION_HEADINGS`, a ~150-term skill-alias dictionary) runs before any LLM call and produces the `baseline` dict — this is not a fallback-on-failure path anymore, it's the first step every extraction takes. `job_title`, `company_name`, `location`, `workplace_type`, `employment_type`, `salary`, `application_url`, `date_posted`, `valid_through`, and `source_url` come from this baseline **only** — no LLM worker schema carries these fields at all.
2. **Deterministic evidence segmentation** slices the rendered markdown into four rough section buckets (role/skills/responsibilities/requirements) via regex heading matching, falling back to the full cleaned evidence text for any bucket where segmentation found nothing usable (correctness over micro-optimization — an unsegmented worker still gets the right facts, just with more irrelevant context).
3. **Four independent DeepSeek-Pro-only workers run concurrently** via `asyncio.TaskGroup` under a 15-second hard deadline (`asyncio.timeout(15.0)`):

   | Worker | Schema | Fields |
   |---|---|---|
   | Role | `JDRoleWorkerResult` | `seniority`, `experience_min`, `experience_max`, `role_family`, `department` |
   | Skills | `JDSkillsWorkerResult` | `skills`, `suggested_skills` |
   | Responsibilities | `JDResponsibilitiesWorkerResult` | `responsibilities` |
   | Requirements | `JDRequirementsWorkerResult` | `requirements`, `preferred_qualifications`, `benefits` |

   Each call: `model_override=settings.DEEPSEEK_JD_MODEL` (hard-validated at startup to be exactly `"deepseek-v4-pro"` — no Flash, no escalation, no race, no head-start delay for this pipeline), `escalate_on_error=False`, `disable_reasoning=True` (see below), and its own strict `max_tokens` budget.
4. **Reasoning explicitly disabled** (`disable_reasoning=True` → `extra_body={"reasoning_effort": "none"}` on the underlying DeepSeek call). Root-cause finding (2026-08-09, measured directly against the live API, not assumed): `deepseek-v4-pro` is a reasoning model that spends `completion_tokens` on an invisible `reasoning_tokens` phase before any real output. A 300-token worker budget with reasoning enabled came back as 300 `reasoning_tokens` / 0 content / `finish_reason: "length"` — completely empty, every time, not occasionally. With reasoning disabled the same call used 17 tokens total and returned correct output. This is why token budgets this small (200-900) work at all; they would not survive DeepSeek Pro's default reasoning behavior.
5. **Targeted retry, per worker, at most once.** A worker that fails (timeout, empty content, malformed JSON) gets exactly one retry with a shorter timeout, still scoped to that worker only — a Skills failure never reruns Role/Responsibilities/Requirements. Total worst case: 4 initial calls + 4 retries = 8 Pro calls; typical case (no failures) is 4.
6. **Merge**: `merged = {**baseline, **each successful worker's non-empty fields}`, then re-validated as one `ExtractedJob` (this is where all the field normalizers — placeholder stripping, workplace/employment canonicalization, salary coercion — actually run; the four worker schemas have none of their own). A worker that never resolved (failed twice, or was still running when the 15s deadline fired and got cancelled) simply leaves the deterministic baseline's value for its fields in place — `used_deterministic_extraction` is `True` whenever fewer than 4 of 4 workers succeeded, but the response is never "blank," only less complete for that specific field group.

It explicitly prevents a marketplace such as LinkedIn from being treated as the employer when the selected job card identifies another company (this rule lives in `EXTRACTION_PROMPT`, shared by all four workers).

**Verified, live, cache-bypassed** (same 3 real postings, back-to-back): LangChain 53.6s → 10.5s; Anthropic 78.0s → 11.2s; Disney 46.4s → 8.6s, with 12/12 worker calls succeeding first try. Full before/after numbers and the empty-content root-cause trace: [CHANGELOG.md](CHANGELOG.md) 3.17.0.

**Not yet done**: none of this streams to the frontend today. `/jobs/extract-url` (§7.1) is still one atomic request/response — the client waits for all four workers (or the 15s deadline) before getting anything back. `minimum_ready` (title/company/description/skills-or-requirements/responsibilities all present) is computed and recorded to `jd_time_to_minimum_ready_seconds` but nothing early-releases it to the UI. SSE progressive per-worker delivery was scoped but not built.

### 8.19 Deterministic review (now informational only — no longer gates routing)

`reviewer_agent` still runs and still checks the same things it always did:

- Job title.
- Company.
- Description or responsibilities.
- Skill evidence.
- Suggested-skill count.
- Unsupported canonical skill labels.
- Responsibilities/requirements completeness (added 2026-08-07): when `description` has substantial content (>200 chars) but both `responsibilities` and `requirements` are empty, this is flagged. See [CHANGELOG.md](CHANGELOG.md) 3.15.22.

**As of 2026-08-09, its `needs_repair`/`is_valid`/`repair_fields` output no longer drives graph routing.** `route_after_reviewer` (`graph.py`) now routes purely on whether `extraction_agent` produced a record at all (`"final_response" if state.extracted_job else "extraction_manual_review"`) — and `extraction_agent` always produces at least the deterministic baseline, so in practice this is always `"final_response"`. The reviewer's field-level checks are preserved for `review_issues`/logging visibility, but no repair call is ever triggered by them anymore; that's what §8.20 replaces. **`final_response_agent` has its own, independent `missing_fields` check** (job_title/company_name/description presence, plus the "skills-only" pattern) that still correctly downgrades a genuinely incomplete result to `status: "partial"` — so a missing required field is still never silently reported as a full success, it just isn't routed through `reviewer_agent`/`repair_agent` to get there anymore.

The reviewer does not make an LLM call (it never did, despite an older log line claiming `llm_calls_so_far=1`).

### 8.20 Repair — replaced by per-worker targeted retry (§8.18 step 5)

`repair_agent` still exists in `agents.py` (full-schema `ExtractedJob` repair, `model_override=DEEPSEEK_JD_MODEL`, `disable_reasoning=True`, 1200 max_tokens) but **the graph no longer routes to it** — `repair`, along with `extraction_manual_review_agent`, is now unreachable from `route_after_reviewer` (see §8.19). The targeted retry inside each of the four workers (§8.18 step 5) is the actual repair mechanism now: smaller, cheaper, and scoped to only the field group that actually failed, rather than re-asking for the entire job record because one section came back short. This is intentional dead code pending a cleanup pass, not a bug — kept in place in case routing needs to be reintroduced, but not currently exercised. Do not assume `repair_attempts`/`max_repair_attempts` on `JDState` reflect anything happening in production today.

Call-count summary (see also §15, also rewritten):

```text
Cache hit (URL-level, §7.4): 0 Pro calls
Full deterministic success:   0 Pro calls (rare — most real postings still need at least one worker)
Typical:                      4 Pro calls (one per worker, no retries)
Worst case:                   8 Pro calls (every worker fails once, retries once each)
```

---

## 9. Job extraction schema and normalization

### 9.0 HTML sanitization safety net (added 2026-08-07)

`responsibilities`, `requirements`, `preferred_qualifications`, and `description` are passed through `_clean_evidence_items`/`_clean_evidence_text` (BeautifulSoup-based tag stripping, already used by the deterministic JSON-LD extraction path) **unconditionally** in `extraction_agent`, regardless of which path (deterministic or LLM) produced the value. Previously this cleaning only ran inside `_deterministic_job_from_evidence` — the LLM-extraction branch (used whenever the source page lacks a complete structured `JobPosting` JSON-LD, i.e. most postings) took the model's structured output verbatim, with no sanitization at all. A source page whose evidence carried raw WYSIWYG/Google-Docs-style markup could get copied straight into these fields as literal `<p><strong>...</strong></p>` text. The cleaner is a safe no-op on already-clean plain text, so this is unconditional rather than branch-specific.

### 9.1 Canonical fields

`ExtractedJob` includes:

- `job_title`
- `company_name`
- `location`
- `workplace_type`
- `employment_type`
- `seniority`
- `department`
- `experience_min` (added 2026-08-09 — populated by the Role worker, §8.18; not yet surfaced in `JobReviewView.jsx`)
- `experience_max` (added 2026-08-09 — same as above)
- `role_family` (added 2026-08-09 — same as above)
- `description`
- `responsibilities`
- `requirements`
- `preferred_qualifications`
- `skills`
- `suggested_skills`
- `benefits`
- `salary`
- `application_url`
- `date_posted`
- `valid_through`
- `source_url`

### 9.2 Employment normalization

The LLM boundary accepts source-native labels to prevent tool-call rejection.

Examples:

| Source label | Canonical value |
|---|---|
| `Full Time, Permanent` | `full_time` |
| `Part-time` | `part_time` |
| `Contract / Freelance` | `contract` |
| `Intern` | `internship` |

This fixed Groq's `tool_use_failed` response when a page used `"Full Time, Permanent"` instead of the exact enum `"full_time"`.

### 9.3 Workplace normalization

Examples:

| Source label | Canonical value |
|---|---|
| `Work from home` | `remote` |
| `Hybrid working` | `hybrid` |
| `Office-based` | `onsite` |

### 9.4 Salary compatibility

The canonical backend salary remains structured:

```json
{
  "minimum": 159200,
  "maximum": 215300,
  "currency": "USD",
  "period": "annually",
  "raw": "159,200 - 215,300 USD annually"
}
```

Compatibility/UI aliases convert it into a display string. `formatSalary()` prevents React from rendering a raw object, which previously caused React error 31.

### 9.5 Legacy compatibility

Compatibility aliases include:

- `title`
- `company`
- `job_type`
- `work_mode`
- `qualifications`
- `required_skills`
- `preferred_skills`
- camelCase equivalents
- `skills_categories`

`normalize_job_payload()` maps the canonical extraction into the legacy `JobAnalysis` contract used by `/api/compare` and tailoring.

Null legacy string/list values are normalized to safe empty values.

---

## 10. Skills intelligence

### 10.1 Explicit skills

`skills` contains only evidence-supported skills explicitly present in:

- Description.
- Responsibilities.
- Required qualifications.
- Preferred qualifications.
- Parenthetical examples.
- Named tool/language/platform lists.

The atomizer splits phrases such as:

```text
data scripting languages (e.g. SQL, Python, R)
```

into separate labels:

- SQL
- Python
- R

### 10.2 Suggested skills

`suggested_skills` contains role-relevant ATS recommendations inferred from:

- Role title.
- Responsibilities.
- Expected outcomes.
- Seniority.
- Domain.
- Required and preferred qualifications.

Rules:

- Produce 4–10 useful recommendations for a valid job.
- Keep them separate from explicit skills.
- Never present them as employer requirements.
- Never duplicate explicit skills.
- Prefer concrete resume-usable labels over vague traits.

### 10.3 UI presentation

The frontend displays:

- `Explicit`
- `Suggested`

`collectJobSkills()` supports canonical, snake_case legacy, and camelCase legacy fields and deduplicates them.

Suggested skills are included as preferred skills for ATS comparison, while explicit skills remain required skills.

---

## 11. Stable response contract

### 11.1 Successful extraction

```json
{
  "success": true,
  "status": "extracted",
  "page_type": "job_detail",
  "page_access_status": "extension_accessible",
  "readiness": "READY",
  "selected_source": "extension_selected_panel",
  "source_selection_reason": "backend_restricted_extension_job_evidence_available",
  "extracted_job": {},
  "warnings": []
}
```

### 11.2 Partial extraction

```json
{
  "success": true,
  "status": "partial",
  "page_type": "job_detail",
  "page_access_status": "partially_accessible",
  "readiness": "PARTIAL",
  "extracted_job": {},
  "missing_fields": [],
  "warnings": []
}
```

### 11.3 Job selection required

```json
{
  "success": false,
  "status": "selection_required",
  "page_type": "job_list",
  "readiness": "NOT_READY",
  "error": {
    "code": "JOB_SELECTION_REQUIRED",
    "message": "Open or select a specific job before extracting."
  }
}
```

### 11.4 Genuine non-job page

```json
{
  "success": false,
  "status": "non_job",
  "page_type": "non_job",
  "readiness": "NOT_READY",
  "error": {
    "code": "NON_JOB_PAGE",
    "message": "The current page does not contain an extractable job description."
  }
}
```

### 11.5 Fully blocked

```json
{
  "success": false,
  "status": "blocked",
  "page_type": "unknown",
  "page_access_status": "fully_blocked",
  "readiness": "BLOCKED",
  "restriction": "security_challenge",
  "error": {
    "code": "PAGE_BLOCKED",
    "message": "The page could not be inspected using the available evidence sources."
  }
}
```

### 11.6 Manual review

```json
{
  "success": false,
  "status": "manual_review",
  "page_type": "unknown",
  "readiness": "MANUAL_REVIEW",
  "warnings": ["Conflicting job identity could not be resolved safely."],
  "error": {
    "code": "MANUAL_REVIEW_REQUIRED",
    "message": "The available evidence is conflicting or incomplete and requires review."
  }
}
```

---

## 12. Frontend state mapping

| Backend/client outcome | Frontend state |
|---|---|
| Extracted | Job review |
| Partial | Job review with missing data left empty |
| Selection required | Job-list recovery screen |
| Genuine non-job | Non-job recovery screen |
| Login required | Login-required screen |
| CAPTCHA | Security-check screen |
| Security challenge | Security-check screen |
| Rate limited | Temporary limitation screen |
| Fully blocked | Blocked screen |
| Manual review | Manual-review screen |
| Insufficient evidence | Extraction-incomplete screen |
| Browser New Tab | No-job-open screen |
| Browser internal page | Page-inaccessible screen |

Controlled backend outcomes return normally and are not thrown into the generic error handler.

Manual job entry remains available as the explicit final fallback.

---

## 13. Job session management

### 13.1 Storage choice

JD state uses:

```text
chrome.storage.session
```

It does not use permanent `chrome.storage.local` for job state.

Why:

- The JD must survive navigation between extension routes.
- The JD must not leak into a future browser session.
- Changing to another job must invalidate the previous job.

### 13.2 Stored session fields

The session stores:

- `jobAnalysis`
- `jobText`
- `companyName`
- `jobTitle`
- `lastAnalyzedUrl`
- `jobDetectionMeta`

### 13.3 Job identity

Identity uses:

- Known job-ID query parameters.
- Linked job path IDs.
- Normalized URL path.
- Job-related hash fragments.

### 13.4 Session rules

- Same job and no forced rescan: retain existing extraction.
- Same job already in flight: suppress duplicate request.
- Different job identity: abort old request, clear old state, remove session, start new extraction.
- Browser New Tab/non-job page: end stale job session.
- Full `chrome-extension://` workflow page: retain current session.
- Browser restart/session end: Chrome clears the job session naturally.
- Stale backend responses are discarded using request and identity refs.

### 13.5 Previous session bugs fixed

1. Permanent storage restored Amazon data while viewing Google or Tesla.
2. Full extension tabs were mistaken for a different job and deleted valid session data.
3. Scans started before profile hydration and never retried.
4. SPA job switches did not always produce tab completion events.
5. Multiple scans for the same identity ran concurrently.

---

## 14. ATS comparison integration

After extraction:

- Job details render immediately.
- Active resume comparison runs once in the background.
- The extraction screen does not wait for `/api/compare`.
- A slow or failed comparison cannot trap the UI at 92%.
- The match result updates when available.

The compare payload accepts canonical and legacy job aliases through backend normalization.

This removed ATS comparison as an extraction bottleneck.

---

## 15. LLM call management (rewritten 2026-08-09 — was "Groq call management")

Rate limiting was the original reason for a strict call-count policy; latency is the current one. See §8.18 for the full architecture.

Current call policy:

- Evidence acquisition: deterministic/browser operations. Zero LLM calls.
- Restriction detection: deterministic. Zero LLM calls.
- Source ranking: deterministic. Zero LLM calls.
- Page classification: deterministic. Zero LLM calls.
- Deterministic extraction baseline: zero LLM calls (JSON-LD/DOM/regex).
- Structured extraction: up to four concurrent DeepSeek-Pro-only calls (role/skills/responsibilities/requirements), each with at most one targeted retry.
- Review: deterministic, zero LLM calls (§8.19 — no longer gates a repair call).
- Repair: not reachable in the current graph (§8.20) — superseded by per-worker targeted retry.

Maximum:

```text
Cache hit (§7.4):        0 Pro calls
Typical extraction:      4 Pro calls (one per worker, no retries needed)
Worst case:               8 Pro calls (every worker fails once, retries once each)
```

This replaced both the earlier many-call pipeline that caused rate-limit problems (Groq era) **and** the later single-combined-call-with-flash/pro-escalation design that caused 46-92s single extractions (see [CHANGELOG.md](CHANGELOG.md) 3.17.0) — decomposition into small, parallel, Pro-only, non-reasoning calls addresses both latency and reliability at once.

Resume storage and resume listing do not require an LLM call. Resume parsing can be performed separately/on demand.

---

## 16. Observability

### 16.1 Log prefixes

Frontend:

```text
[JD-EXTRACTION][FRONTEND]
```

Backend:

```text
[JD-EXTRACTION][BACKEND]
```

### 16.2 Key frontend logs

- Extraction request started.
- Current tab URL captured.
- Browser page classification.
- Browser evidence captured.
- Browser evidence readiness.
- Request sent.
- Backend response received.
- Hybrid evidence decision.
- Explicit and suggested skill counts.
- Session restored/rejected.
- Old job invalidated.
- Stale response discarded.
- Background resume comparison started/finished.

### 16.3 Key backend logs

- Portal discovery.
- Browser attempt and duration.
- Evidence source statuses.
- Source restrictions and confidence.
- Ranking scores.
- Primary/supplementary/excluded sources.
- Source-selection reason.
- Page access.
- Readiness.
- Conflicts.
- Classifier signals.
- Extraction field counts.
- Explicit and suggested skills.
- Review/repair fields.
- Final stable status.

### 16.4 Example recovered restricted page

```text
[JD-EXTRACTION][BACKEND] Evidence evaluation
source_status={
  backend_playwright: restricted,
  extension_selected_panel: usable
}
restrictions={
  backend_playwright: {
    restriction_type: login_required,
    confidence: 0.98
  }
}
primary=extension_selected_panel
excluded=[backend_playwright]
reason=backend_restricted_extension_job_evidence_available
page_access=extension_accessible
readiness=READY
selected_job=true

[JD-EXTRACTION][BACKEND] Final response
success=true
status=extracted
page_type=job_detail
primary=extension_selected_panel
```

### 16.5 Data never logged

- Cookies.
- Tokens.
- Authorization headers.
- Passwords.
- Complete raw HTML.
- Sensitive extension storage.

---

## 17. Testing

### 17.1 Frontend

Run:

```powershell
cd frontend
npm.cmd run test:extraction
```

Current frontend regression coverage includes:

- Stable response-state mapping.
- Malformed response rejection.
- Browser New Tab/internal page classification.
- Portal-independent non-job detection.
- Traditional job readiness.
- Split-panel readiness.
- Security-challenge recovery bypass.
- Salary formatting.
- Canonical/legacy skill collection.
- URL safety.

### 17.2 Backend

Run in the backend Python environment:

```powershell
cd backend
python -m pytest test_job_intelligence.py -q
```

Coverage includes:

- Portal job fixtures.
- JSON-LD arrays, graphs, and malformed blocks.
- Generic job sections without JSON-LD.
- Job-list and non-job classification.
- Bounded retries.
- Tesla-style sections.
- DOM cleanup and metadata.
- Routing and repair limits.
- Stable response shapes.
- Sensitive log exclusion.
- Private URL rejection.
- Employment-label normalization.
- Backend login plus extension selected panel.
- Backend challenge plus extension JSON-LD.
- All sources restricted.
- Public backend JSON-LD.
- Conflicting job identities.
- Invalid restricted-primary invariant.

### 17.3 Production build

```powershell
cd frontend
npm.cmd run build
```

Reload the unpacked Chrome extension after every frontend build.

Restart the backend after backend/schema/graph changes.

---

## 18. Debugging runbook

### 18.1 Extension shows an old job

Check frontend logs for:

```text
Extraction session restored
Stale extraction session rejected
old job invalidated
Previous extraction session ended
```

Verify:

- Active URL identity.
- `jobExtractionSession`.
- Whether the current page is an internal extension page.
- Whether a new job ID appears in the URL.

### 18.2 Backend sees login but user is signed in

Expected:

```text
backend_playwright=restricted
extension_selected_panel=usable
primary=extension_selected_panel
page_access=extension_accessible
```

If backend remains primary, inspect:

- Extension evidence lengths.
- Selected panel score.
- Restriction signals.
- Ranking scores.
- Excluded sources.

### 18.3 Company becomes the job platform

Inspect frontend capture:

```text
jobTitleHint
companyHint
locationHint
```

The selected top-card employer must be present in `browser_session_hints`.

### 18.4 Skills are missing

Inspect:

```text
Extraction explicit skills
Extraction suggested skills
canonicalSkillsCount
canonicalSuggestedSkillsCount
```

Confirm:

- The complete qualifications and responsibilities reached source text.
- Parenthetical lists were atomized.
- UI uses `collectJobSkills()`.

### 18.5 DeepSeek returns HTTP 400 tool validation, or a worker returns empty content

For a genuine schema-validation 400: inspect the failing field. Source-native categorical labels should use permissive schema fields followed by deterministic normalization. Do not make the tool schema stricter than real job-site values.

For **empty content with no error** from a JD-extraction worker specifically (as of the 2026-08-09 rewrite, §8.18): check `disable_reasoning=True` is actually being passed for that call site. `deepseek-v4-pro` silently spends the entire `max_tokens` budget on an invisible reasoning phase when this isn't set, producing `finish_reason: "length"` with zero real content — this looks like a token-budget-too-small bug but isn't; the fix is disabling reasoning, not raising `max_tokens`. Confirm via the response's `usage.completion_tokens_details.reasoning_tokens` field if you have raw API access — if `reasoning_tokens == completion_tokens`, that's the signature.

### 18.6 Extraction spinner does not stop

Check whether:

- Extraction returned HTTP 200.
- ATS comparison is still running.
- `jobAnalysis` was set.
- The extraction page is incorrectly waiting for a match score.

Comparison must remain background-only.

### 18.7 Non-job page shows the empty extraction form

Check:

- Profile/resume/preference hydration.
- Global tab listener initialization.
- Local evidence assessment.
- `jobDetectionStatus`.
- Route redirection to `/no-job-detected`.

The scan should begin only after hydration.

---

## 19. Known limitations

- Cross-origin iframe content cannot be captured due to browser security policy.
- Closed shadow roots cannot be inspected.
- Pages with no rendered evidence and no recognizable restriction may return insufficient evidence.
- Ambiguous selected panels can require manual review.
- Browser evidence size is capped.
- The source evaluator uses deterministic language patterns; new challenge templates may require generic pattern additions.
- A page that changes selected job without changing URL depends on DOM fingerprint and periodic active-tab observation; portal behavior can still affect detection timing.
- Manual input is an explicit fallback rather than an automatic source.
- LLM output remains probabilistic, but the schema, deterministic normalization, reviewer, and repair limits constrain it.

---

## 20. Design rules for future development

1. Never equate one restricted source with a blocked page.
2. Never pass challenge/login content into classification or extraction.
3. Never select a restricted source when a usable source exists.
4. Never mix two job identities.
5. Never label access failure as `non_job`.
6. Keep page type, page access, and readiness separate.
7. Keep explicit and suggested skills separate.
8. Keep frontend capture portal-independent; selectors are optional optimizations.
9. Keep retries bounded — one targeted retry per worker (§8.18 step 5), never a whole-schema rerun.
10. Keep JD extraction on DeepSeek Pro only, reasoning disabled — no Flash, no racing, no escalation, no thinking budget silently eating a small worker's token allowance (§8.18, §15).
11. Keep JD persistence session-scoped.
12. Keep ATS comparison non-blocking.
13. Preserve compatibility aliases until all consumers migrate.
14. Add regression tests for every production failure.
15. Never bypass login, CAPTCHA, anti-bot, or browser security controls.

---

## 21. Current operational checklist

After backend changes:

1. Restart FastAPI.
2. Confirm Playwright is installed.
3. Run backend tests.
4. Test a public JSON-LD job.
5. Test a public generic job.
6. Test a protected page with usable extension evidence.
7. Test a security challenge with no usable evidence.

After frontend changes:

1. Run extraction tests.
2. Run the production build.
3. Reload the unpacked extension.
4. Open a normal job.
5. Change to another job.
6. Open New Tab.
7. Navigate through tailoring routes.
8. Confirm the JD persists only through the browser session.

---

## 22. Final architecture outcome

The completed system is:

- Hybrid rather than backend-only.
- Evidence-driven rather than portal-driven.
- Source-aware rather than globally blocked.
- Session-safe rather than permanently stale.
- Bounded rather than request-heavy.
- Explainable through structured logs.
- Backward compatible with existing tailoring and comparison features.
- Resilient across public pages, SPAs, split panes, login walls, and security challenges.
- Conservative when evidence is missing or conflicting.

The working public-career-page flow remains intact, while restricted-page handling is wrapped by a universal recovery framework.
