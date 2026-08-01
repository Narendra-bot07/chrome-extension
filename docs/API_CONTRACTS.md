# Tailr4U - REST API Contracts & Endpoint Specification

This document provides complete REST API endpoint contracts for the **Tailr4U Backend Engine (`v3.0.0`)**.

---

## 1. Global API Standards

- **Base URL**: `http://localhost:8000/api/v1` (Development) / `https://api.tailr4u.com/api/v1` (Production)
- **Content-Type**: `application/json` (unless handling `multipart/form-data` uploads)
- **Authentication**: HTTP Bearer Token in Request Header:
  ```http
  Authorization: Bearer <supabase_jwt_token>
  ```
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

### 2.1 Register User (`POST /auth/signup`)
- **Purpose**: Creates a new user account in Supabase Auth and initializes a candidate profile record.
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

## 3. Resume Management Router (`/api/v1/resume`)

### 3.1 Upload Master Resume (`POST /resume/upload`)
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

### 3.2 List Master Resumes (`GET /resume/list`)
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

### 4.1 Extract Job Description (`POST /jobs/extract`)
- **Purpose**: Accepts raw scraped DOM text or URL and extracts structured job requirement data.
- **Auth**: Bearer JWT / API Key
- **Request Body**:
  ```json
  {
    "company_name": "Google",
    "job_title": "Senior AI Systems Engineer",
    "job_url": "https://careers.google.com/jobs/results/12345",
    "raw_html_or_text": "We are seeking a Senior AI Systems Engineer with expertise in Python, FastAPI, distributed caching..."
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "job_id": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
    "company_name": "Google",
    "job_title": "Senior AI Systems Engineer",
    "extracted_keywords": ["Python", "FastAPI", "Distributed Caching", "LangChain", "PostgreSQL"],
    "experience_level": "Senior",
    "cleaned_description": "We are seeking a Senior AI Systems Engineer..."
  }
  ```

---

## 5. AI Resume Tailoring Router (`/api/v1/tailor`)

### 5.1 Tailor Resume for Target Job (`POST /tailor/resume`)
- **Purpose**: Invokes `ResilientLLMWrapper` to generate a tailored resume version and calculates ATS match score.
- **Auth**: Bearer JWT Required
- **Request Body**:
  ```json
  {
    "resume_id": "c9d8e7f6-5a4b-3c2d-1e0f-9a8b7c6d5e4f",
    "job_description_id": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
    "target_template": "modern_clean"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "version_id": "98765432-10fe-dcba-ba98-76543210fedc",
    "ats_score": 88,
    "tailored_content": {
      "summary": "Results-driven Senior AI Systems Engineer specializing in Python microservices, FastAPI clean architecture...",
      "experience": [...]
    },
    "tailoring_report": {
      "added_keywords": ["FastAPI", "Distributed Caching"],
      "gaps": ["Kubernetes"],
      "match_percentage": 88
    },
    "rendered_pdf_url": "https://api.tailr4u.com/templates/preview/98765432.pdf"
  }
  ```

---

### 5.2 Generate Cover Letter (`POST /tailor/cover-letter`)
- **Purpose**: Generates a targeted, highly persuasive cover letter tailored to the job description and candidate background.
- **Auth**: Bearer JWT Required
- **Request Body**:
  ```json
  {
    "resume_id": "c9d8e7f6-5a4b-3c2d-1e0f-9a8b7c6d5e4f",
    "job_description_id": "f1e2d3c4-b5a6-7890-1234-567890abcdef",
    "tone": "professional_enthusiastic"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "cover_letter_text": "Dear Hiring Manager at Google,\n\nI am writing to express my strong enthusiasm for the Senior AI Systems Engineer position...",
    "company_name": "Google",
    "job_title": "Senior AI Systems Engineer"
  }
  ```

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
