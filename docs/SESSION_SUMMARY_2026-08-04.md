# Tailr4U — Debugging Session Summary (2026-08-03 → 2026-08-04)

This document narrates a multi-day production debugging session end-to-end: what broke, why, what was
changed, and what still needs manual follow-up. Every fix below is also recorded in
[CHANGELOG.md](CHANGELOG.md) (versions 3.7.0–3.7.3) and cross-referenced from [KNOWN_ISSUES.md](KNOWN_ISSUES.md)
(ISSUE-005 through ISSUE-009). This file is the single narrative read-through; those files are the
authoritative, versioned record.

**Pattern for the whole session**: a real runtime error, traceback, or screenshot was pasted with minimal
commentary, root-caused against the actual code (not guessed), fixed, and verified via `python -m py_compile`
/ `esbuild` where feasible.

---

## 1. Render Deployment: Playwright Install Failures

**Symptom**: Render build failed with `su: Authentication failure` during `playwright install --with-deps`;
after fixing that, PDF generation still failed at runtime with `Executable doesn't exist at
.../chrome-headless-shell`.

**Root causes**:
- `--with-deps` shells out to `apt-get` via `su`, which needs root — Render's native (non-Docker) build
  environment runs as non-root with no passwordless sudo.
- Render's build-machine Playwright browser cache does not reliably carry into the deployed runtime
  container, so a successful build-time install doesn't guarantee the running instance has the browser.

**Fixes**:
- `backend/render-build.sh` — `playwright install chromium` without `--with-deps`.
- `backend/main.py` — `lifespan` startup hook runs `_ensure_playwright_chromium()`, an idempotent
  `playwright install chromium` via `asyncio.to_thread`, on every process boot as a self-heal.

**Still open**: whether Render's dashboard Build Command field (if manually configured before the script
existed) was actually updated to match — tracked in [TODOS.md](TODOS.md).

---

## 2. Supabase Storage 404s Crashing Resume Endpoints

**Symptom**: `storage3.exceptions.StorageApiError: 404 not_found` raw 500s on resume file/preview/recovery
endpoints.

**Root cause**: Pre-existing resume records reference files that were never actually persisted to storage
(from before storage was wired up, or lost to an ephemeral-disk redeploy) — legitimately unrecoverable, but
several call sites had zero error handling.

**Fixes**: `SupabaseStorageService.download_file` now converts `StorageApiError` 404s into a plain
`FileNotFoundError`; `get_resume_file`, `recover_resume_source_details` (`api/v1/resume.py`), and
`_assert_lock` (`services/resume_intelligence/nodes.py`) all handle it cleanly (404 response / graceful
degradation) instead of crashing.

---

## 3. Playwright PDF Rendering: Warning, Memory, and Port Bugs

Three separate issues surfaced in `app/playwright_pdf.py` across the session:

1. **`SyntaxWarning: invalid escape sequence '\/'`** — un-doubled backslashes in embedded JS regex code
   inside a Python string literal. Fixed by doubling the backslashes.
2. **Suspected OOM-driven 502 cascade** — a PDF-render 502 was observed alongside a simultaneous,
   unrelated-endpoint 502, suggesting a whole-process crash rather than an isolated failure. Hypothesis:
   concurrent headless Chromium launches from retried PDF renders exceeding Render's memory limit. Mitigated
   with a process-wide `threading.Lock()` (`_PDF_RENDER_LOCK`) serializing all Playwright rendering — **not
   confirmed** against Render's actual server logs ([KNOWN_ISSUES.md](KNOWN_ISSUES.md) ISSUE-006).
3. **Hardcoded self-referential port** — `PDF_RENDERER_URL` defaulted to `127.0.0.1:8000`, but `main.py`
   binds Uvicorn to Render's dynamically-injected `$PORT`, not a fixed 8000. Every production PDF render
   failed with `net::ERR_CONNECTION_REFUSED` because nothing listens on 8000. Fixed by deriving the default
   port from `os.environ.get("PORT", "8000")`, matching `main.py`'s own bind logic exactly
   ([KNOWN_ISSUES.md](KNOWN_ISSUES.md) ISSUE-009).
   - **Separately discovered, not a code bug**: the traceback's second failing candidate,
     `http://localhost:5173`, revealed that Render's `FRONTEND_URL` environment variable is currently set to
     a local Vite dev address instead of the real production frontend origin. **Requires a manual Render
     dashboard fix** — tracked in [TODOS.md](TODOS.md).

---

## 4. "Edit with AI" — 100% Reproducible Crash

**Symptom**: Every Edit-with-AI request crashed with `PydanticUserError: BaseModel cannot be instantiated
directly`.

**Root cause**: `is_prompt_out_of_scope()` (`app/ai_service.py`) — called first on every Edit-with-AI
request — used a generic `.invoke()` path that hardcoded the literal abstract Pydantic `BaseModel` class as
its structured-output schema, which Pydantic explicitly forbids instantiating. The underlying DeepSeek
provider is also hard-wired to JSON-only responses, so a bare free-text `.invoke()` could never have worked
here regardless.

**Fix**: Added a real `ScopeCheckResult` schema (`app/schemas.py`) and routed the scope guard through
`invoke_structured()`, matching every other LLM call in the codebase. Updated
`tests/test_copilot_scope.py` to mock `get_provider`/`invoke_structured` instead of the removed
`get_llm`/`.invoke` path. Verified manually (pytest isn't installed in this dev environment).

**Open thread**: a later report of "Edit with AI isn't working properly" turned out to be paired with a PDF
rendering traceback (§3.3) from a *separate* download/preview action, not the Edit-with-AI suggestion flow
itself (`/refine-section/stream` has no PDF rendering in it). Awaiting clarification on whether the
Edit-with-AI button itself still fails independently of the PDF issue.

---

## 5. Security & Active Sessions Page Completely Non-Functional

**Symptom**: Empty "Active Devices & Sessions" list; "Delete Account" button did nothing. No error shown.

**Root cause**: `SecurityPage.jsx` referenced an undefined `apiUrl` variable in every fetch call — never
imported — causing a silent `ReferenceError` swallowed by `try/catch` on every request.

**Fix**: Imported and used the shared `getApiUrl()` helper (`config/apiConfig.js`) already used by every
other page. Verified via `esbuild` compile.

---

## 6. Database Connection Pool Exhaustion

**Symptom**: Recurring `psycopg2.pool.PoolError: connection pool exhausted` under concurrent load.

**Root cause**: FastAPI's per-request dependency caching means every `Depends(get_db_connection)` in a
request resolves to the *same* connection, held for the connection's dependency lifetime — effectively the
whole request. Several endpoints combined this with slow synchronous LLM/Playwright work in the same
request, holding a pooled connection idle for seconds (or, for one SSE endpoint, indefinitely) per request.

**Investigation**: An Explore-agent audit surveyed `api/v1/*.py` and `app/routers/api.py`, finding 8
offending endpoints.

**Fixes applied**:
- `POST /refine-section/stream` (`app/routers/api.py`) — the worst offender. Held a connection for an
  *entire unbounded SSE stream* via a `conn` dependency that was silently absorbed into an unused `**kwargs`
  inside `refine_section_stream_generator` and **never actually used**. Removed the dependency entirely —
  zero functional change, pure leak fix.
- `tailor_resume` (`api/v1/tailoring.py`), `api_compare` (`app/routers/api.py`), `parse_existing_resume` and
  `get_active_resume` (`api/v1/resume.py`) — wrapped previously-unwrapped blocking LLM calls in
  `run_in_threadpool` (these were also freezing the *entire event loop*, not just holding a connection —
  arguably a worse bug than the pool exhaustion itself).
- `api_cover_letter` (`app/routers/api.py`) — fully fixed using a new `_db_context()` helper
  (`contextmanager(get_db_connection)`) so the connection is held only around the usage-check/consume
  writes, not the LLM call in between. This pattern is documented in
  [BACKEND.md](BACKEND.md) §3.3 for reuse elsewhere.

**Still open** (connection held across slow work, needs a service-layer refactor, not a mechanical patch —
[KNOWN_ISSUES.md](KNOWN_ISSUES.md) ISSUE-005, [TODOS.md](TODOS.md) P0):
- `tailor_resume` / `api_compare` — event-loop-blocking half fixed, connection-lifetime half is not.
- `download_pdf` (`api/v1/tailoring.py`) — connection held through Playwright render + the new
  `_PDF_RENDER_LOCK` queue wait.
- `build_selected_resume_intelligence` / `confirm_selected_resume_intelligence` (`api/v1/resume.py`).
- `api_generate_cover_letter_draft` (`app/routers/api.py`).

**Also fixed in passing**: `BACKEND.md` documented the pool as `minconn=10`; the actual code
(`core/database.py`) uses `minconn=2` — corrected doc drift.

---

## 7. JD Extraction Failing Outright on a Single Playwright Timeout

**Symptom**: `playwright._impl._errors.TimeoutError: Page.goto: Timeout 30000ms exceeded` on slow-loading
job portals (e.g. `amazon.jobs`) failed the entire extraction with zero retry.

**Root cause**: `route_after_evidence()` (`services/job_extraction/graph.py`) only retried the browser fetch
when it had been deliberately *skipped* in favor of extension evidence that turned out insufficient
(`browser_attempts == 0`). An actual `BROWSER_FAILED` exception (timeout, launch error) set `state.error`
and routed straight to `final_response` on the very first attempt, never spending the
`max_browser_attempts = 2` retry budget the state schema already allocates.

**Fix**: `route_after_evidence()` now also retries when `error.code == "BROWSER_FAILED"` and attempts
remain. `browser_agent` (`services/job_extraction/agents.py`) additionally escalates the navigation timeout
on retry (30s → 45s, capped at 60s), since a page that missed the base window is more likely to succeed with
a longer one than an identical retry.

---

## 8. Extension Session Handling — Three Compounding Bugs

This was the deepest investigation of the session, spanning three separate but related defects, all in the
custom self-issued-JWT auth stack (see [AUTH_OAUTH.md](AUTH_OAUTH.md) §4 for the full mechanism writeup).

### 8.1 `setUser(null)` silently deletes cached storage, not just React state
`setUser()` (`context/AppContext.jsx`) is a wrapper, not a plain state setter — calling it with `null`
actively deletes the `user` record from both `localStorage` and `chrome.storage.local`. The background
`/auth/session` verification (`checkSession()`) previously called `setUser(null)` whenever it couldn't get a
*definitive* response (timeout, network blip, slow/cold-starting Render backend) — not only on a confirmed
`401`. Once wiped, every subsequently opened tab failed the "instant unblock" check (which requires **both**
a stored token and a stored user) and depended entirely on a fresh live verification succeeding fast enough.

**Fix**: the inconclusive-result branch no longer calls `setUser(null)`/`setSession(null)` — only a
confirmed invalid/expired token (after an attempted refresh) clears the session now.

### 8.2 Verification retry budget too short for a cold backend
The `/auth/session` check had only ~11s of retry budget (2 attempts × 5s + a short pause) — too short for a
cold-starting Render instance. **Fix**: widened to 3 attempts × 8s with backoff (~27s total).

### 8.3 Token refresh itself had zero retry
`refreshAccessToken()` (`services/authSession.js`) — the call `checkSession()`'s confirmed-401 branch
depends on before actually logging out — made exactly one unbounded attempt. A single transient failure on
*this specific call* was indistinguishable from a genuinely invalid refresh token. **Fix**: retries transient
failures (network error, timeout, 5xx) up to 3 times with backoff and an 8s per-attempt timeout, giving up
immediately only on a definitive `401`/`403` (retrying a truly-rejected token can't help).

**Net effect**: new tabs opened via the extension's "Resume"/"Cover Letter" buttons (which open the
extension's own bundled page, same-origin, so `localStorage` is already visible — no cross-context handoff
needed) no longer get bounced to the sign-in/Extension Setup screen due to a merely slow backend response.
A real, confirmed-invalid session still (correctly) logs out.

**Still open**: one report of a "Configure Tailoring" page falling back to Extension Setup even after all
three fixes above were live — traced as far as confirming the profile data shown during "Restoring
Session..." is genuinely cached (not hardcoded, not a bug) and that an accompanying `/api/compare` 401 was a
real JWT expiry (`jwt.ExpiredSignatureError`, `JWT_EXPIRE_MINUTES=30` default) — but whether the
now-hardened refresh-and-retry silently recovered from it or not is unconfirmed without a browser
console/network capture at the exact moment.

---

## 9. Documentation Updated This Session

| File | What changed |
| :--- | :--- |
| [CHANGELOG.md](CHANGELOG.md) | New versions 3.7.0 → 3.7.3, one per fix batch above |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | ISSUE-005 (DB pool exhaustion, partial), ISSUE-006 (502/OOM, unconfirmed), ISSUE-007 (session wipe, resolved), ISSUE-008 (JD extraction timeout, resolved), ISSUE-009 (PDF port mismatch, code-side resolved / env action required) |
| [TODOS.md](TODOS.md) | P0 item for the remaining DB-connection-lifetime refactor; items to verify Render's Build Command and fix the `FRONTEND_URL` env var |
| [BACKEND.md](BACKEND.md) | Corrected `minconn` doc drift (10 → 2); documented the `_db_context()` short-lived-connection pattern (§3.3); documented the startup self-heal, `_PDF_RENDER_LOCK`, and `$PORT`-tracking fix (§5.2) |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Documented Render's native build command vs. the Dockerfile, and why `--with-deps` breaks it |
| [AUTH_OAUTH.md](AUTH_OAUTH.md) | New §4: new-tab session handoff mechanism, `checkSession()`/`refreshAccessToken()` retry behavior, and the `setUser(null)`-deletes-storage gotcha |
| [JD_EXTRACTION_ENGINE_DOCUMENTATION.md](JD_EXTRACTION_ENGINE_DOCUMENTATION.md) | §8.16 updated to note hard browser failures now share the bounded retry budget, plus timeout escalation |

---

## 10. Outstanding Items Requiring Manual Action (Not Code Fixes)

- [ ] Confirm Render's dashboard Build Command actually invokes `backend/render-build.sh` (or an equivalent
      without `--with-deps`) — cannot be verified from the repo alone.
- [ ] Correct the `FRONTEND_URL` environment variable on Render — currently `http://localhost:5173`.
- [ ] If 502s recur, check Render's server-side logs for an explicit OOM/SIGKILL message to confirm or rule
      out ISSUE-006.
- [ ] If the extension-setup redirect recurs after the auth fixes in §8, capture the browser
      console/network output at the exact moment for further diagnosis.
- [ ] Clarify whether "Edit with AI" itself (not the separate PDF download/preview path) still exhibits any
      failure.
