# Tailr4U - Categorized Task Backlog (TODOS)

This document categorizes all active development, refactoring, testing, and operational tasks for **Tailr4U** organized by priority level.

---

## 1. Critical Priority (P0 - Blocker / Immediate Action)

- [ ] **Eliminate Request-Long DB Connections Around Slow AI/Playwright Work**:
  - `TailoringService.execute_tailoring_flow` (`services/resume/tailoring_service.py`, used by `tailor_resume` in `api/v1/tailoring.py`) and `api_compare` (`app/routers/api.py`) still hold one `Depends(get_db_connection)` connection across the full request, including the LLM call — only the event-loop-blocking half was fixed (`run_in_threadpool`). Refactor to take short-lived connections (see `_db_context()` pattern already applied to `api_cover_letter` in `app/routers/api.py`) only around the actual repo reads/writes.
  - Same issue in `download_pdf` (`api/v1/tailoring.py` — connection held through the Playwright render + `_PDF_RENDER_LOCK` queue wait), `build_selected_resume_intelligence` / `confirm_selected_resume_intelligence` (`api/v1/resume.py`), and `api_generate_cover_letter_draft` (`app/routers/api.py`).
  - See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) ISSUE-005 for full audit findings.
- [ ] **Playwright Browser Pool Initialization**:
  - Implement reusable browser pool context in `app/playwright_pdf.py` to eliminate cold-start PDF generation latency.
- [ ] **Production Secret Verification**:
  - Audit all deployment environment variables to ensure zero default development secrets remain in production.
- [ ] **Confirm Render Dashboard Build Command matches `backend/render-build.sh`**:
  - The dashboard's manually-configured Build Command field may still contain the old `playwright install --with-deps chromium` (which fails on Render's native non-root runtime, see [KNOWN_ISSUES.md](KNOWN_ISSUES.md) / [CHANGELOG.md](CHANGELOG.md) 3.7.0). Verify it invokes `backend/render-build.sh` (or an equivalent command without `--with-deps`).
- [ ] **Correct the `FRONTEND_URL` environment variable on Render**:
  - Currently set to a local Vite dev server address (`http://localhost:5173`) instead of the real production frontend origin, breaking the PDF renderer's last-resort fallback candidate. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) ISSUE-009.

---

## 2. High Priority (P1 - Core Feature / Next Release)

- [ ] **Multi-Template Selector Engine**:
  - Expand React template library to include 5 distinct ATS-optimized vector layouts (`Classic`, `Modern Minimal`, `Executive`, `Tech Compact`, `Creative`).
- [ ] **Cover Letter PDF Exporter**:
  - Enable vector PDF generation for cover letters using Playwright templates matching the candidate's selected resume layout.
- [ ] **Automated Integration Test Suite**:
  - Add comprehensive end-to-end integration tests (`pytest` + `httpx`) covering full tailoring pipeline from raw JD scraping to PDF rendering.

---

## 3. Medium Priority (P2 - System Enhancement)

- [ ] **Enhanced Rate-Limiting & Quota Management**:
  - Implement Redis-backed token bucket rate limiter middleware for free-tier users.
- [ ] **Extension Auto-Fill Form Assistant**:
  - Build smart input field mapping for job application forms (Lever, Greenhouse, Workday).
- [ ] **Sentry Performance Monitoring Integration**:
  - Add Sentry transaction tracing to database query repositories.

---

## 4. Low Priority (P3 - Polish & Refactoring)

- [ ] **Dark Mode Color Customizer**:
  - Allow web app users to pick custom theme accent colors (Indigo, Emerald, Violet, Amber).
- [ ] **Codebase Linting Cleanup**:
  - Enforce zero `flake8` warnings across all backend python files.

---

## 5. Future Explorations (P4 - Long-Term Research)

- [ ] **Local LLM Model Integration (Ollama / vLLM)**:
  - Add optional local LLM execution support for ultra-private offline resume tailoring.
- [ ] **Autonomous Job Matching Agent**:
  - AI agent that periodically monitors preferred company career portals and alerts candidate when high-match roles open.
