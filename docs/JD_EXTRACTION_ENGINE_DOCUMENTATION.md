# tailr4u Job Description Extraction Engine

## End-to-End Engineering Documentation

**Document status:** Current implementation, with one stale provider name (see correction below)  
**Scope:** Chrome extension JD capture, hybrid evidence acquisition, backend Job Intelligence graph, extraction, review, session management, ATS comparison integration, frontend states, observability, testing, and operations.

> ⚠️ **Provider correction**: every mention of **Groq** throughout this document (the "one structured Groq call" pattern, `Groq rate limiting`, `Groq's tool_use_failed`, §15 "Groq call management", §18.5, etc.) should be read as **DeepSeek**. Per [ADR_DEEPSEEK_SOLE_PROVIDER.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/ADR_DEEPSEEK_SOLE_PROVIDER.md), Groq was fully removed from the codebase (`groq_service.py` deleted, `groq` package not in `requirements.txt`) and `backend/services/job_extraction/agents.py` now calls `app.ai_service.get_llm()`, which routes through `DeepSeekProvider`/`ResilientLLMWrapper` (`deepseek-v4-flash` → `deepseek-v4-pro` escalation) instead. The call-count discipline this document describes (one normal-path call, at most one repair call) is a real, still-enforced constraint — only the vendor name is outdated. This banner was added rather than rewriting all ~15 in-body mentions individually, to avoid introducing new errors in a 37KB document without re-verifying every surrounding claim line-by-line.

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
- One structured Groq extraction call in the normal path.
- Deterministic validation and at most one repair call when required.
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
- Unresolved identity conflicts become `MANUAL_REVIEW`.
- Evidence from two different jobs is not concatenated.

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

Low-confidence classification can request one bounded browser retry.

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

### 8.18 Structured extraction

The normal extraction path makes one structured Groq call using `ExtractedJob`.

The extraction prompt requires:

- Exact role title.
- Recognizable employer brand.
- Location.
- Workplace and employment types.
- Description.
- Responsibilities.
- Requirements.
- Preferred qualifications.
- Explicit skills.
- Suggested skills.
- Benefits.
- Salary.
- Application and posting dates.
- Source URL.

It explicitly prevents a marketplace such as LinkedIn from being treated as the employer when the selected job card identifies another company.

### 8.19 Deterministic review

The reviewer checks:

- Job title.
- Company.
- Description or responsibilities.
- Skill evidence.
- Suggested-skill count.
- Unsupported canonical skill labels.

The reviewer does not make an additional LLM call.

### 8.20 Optional repair

If review finds repairable issues:

- At most one repair call is allowed.
- The repair prompt includes current extraction, repair fields, field issues, and sanitized evidence.
- The result is normalized and reviewed again.

Therefore:

- Normal path: one Groq call.
- Repair path: maximum two Groq calls.

This replaced the earlier many-call pipeline that caused rate-limit problems.

---

## 9. Job extraction schema and normalization

### 9.1 Canonical fields

`ExtractedJob` includes:

- `job_title`
- `company_name`
- `location`
- `workplace_type`
- `employment_type`
- `seniority`
- `department`
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

## 15. Groq call management

Rate limiting occurred because the earlier agent pipeline made many calls per extraction.

Current call policy:

- Evidence acquisition: deterministic/browser operations.
- Restriction detection: deterministic.
- Source ranking: deterministic.
- Page classification: deterministic.
- Normal structured extraction: one Groq call.
- Review: deterministic.
- Repair: optional one Groq call.

Maximum:

```text
Normal extraction: 1 Groq call
Extraction needing repair: 2 Groq calls
```

Resume storage and resume listing do not require Groq. Resume parsing can be performed separately/on demand.

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

### 18.5 Groq returns HTTP 400 tool validation

Inspect the failing field.

Source-native categorical labels should use permissive schema fields followed by deterministic normalization. Do not make the tool schema stricter than real job-site values.

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
9. Keep retries bounded.
10. Keep normal Groq usage to one extraction call.
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
