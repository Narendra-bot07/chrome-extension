# Tailr4U - Deployment, DevOps & Infrastructure Specification

This document details the multi-environment deployment strategy, environment variables schema, GitHub Actions CI/CD pipelines, container specifications, and rollback procedures for **Tailr4U**.

---

## 1. Environments Overview

| Environment | Host Provider | URL / Base Endpoint | Deployment Trigger |
| :--- | :--- | :--- | :--- |
| **Development** | Local / Docker Compose | `http://localhost:8000` (API) / `:5173` (Web) | Local execution |
| **Staging** | Render (API) / Vercel (Web) | `https://staging-api.tailr4u.com` | Push to `develop` branch |
| **Production** | Render (API) / Vercel (Web) | `https://api.tailr4u.com` / `https://tailr4u.com` | Push to `main` branch |

---

## 2. Master Environment Variables Specification (`.env`)

```ini
# --- Application Config ---
PROJECT_NAME="Tailr4U Enterprise Engine"
API_V1_STR="/api/v1"
PORT=8000
FRONTEND_URL="https://tailr4u.com"

# --- Database & Supabase ---
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."
SUPABASE_JWT_SECRET="super-secret-jwt-key"
DATABASE_URL="postgresql://postgres:password@db.your-project.supabase.co:5432/postgres"

# --- Redis Caching ---
REDIS_URL="redis://default:password@redis-host.com:6379"

# --- AI Provider (DeepSeek — sole LLM provider) ---
DEEPSEEK_API_KEY="sk-..."
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL_FLASH="deepseek-v4-flash"
DEEPSEEK_MODEL_PRO="deepseek-v4-pro"
LLM_PROVIDER="deepseek"

# --- Observability (LangSmith) ---
LANGSMITH_TRACING=true
LANGSMITH_API_KEY="lsv2_pt_..."
LANGSMITH_PROJECT="tailr4u-production"
LANGSMITH_ENDPOINT="https://api.smith.langchain.com"

# --- Error Telemetry (Sentry) ---
SENTRY_DSN="https://key@sentry.io/project"
```

---

## 3. Container & Build Specifications

### 3.1 Backend Dockerfile (`backend/Dockerfile`)
The backend image installs system dependencies for Headless Chromium (Playwright) alongside Python 3.12.

```dockerfile
FROM python:3.12-slim

# Install Playwright dependencies & Chromium
RUN apt-get update && apt-get install -y \
    curl \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN playwright install chromium --with-deps

COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 4. GitHub Actions CI/CD Pipelines

Workflow specifications are maintained under `.github/workflows/`:

```mermaid
graph TD
    PUSH["Git Push to 'main'"]
    TESTS["Backend pytest & Playwright PDF Audit"]
    LINT["ESLint & React Build Check"]
    DEPLOY_BACKEND["Deploy Backend Container to Render"]
    DEPLOY_FRONTEND["Deploy React App to Vercel"]
    NOTIFY["Send Deployment Status Notification"]

    PUSH --> TESTS
    PUSH --> LINT
    TESTS --> DEPLOY_BACKEND
    LINT --> DEPLOY_FRONTEND
    DEPLOY_BACKEND --> NOTIFY
    DEPLOY_FRONTEND --> NOTIFY
```

### Key Workflow Files
- `.github/workflows/backend-ci.yml`: Runs backend linting (`flake8`), type checking (`mypy`), and test suite (`pytest`).
- `.github/workflows/playwright-pdf.yml`: Validates headless Chromium PDF vector rendering.

---

## 5. Release & Rollback Strategy

### 5.1 Release Checklist
1. All unit and integration tests pass on `develop` branch.
2. Database DDL migration scripts applied to target PostgreSQL database using Supabase CLI.
3. Version incremented in `main.py` (`version="3.0.0"`) and `docs/CHANGELOG.md`.
4. Pull request merged to `main` branch.

### 5.2 Emergency Rollback Protocol
- **Backend (Render)**: Revert to previous image tag instantly via Render Deployment History dashboard or CLI (`render deploys rollback`).
- **Frontend (Vercel)**: Instant rollback to previous deployment commit hash via Vercel CLI (`vercel rollback`).
- **Database Schema**: Every DDL migration includes a corresponding `down` migration SQL script to reverse schema alterations without data loss.

---

## 6. Post-DeepSeek Migration — Manual Secret Removal Checklist

> ⚠️ **IMPORTANT**: Obsolete Gemini and Groq secrets must be removed **manually** from all platforms. Do NOT automate secret deletion.

After confirming DeepSeek is fully operational in production:

### 6.1 Render Dashboard
1. Navigate to **Render → Service → Environment**.
2. Delete the following variables if present:
   - `GEMINI_API_KEY`
   - `GOOGLE_GENERATIVE_AI_API_KEY`
   - `GROQ_API_KEY`
   - `GEMINI_MODEL`
   - `GROQ_MODEL`
   - `LLM_FALLBACK_PROVIDER`

### 6.2 GitHub Actions Secrets
1. Navigate to **Settings → Secrets and Variables → Actions**.
2. Delete:
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY`

### 6.3 Local `.env` Files
Remove from all `.env` files:
```bash
# DELETE THESE:
# GEMINI_API_KEY=...
# GROQ_API_KEY=...
# GEMINI_MODEL=...
# GROQ_MODEL=...
```

### 6.4 Revocation
- Revoke the old Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey).
- Revoke the old Groq API key in [Groq Console](https://console.groq.com/keys).

### 6.5 Verification
- Monitor Render logs for 24 hours to confirm zero Gemini/Groq traffic.
- Verify DeepSeek billing activity in [DeepSeek Platform](https://platform.deepseek.com/).
- Confirm no old provider errors appear in Sentry.
