# Tailr4U - REST API Contracts & Endpoint Specification

This document provides complete REST API endpoint contracts for the **Tailr4U Backend Engine (`v3.0.0`)**.

---

## 1. Global API Standards

- **Base URL**: `http://localhost:8000/api/v1` (Development) / `https://api.tailr4u.com/api/v1` (Production)
- **Content-Type**: `application/json` (unless handling `multipart/form-data` uploads)
- **Authentication**: HTTP Bearer Token in Request Header:
  ```http
  Authorization: Bearer <session_jwt_token>
  ```
  This is a self-issued HS256 JWT (signed with `JWT_SECRET`, verified in `core/security.py::verify_supabase_jwt`), **not** a Supabase Auth token — see [SECURITY.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/SECURITY.md) §1 for the corrected auth architecture.
- **Standard Error Response Format**:
  ```json
  {
    "detail": "Descriptive error message",
    "error_code": "RESOURCE_NOT_FOUND",
    "timestamp": "2026-08-01T21:55:12Z"
  }
  ```

---

## 2. Authentication Router (`/api/v1/auth`)

### 2.1 Register User (`POST /auth/register`)
- **Purpose**: Creates a new user account (custom bcrypt + JWT auth, not Supabase Auth) and initializes a candidate profile record. Actual route: `backend/api/v1/auth.py:144`.
- **Auth**: None (Public)
- **Request Body**:
  ```json
  {
    "email": "candidate@example.com",
    "password": "SecurePassword123!",
    "full_name": "Narendra Bandi"
  }
  ```
- **Response (`201 Created`)**:
  ```json
  {
    "user": {
      "id": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
      "email": "candidate@example.com",
      "full_name": "Narendra Bandi"
    },
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer"
  }
  ```

---

### 2.2 User Login (`POST /auth/login`)
- **Purpose**: Authenticates user credentials and returns JWT session access tokens.
- **Auth**: None (Public)
- **Request Body**:
  ```json
  {
    "email": "candidate@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "d7890abc...",
    "expires_in": 3600,
    "user": {
      "id": "a1b2c3d4-e5f6-7890-abcd-1234567890ab",
      "tier": "pro"
    }
  }
  ```

---

## 3. Resume Management Router (`/api/v1/resumes`)

> Note the prefix is plural (`resumes`, `backend/api/v1/resume.py:43`). This router also exposes many more routes than shown below (versions, layout, activate, mark-used, recover-source, intelligence, etc.) — see the file directly for the full 20+ route list.

### 3.1 Upload Master Resume (`POST /resumes/upload`)
- **Purpose**: Uploads raw candidate resume file (`PDF` or `DOCX`), parses text structure via AI, and saves to storage.
- **Auth**: Bearer JWT Required
- **Request Format**: `multipart/form-data`
  - `file`: Binary file blob
  - `title`: String (e.g. "Software Engineer Master Resume")
- **Response (`201 Created`)**:
  ```json
  {
    "resume_id": "c9d8e7f6-5a4b-3c2d-1e0f-9a8b7c6d5e4f",
    "title": "Software Engineer Master Resume",
    "file_path": "original-resumes/a1b2c3d4.../resume.pdf",
    "parsed_content": {
      "contact_info": { "name": "Narendra Bandi", "email": "candidate@example.com" },
      "summary": "Experienced Full Stack & AI Engineer...",
      "skills": ["Python", "FastAPI", "React", "PostgreSQL"],
      "experience": [...]
    }
  }
  ```

---

### 3.2 List Master Resumes (`GET /resumes/`)
- **Purpose**: Fetches all master resume files owned by the authenticated candidate.
- **Auth**: Bearer JWT Required
- **Response (`200 OK`)**:
  ```json
  [
    {
      "id": "c9d8e7f6-5a4b-3c2d-1e0f-9a8b7c6d5e4f",
      "title": "Software Engineer Master Resume",
      "is_master": true,
      "created_at": "2026-08-01T12:00:00Z"
    }
  ]
  ```

---

## 4. Job Intelligence Router (`/api/v1/jobs`)

### 4.1 Extract Job Description (`POST /jobs/extract-url`)
- **Purpose**: Accepts a job listing URL plus browser-collected evidence (from the extension's in-page heuristic collector, see `frontend/src/services/jdExtractionFlow.js`) and runs the job extraction graph (`backend/services/job_extraction/`).
- **Auth**: Bearer JWT Required
- **Request Body** (`JobUrlExtractRequest`, `backend/schemas/jobs.py:79`):
  ```json
  {
    "url": "https://careers.google.com/jobs/results/12345",
    "request_id": "optional-idempotency-id",
    "browser_evidence": { "title": "...", "visible_text": "...", "selected_panel_text": "...", "jsonld": [] }
  }
  ```
- **Response (`200 OK`)**: shape varies by extraction outcome — `page_type` of `job_detail` | `job_list` | `non_job`, with `extracted_job` (a `JobAnalysis`, see `backend/schemas/jobs.py`) present only on success. See `frontend/src/services/jdExtractionFlow.js::classifyJDResult` for the full response contract this endpoint is expected to satisfy.

---

## 5. AI Resume Tailoring Router (`/api/v1/tailor`)

### 5.1 Tailor Resume for Target Job (`POST /tailor/`)
- **Purpose**: Invokes the DeepSeek `ResilientLLMWrapper` to generate a tailored resume patch and calculates ATS match score. Actual route: `backend/api/v1/tailoring.py:81`.
- **Auth**: Bearer JWT Required
- **Request Body** (`TailorRequest`, `backend/schemas/tailoring.py:103`):
  ```json
  {
    "resume": { "...": "RenderableResume — the full canonical resume JSON, not a resume_id" },
    "patch": { "...": "ResumePatch — the target job/section instructions" }
  }
  ```
  Unlike a typical `{resume_id, job_description_id}` shape, this endpoint takes the full resume document and patch instructions in-body rather than referencing stored IDs.
- **Related routes on the same router**: `POST /tailor/preservation` (`tailoring.py:19`), `POST /tailor/download-pdf` (`tailoring.py:118`), `GET /tailor/history` (`tailoring.py:211`).

---

### 5.2 Generate Cover Letter (`POST /api/cover-letter/generate`)
- **Purpose**: Generates a targeted cover letter tailored to the job description and candidate background.
- **Auth**: Bearer JWT Required
- **Important**: This is **not** under `/api/v1/tailor` — cover letter routes live in the legacy router (`backend/app/routers/api.py:910`, mounted at the bare `/api` prefix, not `/api/v1`, see `main.py:83`). Related routes on the same legacy router: `POST /api/cover-letter/context`, `POST /api/cover-letter/strategy`, `POST /api/cover-letter/review`, `POST /api/cover-letter/edit/stream`, `POST /api/cover-letter/render`, `POST /api/download-cover-letter-pdf`, `POST /api/refine-section/stream`.
- **Response shape**: see `GeneratedCoverLetter` in `backend/schemas/cover_letter_generation.py`.

---

## 6. Applications Tracker Router (`/api/v1/applications`)

### 6.1 List Applications (`GET /applications/`)
- **Purpose**: Retrieves all tracked job applications for the candidate dashboard.
- **Auth**: Bearer JWT Required
- **Response (`200 OK`)**:
  ```json
  [
    {
      "id": "app_12345",
      "company_name": "Google",
      "job_title": "Senior AI Systems Engineer",
      "status": "INTERVIEWING",
      "applied_at": "2026-08-01T14:30:00Z"
    }
  ]
  ```

---

## 7. Health & Observability Router (`/health`, `/live`, `/ready`)

### 7.1 Liveness Probe (`GET /live`)
- **Response (`200 OK`)**: `{"status": "alive"}`

### 7.2 Readiness Probe (`GET /ready`)
- **Response (`200 OK`)**: `{"status": "ready", "database": "connected", "redis": "connected"}`

### 7.3 Observability Status (`GET /api/observability/status`)
- **Response (`200 OK`)**: `{"langsmith_enabled": true, "project": "tailr4u-prod"}`
- Note: this is a standalone route defined directly in `main.py:106`, not part of `health.py`.

---

## 8. Additional Routers (previously undocumented)

All mounted under `/api/v1` via `backend/api/router.py` unless noted. This list exists so the endpoint inventory above isn't mistaken for the complete API surface — each of these is a real, live router with request/response schemas defined under `backend/schemas/`.

| Router | Prefix | File |
| :--- | :--- | :--- |
| Analytics | `/api/v1/analytics` | `backend/api/v1/analytics.py` |
| Profile | `/api/v1/profile` | `backend/api/v1/profile.py` |
| Sessions | `/api/v1/sessions` | `backend/api/v1/sessions.py` |
| Support | `/api/v1/support` | `backend/api/v1/support.py` |
| Plans | `/api/v1/plans` | `backend/api/v1/plans.py` |
| Subscription | `/api/v1/subscription` | `backend/api/v1/subscription.py` |
| Usage | `/api/v1/usage` | `backend/api/v1/usage.py` |
| Admin Subscriptions | `/api/v1/admin` | `backend/api/v1/admin_subscriptions.py` |
| Admin Abuse | `/api/v1/admin/abuse` | `backend/api/v1/admin_abuse.py` |
| Job Preferences | `/api/v1/job-preferences` | `backend/api/v1/job_preferences.py` |
| Workflows | `/api/v1/workflows` | `backend/api/v1/workflows.py` |
| Billing | `/api/v1/billing` | `backend/app/billing/routers/billing.py` (Stripe + Razorpay checkout & webhooks) |
| Notifications | `/api/v1/notifications` | `backend/api/v1/notifications.py` |
| Reminders | `/api/v1/reminders` | `backend/api/v1/notifications.py` (`reminder_router`) |

The legacy router (`backend/app/routers/api.py`, mounted at bare `/api` — no `/v1`) additionally hosts cover-letter generation, section refinement, and PDF download routes retained for backward compatibility with older frontend builds.
