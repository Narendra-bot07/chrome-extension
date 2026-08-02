# Tailr4U - Architecture Decision Records (ADR)

This document tracks all critical architectural, structural, and infrastructure design decisions made in **Tailr4U**.

---

## Index of Architecture Decision Records

- [ADR-001: Adoption of FastAPI Clean 4-Layer Architecture](#adr-001-adoption-of-fastapi-clean-4-layer-architecture)
- [ADR-002: Headless Chromium Playwright Engine for Vector PDF Compilation](#adr-002-headless-chromium-playwright-engine-for-vector-pdf-compilation)
- [ADR-003: Resilient DeepSeek LLM Wrapper (Flash → Pro Escalation)](#adr-003-resilient-deepseek-llm-wrapper-flash--pro-escalation)
- [ADR-004: Supabase PostgreSQL with Native Row-Level Security (RLS)](#adr-004-supabase-postgresql-with-native-row-level-security-rls)
- [ADR-005: Chrome Manifest V3 Content Script & Shadow DOM Injection](#adr-005-chrome-manifest-v3-content-script--shadow-dom-injection)
- [ADR-006: Controlled Migration to DeepSeek as Sole LLM Provider](#adr-006-controlled-migration-to-deepseek-as-sole-llm-provider)
- [ADR-007: Production-Grade Redis LLM Caching Layer](#adr-007-production-grade-redis-llm-caching-layer)
- [ADR-008: Phase 6 Subscription Tier Standard and Dual Payment Routing](#adr-008-phase-6-subscription-tier-standard-and-dual-payment-routing)

---

## ADR-001: Adoption of FastAPI Clean 4-Layer Architecture

- **Date**: 2026-06-15
- **Status**: Approved & Implemented (`v3.0.0`)
- **Context**: The original backend codebase suffered from monolithic routers (`api.py` ~60KB) where HTTP endpoint handlers directly executed raw SQL, calls to LLM APIs, and file rendering logic. This created severe tight coupling, made unit testing impossible, and led to frequent regression bugs.
- **Decision**: Refactor backend into a 4-Layer Clean Architecture:
  1. `api/v1/`: HTTP Routers & Request Validation
  2. `services/`: Business Logic & AI Prompt Pipeline
  3. `repositories/`: Abstracted Database Access Pool
  4. `core/`: Config, Security & Observability Setup
- **Alternatives Considered**:
  - *Option A*: Retain monolithic `api.py` with helper functions.
  - *Option B*: Standard Django / Flask MVC structure.
- **Reasoning**: FastAPI Clean Architecture isolates side effects, permits clean repository mocks for unit testing, and provides modular routing files under `api/v1/`.
- **Consequences**: Significantly improved test coverage, faster debugging, and decoupled feature development.

---

## ADR-002: Headless Chromium Playwright Engine for Vector PDF Compilation

- **Date**: 2026-07-02
- **Status**: Approved & Implemented
- **Context**: Tailored resumes must render as single-page, ATS-scannable PDFs with exact vector font crispness and precise margin layouts.
- **Decision**: Deploy headless Chromium Playwright on the backend (`app/playwright_pdf.py`). The backend injects tailored JSON into built React template HTML and captures a vector PDF snapshot.
- **Alternatives Considered**:
  - *Option A*: Client-side `html2pdf.js` / `jspdf`. (Rejected: Browser font rendering variations and broken multi-page page breaks).
  - *Option B*: Python ReportLab / WeasyPrint. (Rejected: Complex custom layout engines with limited CSS flexbox/grid support).
- **Reasoning**: Chromium Playwright produces 100% pixel-perfect PDF vector output identical to what candidates view in their desktop browsers, with full CSS print layout controls (`@media print`).
- **Consequences**: Requires installing Playwright Chromium binaries in Docker containers (~150MB image size overhead), offset by flawless PDF output.

---

## ADR-003: Resilient DeepSeek LLM Wrapper (Flash → Pro Escalation)

- **Date**: 2026-08-02 (supersedes original 2026-07-20 Groq+Gemini design)
- **Status**: Approved & Implemented (`v3.2.0`)
- **Context**: The original `ResilientLLMWrapper` relied on a three-model chain (Groq → Gemini 2.0 → Gemini 1.5) to handle free-tier rate limits. After migrating to DeepSeek as the sole LLM provider (ADR-006), the multi-vendor chain was simplified to a two-tier DeepSeek hierarchy while preserving the same thread-locking and Redis caching guarantees.
- **Decision**: Implement `DeepSeekProvider` (`app/llm/deepseek_provider.py`) as the single AI provider with:
  1. Primary: **DeepSeek Flash (`deepseek-v4-flash`)** for ultra-fast `json_object`-mode structured outputs.
  2. Escalation: **DeepSeek Pro (`deepseek-v4-pro`)** triggered automatically on schema validation failure.
- **Alternatives Considered**: Retain Groq + Gemini multi-vendor chain. (Rejected: Vendor fragmentation, separate quota management, and `langchain-groq` / `langchain-google-genai` dependency overhead).
- **Reasoning**: DeepSeek provides state-of-the-art JSON structured generation at lower cost. The two-tier escalation path within a single vendor is simpler to operate and monitor than a three-vendor chain.
- **Consequences**: `DEEPSEEK_API_KEY` is the single backend LLM secret. `langchain-groq` and `groq` packages removed from `requirements.txt`.

---

## ADR-004: Supabase PostgreSQL with Native Row-Level Security (RLS)

- **Date**: 2026-05-10
- **Status**: Approved & Implemented
- **Context**: Multi-tenant data security is critical. Leaking one user's resume data to another user is a fatal security violation.
- **Decision**: Adopt Supabase PostgreSQL with strict Row-Level Security (RLS) policies enforcing `auth.uid() = user_id` across all user-owned tables.
- **Alternatives Considered**: Application-level `WHERE user_id = ...` filtering only.
- **Reasoning**: Database-level RLS policies provide defense-in-depth, guaranteeing data isolation even if a bug occurs in backend API routing logic.
- **Consequences**: All database migration SQL scripts must explicitly enable RLS and define security policies.

---

## ADR-005: Chrome Manifest V3 Content Script & Shadow DOM Injection

- **Date**: 2026-06-01
- **Status**: Approved & Implemented
- **Context**: Job descriptions on sites like LinkedIn and Indeed must be extracted instantly without requiring users to copy-paste text manually into a dashboard.
- **Decision**: Build a Chrome Extension using Manifest V3 with specialized DOM parser content scripts and a floating overlay widget rendered inside an isolated Shadow DOM container.
- **Alternatives Considered**: Web scraping background server workers. (Rejected: IP blocking and CAPTCHA restrictions on target job portals).
- **Reasoning**: Scraping client-side within the user's active browser session bypasses CAPTCHAs effortlessly. Shadow DOM prevents host website CSS styles from distorting the extension UI.
- **Consequences**: Content scripts must be maintained whenever major job boards alter their DOM HTML class names.

---

## ADR-006: Controlled Migration to DeepSeek as Sole LLM Provider & `ai_service.py` Consolidation

- **Date**: 2026-08-01
- **Status**: Approved & Implemented (`v3.1.0`)
- **Context**: Tailr4U previously utilized a multi-model failover chain between Groq (`llama-3.3-70b-versatile`) and Google Gemini (`gemini-2.0-flash`). To streamline AI infrastructure, improve reasoning capabilities, and reduce vendor fragmentation, the LLM provider layer required consolidation.
- **Decision**: Perform a controlled provider migration to **DeepSeek** (`deepseek-v4-flash` as primary, `deepseek-v4-pro` as escalation) via OpenAI-compatible SDK integration (`https://api.deepseek.com`), while consolidating `gemini_service.py` and `groq_service.py` into a unified, provider-neutral **`backend/app/ai_service.py`** module.
- **Alternatives Considered**:
  - *Option A*: Retain Groq + Gemini multi-provider complexity. (Rejected: Vendor fragmentation and separate quota management).
  - *Option B*: Redesign tailoring prompts for DeepSeek. (Rejected: Violates non-negotiable zero-prompt-rewrite rule).
- **Reasoning**: DeepSeek provides state-of-the-art structured JSON generation (`response_format={"type": "json_object"}`) and strong reasoning at lower cost. The provider abstraction layer (`DeepSeekProvider`) adapts DeepSeek directly to Tailr4U's existing Pydantic schemas without modifying any business logic or API contracts.
- **Consequences**: `DEEPSEEK_API_KEY` is the single backend secret. All legacy `gemini_service` and `groq_service` imports forward seamlessly to `app.ai_service`.

---

## ADR-007: Production-Grade Redis LLM Caching Layer

- **Date**: 2026-08-02
- **Status**: Approved & Implemented (`v3.6.0`)
- **Context**: DeepSeek API invocations for repetitive job description extractions and resume tailoring operations consume significant API tokens and introduce ~12s latency.
- **Decision**: Implement a multi-tiered LLM Redis Caching Layer (`LLMCacheService` in `services/cache/llm_cache.py`, backed by `redis_cache` in `services/cache/redis_cache.py`) using Upstash Redis. Key features include:
  1. **Canonical Input Fingerprinting (`LLMFingerprintBuilder`)**: Unicode NFC normalization, line ending unification (`\r\n` ➔ `\n`), key-sorted JSON, and SHA-256 fingerprinting without storing raw PII in keys.
  2. **Metadata Enveloping & Validation**: Stores responses wrapped in `LLMCacheEnvelope` with task metadata and prompt/schema versions. Deserialized cache hits run Pydantic domain model validation; stale or malformed payloads purge automatically.
  3. **Single-Flight Distributed Locking (`SET NX`)**: Prevents cache stampedes by acquiring a 120s distributed lock for cache misses, allowing concurrent waiter requests to poll and reuse the single LLM response.
  4. **Resilient Failover**: Redis connection errors log warnings and seamlessly fall back to direct LLM execution without throwing HTTP exceptions.
- **Consequences**: Reduces duplicate request latency from ~12s to `< 50ms`, preserves zero-hallucination contracts, and protects against cache stampedes.

---

## ADR-008: Phase 6 Subscription Tier Standard and Dual Payment Routing

- **Date**: 2026-08-02
- **Status**: Approved & Implemented (`v3.6.0`)
- **Context**: Subscription pricing required alignment with user feedback across global markets, and payment gateway routing needed clear separation between international cardholders and Indian users.
- **Decision**:
  1. Standardized subscription tiers to **Basic** ($9.99/mo), **Pro** ($19.99/mo), and **Elite** ($39.99/mo) seeded via `seed_phase6_plans.py`.
  2. Implemented dual payment gateway routing: International users open Stripe Checkout in a standalone external page, while Indian cardholders launch a Razorpay modal featuring real-time USD-to-INR currency conversion display.
  3. Replaced generic plain text loading states on the subscription dashboard with an animated 3-card skeleton UI.
- **Consequences**: Provides seamless checkout options for global and local users with clean USD pricing display.
