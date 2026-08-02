# Tailr4U - Known Issues & Bug Tracking Log

This document tracks all currently identified technical issues, edge-case bugs, performance bottlenecks, and active remediation plans for **Tailr4U**.

---

## Active Issues Register

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
- **Component**: Chrome Extension Content Scripts (`src/browser-intelligence/`)
- **Description**: Occasional job descriptions on niche ATS portals (e.g. custom company career pages) fail auto-parsing and require user fallback selection.
- **Root Cause**: Non-standard HTML markup missing standard ARIA roles or microdata tags.
- **Current Status**: Active Monitoring.
- **Assigned Fix**: Add generic heuristic DOM parser relying on main container density and article text extraction algorithms.

---

### ISSUE-004: PDF Single-Page Overflow on Long Resumes
- **Date Discovered**: 2026-08-01
- **Severity**: Low
- **Component**: React Render Templates (`frontend/src/templates/`)
- **Description**: Resumes with extensive employment histories (5+ positions) exceed 1 page when rendered into tight ATS templates.
- **Root Cause**: Fixed font sizes and line heights without dynamic scale-down rules.
- **Current Status**: Open.
- **Assigned Fix**: Add automated font-size scaling dynamic CSS classes based on total character count in template renderer.
