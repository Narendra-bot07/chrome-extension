# Tailr4U - Release Changelog

All notable changes to **Tailr4U** will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- **Resilient Multi-Model LLM Orchestration**: Implemented `ResilientLLMWrapper` supporting automatic failover between Groq (`llama-3.3-70b-versatile`), Gemini 2.0 Flash, and Gemini 1.5 Flash.
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
