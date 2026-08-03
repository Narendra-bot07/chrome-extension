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

### Render build settings for the backend

The backend PDF renderer depends on React source under `frontend/`, so the Render service must have access to the entire repository:

```text
Root Directory:       (blank)
Build Command:        bash backend/render-build.sh
Start Command:        cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
```

Do not set Root Directory to `backend`. Render excludes files outside a configured root directory, which would make `frontend/` unavailable and prevent creation of `backend/pdf_renderer_dist/index.html`. A successful startup logs `[PDF-RENDERER] Mounted static renderer from .../backend/pdf_renderer_dist`.

> The block below is corrected to match the actual Pydantic `Settings` fields in `backend/core/config.py` and `backend/.env.example` (the source of truth — consult it directly for any var not listed here). `PROJECT_NAME` and `API_V1_STR` are internal defaults, not meant to be overridden per-deployment; there is no `PORT` setting (Uvicorn's `--port` / the host platform's `$PORT` controls this, not an app setting).

```ini
# --- Application Config ---
FRONTEND_URL="https://tailr4u.com"

# --- Database ---
DATABASE_URL="postgresql://postgres:password@db.your-project.supabase.co:5432/postgres"

# --- Custom Auth (self-issued JWT — NOT Supabase Auth, see SECURITY.md) ---
JWT_SECRET="a-long-random-secret"
JWT_ALGORITHM="HS256"
JWT_EXPIRE_MINUTES=30
REFRESH_TOKEN_DAYS=30

# --- Supabase (Postgres host + storage/service-role keys; not used for auth) ---
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."
SUPABASE_ANON_KEY="eyJhbGciOi..."

# --- Redis Caching (Upstash) ---
UPSTASH_REDIS_URL="rediss://default:password@redis-host.upstash.io:6379"
UPSTASH_REDIS_REST_URL="https://your-instance.upstash.io"
UPSTASH_REDIS_REST_TOKEN="AX..."

# --- LLM Redis Caching Layer (TTLs, see CACHING.md) ---
LLM_CACHE_ENABLED=true
LLM_CACHE_NAMESPACE="tailr4u"
LLM_CACHE_TTL_JD_SECONDS=604800
LLM_CACHE_TTL_TAILORING_SECONDS=86400

# --- AI Provider (DeepSeek — sole LLM provider) ---
DEEPSEEK_API_KEY="sk-..."
DEEPSEEK_BASE_URL="https://api.deepseek.com"
DEEPSEEK_MODEL_FLASH="deepseek-v4-flash"
DEEPSEEK_MODEL_PRO="deepseek-v4-pro"
LLM_PROVIDER="deepseek"

# --- Email (Resend primary, SMTP fallback) ---
RESEND_API_KEY="re_..."
SMTP_HOST=""
SMTP_PORT=587

# --- Observability (LangSmith) ---
LANGSMITH_TRACING=true
LANGSMITH_API_KEY="lsv2_pt_..."
LANGSMITH_PROJECT="tailr4u-production"
LANGSMITH_ENDPOINT="https://api.smith.langchain.com"

# --- Error Telemetry (Sentry — three separate DSNs, one per surface) ---
SENTRY_BACKEND_DSN="https://key@sentry.io/backend-project"
SENTRY_FRONTEND_DSN="https://key@sentry.io/frontend-project"
SENTRY_EXTENSION_DSN="https://key@sentry.io/extension-project"

# --- Metrics (Prometheus, bearer-token protected) ---
METRICS_ENABLED=true
METRICS_PATH="/internal/metrics"
METRICS_BEARER_TOKEN="a-long-random-token"
```

The full field list (including `OTEL_*` tracing vars, `LLM_CACHE_TTL_*` per-task overrides, `PASSWORD_RESET_MINUTES`, `EMAIL_VERIFICATION_HOURS`) lives in `backend/.env.example` — treat that file, not this doc, as authoritative for exact defaults.

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

### 3.2 Render Native (Non-Docker) Build Command
Render's actual production deployment for this service uses Render's **native Python runtime**, not the Dockerfile above — the Dockerfile is retained for portability/local parity but is not what Render builds from. The Build Command must point at `backend/render-build.sh`:

```bash
#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt
playwright install chromium
```

> **Do not add `--with-deps`** to the `playwright install` call here. That flag shells out to `apt-get install` via `su`, which requires root. Render's native build environment runs as a non-root user with no passwordless sudo, so `--with-deps` fails the build outright with `su: Authentication failure` before the browser is ever downloaded (see [KNOWN_ISSUES.md](KNOWN_ISSUES.md) / [CHANGELOG.md](CHANGELOG.md) 3.7.0). If Render's dashboard Build Command field was configured manually before this script existed, verify it was updated to match — a stale dashboard setting will still fail even though the repo-tracked script is correct.

Because Render's build-machine browser cache does not reliably persist into the deployed runtime container, `main.py`'s `lifespan` startup hook also runs an idempotent `playwright install chromium` on every process boot as a self-healing fallback (see [BACKEND.md](BACKEND.md) §5.2) — so even if the build-time cache doesn't carry over, the app installs Chromium itself before accepting traffic.

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
