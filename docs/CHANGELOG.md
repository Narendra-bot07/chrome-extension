# Tailr4U - Release Changelog

All notable changes to **Tailr4U** will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
