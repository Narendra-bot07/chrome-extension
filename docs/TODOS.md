# Tailr4U - Categorized Task Backlog (TODOS)

This document categorizes all active development, refactoring, testing, and operational tasks for **Tailr4U** organized by priority level.

---

## 1. Critical Priority (P0 - Blocker / Immediate Action)

- [ ] **Playwright Browser Pool Initialization**:
  - Implement reusable browser pool context in `app/playwright_pdf.py` to eliminate cold-start PDF generation latency.
- [ ] **Production Secret Verification**:
  - Audit all deployment environment variables to ensure zero default development secrets remain in production.

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
