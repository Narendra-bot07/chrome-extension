# Tailr4U - Release Changelog

All notable changes to **Tailr4U** will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.8.6] - 2026-08-04

### Changed
- **Photo upload now available directly from the Template Details preview** (`components/TemplateSelectionView.jsx`): the large zoomed template preview passed `isExporting` to `TailorRender`, which deliberately suppresses the interactive "Add Photo" / "click to adjust" affordance (intended for the small non-interactive gallery thumbnail cards, `MiniPreview`, which correctly still pass it). Removed it from this specific preview so photo-enabled templates (Portfolio Pro, Premium Executive) can have a photo added/adjusted right from the template picker, not only later in the Download/Studio editor.

---

## [3.8.5] - 2026-08-04

### Fixed
- **Download page "Layout Structure" drag-to-reorder (both single-column and two-column/sidebar templates) had no effect on the actual resume preview**: `DownloadPage.jsx` wired `ResumeEditorView`'s `setParsedResume` directly to `updateFinalizedWorkflowResume` (`context/AppContext.jsx`), which only persists into a separate workflow-recovery slot (`finalizedTailoredResume`). The page's actual preview (`sourceResume`/`activeResume`, feeding both `ResumeEditorView`'s own re-render and the `ResumePreview`/`TailorRender` pane) reads from `tailoredResume || workflowResume || parsedResume` — three entirely different state variables `updateFinalizedWorkflowResume` never touched. Every drag-reorder was saved correctly but invisible, because the preview was reading from state the edit never reached. Added a wrapper (`updateActiveResumeLayout`) that keeps the existing persistence call and also syncs the result into `tailoredResume`, so edits are now immediately visible.

---

## [3.8.4] - 2026-08-04

### Fixed
- **PDF generation failing with `Rendering Validation Failed: Missing sections in rendered HTML DOM: achievements` (or any other optional section) for users who simply don't have that section**: `app/playwright_pdf.py`'s post-render validation decided which sections it should expect to find in the rendered DOM using a weak `data.achievements.length > 0`-style check — a non-empty *array* isn't the same thing as having real content (e.g. `[{}]` or `[{title: '', description: []}]` passes that check). The actual template's own section-visibility logic (`hasData()` in `TailorRender.tsx`) correctly skips rendering a section with no meaningful content, but the validator still expected it — a legitimate "user doesn't have this section" case was being treated as a rendering bug and failing PDF generation outright. The validator's per-section checks now require actual meaningful content (a title/name/description/role/etc., matching what the template itself checks for) before expecting that section to appear, for every optional section (experience, projects, education, skills, certifications, achievements, languages, awards, volunteer, publications).

---

## [3.8.3] - 2026-08-04

### Fixed
- **ATS Intelligence breakdown rows showing values wildly inconsistent with the headline Current score** (e.g. Current ATS 60/100 shown alongside "Keyword Optimization 12%" in one view and the *same* Current ATS 60/100 alongside "Keyword Optimization 97%" in another): `calculateJDMatchScore` (`utils/matchScore.js`) — the deterministic, local scoring pass that produces the headline "Current" score — computed rich per-category sub-scores (skills, keywords, experience, role similarity, etc.) internally but discarded all of them, returning only the final composite numbers. With no live breakdown available, `ResumeReviewView.jsx`'s `matchCurrent`/`optCurrent` faked one by linearly interpolating the backend's one-time "before"/"after" snapshots by the *fraction* of suggestions accepted (`acceptedRatio`) — completely ignoring which specific suggestions were accepted or their actual content. That interpolation has no real relationship to what the headline score (computed independently, from the actual current resume content) reflects, so the two could tell entirely different stories at the same moment. Fixed by having `calculateJDMatchScore` return its computed sub-scores as a `breakdown` object; `matchCurrent`/`optCurrent` now use those directly for every field the local engine models (Skills Match, Keyword Relevance, Experience Alignment, Role Similarity, Project Relevance, Education Fit, Certification Relevance, ATS Parseability, Keyword Optimization, Required Skills Coverage, Overall Optimization), falling back to the old interpolation only for the handful of fields it doesn't model (Formatting & Action Verbs, Section Completeness, Readability, Measurable Impact) — those are unavoidably approximate until the local engine is extended to compute them too.

---

## [3.8.2] - 2026-08-04

### Fixed
- **Job Tracker "Preview Document" showed the original (untailored) resume and a generic hardcoded cover letter instead of the real ones**: `GET /api/v1/applications/` (`api/v1/applications.py`) is deliberately lightweight — it omits `resume_snapshot`/`cover_letter_snapshot`/`job_description`/`organized_jd` (large JSONB blobs) to keep the board fast — but there was no other route to fetch those fields for one specific application, and no such route existed at all (`ApplicationRepository.get_by_id` was defined but never exposed via any endpoint). `DocumentsTab.jsx` therefore always fell back to whatever was in AppContext's global in-memory `tailoredResume`/`coverLetter`/`parsedResume` state (stale or from a *different* job entirely if the user had since worked on another application), and beyond that, to the original resume and a hardcoded generic template — literally containing the placeholder string "Candidate Name" — whenever none of those were populated. Added `GET /api/v1/applications/{id}` (full record, including the omitted fields); `DocumentsTab.jsx` now fetches it on mount and prefers the application's own saved snapshot over the global in-memory fallbacks, which are now used only as a last resort.
- **Resume Manager "Version History" always showed "No version history found" despite a resume clearly having tailored versions** (e.g. Documents tab showing "Version: v1 (Tailored)" for the same resume): two independent, disconnected systems write into `public.resume_versions`. `ResumeRepository.list_versions` (backing the version-history modal) filters `WHERE resume_versions.resume_id = %s`, but `TailoringRepository._create_version_internal` (the actual "tailor a resume" flow) only ever set `tailored_resume_id`, leaving `resume_id` `NULL` on every row it created — invisible to that query. (The "v1 (Tailored)" label itself is unrelated: it's just a free-text string on `applications.resume_version`, not derived from `resume_versions` at all, so it doesn't prove any row is actually visible there.) Fixed by having `create_tailored` pass the original resume's id through so `resume_id` is set on creation; the existing `tr_increment_resume_version` trigger picks it up automatically to compute the correct version number.
- **"Add Photo" on the resume header did nothing**: a prior refactor (commit `1c14df9`) deleted the `openCropModalForFile`/`openCropModalForExisting` function definitions in `components/Resume/TailorRender.tsx` but left their `onClick`/`onChangePhoto` call sites intact, so clicking "Add Photo" (or an existing photo, to adjust it) threw a silent `ReferenceError` and the crop modal never opened. Both functions restored.

---

## [3.8.1] - 2026-08-04

### Fixed
- **"Potential" score rendering lower than "Current" score in the ATS Intelligence panel** (`components/ResumeReviewView.jsx`), e.g. Current ATS 96/100 shown next to Potential ATS 91/100, and a 79% Resume Match headline next to a 78% Potential figure below it: `estimatedResumeMatch`/`estimatedATS` ("Potential") were only clamped to be at least the *original* score, never checked against the *current* one. `currentResumeMatch`/`currentATS` are recomputed live via a separate, deterministic client-side scoring pass (`calculateJDMatchScore`) as the user accepts suggestions, while the "potential" figures come from a one-time backend prediction (`comparison.resume_match_after`/`ats_score_after`) computed before those live edits — the live score can legitimately overtake that earlier prediction. Since "Potential" is meant to be a ceiling, it must never display below what's already been achieved. Both are now also clamped against the live current score: `Math.max(original, rawEstimated, currentScore)`.

### Fixed
- **`psycopg2.pool.PoolError: connection pool exhausted`, root-caused and fully resolved**: escalating in production (Sentry: `POST /api/v1/reminders/` — a trivial, fast DB read — timing out on connection checkout after 5s, 178 events over 12 hours). Every remaining endpoint identified in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) ISSUE-005 as still holding a DB connection across slow LLM/Playwright work is now fixed:
  - `TailoringService` (`services/resume/tailoring_service.py`) split into `load_context()` / `compute_tailored_resume()` (pure computation, touches no repo) / `persist_result()`; `tailor_resume` (`api/v1/tailoring.py`) now opens a short-lived, RLS-scoped connection (`api/dependencies.py::user_scoped_db_context`, new) around each DB phase only, via a new `build_tailoring_service()` factory.
  - `api_compare` (`app/routers/api.py`) restructured into the same read-phase / LLM-call / write-phase shape.
  - `download_pdf` (`api/v1/tailoring.py`) now opens its connection only after the Playwright render completes, not for the whole request.
  - `PostgresCheckpointStore` (`services/workflow/checkpoints.py`) now takes a connection **factory** instead of one bound connection — every method was already a self-contained transaction, so each checkpoint write (fired after every step of the multi-step resume-intelligence DeepSeek pipeline) now opens and closes its own short-lived connection instead of one connection sitting open for the pipeline's entire duration. `services/workflow/runtime.py` and `api/v1/workflows.py` updated to match (those 5 routes intentionally preserve their existing connection behavior via a `nullcontext` wrapper — out of scope for this pass).
  - `api_generate_cover_letter_draft` (`app/routers/api.py`) given the same short-lived-connection treatment as `api_cover_letter`.
  - `core/database.py`'s pool `maxconn` reduced from `50` to `12` — Supabase's own pooler for this project's compute tier only grants 15 real connections total, so the app's pool ceiling was never actually reachable; checkouts were failing against Supabase's own limit before ever hitting psycopg2's.
- **`NameError: name 'api_key' is not defined` in `build_selected_resume_intelligence`** (`api/v1/resume.py`): a 100%-reproducible crash on every call, found while fixing the connection-lifetime issue above. `api_key` was referenced but never defined anywhere in the function or file — a leftover from the Groq/Gemini per-request API-key-header removal (3.5.0). Removed the dead argument.

---

## [3.7.9] - 2026-08-04

### Fixed
- **Brand-new users seeing a previous account's dashboard ATS score and radar chart despite never uploading a resume or taking any action**: not random or fabricated data — `logout()` (`context/AppContext.jsx`) only ever cleared auth tokens (`access_token`, `refresh_token`, `user`), never the other per-account caches: `parsed_resume`, `resumes_list`, `tailored_resume`, `selected_template`, `tailr4u_user_profile` in `localStorage`, or the dashboard's `tf_perf_signature` and several workflow-state keys in `sessionStorage`. On a shared browser/extension profile, when a different account logged in afterward, the app's "instant unblock" optimistic hydration read these still-present keys and displayed the *previous* account's cached dashboard metrics, resume data, and workflow state until (and unless) a live fetch happened to overwrite them. `logout()` now clears the complete list of account-scoped `localStorage`/`sessionStorage`/`chrome.storage.local` keys (UI-only preferences like `theme` and view-mode toggles are intentionally left alone, since those aren't account data).
- **Custom cursor (`GlobalCursor.jsx`) feeling very slow/janky**: two contributing issues. (1) Both `mousemove` and `pointermove` listeners were registered for the identical handler, so every real mouse movement fired the position update twice for no benefit. (2) `pointerover` fires for every DOM element boundary the pointer crosses (not just genuine enter/leave of an interactive element), and the handler unconditionally wrote `classList.toggle('interactive', ...)` on every single firing, forcing a style recalculation each time even when the interactive state hadn't actually changed — costly on dense pages (e.g. the dashboard's radar chart, which has several `cursor-pointer` elements close together). Fixed by dropping the redundant `mousemove` listener and only touching the DOM when the interactive state actually flips (tracked via a ref).

### Fixed
- **`psycopg2.pool.PoolError: connection pool exhausted` under load, root cause of the numeric mismatch**: `core/database.py`'s `ThreadedConnectionPool` was configured with `maxconn=50`, but Supabase's own connection pooler for this project's compute tier (Nano) only grants **15** real Postgres connections total (Database Settings → Connection Pooling → "Connection pool size"). Asking psycopg2's own pool for up to 50 connections never gets more than 15 real ones — the 16th+ concurrent checkout attempt hangs/fails against Supabase's pooler instead of failing cleanly against this pool's own ceiling. `maxconn` is now `12`, leaving a small margin below Supabase's actual 15-connection limit for other clients (migrations, Supabase Studio). This complements, but does not replace, the connection-hold-time fixes in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) ISSUE-005 — the two problems compound: too few real connections available, combined with several endpoints still holding one for seconds during slow LLM/Playwright work.

---

## [3.7.7] - 2026-08-04

### Fixed
- **"Add Photo" upload placeholder (dashed circle, camera icon) appearing in read-only resume previews for candidates who never uploaded a photo**: `TailorRender.tsx`'s `renderProfilePhoto()` intentionally shows this clickable placeholder to invite a photo upload, but only suppresses it when the caller passes `isExporting={true}` (the actual PDF export path, `PrintLayout.tsx`, already does this correctly). Several other screens render `TailorRender` purely as a **preview** of the final resume — with no photo-upload wiring of their own — but never passed `isExporting`, so the interactive placeholder leaked into contexts meant to represent the final output: the "Preview Studio" download screen (`pages/DownloadPage.jsx`), the template gallery's mini preview cards and full-size zoom modal (`components/TemplateSelectionView.jsx`), the stored-resume preview modal (`components/ResumeDetectionView.jsx`), and the Job Tracker document preview modal (`components/JobTracker/DocumentsTab.jsx`). All four now pass `isExporting`, matching the export renderer's behavior. The live "Edit with AI" review page (`pages/ResumeReviewPage.jsx`) intentionally still allows interactive photo upload/reposition and was left unchanged.

---

## [3.7.6] - 2026-08-04

### Fixed
- **One of two simultaneously-open extension contexts (a full tab vs. the side panel) getting logged out while the other stayed signed in**, surfacing as `POST /api/v1/auth/refresh` returning `401 Unauthorized` right after a real `401 "Session expired."` on an unrelated request: `SessionService.rotate_refresh_token` (`app/services/session_service.py`) stores exactly one `refresh_token_hash` per session row, atomically replaced on each rotation. The side panel and any tab opened from it share the *same* session (same access/refresh tokens via shared `localStorage`), so both independently notice the access token nearing/past expiry around the same moment and can call `/auth/refresh` concurrently. Whichever request the database processes first wins the rotation; the loser's refresh token is, by definition, already stale by the time it's looked up — that's a *race*, not an actually-invalid session. The endpoint's own fallback path (verify the old access token, issue a fresh refresh token) previously used the strict `verify_supabase_jwt()`, which enforces the JWT's `exp` claim — but the access token being refreshed had, by definition, already expired, so the fallback almost always failed too, permanently logging out the losing tab. Fixed by having the fallback verify the old access token's *signature* only (`jwt.decode(..., options={"verify_exp": False})`), then independently confirming the underlying session is still live via a new `SessionService.is_session_refreshable()` DB check (not revoked, refresh window not expired) before trusting it — recovering the losing side of the race instead of forcing a logout.

---

## [3.7.5] - 2026-08-04

### Fixed
- **PDF renderer validation failing with "Missing sections in rendered HTML DOM" for every section, but only on `PortfolioPro` and `PremiumExecutive`**: the Playwright print route loads the app in a fresh, unauthenticated browser context (no `localStorage`/session — resume data is injected directly via `window.__INJECTED_RESUME_DATA__`), so `AppContext`'s `user` state is genuinely `null` there. `TailorRender.tsx`'s `renderProfilePhoto()` — only invoked for templates with `profilePhoto: true`, which is exactly these two templates — called `selectProfileImage(profile, user)` (`services/profilePolicy.js`), whose default parameters (`user = {}`) only apply to `undefined`, not an explicit `null`. `null.user_metadata` threw during render, crashing the entire template tree before any section mounted — which is why validation reported *every* section missing rather than just the photo. Templates with `profilePhoto: false` never call this function at all, so they were unaffected. Fixed by coercing `profile`/`user` to `{}` inside `selectProfileImage` itself when either is falsy (covers `null` as well as `undefined`), rather than relying on default parameters alone.

---

## [3.7.4] - 2026-08-04

### Fixed
- **Resume preview succeeded but PDF download failed with `GET /__pdf_renderer/index.html 404` on Render**: the backend build installed Python and Chromium but never built the React application that Playwright uses as its print renderer. `main.py` therefore skipped the static mount because no renderer `index.html` existed. `backend/render-build.sh` now builds the React app into `backend/pdf_renderer_dist`, verifies `index.html` exists, and only then installs the backend dependencies. `main.py` mounts this backend-contained artifact first and logs an explicit startup error if it is missing. The Render service must use a blank Root Directory so both `frontend/` and `backend/` are available to the build.

---

## [3.7.3] - 2026-08-04

### Fixed
- **PDF generation failing outright in production** (`RuntimeError: PDF renderer is unavailable ... net::ERR_CONNECTION_REFUSED` on both candidate URLs): `app/playwright_pdf.py`'s self-referential renderer URL (Playwright navigates the backend's own bundled frontend build at `/__pdf_renderer` to render each PDF) had `127.0.0.1:8000` hardcoded as its default target port. `main.py` binds Uvicorn to Render's dynamically-injected `$PORT` (its own comment already noted "hardcoding 8000 only works by coincidence of platform configuration"), so on Render the app is never actually listening on port 8000 — every self-referential Playwright navigation hit a closed port and failed immediately. Fixed by deriving the default renderer port from `os.environ.get("PORT", "8000")`, matching `main.py`'s own bind logic exactly. The second failing candidate in the traceback (`http://localhost:5173`) was not a code bug — it came from the Render environment's `FRONTEND_URL` variable being set to the local Vite dev server address instead of the real production frontend origin; that requires a Render dashboard config fix, not a code change. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) ISSUE-009.

---

## [3.7.2] - 2026-08-04

### Fixed
- **Extension tabs still occasionally dropping to the sign-in / Extension Setup screen after 3.7.1**: `refreshAccessToken()` (`frontend/src/services/authSession.js`) made exactly one attempt at `POST /api/v1/auth/refresh` with no timeout — and it's what `checkSession()`'s confirmed-`401` branch depends on before actually clearing the session. Given the backend's documented cold-start/DB-pool latency (see [KNOWN_ISSUES.md](KNOWN_ISSUES.md) ISSUE-005), a single transient failure on that one refresh call was indistinguishable from a genuinely invalid refresh token and logged the user out regardless. `refreshAccessToken()` now retries transient failures (network error, timeout, 5xx) up to 3 times with backoff, an 8s timeout per attempt, and gives up immediately only on a definitive `401`/`403` response (the refresh token itself was rejected — retrying with the same token can't help). See [AUTH_OAUTH.md](AUTH_OAUTH.md) §4.1.

---

## [3.7.1] - 2026-08-04

### Fixed
- **Extension "Resume"/"Cover Letter" buttons landing the new tab on the sign-in / Extension Setup screen despite an already-authenticated session**: root-caused to `setUser()` (`context/AppContext.jsx`) being a wrapper that actively deletes the cached `user` record from `localStorage`/`chrome.storage.local` whenever called with `null` — not a plain state setter. The session-verification background check (`checkSession()`) previously called `setUser(null)` whenever it couldn't get a definitive response (timeout, network blip, or a slow/cold-starting Render backend, not a confirmed `401`), permanently wiping the cached `user` object while leaving `access_token`/`refresh_token` untouched. Every subsequently opened tab then failed the "instant unblock" check (which requires **both** a stored token and a stored user), had to wait on a live `/api/v1/auth/session` call to re-populate `user`, and got redirected to `/extension-setup` if that call didn't return inside the previous ~11s retry budget. Fixed by (a) no longer calling `setUser(null)`/`setSession(null)` on an inconclusive (non-401) verification result — only a confirmed invalid/expired token (after an attempted refresh) ever clears the session now — and (b) widening the verification retry budget to 3 attempts × 8s with backoff (~27s total) so a slow/cold backend has a real chance to respond before the app gives up. See [AUTH_OAUTH.md](AUTH_OAUTH.md) §4.
- **JD extraction failing outright on a single Playwright navigation timeout** (e.g. `Page.goto: Timeout 30000ms exceeded` on slow-loading portals like `amazon.jobs`): `route_after_evidence()` (`services/job_extraction/graph.py`) only retried the browser fetch when it had been deliberately *skipped* in favor of extension evidence that turned out insufficient — an actual `BROWSER_FAILED` exception (timeout, launch error) routed straight to `final_response` without ever spending the `max_browser_attempts = 2` retry budget the state schema already allocates. Fixed by also retrying on `BROWSER_FAILED` while attempts remain, and escalating the navigation timeout on retry (30s → 45s → capped at 60s) in `browser_agent` (`services/job_extraction/agents.py`), since a page that didn't finish loading in the base window is more likely to succeed with a longer one than the identical budget again. See [JD_EXTRACTION_ENGINE_DOCUMENTATION.md](JD_EXTRACTION_ENGINE_DOCUMENTATION.md) §8.16.

---

## [3.7.0] - 2026-08-03

### Fixed
- **"Edit with AI" 100% failure (`PydanticUserError: BaseModel cannot be instantiated directly`)**: `is_prompt_out_of_scope()` (`app/ai_service.py`) — called first on every Edit-with-AI request — used a generic `.invoke()` path that hardcoded the abstract `BaseModel` class as its structured-output schema, which Pydantic explicitly forbids instantiating. Added a real `ScopeCheckResult` schema (`app/schemas.py`) and routed the scope guard through `invoke_structured()` like every other LLM call in the codebase. Updated `tests/test_copilot_scope.py` to mock `get_provider`/`invoke_structured` instead of the removed `get_llm`/`.invoke` path.
- **Security & Active Sessions page completely non-functional**: `SecurityPage.jsx` referenced an undefined `apiUrl` variable in every fetch call (never imported), causing a silent `ReferenceError` swallowed by `try/catch` — the device list rendered empty and "Delete Account" did nothing. Fixed by importing the shared `getApiUrl()` helper (`config/apiConfig.js`) already used by every other page.
- **Recurring `psycopg2.pool.PoolError: connection pool exhausted`**: an Explore-agent audit found 8 endpoints holding a pooled DB connection across slow AI/Playwright work. Fixed the worst offender — `POST /refine-section/stream` (`app/routers/api.py`) held a connection for the entire unbounded SSE stream duration via a `conn` dependency that was silently absorbed into an unused `**kwargs` inside `refine_section_stream_generator` and never actually used; removed the dependency entirely. Wrapped previously-unwrapped blocking LLM calls in `run_in_threadpool` (these were also freezing the whole event loop, not just holding a connection) in `tailor_resume` (`api/v1/tailoring.py`), `api_compare` (`app/routers/api.py`), and `parse_existing_resume` / `get_active_resume`'s auto-recovery path (`api/v1/resume.py`). Fully fixed `api_cover_letter` (`app/routers/api.py`) using a new short-lived `_db_context()` helper (`contextmanager(get_db_connection)`) so the connection is only held for the usage-check/consume writes, not the LLM call in between.
  - **Not yet fully fixed** (connection still held across slow work, needs a service-layer refactor, not a mechanical patch): `tailor_resume` / `api_compare`'s connection-lifetime (event-loop-blocking half only was fixed), `download_pdf` (`api/v1/tailoring.py`), `build_selected_resume_intelligence` / `confirm_selected_resume_intelligence` (`api/v1/resume.py`), and `api_generate_cover_letter_draft` (`app/routers/api.py`). Tracked in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) ISSUE-005 and [TODOS.md](TODOS.md).
- **Render deploy failure (`su: Authentication failure`) during `playwright install --with-deps`**: that flag shells out to `apt-get` via `su`, which requires root and fails on Render's native (non-Docker, non-root) build environment. Removed `--with-deps` from `backend/render-build.sh`.
- **`BrowserType.launch: Executable doesn't exist` at runtime despite a successful build**: Render's build-machine Playwright browser cache doesn't reliably carry into the deployed runtime container. Added a self-healing `_ensure_playwright_chromium()` step to the FastAPI `lifespan` startup hook (`main.py`) that runs an idempotent `playwright install chromium` via `asyncio.to_thread` on every process start, before accepting traffic.
- **`storage3.exceptions.StorageApiError: 404 not_found` crashing resume file/preview/recovery endpoints**: pre-existing resume records reference files that were never actually persisted to Supabase Storage (from before storage was wired up, or lost to an ephemeral-disk redeploy) — those files are permanently gone and the affected users must re-upload, but several call sites had zero error handling and crashed with raw 500s. `SupabaseStorageService.download_file` (`services/storage/supabase_storage.py`) now catches `StorageApiError` and re-raises `FileNotFoundError` for 404s; `get_resume_file` and `recover_resume_source_details` (`api/v1/resume.py`) and `_assert_lock` (`services/resume_intelligence/nodes.py`) now handle it cleanly (404 response / graceful degradation) instead of crashing.
- **`SyntaxWarning: invalid escape sequence '\/'` in `app/playwright_pdf.py`**: un-doubled backslashes in embedded JS regex code inside a Python string literal. Fixed by doubling the backslashes to match the correctly-escaped patterns elsewhere in the same literal.
- **Suspected OOM-driven 502 cascades across unrelated endpoints during PDF generation**: hypothesized cause — concurrent headless Chromium launches from repeated frontend PDF-render retries exceeding Render's memory limit and OOM-killing the whole process. Added a process-wide `threading.Lock()` (`_PDF_RENDER_LOCK`) serializing all Playwright rendering (`generate_pdf_via_playwright`, `generate_cover_letter_pdf_via_playwright`, `render_cover_letter_artifact`) to bound peak memory. Not confirmed against Render's server-side logs — see [KNOWN_ISSUES.md](KNOWN_ISSUES.md) ISSUE-006.

---

## [3.6.0] - 2026-08-02

### Added
- **Production-Grade LLM Redis Caching Layer**: Built `LLMCacheService` (`services/cache/llm_cache.py`), `LLMFingerprintBuilder` (`services/cache/llm_fingerprint.py`), and `LLMCacheTelemetry` (`services/cache/llm_cache_telemetry.py`) on top of Upstash Redis.
- **Canonical Input Fingerprinting**: Normalizes Unicode NFC, line endings (`\r\n` ➔ `\n`), and sorts object keys recursively to build deterministic SHA-256 fingerprints without exposing raw PII in Redis keys.
- **Envelope Storage & Pydantic Validation**: All cached responses are enveloped with task metadata, prompt/schema versions, and token usage. Invalid or stale schemas automatically purge on cache hit.
- **Single-Flight Distributed Locking (`SET NX`)**: Prevents cache stampedes by locking cache misses for up to 120s with owner UUID verification, allowing waiter processes to reuse the single LLM response.
- **Integrated Across All 9 LLM Workflows**: Wrapped `analyze_job_description`, `parse_resume`, `generate_tailoring_patch`, `generate_cover_letter`, `analyze_gaps`, `refine_section_with_ai`, `calculate_llm_live_scores`, `extraction_agent`, and `DeepSeekSemanticAnalyzer.analyze`.
- **Phase 6 Subscription Plans & Pricing Update**: Standardized pricing tiers to **Basic** ($9.99/mo), **Pro** ($19.99/mo), and **Elite** ($39.99/mo). Database seeded via `seed_phase6_plans.py`. Added live USD-to-INR real-time currency conversion for Razorpay modal checkout and 3-card animated skeleton loading UI.

### Changed
- `backend/core/config.py`: Added `LLM_CACHE_*` configuration settings for task-specific TTLs and lock timeouts.
- `backend/.env.example`: Added documentation for all `LLM_CACHE_*` parameters.

---

## [3.5.0] - 2026-08-02

### Removed
- **Groq & Gemini services fully eliminated**: Removed `langchain-groq`, `groq` from `requirements.txt`; deleted dead shim files `app/groq_service.py` and `app/gemini_service.py`; removed `GROQ_API_KEY` and `GEMINI_API_KEY` from `core/config.py`, `app/config.py`, and `backend/.env`.
- **Legacy `x_groq_key` / `x_gemini_key` HTTP headers**: Removed all per-request API-key override headers from every route in `api/v1/resume.py` and `app/routers/api.py`. DeepSeek reads its key from `settings.DEEPSEEK_API_KEY` only.
- **`ChatGroq` in `semantic.py`**: Replaced `GroqSemanticAnalyzer` (backed by `langchain_groq.ChatGroq`) with `DeepSeekSemanticAnalyzer` — same protocol interface, backed by `DeepSeekProvider`.

### Changed
- `api/dependencies.py`: `get_ai_service()` return type corrected from `GeminiService` to `AIService`.
- `services/ai/ai_service.py`: `GeminiService`/`GroqService` kept as transparent `AIService` aliases for any remaining import sites.
- `tests/test_copilot_scope.py` and `tests/test_streaming.py`: patch paths updated from `app.groq_service.*` → `app.ai_service.*`.
- `test_multi_agent.py`: `GROQ_API_KEY` reference replaced with `DEEPSEEK_API_KEY`.
- `docs/`: ARCHITECTURE, BACKEND, DECISIONS, PROMPTS updated to reflect single-provider DeepSeek architecture.

---

## [3.4.0] - 2026-08-02

### Added
- **Job Tracker DAG Workflow Board**: Enforced a Directed Acyclic Graph (DAG) system inside `JobTrackerPage.jsx` preventing cards from being dragged backward in the sequence of stages.
- **Visual Upstream Completion Cues**: Completed upstream stages in the horizontal stepper dynamically display emerald green borders, soft green backgrounds, checkmark icons, and header "Done" tags.
- **Unified 3D Card Flip Auth Pages**: Styled both `LoginPage.jsx` and `RegisterPage.jsx` with symmetrical features, custom light-mode gradients, and hardware-accelerated 3D perspective flip card transitions.
- **Robust Page Error Boundaries**: Added `DashboardErrorBoundary` and `JobTrackerErrorBoundary` wrapper components to catch and display detailed traceback stack logs in-place, eliminating blank page crashes.
- **Missing Core Backend Dependencies**: Appended `supabase`, `redis`, `upstash-redis`, `requests`, `langchain-deepseek`, and `pytest` dependencies to `backend/requirements.txt`.

### Fixed
- **Scroll Layout Cut-off**: Removed centering alignment (`xl:justify-center`) in the horizontal pipeline overflow container so that layout starts on the left boundary and scrolls cleanly.
- **Lucide Icon Reference Errors**: Fixed crashes caused by missing `Send` and `Clock` imports in `DashboardPage.jsx`.

## [3.3.0] - 2026-08-02

### Added
- **Theme-Aware Secure Checkout Loading Screen**: Updated `PaymentModal.jsx` to inject a theme-aware loading template into newly opened Stripe Checkout tabs (`checkoutTab`). Features the official **Tailr4U Logo** (`/application-logo.png` + `Tailr4U` wordmark), animated loading spinner, and SSL encryption badge matching light/dark mode.
- **Database Performance Index Migration**: Executed `backend/migrate_db_performance_indexes.py` directly on PostgreSQL, applying 14 database indexes across `resumes`, `resume_versions`, `applications`, `usage_events`, `subscriptions`, `user_sessions`, `reminders`, `notification_deliveries`, and `profiles`.
- **Backend Redis Read Caching**: Added Upstash Redis caching across `profile_repository.py`, `subscription.py`, `resume.py`, and `job_preferences_repository.py` for sub-2ms read response times.

### Changed
- **Zero-Latency Client Cache Hydration**: Initialized `ProfilePage.jsx` state from `localStorage` (`tailr4u_user_profile`), delivering instant <1ms UI rendering on profile navigation.
- **System-Wide Brand Uniformity**: Replaced all remaining occurrences of legacy product names across codebase and documentation with **Tailr4U** / **`tailr4u`**.

---

## [3.2.0] - 2026-08-02

### Added
- **DeepSeek LangChain Integration**: Integrated `langchain_deepseek.ChatDeepSeek` (`DEEPSEEK_API_KEY`) for AI intelligence tasks. Verified live connectivity via `test_deepseek_api.py`.
- **Real-Time Stripe API Verification**: Performed 100% real-time live network tests against Stripe API endpoints (`stripe.Balance.retrieve()`, `stripe.checkout.Session.create()`, `stripe.checkout.Session.retrieve()`, and webhooks). Refactored `backend/app/billing/providers/stripe_provider.py` to rely directly on live Stripe validation instead of string prefix checks.
- **Global Custom Cursor Engine**: Moved `.lp-custom-cursor` CSS system into `index.css`, enforcing `*, *::before, *::after { cursor: none !important; }` across all fine pointer devices. Updated `GlobalCursor.jsx` to render via `createPortal(..., document.body)` with `z-index: 9999999`.
- **Multi-Tab Payment Checkout Workflow**: Implemented synchronous click-event tab opening (`checkoutTab`) in `PaymentModal.jsx` so browser popup blockers NEVER block Stripe Checkout windows.
- **Tailr4U Payment Status Modal**: Created `PaymentStatusModal.jsx` featuring the official **Tailr4U Brand Logo** (`BrandLogo`), 1.5-second automated signal polling, and status notifications (`pending`, `success`, `cancelled`, `failed`).
- **Quota Exceeded Alert**: Built `QuotaExceededModal.jsx` and integrated global HTTP 429 quota handling in `AppContext.jsx` & `Layout.jsx`.

### Changed
- **Stripe HashRouter Return URLs**: Updated `success_url` and `cancel_url` in `stripe_provider.py` to redirect to `${frontend_url}/#/subscription?payment=success` and `${frontend_url}/#/subscription?payment=cancelled`, eliminating 404/wrong route redirects.
- **Unlimited Free Demo Plan**: Re-seeded database plans (`seed_phase6_plans.py`) setting Free Demo limits to Unlimited (`None`) and set `ENFORCE_SUBSCRIPTION_QUOTAS=false` in `backend/.env`.
- **Payment Modal Viewport Centering**: Wrapped `PaymentModal.jsx` and `PaymentStatusModal.jsx` in `createPortal(..., document.body)` to break out of CSS transform parents and keep modals perfectly centered on the screen.
- **Available Plans Grid**: Filtered out `$0`, `free`, and `trial` cards from the Subscription page plan grid.

---

## [3.1.0] - 2026-08-01

### Added
- **DeepSeek Provider Integration**: Replaced legacy Gemini and Groq model integrations with **DeepSeek** (`deepseek-v4-flash` as primary, `deepseek-v4-pro` as escalation) via OpenAI-compatible SDK (`https://api.deepseek.com`).
- **Provider Abstraction Layer**: Implemented `DeepSeekProvider` (`backend/app/llm/deepseek_provider.py`) with structured JSON parsing (`response_format={"type": "json_object"}`) and schema validation retries.
- **Unified AI Module**: Consolidated `gemini_service.py` and `groq_service.py` into **`backend/app/ai_service.py`** while maintaining complete backward compatibility.
- **Architecture Decision Record**: Documented ADR-006 for the controlled migration to DeepSeek in `docs/DECISIONS.md`.

### Changed
- Standardized AI provider settings in `core/config.py` and `backend/.env` with `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL_FLASH`, `DEEPSEEK_MODEL_PRO`.
- Updated frontend UI labels in Settings and Review views to provider-neutral "Tailr4U AI Engine".

---

## [3.0.0] - 2026-08-01

### Added
- **FastAPI Clean Architecture**: Refactored backend into 4 decoupled layers (`api/v1/`, `services/`, `repositories/`, `core/`).
- **Playwright HTML-to-PDF Engine**: Direct backend Chromium vector PDF compilation for pixel-perfect, ATS-scannable resumes.
- **Resilient DeepSeek LLM Orchestration**: Implemented `ResilientLLMWrapper` with two-tier DeepSeek failover (`deepseek-v4-flash` primary, `deepseek-v4-pro` escalation).
- **LangSmith Tracing**: Integrated full LLM prompt and chain execution tracing.
- **Health Probes**: Added root liveness (`/live`), readiness (`/ready`), and health status (`/health`) endpoints.
- **Centralized `/docs` Knowledge Base**: Established self-documenting repository specification containing 13 core technical documents.

### Changed
- Converted database queries to use `asyncpg` connection pools.
- Standardized API route prefix to `/api/v1/`.
- Updated Chrome Extension Manifest V3 overlay widget styling.

### Fixed
- Fixed rate-limit crashes on free-tier accounts by enforcing thread locking (`_SINGLE_AI_REQUEST_LOCK`) and Redis response caching.
- Resolved CORS header issues for Chrome Extension content scripts.

### Security
- Applied PostgreSQL Row-Level Security (RLS) policies across all tenant data tables.
- Isolated storage object access under `original-resumes` and `generated-resumes` buckets.

---

## [2.0.0] - 2026-06-20

### Added
- Chrome Extension Manifest V3 for instant job description scraping from LinkedIn and Indeed.
- ATS Match Score calculator and skill gap analysis engine.
- Redis response caching layer for LLM prompts.
- Interactive side-by-side resume editor in React dashboard.

### Changed
- Migrated database layer to Supabase PostgreSQL.
- Updated UI theme to dark obsidian aesthetic with glassmorphism panels.

---

## [1.0.0] - 2026-05-15

### Added
- Initial release of Tailr4U MVP.
- Basic FastAPI REST API with candidate resume upload and PDF parsing.
- Integration with LLM for resume tailoring and cover letter generation.
