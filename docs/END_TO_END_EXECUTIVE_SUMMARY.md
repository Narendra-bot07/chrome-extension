# Tailr4U — Complete End-to-End Executive Summary & Technology Specification

---

## 1. Complete Technology Stack Matrix

| Architecture Layer | Technology / Library | Version / Detail | Purpose / Role |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | **React** | `v18.3.1` | Core UI component library for web dashboard & Chrome extension |
| **Build Tooling** | **Vite** | `v5.4.21` | High-speed frontend compiler & development server |
| **Styling** | **Vanilla CSS** | Modern Tokens & Glassmorphism | Curated dark mode aesthetics, dynamic micro-animations |
| **Browser Extension** | **Chrome Manifest V3** | Web Extension API | Background service worker, active-tab scraping, sidepanel UI |
| **Backend Framework** | **FastAPI** | `v0.100+` | High-performance asynchronous REST API server |
| **Data Validation** | **Pydantic V2** | `v2.0+` | Strict request/response payload schema validation |
| **ASGI Web Server** | **Uvicorn** | `v0.22+` | Asynchronous Python web server implementation |
| **Primary AI Engine** | **DeepSeek** | `deepseek-v4-flash` / `deepseek-v4-pro` | Resume parsing, job analysis, ATS scoring, tailoring, cover letters |
| **AI Integration** | **LangChain + OpenAI SDK** | `langchain-openai` (OpenAI-compatible client) | Structured output parsing and prompt chaining via DeepSeek API |
| **AI Resiliency** | **ResilientLLMWrapper** | Custom Runnable | Flash → Pro escalation, bounded retry, concurrency lock |
| **Global Payments** | **Stripe** | `stripe-python` | International checkout sessions, webhooks, subscription billing |
| **Domestic Payments** | **Razorpay** | `razorpay-python` | India region geo-routed payment orders & HMAC signature verification |
| **Billing Router** | **BillingService** | Geo-Routing Engine | Automatic routing: India → Razorpay, Rest of World → Stripe |
| **Database Engine** | **Supabase PostgreSQL** | Managed Postgres 15+ | Multi-tenant relational storage (31+ tables across `supabase/migrations/`, RLS enabled) |
| **Database Connection** | **Psycopg2 Binary** | Transaction Pooler (Port 6543) | PgBouncer connection pooling with SSL mode |
| **Blob Storage** | **Supabase Storage** | Cloud Object Buckets | Binary file storage (`original-resumes`, `generated-resumes`) |
| **Caching Layer** | **Upstash Redis Cloud** | REST API (`topical-katydid-92319.upstash.io`) | Sub-50ms AI response caching & JD extraction caching |
| **Cache Fallback** | **In-Memory Cache** | Custom Python Dict | Graceful offline cache fallback when Redis is unconfigured |
| **Email Service** | **Resend REST API** | `https://api.resend.com/emails` | Transactional email delivery with automatic SMTP fallback |
| **Job Web Scraper** | **Playwright + BeautifulSoup4** | Headless Browser / HTML Parser | Full DOM rendering and JD markdown extraction |
| **Authentication** | **Self-Issued JWT Guard** | PyJWT + bcrypt (not Supabase Auth) | HS256 JWT signed with app-local `JWT_SECRET`, session revocation via `SessionService`; see [SECURITY.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/SECURITY.md) §1 |

---

## 2. What We Are Doing (Product Capabilities & Workflows)

### 2.1 Core Application Features
1. **1-Click Active Tab JD Extraction**: Chrome Extension automatically extracts, cleans, and normalizes job descriptions from LinkedIn, Indeed, Greenhouse, and Lever pages.
2. **AI Resume Parsing**: Converts raw resume text (PDF/Word) into structured Pydantic JSON schema (`summary`, `experience`, `skills`, `projects`, `education`, `certifications`).
3. **ATS Match Scoring & Gap Analysis**: Computes an exact ATS Match Score (0–100%) against target job descriptions and highlights missing technical keywords.
4. **Targeted Resume Patch Tailoring**: Generates tailored resume modifications that weave target job keywords into experience bullets without fabricating work history.
5. **Cover Letter Generator**: Drafts customized, job-specific cover letters aligned with the candidate's active resume.
6. **Live Section Stream Refinement**: Streams real-time AI refinements for specific resume sections via SSE endpoints.

### 2.2 Dual Payment & Subscription Gateway Engine
* **Geo-Routed Billing (`BillingService`)**: Intelligently routes candidates based on region:
  * **India Candidate Traffic**: Routed to **Razorpay** for native UPI, Net Banking, and local card checkout.
  * **Global Candidate Traffic**: Routed to **Stripe** for international credit card, Apple Pay, and Google Pay checkout.
* **Webhook Security & Verification**:
  * **Stripe Webhooks** (`POST /api/v1/billing/webhook/stripe`): Verified via `stripe.Webhook.construct_event(payload, sig_header, secret)`.
  * **Razorpay Webhooks** (`POST /api/v1/billing/webhook/razorpay`): Verified via HMAC SHA256 signature validation.
* **Subscription & Credit Management**: Automated credit top-ups (`credit_svc.add_credits`), subscription activation (`sub_svc.activate_subscription`), and cancellation lifecycle (`Stripe.Subscription.modify`).

### 2.3 Presentation & Design Engineering
* **Intelligent Profile Photo Engine**: Automatically suppresses photo UI for resumes without photos (`renderProfilePhoto()` returns `null`). For resumes with photos, applies aspect-ratio cover scale math `Math.max(containerW / imgW, containerH / imgH)` for 100% gapless canvas exports.
* **Username & Handle Hyperlink Embedding**: Automatically extracts social handles (e.g. `@Narendra-bot07`) from profile URLs and embeds clickable links across all template layouts.

---

## 3. What We Are Following (Active Best Practices & Implemented Standards)

### AI & Pipeline Resiliency
* [x] **100% DeepSeek Exclusive**: Engine relies exclusively on DeepSeek models (`deepseek-v4-flash`, `deepseek-v4-pro`) — Gemini and Groq were fully removed, see [ADR_DEEPSEEK_SOLE_PROVIDER.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/ADR_DEEPSEEK_SOLE_PROVIDER.md).
* [x] **Single-Request Concurrency Lock (`_SINGLE_AI_REQUEST_LOCK`)**: Enforces 1-at-a-time LLM execution with 1.5s cooling intervals, eliminating 429 quota exhaustion errors.
* [x] **Multi-Tier Model Fallback**: Automatically tries alternative Gemini model strings if a primary model returns 404 or temporary errors.

### Payments & Subscription Security
* [x] **Dual Gateway Geo-Routing**: Native routing between Stripe (Global) and Razorpay (India).
* [x] **Cryptographic Webhook Verification**: All billing webhooks verify signature headers before executing credit or subscription mutations.
* [x] **Transaction Log Integrity**: Payment events recorded in `public.usage_events` and analytics logs (`PAYMENT_SUCCESS`, `SUBSCRIPTION_CREATED`).

### Database & Cloud Storage
* [x] **Supabase Managed Postgres**: Database hosted on Supabase managed infrastructure connected via Transaction Pooler PgBouncer on port `6543`.
* [x] **Indexed Relational Schema**: 31+ tables across `supabase/migrations/*.sql` (not the previously-documented "10" — that count is stale from an early schema draft; see [DATABASE.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/DATABASE.md) scope note and [DATABASE_DDL_MIGRATIONS.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/DATABASE_DDL_MIGRATIONS.md) for the full list), with primary keys, foreign keys, and indexes.
* [x] **Row Level Security (RLS)**: Row-level security policies enforced on Supabase tables to isolate multi-tenant user data.
* [ ] **Cloud Storage Buckets**: **Not yet wired up.** `original-resumes`/`generated-resumes` bucket RLS policies exist in migrations and `SupabaseStorageService` is fully implemented, but `get_storage_service()` (`backend/api/dependencies.py:48`) unconditionally returns `LocalStorageService` (local disk) — uploads do not currently reach Supabase Storage. See [DATABASE.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/DATABASE.md) §1 for detail.

### Caching, Performance & Email
* [x] **Upstash Cloud Redis**: Live and authenticated at `topical-katydid-92319.upstash.io` providing sub-50ms cache hits for AI responses.
* [x] **Graceful Cache Fallback**: `RedisCacheService` falls back to in-memory dictionary storage if cloud Redis is unreachable.
* [x] **Resend Email REST API**: Configured with `RESEND_API_KEY` for email delivery with secondary SMTP fallback.
* [x] **Debounced Live ATS Scoring**: Increased live score debounce timer in `AppContext.jsx` to 2500ms to prevent API request spamming.

### Code Quality & Security
* [x] **Clean Frontend Production Build**: `npm run build` compiles cleanly in 12.46s (1978 modules transformed, 0 errors).
* [x] **Clean Backend Module Loading**: `python -c "import main"` initializes cleanly with 0 errors.
* [x] **Secrets Isolation**: All secret tokens stored strictly in `backend/.env` (excluded from git tracking).
* [x] **PII & Token Sanitization**: Server loggers scrub sensitive user credentials and tokens.

---

## 4. What We Are Not Following Yet (Identified Gaps & Action Items)

| Item | Architectural Area | What We Are Not Following Yet | Recommended Action Item |
| :---: | :--- | :--- | :--- |
| **1** | **Database Security** | Connection string uses default superuser `postgres` URI in `DATABASE_URL`. | Create a restricted `tailr4u_app` application role in Supabase. |
| **2** | **Environment Isolation** | Development and production share the same Supabase project instance. | Create a separate `tailr4u-staging` Supabase project for dev testing. |
| **3** | **Real-Time Error Tracking** | ~~Sentry exception tracking is unconfigured~~ — **stale, already resolved**: `backend/observability/sentry.py` is fully wired (PII redaction, FastAPI integration) and called from `main.py`, keyed off `SENTRY_BACKEND_DSN`/`SENTRY_FRONTEND_DSN`/`SENTRY_EXTENSION_DSN`. | Verify DSN values are actually populated per environment (not a code gap). |
| **4** | **Backup Recovery Drills** | Automated daily Supabase backups are active, but restoration is un-drilled. | Schedule a quarterly automated backup restoration test. |
| **5** | **Frontend Code-Splitting** | Large vendor chunks (>500kB) compile cleanly, but lack dynamic import splitting. | Add dynamic `import()` chunking in `vite.config.js` for lighter initial page loads. |
| **6** | **Blob Storage Wiring** | `get_storage_service()` always returns `LocalStorageService`; `SupabaseStorageService` is fully implemented but never instantiated. Uploads do not persist across restarts on ephemeral hosts. | Construct a `supabase.Client` from `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` and swap the dependency to `SupabaseStorageService`. |

---

## 5. Master System Scorecard

* **Gaps / Action Items Remaining**: **6 items** (§4 above) — one newly added (Blob Storage Wiring, item 6) since the prior audit, one resolved (Sentry, item 3, downgraded to a verification-only note).
* **Current Operational Status**: Production-deployed; the storage wiring gap (item 6) is the highest-priority open item since it risks silent data loss on redeploy.
