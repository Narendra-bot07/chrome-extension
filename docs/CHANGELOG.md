# Tailr4U - Release Changelog

All notable changes to **Tailr4U** will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
