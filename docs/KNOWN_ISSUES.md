# Tailr4U - Known Issues & Bug Tracking Log

This document tracks all currently identified technical issues, edge-case bugs, performance bottlenecks, and active remediation plans for **Tailr4U**.

---

## Active Issues Register

### ISSUE-015: `/billing/verify-session` Grants Paid Plans Without Verifying Payment
- **Date Discovered**: 2026-08-04
- **Date Fixed**: 2026-08-04
- **Severity**: Critical (billing/security)
- **Component**: `backend/app/billing/routers/billing.py` (`create_checkout`, `verify_checkout_session`, `stripe_webhook`, `razorpay_webhook`), `backend/core/config.py`, `frontend/src/pages/SubscriptionPage.jsx`
- **Description**: `POST /api/v1/billing/verify-session` looked up the requested plan and unconditionally called `sub_svc.activate_subscription(user_id, plan_id, "stripe", f"sub_active_{user_id}")`, then always returned `{"status": "success"}` — there was no check against Stripe/Razorpay for whether a payment (or even a checkout session) actually existed or succeeded. Any authenticated user could obtain any paid plan with zero payment by simply calling this endpoint. Directly observed live: a user whose Razorpay checkout fell back to the no-real-payment mock path still saw a "Payment completed successfully!" banner.
- **Related, separate bug found in the same file**: `stripe_webhook`'s handler for `checkout.session.completed`, and `razorpay_webhook`'s handler for `subscription.charged`, both hardcoded `plan_id = "pro"` — the genuinely signature-verified activation paths still activated the wrong plan for anyone who didn't buy exactly Pro.
- **Current Status**: **Fixed.**
  - `/verify-session` is now read-only — it reports the user's current subscription state (`sub_svc.get_user_subscription`) and never calls `activate_subscription`.
  - `activate_subscription` is now only ever called from the signature-verified `/webhook/stripe` and `/webhook/razorpay` handlers, plus one narrow, explicit opt-in for local testing: `create_checkout` may activate a mock checkout server-side, but only when `ALLOW_MOCK_BILLING_ACTIVATION=true` is set (default `false`, not derived from `APP_ENV` since its live deployed value couldn't be safely assumed from this environment — see `core/config.py`). This is never reachable in production unless someone deliberately sets that flag there.
  - Both webhook handlers now read the real purchased `plan_id` from data the checkout-creation code already attaches (`stripe_provider.py`'s Checkout Session `metadata.plan_id`, `razorpay_provider.py`'s subscription `notes.plan_id`) instead of hardcoding `"pro"`.
  - `SubscriptionPage.jsx`'s `handleVerifyAndActivate` now only flips the payment-status modal to `'success'` when the response actually shows the target plan is active, and no longer shows an unconditional "Payment completed successfully!" banner for the mock-fallback path — the existing 2-second poll / 120-second timeout-to-`'unknown'` mechanism now honestly reflects whether a real payment ever landed.
  - Verified against the live database (read/write, rolled back afterward) that the read-only `/verify-session` query shape and the webhook `plan_id` extraction both work correctly with real data.

---

### ISSUE-014: Three Incompatible Cover Letter Generation Paths
- **Date Discovered**: 2026-08-04
- **Severity**: Medium
- **Component**: `frontend/src/context/AppContext.jsx` (`handleGenerateFirstCoverLetterDraft`, `handleDraftCoverLetterFromContext`, `handleGenerateCoverLetter`), `backend/app/routers/api.py` (legacy `/api/cover-letter` vs. Phase-3 `/api/cover-letter/context` → `/strategy` → `/generate`)
- **Description**: Three separate frontend functions can produce a "generated cover letter," each backed by a different backend endpoint returning a different response shape (`{cover_letter}` vs `{content}`), and only one of the three (`handleGenerateFirstCoverLetterDraft`) actually persists the result to `applications.cover_letter_snapshot`. The rendering-side symptom (empty preview body) was fixed in [CHANGELOG.md](CHANGELOG.md) 3.9.0 by making every renderer check all known field names, but the underlying duplication remains.
- **Also found**: `handleGenerateCoverLetter` (`AppContext.jsx` ~line 3624-3820) has an unconditional `return contextResult;` partway through, making a trailing block that PUTs `cover_letter_version`/timeline updates to the application permanently unreachable dead code. Not fixed this pass — deferred pending a fuller trace of which UI entry points call which of the three functions, to avoid an under-verified change to a large, heavily-branched context function.
- **Current Status**: Open. Rendering-side symptom mitigated; root duplication not resolved. **Re-confirmed 2026-08-07** via the full AI-governance audit ([AI_GOVERNANCE.md](AI_GOVERNANCE.md)): both `generate_cover_letter()` (`app/ai_service.py:481`) and `generate_cover_letter_draft()` (`services/cover_letter/generation.py:88`) are still live, independent LLM call sites. When `COVER_LETTER_GENERATE` migrates to the AI governance gateway (a single task type, one policy), the duplication will need to be resolved as part of that migration — the gateway can't meaningfully enforce one policy over two genuinely different implementations.
- **Assigned Fix**: Consolidate cover letter generation onto a single backend endpoint and response shape (the Phase-3 `GeneratedCoverLetter.content` shape is the more complete one — includes `word_count`, `selected_evidence`, `used_keywords`), with one frontend function that both generates and persists. Remove or wire up the dead code in `handleGenerateCoverLetter`.

---

### ISSUE-013: Resume Photo Has No Server-Side Persistence
- **Date Discovered**: 2026-08-04
- **Severity**: Medium
- **Component**: `components/Resume/TailorRender.tsx` (`ProfilePhotoCropModal` `onApply`), backend (no matching endpoint)
- **Description**: After fixing "Add Photo" doing nothing (dangling references to deleted handler functions, see [CHANGELOG.md](CHANGELOG.md) 3.8.2), the crop-and-apply flow itself works, but the cropped image is only ever held as a base64 data URL in local React state (`personal_info.photo_url`) — there is no backend photo-upload endpoint at all (confirmed: no "photo" references anywhere in `backend/api/v1/*.py` or `backend/services/storage/*.py`).
- **Current Status**: Open. The photo will render correctly for the remainder of the session but will not survive a page reload or reopening the resume later.
- **Assigned Fix**: Add a resume/profile photo upload endpoint (persist to Supabase Storage similar to `original-resumes`/`generated-resumes` buckets) and have the crop modal's `onApply` upload the cropped image and store the returned URL instead of a raw data URL.

---

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

### ISSUE-005: DB Connection Held Across Slow AI/Playwright Work (Pool Exhaustion) — REOPENED, PARTIALLY RE-FIXED
- **Date Discovered**: 2026-08-03
- **Date Closed**: 2026-08-04
- **Date Reopened**: 2026-08-07 (user reported recurring pool issues; full re-audit found the original sweep never covered several areas)
- **Severity**: High (Resolved)
- **Component**: `core/database.py` (`ThreadedConnectionPool`), several routers in `api/v1/` and `app/routers/api.py`, `services/resume/tailoring_service.py`, `services/workflow/checkpoints.py`
- **Description**: Recurring `psycopg2.pool.PoolError: connection pool exhausted`, surfaced concretely via Sentry on `POST /api/v1/reminders/` — a trivial, fast DB read with no LLM/Playwright work of its own — timing out on connection *checkout* because other endpoints were holding every available connection for seconds at a time during unrelated slow work. FastAPI's per-request dependency caching means every `Depends(get_db_connection)` in a request resolves to the same single pooled connection, held for as long as that dependency lives — which is the whole request if it's injected via `Depends`. Several endpoints inject a DB connection via `Depends` and then also run a slow, synchronous LLM or Playwright call in the same request, holding a pooled connection idle for seconds (or, for SSE streams, indefinitely) per request — starving unrelated, fast endpoints of any available connection at all.
- **Root Cause**: Mixing FastAPI's request-scoped `Depends(get_db_connection)` pattern with slow synchronous work in the same request, compounded by `core/database.py`'s pool `maxconn` being set to `50` while Supabase's own pooler for this project's compute tier only grants **15** real connections total — the app's pool ceiling was never actually reachable, so checkouts were failing against Supabase's own limit before ever hitting psycopg2's.
- **Current Status**: **RESOLVED (2026-08-04)**. All previously-flagged offenders are now fixed:
  - `POST /refine-section/stream` — dead, unused `conn` dependency removed entirely.
  - `POST /cover-letter` and `POST /cover-letter/generate` (`app/routers/api.py`) — refactored to a short-lived `_db_context()` (`contextmanager(get_db_connection)`) held only around the usage-check/consume writes, with the LLM call in between running with no DB connection open.
  - `tailor_resume` (`api/v1/tailoring.py`) — `TailoringService.execute_tailoring_flow` was split into `load_context()` (reads) / `compute_tailored_resume()` (pure AI + merge + preservation computation, touches no repo) / `persist_result()` (writes), each phase using its own short-lived `user_scoped_db_context()` connection via a new `build_tailoring_service()` factory (`api/dependencies.py`), with zero connection held during the LLM call.
  - `api_compare` (`app/routers/api.py`) — restructured into the same read-phase / LLM-call / write-phase shape, each DB phase on its own short-lived connection.
  - `download_pdf` (`api/v1/tailoring.py`) — the DB writes (`AuditRepository.log_download`, `AnalyticsService.emit_event`) only ever ran after the Playwright render; now open a connection only at that point instead of for the whole request (including the `_PDF_RENDER_LOCK` queue wait).
  - `build_selected_resume_intelligence` / `confirm_selected_resume_intelligence` (`api/v1/resume.py`) — `PostgresCheckpointStore` (`services/workflow/checkpoints.py`) now takes a connection **factory** instead of one bound connection; since every checkpoint-store method was already a fully self-contained transaction, each checkpoint write (fired after every step of the multi-step DeepSeek pipeline) now opens and closes its own short-lived connection instead of one connection sitting open for the entire pipeline's duration. `services/workflow/runtime.py` and `api/v1/workflows.py` were updated to match the new constructor signature (those five routes intentionally keep their existing request-scoped connection behavior via a trivial `nullcontext` wrapper — they weren't part of this fix's scope). A separate, unrelated `NameError: name 'api_key' is not defined` bug (100% reproducible crash) was also found and fixed in `build_selected_resume_intelligence` while editing this function.
  - `api_generate_cover_letter_draft` (`app/routers/api.py`) — same `_db_context()`-around-usage-only pattern as `api_cover_letter`.
  - `core/database.py`'s pool `maxconn` reduced from `50` to `12`, matching Supabase's real 15-connection ceiling with a small safety margin (see [CHANGELOG.md](CHANGELOG.md) 3.7.8).
  - **2026-08-05 follow-up**: `POST /resumes/reconcile-local` (`api/v1/resume.py`) was missed in the original sweep and turned out to be the actual live cause of a fresh round of pool-exhaustion errors — it held a connection via `Depends(get_resume_repository)` while doing fully synchronous disk I/O/hashing/parsing with no `await` anywhere, blocking the event loop too. It fires on nearly every `fetchResumesList()` call from the frontend (20+ call sites), so concurrent hits piled up and starved the pool. Fixed the same way as the rest of this list: the scan/hash/parse work now runs via `asyncio.to_thread`, with `user_scoped_db_context` opened only around the brief known-paths read and the final write loop. See [CHANGELOG.md](CHANGELOG.md) 3.15.3.
- **2026-08-07 re-audit (full sweep of every DB-connection-acquisition site in the backend, not just the previously-known offenders)**: the user reported the same pool-exhaustion symptom recurring. A complete re-audit found the original sweep had, in fact, left several real offenders uncovered — some pre-existing and never profiled, one that was "fixed" for the wrong root cause, and the exact "remaining lower-priority item" noted above turned out to be the single largest live offender once actually checked:
  - **`build_selected_resume_intelligence` / `confirm_selected_resume_intelligence` (`api/v1/resume.py`) — FIXED.** The "lower-priority" note above undersold the real exposure: holding a connection has nothing to do with how many *times* it's touched, only how long it stays checked out, and `repo: ResumeRepository = Depends(get_resume_repository)` was held via `Depends()` for the entire multi-LLM-step pipeline (parse_resume + semantic analysis, several seconds to tens of seconds) even though `PostgresCheckpointStore` alongside it had already been correctly converted to a connection factory. Fixed by removing the `Depends()` parameter entirely and adding `_ScopedResumeRepository`, a small proxy over the two methods the pipeline actually calls (`get_selected_snapshot`, `set_source_fingerprint_if_missing`), each opening its own fresh short-lived connection — mirroring the checkpoint store's own factory pattern.
  - **`app/billing/routers/billing.py` — FIXED, never covered by the original sweep at all (not mentioned anywhere in this doc or the CHANGELOG before now).** `create_checkout`, `verify_checkout_session`, `cancel_subscription`, and `razorpay_webhook`'s `payment.failed` branch all bound a connection via `Depends(get_subscription_service)`/`Depends(get_credit_service)`/`Depends(get_db_connection)` (all three resolve to the same cached connection per FastAPI's dependency cache) and held it across real outbound HTTPS calls to Stripe/Razorpay. Restructured each into short-lived phases (DB read → external call with no connection open → DB write), matching the `_db_context()` pattern used elsewhere. `stripe_webhook` and `razorpay_webhook`'s `subscription.charged` branch were left as single-connection-scope (correctly — no external call happens in either, so one connection for the whole branch is fine, not an offender).
  - **`api/v1/auth.py` `google_login` — FIXED.** `verify_google_token` (up to three sequential blocking Google HTTPS calls) was previously called with a `Depends(get_db_connection)`-bound connection already checked out and completely idle for its entire duration — confirmed via grep that the method never touches `self.conn` at all. Fixed by calling it via a temporary `AuthService(None)` instance before any connection is acquired, then opening a real connection only for the DB-dependent work afterward (`sync_oauth_user`, session creation, device-abuse recording, analytics).
  - **`api/v1/auth.py` `register_user` — investigated, deliberately NOT fixed this pass, left open.** CHANGELOG 3.15.4 previously claimed this was fixed by moving `RateLimiterService`/`DeviceAbuseService`'s blocking HTTPS calls (Upstash rate-limit checks, Turnstile verification) into `asyncio.to_thread` — that fix addressed **event-loop blocking**, not the connection pool: `asyncio.to_thread` does not release a `Depends()`-bound connection, and it's still checked out for the full duration of those calls. Unlike `google_login`, this one could **not** get the same quick fix: `RateLimiterService.is_rate_limited` and `DeviceAbuseService.evaluate_signup_attempt` both genuinely use `self.conn` for their own DB-backed logic (rate-limit fallback counters, device-reputation lookups) *interleaved with* the external HTTP calls within the same method, not as a separable before/after phase. Fixing this properly requires restructuring those two services' internal DB-vs-network coupling, not just the route handler — a larger, higher-risk change to abuse-prevention-critical code that wasn't safe to rush through without deeper verification. **Still open.**
  - **Six storage-download/upload endpoints** (`api/v1/resume.py`: `get_resume_file`, `preview_resume_file`, `recover_resume_source_details`; `api/v1/applications.py`: `get_stored_resume_pdf`, `store_resume_pdf`, `get_stored_cover_letter_pdf`, `store_cover_letter_pdf`) hold a repo-bound connection idle during real Supabase Storage network calls. **Not fixed this pass** — real but minor/moderate (storage I/O, not LLM-scale duration); lower priority than the above.
  - **`api/v1/workflows.py`'s generic `/workflows` router** wraps a `Depends()`-bound connection in `nullcontext(...)` as the checkpoint store's "factory," defeating the whole point — currently inert since `workflow_node_registry` is empty and no node runs slow work yet, but a landmine for whenever a node is registered there. **Not fixed this pass** — flagged for whoever wires up the first real node.
  - **Pool sizing**: `maxconn=12` may simply be undersized *relative to this app's own connection-holding convention* even with zero leaks — every `Depends(get_db_connection)`/`Depends(get_*_repository)` route holds a connection for its entire dependency lifetime (the whole request), not just the query duration, and the app runs as a single uvicorn process with no `--workers` flag (confirmed: no `Procfile`/`render.yaml` setting `WEB_CONCURRENCY` found anywhere). A single dashboard page load alone fans out several parallel `Depends()`-based calls; 2-3 users loading pages simultaneously, with zero leaks, can plausibly approach 12 concurrent checkouts on legitimate traffic. Fixing the holding-pattern (checkout only around the actual query) reduces both leak-duration and legitimate concurrent demand together — they're coupled, not separate problems.

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

### ISSUE-009: PDF Generation Failing in Production via Renderer Deployment — RESOLVED
- **Date Discovered**: 2026-08-04
- **Date Closed (code side)**: 2026-08-04
- **Severity**: High
- **Component**: `app/playwright_pdf.py`
- **Description**: Every PDF render (download/preview) failed in production with `RuntimeError: PDF renderer is unavailable ... net::ERR_CONNECTION_REFUSED` against both candidate URLs.
- **Root Cause**: Three independent problems surfaced across deployments:
  1. **(Code bug, fixed)** `PDF_RENDERER_URL`'s default value hardcoded `127.0.0.1:8000` as the self-referential port Playwright navigates to render the backend's own bundled frontend build (`/__pdf_renderer`). `main.py` binds Uvicorn to Render's dynamically-injected `$PORT`, not a fixed 8000 (its own comment already flagged hardcoding 8000 as coincidental). On Render, nothing listens on port 8000, so this candidate always failed.
  2. **(Environment misconfiguration, corrected)** The second failing candidate in the traceback was `http://localhost:5173` — the Vite dev server address. This came from the Render environment's `FRONTEND_URL` variable being set to a local-dev value instead of the actual production frontend origin. `playwright_pdf.py` uses `FRONTEND_URL` only as a last-resort compatibility path.
  3. **(Build artifact bug, fixed)** The Render build installed Python and Chromium but never built the React print renderer. Because no renderer `index.html` existed, `main.py` skipped mounting `/__pdf_renderer` and export produced `GET /__pdf_renderer/index.html 404`.
- **Current Status**: Resolved. The renderer URL follows Render's `$PORT`; `backend/render-build.sh` builds and verifies `backend/pdf_renderer_dist/index.html`; and `main.py` mounts that backend-contained artifact with explicit startup logging. Render must use the repository root (blank Root Directory) and `FRONTEND_URL=https://tailr4u.com`.
- **Assigned Fix**: None. Keep the documented Render build/root settings intact.

---

### ISSUE-010: PDF Render Validation Failing for All Sections on Photo-Enabled Templates — RESOLVED
- **Date Discovered**: 2026-08-04
- **Date Closed**: 2026-08-04
- **Severity**: High (Resolved)
- **Component**: `frontend/src/services/profilePolicy.js`, `frontend/src/components/Resume/TailorRender.tsx`
- **Description**: `ValueError: Rendering Validation Failed: Missing sections in rendered HTML DOM: summary, experience, projects, education, skills, achievements` — every section reported missing, but only for the `PortfolioPro` and `PremiumExecutive` templates.
- **Root Cause**: The Playwright print route loads the app in a fresh, unauthenticated browser context (data is injected via `window.__INJECTED_RESUME_DATA__`, no login/session), so `AppContext`'s `user` state is genuinely `null` there. `renderProfilePhoto()` in `TailorRender.tsx` — only called for templates with `profilePhoto: true`, i.e. exactly these two — calls `selectProfileImage(profile, user)`, whose default parameters (`user = {}`) only apply to `undefined`, not an explicit `null`. `null.user_metadata` threw during render, crashing the entire template component tree before any section mounted, which is why validation reported *every* section missing rather than just the photo. Templates with `profilePhoto: false` never call this function, so they were unaffected.
- **Current Status**: **RESOLVED**. `selectProfileImage` now coerces `profile`/`user` to `{}` internally whenever either is falsy, covering `null` as well as `undefined`. See [CHANGELOG.md](CHANGELOG.md) 3.7.5.

---

### ISSUE-011: Concurrent Refresh Race Between Two Tabs of the Same Session — RESOLVED
- **Date Discovered**: 2026-08-04
- **Date Closed**: 2026-08-04
- **Severity**: High (Resolved)
- **Component**: `backend/api/v1/auth.py` (`POST /auth/refresh`), `backend/app/services/session_service.py`
- **Description**: With the extension's side panel and a separately opened tab both open at once (sharing the same session via `localStorage`), one would get logged out while the other stayed signed in — `POST /api/v1/auth/refresh` returned a genuine `401 Unauthorized`.
- **Root Cause**: `SessionService.rotate_refresh_token` stores a single `refresh_token_hash` per session, atomically replaced on each rotation. Both contexts share one access/refresh token pair and independently detect the same expiring access token around the same time, so both can call `/auth/refresh` concurrently. The DB processes one first (winner); the other's refresh token is now stale by definition (a timing race, not an invalid session). The endpoint's fallback for this case re-verified the *old access token* via the strict `verify_supabase_jwt()`, which enforces `exp` — but that token had, by definition, already expired (that's why refresh was triggered), so the fallback almost always failed too, producing a real logout for the losing tab.
- **Current Status**: **RESOLVED**. The fallback now verifies only the old access token's signature (`verify_exp: False`) and independently confirms the session is still live via a new `SessionService.is_session_refreshable()` check (not revoked, refresh window not expired) before issuing a fresh token pair to the losing request. See [CHANGELOG.md](CHANGELOG.md) 3.7.6.

---

### ISSUE-012: Incomplete Logout Leaked Previous Account's Cached Data to the Next Login — RESOLVED
- **Date Discovered**: 2026-08-04
- **Date Closed**: 2026-08-04
- **Severity**: High (Resolved) — data-isolation concern on a shared browser/extension profile, not a security/RLS bypass (all live API calls are still correctly scoped server-side by JWT `sub`).
- **Component**: `frontend/src/context/AppContext.jsx` (`logout()`)
- **Description**: A brand-new user who had uploaded no resume and taken no action saw a populated dashboard ATS score and radar/spider chart.
- **Root Cause**: `logout()` only ever cleared auth tokens (`access_token`, `refresh_token`, `user`). Numerous other per-account caches were left in `localStorage` (`parsed_resume`, `resumes_list`, `tailored_resume`, `selected_template`, `tailr4u_user_profile`) and `sessionStorage` (`tf_perf_signature` and several tailoring-workflow keys). On a shared browser/extension profile, the next logged-in account's "instant unblock" optimistic hydration read these still-present keys and displayed the *previous* account's cached data until a live fetch happened to overwrite it — for a fresh account, the dashboard's live fetch would eventually correct itself, but the flash of stale data (or worse, a stale `parsed_resume`) was visible in the meantime.
- **Current Status**: **RESOLVED**. `logout()` now clears the full list of account-scoped `localStorage`/`sessionStorage`/`chrome.storage.local` keys. UI-only preferences (`theme`, job tracker view mode, print zoom mode) are intentionally left alone, as they aren't account data. See [CHANGELOG.md](CHANGELOG.md) 3.7.9.

---

### ISSUE-006: OOM-Driven Instance Crash During PDF Rendering — CONFIRMED, MITIGATION HISTORY MIXED
- **Date Discovered**: 2026-08-03
- **Date Confirmed**: 2026-08-06
- **Severity**: High (was Medium/unconfirmed; upgraded once actually confirmed)
- **Component**: `app/playwright_pdf.py`
- **Description**: Originally an unconfirmed hypothesis from browser-console-only evidence (a 502 on a PDF-render request coinciding with a 502 on an unrelated endpoint). **Now confirmed directly against Render's own dashboard**: `Instance failed: Ran out of memory (used over 512MB)`, timestamped to coincide almost exactly with a `POST /api/render-unified-pdf` call (duration ~101s) followed by the crash message ~58s after the render started.
- **Root Cause (now well-supported, still not exhaustively proven)**: The persistent Chromium browser instance (`_get_context()`, kept alive for the whole process lifetime as a deliberate cold-start optimization) likely accumulates memory over many renders on a long-lived instance with no bound — internal caches, per-page allocations, heap fragmentation — until a render's peak usage tips an already-elevated baseline (FastAPI + DB pool + OTEL + Sentry + Redis + a warm Chromium instance, all coexisting in one 512MB container) over the ceiling. Not proven with a memory-over-time graph; inferred from the timing correlation and general knowledge of long-lived headless-browser processes.
- **Current Status**: **Mixed history, current state unverified.** A browser-recycling mitigation (close+relaunch Chromium every 25 renders, plus trimmed unused Chromium subsystems) was implemented 2026-08-06 (see [CHANGELOG.md](CHANGELOG.md) 3.15.19) but was subsequently overwritten by further, independent work in the same file from a different session — `_get_context()` as it currently stands does not contain that recycling logic. The user later confirmed (2026-08-06, without specifics on what fixed it) that "the last commit is working great in all aspects" regarding this file, which may mean the OOM is resolved via a different mechanism, may mean it simply hasn't recurred yet, or may mean the underlying 512MB ceiling is genuinely tight for this workload regardless of code-level mitigation. **Re-verify against the live `_get_context()` implementation and Render's memory graph before assuming this is closed.**
- **Assigned Fix**: If this recurs, check whether the current `_get_context()` has any memory-bounding mechanism at all; if not, browser recycling (see 3.15.19's diff for the exact mitigation, reapply if appropriate) is the fastest re-fix. If it recurs even with recycling in place, the real fix is likely a larger Render instance plan, not another code change — headless Chromium alone commonly wants 150-300MB, which may just not fit alongside this app's other baseline memory needs in 512MB.
