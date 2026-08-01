# Tailr4U - Architecture Decision Records (ADR)

This document tracks all critical architectural, structural, and infrastructure design decisions made in **Tailr4U**.

---

## Index of Architecture Decision Records

- [ADR-001: Adoption of FastAPI Clean 4-Layer Architecture](#adr-001-adoption-of-fastapi-clean-4-layer-architecture)
- [ADR-002: Headless Chromium Playwright Engine for Vector PDF Compilation](#adr-002-headless-chromium-playwright-engine-for-vector-pdf-compilation)
- [ADR-003: Multi-Model Resilient LLM Wrapper (Groq + Gemini Failover)](#adr-003-multi-model-resilient-llm-wrapper-groq--gemini-failover)
- [ADR-004: Supabase PostgreSQL with Native Row-Level Security (RLS)](#adr-004-supabase-postgresql-with-native-row-level-security-rls)
- [ADR-005: Chrome Manifest V3 Content Script & Shadow DOM Injection](#adr-005-chrome-manifest-v3-content-script--shadow-dom-injection)

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

## ADR-003: Multi-Model Resilient LLM Wrapper (Groq + Gemini Failover)

- **Date**: 2026-07-20
- **Status**: Approved & Implemented
- **Context**: LLM API providers enforce strict free-tier rate limits (`429 Quota Exceeded`). Depending solely on a single AI provider leads to user-facing service outages during traffic spikes.
- **Decision**: Implement `ResilientLLMWrapper` (`app/gemini_service.py`) supporting automatic failover:
  1. Primary: **Groq (`llama-3.3-70b-versatile`)** for ultra-fast JSON structured output.
  2. Fallback: **Gemini 2.0 Flash (`gemini-2.0-flash`)** if Groq fails or rate limits.
  3. Tertiary: **Gemini 1.5 Flash (`gemini-1.5-flash`)**.
- **Alternatives Considered**: Direct single model calls with retries.
- **Reasoning**: Guarantees high availability, reduces overall latency, and respects free-tier quotas through thread locking (`_SINGLE_AI_REQUEST_LOCK`).
- **Consequences**: Requires maintaining compatibility across LangChain provider libraries (`langchain-groq` and `langchain-google-genai`).

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
