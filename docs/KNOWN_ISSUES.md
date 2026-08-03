# Tailr4U - Known Issues & Bug Tracking Log

This document tracks all currently identified technical issues, edge-case bugs, performance bottlenecks, and active remediation plans for **Tailr4U**.

---

## Active Issues Register

### ISSUE-001: Headless Chromium Playwright Cold-Start Latency
- **Date Discovered**: 2026-07-28
- **Severity**: Medium
- **Component**: PDF Rendering Engine (`app/playwright_pdf.py`)
- **Description**: The first PDF generation request after backend startup exhibits an initial latency of `3.5s - 5.0s` as the headless Chromium browser context launches.
- **Root Cause**: Playwright launches browser process on-demand rather than maintaining a warm browser context pool.
- **Current Status**: Workaround in place (Health ticker triggers browser warm-up on server boot). Permanent fix planned for `v3.1`.
- **Assigned Fix**: Implement a persistent Playwright browser context pool using a background worker thread (`playwright_pool.py`).

---

### ISSUE-002: Upstream Free-Tier Gemini API Quota Exceeded (HTTP 429) — HISTORICAL
- **Date Discovered**: 2026-07-22
- **Date Closed**: 2026-08-02
- **Severity**: Medium (Resolved)
- **Component**: ~~AI Service Pipeline (`app/gemini_service.py`)~~ — _file deleted_
- **Description**: Rapid sequential tailoring requests on free-tier accounts occasionally encountered 429 rate-limit exceptions from Google Gemini API.
- **Root Cause**: Gemini free-tier imposed a strict `15 Requests Per Minute (RPM)` limit.
- **Current Status**: **FULLY RESOLVED** — Gemini removed. Application migrated to **DeepSeek** (sole LLM provider). Redis caching and single-flight lock prevent redundant API calls.

---

### ISSUE-003: Dynamic DOM Class Name Mutations on Custom Niche Job Boards
- **Date Discovered**: 2026-07-15
- **Severity**: Low
- **Component**: Extension JD Collector (`frontend/src/services/jdExtractionFlow.js::captureActiveTabJobEvidence`) — not `src/browser-intelligence/`, which is unused/empty; see [BROWSER_INTELLIGENCE_ARCHITECTURE.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/BROWSER_INTELLIGENCE_ARCHITECTURE.md) status note.
- **Description**: Occasional job descriptions on niche ATS portals (e.g. custom company career pages) fail auto-parsing and require user fallback selection.
- **Root Cause**: Non-standard HTML markup missing standard ARIA roles or microdata tags.
- **Current Status**: Active Monitoring. Note: a generic heuristic fallback (density/signal-word scoring over `[role="dialog"], [role="main"], article, main, aside, section`) already exists in the collector — this issue tracks the remaining cases it still misses, not an unimplemented fallback.
- **Assigned Fix**: Improve the existing heuristic scoring further (see `jdExtractionFlow.js` lines 62-90 for current logic) rather than adding a new parser.

---

### ISSUE-004: PDF Single-Page Overflow on Long Resumes
- **Date Discovered**: 2026-08-01
- **Severity**: Low
- **Component**: React Render Templates (`frontend/src/templates/`)
- **Description**: Resumes with extensive employment histories (5+ positions) exceed 1 page when rendered into tight ATS templates.
- **Root Cause**: Fixed font sizes and line heights without dynamic scale-down rules.
- **Current Status**: Open.
- **Assigned Fix**: Add automated font-size scaling dynamic CSS classes based on total character count in template renderer.

---

### ISSUE-005: DB Connection Held Across Slow AI/Playwright Work (Pool Exhaustion) — PARTIALLY RESOLVED
- **Date Discovered**: 2026-08-03
- **Severity**: High
- **Component**: `core/database.py` (`ThreadedConnectionPool`), several routers in `api/v1/` and `app/routers/api.py`
- **Description**: Recurring `psycopg2.pool.PoolError: connection pool exhausted` under concurrent load. FastAPI's per-request dependency caching means every `Depends(get_db_connection)` in a request resolves to the same single pooled connection, held for as long as that dependency lives — which is the whole request if it's injected via `Depends`. Several endpoints inject a DB connection via `Depends` and then also run a slow, synchronous LLM or Playwright call in the same request, holding a pooled connection idle for seconds (or, for SSE streams, indefinitely) per request.
- **Root Cause**: Mixing FastAPI's request-scoped `Depends(get_db_connection)` pattern with slow synchronous work in the same request. The worst instance (`POST /refine-section/stream` in `app/routers/api.py`) held a connection for an entire unbounded SSE stream via a `conn` dependency that was never even used inside `refine_section_stream_generator` (silently absorbed into an unused `**kwargs`).
- **Current Status**: Partially resolved (2026-08-03):
  - **Fully fixed**: `POST /refine-section/stream` (dead `conn` dependency removed entirely — zero functional change, pure leak fix); `POST /cover-letter` in `app/routers/api.py` (refactored to a short-lived `_db_context()` — `contextmanager(get_db_connection)` — held only around the usage-check/consume writes, with the LLM call in between running outside any DB connection scope).
  - **Half-fixed** (blocking LLM call moved off the event loop via `run_in_threadpool`, but the DB connection is still held via `Depends` for the full request): `tailor_resume` (`api/v1/tailoring.py`), `api_compare` (`app/routers/api.py`), `parse_existing_resume` and `get_active_resume` (`api/v1/resume.py`).
  - **Not yet addressed**: `download_pdf` (`api/v1/tailoring.py` — connection held through Playwright render + the new `_PDF_RENDER_LOCK` queue wait, see ISSUE-006); `build_selected_resume_intelligence` / `confirm_selected_resume_intelligence` (`api/v1/resume.py` — connection held through a multi-step DeepSeek pipeline); `api_generate_cover_letter_draft` (`app/routers/api.py`).
- **Assigned Fix**: Refactor `TailoringService.execute_tailoring_flow` and the equivalent resume-intelligence/cover-letter-draft services to stop binding a single request-long connection across repo reads → LLM call → repo writes — instead take short-lived connections (the `_db_context()` pattern now in `app/routers/api.py`) only around the actual DB read/write, leaving no connection held during the LLM/Playwright call. Tracked in [TODOS.md](TODOS.md) P0.

---

### ISSUE-007: Cached `user` Record Permanently Wiped by Inconclusive Session Verification — RESOLVED
- **Date Discovered**: 2026-08-04
- **Date Closed**: 2026-08-04
- **Severity**: High (Resolved)
- **Component**: `frontend/src/context/AppContext.jsx`
- **Description**: Opening a new tab via the extension's "Resume" or "Cover Letter" buttons (or any new `chrome-extension://` tab) intermittently landed on `/extension-setup` asking the user to sign in again, despite the access token being fully valid.
- **Root Cause**: `setUser()` is not a plain state setter — calling it with `null` deletes the cached `user` record from both `localStorage` and `chrome.storage.local`. The background `/auth/session` verification in `checkSession()` called `setUser(null)` whenever it couldn't get a definitive response within its retry budget (network blip, timeout, or a slow/cold-starting Render backend) — not only on a confirmed `401`. Once the cached `user` object was wiped this way, every subsequently opened tab failed the "instant unblock" check (which requires both a stored token AND a stored user) and depended entirely on a fresh, live `/auth/session` call succeeding within ~11 seconds — too short for a cold backend.
- **Current Status**: **RESOLVED**. `checkSession()`'s inconclusive-result branch no longer calls `setUser(null)`/`setSession(null)` — only a confirmed invalid/expired token (after an attempted refresh) clears the session. The verification retry budget was also widened to 3 attempts × 8s with backoff (~27s total). See [AUTH_OAUTH.md](AUTH_OAUTH.md) §4 and [CHANGELOG.md](CHANGELOG.md) 3.7.1.

---

### ISSUE-008: JD Extraction Failing Outright on a Single Playwright Navigation Timeout — RESOLVED
- **Date Discovered**: 2026-08-03
- **Date Closed**: 2026-08-04
- **Severity**: Medium (Resolved)
- **Component**: `services/job_extraction/agents.py`, `services/job_extraction/graph.py`
- **Description**: Job description extraction failed completely (`playwright._impl._errors.TimeoutError: Page.goto: Timeout 30000ms exceeded`) on slow-loading job portals such as `amazon.jobs`, with zero retry despite the state schema budgeting for `max_browser_attempts = 2`.
- **Root Cause**: `route_after_evidence()` only routed back to the `browser` node when the Playwright fetch had been deliberately *skipped* in favor of extension evidence that turned out insufficient (`browser_attempts == 0`). An actual `BROWSER_FAILED` exception (timeout, launch error, DNS failure) set `state.error` and routed straight to `final_response` on the very first attempt, never spending the allocated retry budget.
- **Current Status**: **RESOLVED**. `route_after_evidence()` now also retries when `error.code == "BROWSER_FAILED"` and attempts remain. `browser_agent` additionally escalates the navigation timeout on retry (30s → 45s, capped at 60s), since a page that missed the base timeout window is more likely to succeed with a longer one than an identical retry. See [JD_EXTRACTION_ENGINE_DOCUMENTATION.md](JD_EXTRACTION_ENGINE_DOCUMENTATION.md) §8.16 and [CHANGELOG.md](CHANGELOG.md) 3.7.1.

---

### ISSUE-006: Suspected OOM-Driven 502 Cascade During Concurrent PDF Rendering — UNCONFIRMED
- **Date Discovered**: 2026-08-03
- **Severity**: Medium
- **Component**: `app/playwright_pdf.py`
- **Description**: A 502 on a PDF-render request was observed occurring simultaneously with 502s on an unrelated endpoint (`/notifications/unread-count`), suggesting a whole-process failure rather than an isolated request error.
- **Root Cause (hypothesis, unconfirmed)**: Concurrent headless Chromium launches, triggered by repeated frontend PDF-render retries, exceeding Render's per-instance memory limit and OOM-killing the entire process — which would explain the simultaneous unrelated-endpoint failure. Not confirmed against Render's actual server-side logs; diagnosis was made from browser console output only.
- **Current Status**: Mitigated but not confirmed. Added a process-wide `threading.Lock()` (`_PDF_RENDER_LOCK` in `app/playwright_pdf.py`) serializing all Playwright rendering (`generate_pdf_via_playwright`, `generate_cover_letter_pdf_via_playwright`, `render_cover_letter_artifact`) to bound peak concurrent Chromium memory usage.
- **Assigned Fix**: If 502s recur, check Render's dashboard logs for an explicit OOM/SIGKILL message to confirm or rule out this hypothesis before investing further here.
