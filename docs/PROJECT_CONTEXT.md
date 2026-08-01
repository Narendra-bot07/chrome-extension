# Tailr4U - Project Context & Master Specifications

> [!IMPORTANT]
> **AI Instructions & Source of Truth**
> This file is the single source of truth for Tailr4U. Any future AI agent (Gemini, Claude, ChatGPT, Codex, etc.) or developer MUST consult this document and its companion files in `/docs` before proposing or executing any architectural, database, or API changes. Always adhere strictly to the established Clean Architecture principles, database contracts, and coding standards.

---

## 1. Executive Summary & Vision

### Vision
Tailr4U is an enterprise-grade, AI-driven career acceleration and resume tailoring engine. It bridges the gap between candidates and Automated Tracking Systems (ATS) by instantly optimizing resumes, auto-generating targeted cover letters, extracting live job descriptions directly from job boards via a Chrome Extension, and rendering pixel-perfect, ATS-compliant PDFs.

### Mission
To empower job seekers with real-time browser intelligence, AI-assisted resume composition, and automated application tracking—maximizing ATS match scores while eliminating repetitive application friction.

### Core Principles
1. **Zero-Hallucination Tailoring**: Preserve real candidate accomplishments while reframing language to match Job Description (JD) keywords.
2. **Sub-Second Responsiveness**: Leverage Redis caching, asynchronous processing, and multi-model failover (Groq + Gemini) for instant feedback.
3. **Deterministic PDF Compilation**: Utilize a custom Chromium Playwright rendering engine over React components for pixel-perfect, single-page, ATS-scannable PDFs.
4. **Privacy & Security First**: Strict Row-Level Security (RLS) on PostgreSQL, sandboxed file uploads in Supabase Storage, and zero exposure of internal environment keys.
5. **Clean Architecture & Maintainability**: Modular backend layers (Routers → Services → Repositories → Core) ensuring high testability and seamless maintenance.

---

## 2. Product Overview & Key Features

Tailr4U is composed of three interconnected sub-systems:
1. **Chrome Extension (Browser Intelligence Engine)**: DOM scraper & floating overlay injected into major job platforms (LinkedIn, Indeed, Glassdoor, Lever, Greenhouse, Workday) to capture raw Job Descriptions and trigger instant tailoring.
2. **Web Application (Vite + React Frontend)**: Premium dark-mode dashboard providing resume management, real-time tailoring editors, template customization, cover letter generator, application status tracking, and account management.
3. **Backend API (FastAPI Enterprise Engine)**: Asynchronous REST API providing multi-LLM orchestration (Groq Llama-3.3-70b & Gemini 2.0 Flash), Playwright PDF compilation, ATS scoring, account security, usage analytics, and Supabase integration.

### Core Feature Matrix
- **Instant JD Extraction**: Scrapes active job listings with single-click DOM parsing.
- **ATS Match Score & Gap Analysis**: Evaluates resume-JD compatibility (0-100%) and provides missing keyword breakdowns.
- **Smart Section Tailoring**: Modular AI editing for Work Experience, Professional Summary, Skills, and Projects.
- **Deterministic PDF Generation**: Uses headless Chromium to compile tailored JSON resume models directly into HTML/CSS and output vector-sharp PDFs.
- **Cover Letter Engine**: Generates customized, role-specific cover letters tailored to employer domain and candidate background.
- **Application Workflow Tracker**: KanBan and list views for managing job applications, interview schedules, and follow-up reminders.
- **Multi-Resume Management**: Upload, store, and manage primary resumes and versioned tailored iterations.

---

## 3. Current Development Stage & Versioning

- **Current Version**: `v3.0.0`
- **Architecture State**: Enterprise Clean Architecture with decoupled API routers, repository abstraction layers, resilient LLM fallback wrappers, and dedicated worker threads.
- **Status**: Production Ready / Active Enhancement Phase.

---

## 4. Technology Stack Summary

| Layer | Technology / Framework | Purpose |
| :--- | :--- | :--- |
| **Browser Extension** | Chrome Manifest V3 (JS, DOM Observers) | Instant JD scraping & embedded context overlay |
| **Frontend** | React 18, Vite, TailwindCSS, Lucide React, Framer Motion | Web dashboard, rich resume editor, preview engine |
| **Backend Framework** | FastAPI (Python 3.12, Uvicorn, Pydantic v2) | High-performance async REST API engine |
| **Database** | PostgreSQL (Supabase Managed), asyncpg / psycopg2 | Core data persistence, JSONB models, RLS policies |
| **Object / Blob Storage** | Supabase Storage / S3-compatible | Secure file storage (`original-resumes`, `generated-resumes`) |
| **Caching Layer** | Redis / In-Memory Fallback Cache | Fast result caching for LLM responses & sessions |
| **PDF Renderer** | Playwright (Headless Chromium) + React Static | HTML/CSS to PDF vector compilation |
| **Primary AI Engine** | DeepSeek (`deepseek-v4-flash`) | Rapid structured JSON generation, JD parsing & tailoring |
| **Escalation AI Engine**| DeepSeek (`deepseek-v4-pro`) | Escalation model for schema recovery & complex reasoning |
| **Observability** | LangSmith & Sentry | LLM prompt tracing, execution monitoring & error tracking |

---

## 5. Folder Structure Overview

```
tailr4u/
├── docs/                                 # Central Knowledge Base & Specifications
├── frontend/                             # React + Vite Web Application
│   ├── src/
│   │   ├── browser-intelligence/        # Injected Chrome Extension logic & content scripts
│   │   ├── components/                  # UI Components (Dashboard, Resume Editors, Modals)
│   │   ├── context/                     # React Auth & Theme Contexts
│   │   ├── pages/                       # Route pages (Dashboard, Resume, CoverLetter, Profile)
│   │   ├── services/                    # Axios API client services
│   │   └── templates/                   # HTML/CSS Resume Render Templates for Playwright
│   ├── index.html
│   ├── tailwind.config.js
│   └── vite.config.js
├── backend/                              # FastAPI Clean Architecture Engine
│   ├── api/                             # Router endpoints (v1 routes & legacy adapters)
│   │   └── v1/                          # Versioned modular routers (auth, resume, jobs, etc.)
│   ├── app/                             # Core AI logic, templates & AI services
│   │   ├── ai_service.py                # Primary AI orchestration & DeepSeekProvider
│   │   ├── llm/                         # Provider-neutral LLM client abstractions
│   │   ├── playwright_pdf.py            # Chromium PDF rendering pipeline
│   │   └── schemas.py                   # Pydantic data schemas
│   ├── core/                            # System config, security, database pool, observability
│   ├── repositories/                    # Database access repositories (PostgreSQL & Supabase)
│   ├── services/                        # Business logic engines (Tailoring, Auth, Job, Cache)
│   ├── templates/                       # Jinja2 / HTML templates for PDF rendering
│   ├── main.py                          # Application entry point & FastAPI setup
│   └── requirements.txt
├── supabase/                            # Database migrations, seed data & SQL DDL
├── docker-compose.yml                   # Local development container orchestration
└── README.md                            # Workspace root entry point
```

---

## 6. Coding Standards & Conventions

### Backend (Python / FastAPI)
- **Typing**: Enforce strict Python type hints (`typing.Dict`, `Optional`, `List`, `Pydantic` models).
- **Asynchronous Execution**: Use `async`/`await` for I/O operations (database queries, HTTP calls, Playwright execution).
- **Error Handling**: Raise standard `HTTPException` with consistent error payload structures (`{"detail": "..."}`). Avoid silent exception masking.
- **Database Access**: Perform database mutations through designated Repositories rather than raw inline SQL inside HTTP routers.

### Frontend (React / JavaScript)
- **Component Design**: Modular, reusable React components with clean prop types.
- **Styling**: TailwindCSS with CSS variables for dark-mode support. Avoid hardcoded pixel inline styles.
- **State Management**: React Context for global user auth & settings; local state (`useState`, `useReducer`) for complex form inputs.

---

## 7. UI/UX Philosophy

- **Aesthetics**: Premium, modern dark-mode aesthetic utilizing deep obsidian backgrounds (`#0B0F17`), sleek glassmorphism panels, harmonious indigo/violet accents (`#6366F1`), and polished typography.
- **Feedback & Micro-Animations**: Smooth visual transitions via Framer Motion for loading states, ATS score radial indicators, and toast notifications.
- **Zero-Friction Editing**: Instant side-by-side preview of original vs. tailored bullet points with single-click accept/reject controls.

---

## 8. Cross-Reference Index

- For System Architecture & Flow: see [ARCHITECTURE.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/ARCHITECTURE.md)
- For Frontend Architecture & Design System: see [FRONTEND.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/FRONTEND.md)
- For Backend Architecture & Engine Specification: see [BACKEND.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/BACKEND.md)
- For Redis Caching System: see [CACHING.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/CACHING.md)
- For Cloudflare R2 / Object Storage: see [CLOUDFLARE_R2.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/CLOUDFLARE_R2.md)
- For Resend Email Integration: see [EMAIL_RESEND.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/EMAIL_RESEND.md)
- For Auth & Google OAuth: see [AUTH_OAUTH.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/AUTH_OAUTH.md)
- For Database Schemas & Storage: see [DATABASE.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/DATABASE.md)
- For REST API Endpoint Specifications: see [API_CONTRACTS.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/API_CONTRACTS.md)
- For Security & Authentication: see [SECURITY.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/SECURITY.md)
- For Prompts & AI Pipelines: see [PROMPTS.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/PROMPTS.md)
