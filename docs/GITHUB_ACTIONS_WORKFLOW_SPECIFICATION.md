# TailorFlow AI — Suggested GitHub Actions Workflow Specification

---

## 1. Overview of GitHub Actions Workflows

To ensure production stability, zero-downtime deployments, and automated testing across the **Chrome Extension**, **React Web Dashboard**, and **FastAPI Backend**, we have implemented and recommended the following **3 GitHub Actions Workflows**:

```text
.github/
└── workflows/
    ├── ci.yml                    # Main CI (Backend Python Tests + Frontend Vite Build + Extension Packaging)
    ├── db-migration-check.yml    # Database Migration Safety Verification (Supabase SQL Check)
    └── cd-deploy-backend.yml     # Continuous Deployment (FastAPI Deployment to Cloud)
```

---

## 2. Detailed Workflow Specifications

### Workflow 1: Continuous Integration (`.github/workflows/ci.yml`)
* **Trigger**: On `push` or `pull_request` to `main` and `develop` branches.
* **Job 1 (`backend-ci`)**:
  * Sets up Python 3.11 with `pip` dependency caching.
  * Installs `backend/requirements.txt`.
  * Executes backend module import verification (`python -c "import main"`).
  * Runs `pytest` unit & integration tests.
* **Job 2 (`frontend-ci`)**:
  * Sets up Node.js 20 with `npm` dependency caching.
  * Runs `npm ci` and `npm run build` to verify Vite production bundle compilation.
* **Job 3 (`extension-package`)**:
  * Bundles `manifest.json`, compiled `dist/`, and backend assets into a `chrome-extension-bundle.zip` artifact downloadable directly from GitHub Actions summary.

---

### Workflow 2: Database Migration Safety Check (`.github/workflows/db-migration-check.yml`)
* **Trigger**: Whenever changes occur in `backend/supabase/migrations/**` or `DATABASE_DDL_MIGRATIONS.md`.
* **Purpose**:
  * Prevents destructive schema changes (e.g. dropping columns or tables without rollback paths).
  * Validates SQL DDL syntax before applying migrations to production Supabase PostgreSQL.

---

### Workflow 3: Continuous Deployment (`.github/workflows/cd-deploy-backend.yml`)
* **Trigger**: On `push` to `main` branch after CI tests pass.
* **Purpose**:
  * Deploys the FastAPI server to cloud platforms (Render / Railway / AWS ECS / Fly.io).
  * Executes DB migration scripts (`backend/migrate_*.py`).

---

## 3. GitHub Secrets Configuration Guide

To enable these workflows, set the following secrets under **Repository Settings → Secrets and variables → Actions**:

| Secret Name | Description | Example / Format |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API Key | `AIzaSy...` |
| `SUPABASE_URL` | Supabase Project REST Endpoint | `https://[ref].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Administrative Key | `eyJhbGci...` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis Cloud Endpoint | `https://topical-katydid-92319.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis Cloud Auth Token | `gQAAAAAAAWif...` |
| `RESEND_API_KEY` | Resend Email API Key | `re_123456789...` |
| `STRIPE_SECRET_KEY` | Stripe Secret API Key | `sk_live_...` |
| `RAZORPAY_KEY_ID` | Razorpay Key ID | `rzp_live_...` |
