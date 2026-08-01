<div align="center">

# 🚀 TailorFlow AI — Intelligent Resume Tailoring & ATS Optimization Platform

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-v4_Flash-0066FF?style=for-the-badge&logo=openai&logoColor=white)](https://api.deepseek.com)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_&_Storage-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Upstash](https://img.shields.io/badge/Upstash-Redis_Cloud-00E599?style=for-the-badge&logo=redis&logoColor=white)](https://upstash.com/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?style=for-the-badge&logo=stripe&logoColor=white)](https://stripe.com/)
[![Razorpay](https://img.shields.io/badge/Razorpay-UPI_&_Cards-0C2340?style=for-the-badge&logo=razorpay&logoColor=white)](https://razorpay.com/)
[![Resend](https://img.shields.io/badge/Resend-Email_API-000000?style=for-the-badge&logo=resend&logoColor=white)](https://resend.com/)

**TailorFlow AI** is a production-grade, high-availability resume tailoring system delivered via a **Chrome Extension (Manifest V3)** and a **Web Dashboard**. It enables job seekers to extract active Job Descriptions (JDs) in 1-Click, optimize resumes against ATS filters using **DeepSeek** (`deepseek-v4-flash` / `deepseek-v4-pro`), render dynamic vector templates, and export ATS-ready PDFs.

</div>

---

## 📚 Repository Knowledge Base (`/docs`)

All technical specifications, architecture diagrams, API contracts, database schemas, security threat models, prompts, deployment guides, and changelogs are documented in the central **[`/docs`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs)** directory:

| Document | Description |
| :--- | :--- |
| **[`PROJECT_CONTEXT.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/PROJECT_CONTEXT.md)** | Single source of truth, vision, stack, folder structure & standards |
| **[`FRONTEND.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/FRONTEND.md)** | Detailed frontend architecture, design tokens, color palette, glassmorphism & micro-animations |
| **[`BACKEND.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/BACKEND.md)** | Detailed backend architecture, Clean 4-Layer design, DB connection pool, Resilient LLM failover & Playwright PDF engine |
| **[`CACHING.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/CACHING.md)** | Upstash Redis TLS & REST API caching, SHA-256 content key hashing, TTL policies & fallbacks |
| **[`CLOUDFLARE_R2.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/CLOUDFLARE_R2.md)** | Cloudflare R2 / S3 blob storage, bucket visibility, presigned URLs & asset path mappings |
| **[`EMAIL_RESEND.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/EMAIL_RESEND.md)** | Resend REST API email engine, SMTP relay failover, HTML shell templates & transactional security flows |
| **[`AUTH_OAUTH.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/AUTH_OAUTH.md)** | Supabase Auth, Google OAuth 2.0 PKCE flow, Bearer JWT session validation & Chrome Extension SSO sync |
| **[`ARCHITECTURE.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/ARCHITECTURE.md)** | Technical architecture, data flow diagrams & sub-system breakdowns |
| **[`DATABASE.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/DATABASE.md)** | PostgreSQL DDL schemas, ERD, indexes, constraints & storage links |
| **[`API_CONTRACTS.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/API_CONTRACTS.md)** | Complete REST API endpoint contracts, schemas, headers & error payloads |
| **[`SECURITY.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/SECURITY.md)** | Auth flows, JWT, RLS policies, rate-limiting & threat model |
| **[`OBSERVABILITY.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/OBSERVABILITY.md)** | LangSmith prompt tracing, health probes (`/live`, `/ready`) & Sentry |
| **[`DEPLOYMENT.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/DEPLOYMENT.md)** | Environments, `.env` schema, Docker, Render, Vercel & CI/CD workflows |
| **[`DECISIONS.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/DECISIONS.md)** | Architecture Decision Records (ADRs) tracking core design choices |
| **[`ROADMAP.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/ROADMAP.md)** | Milestone features, release history & future version roadmap |
| **[`PROMPTS.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/PROMPTS.md)** | Archive of production LLM prompts & structured JSON output schemas |
| **[`KNOWN_ISSUES.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/KNOWN_ISSUES.md)** | Active bug register, root cause analyses & remediation status |
| **[`TODOS.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/TODOS.md)** | Prioritized task backlog (P0 Critical through P4 Long-Term) |
| **[`CHANGELOG.md`](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/docs/CHANGELOG.md)** | Semantic version release history and security updates |

---

## 🛠️ Technology Stack & Badges

### **Frontend & Extension Layer**
| Technology | Badge | Description |
| :--- | :--- | :--- |
| **React 18** | ![React](https://img.shields.io/badge/-React_18-61DAFB?style=flat-square&logo=react&logoColor=black) | UI library for web app and extension sidepanel |
| **Vite 5** | ![Vite](https://img.shields.io/badge/-Vite_5-646CFF?style=flat-square&logo=vite&logoColor=white) | Ultra-fast frontend compiler & dev server |
| **Vanilla CSS** | ![CSS3](https://img.shields.io/badge/-Vanilla_CSS-1572B6?style=flat-square&logo=css3&logoColor=white) | Design system with glassmorphism & dark mode tokens |
| **Chrome Extension** | ![Chrome](https://img.shields.io/badge/-Manifest_V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white) | Background service worker & active tab job scraper |

### **Backend & AI Intelligence**
| Technology | Badge | Description |
| :--- | :--- | :--- |
| **FastAPI** | ![FastAPI](https://img.shields.io/badge/-FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white) | High-performance asynchronous Python REST server |
| **Pydantic V2** | ![Pydantic](https://img.shields.io/badge/-Pydantic_V2-E92063?style=flat-square&logo=pydantic&logoColor=white) | Strict schema validation for request/response payloads |
| **DeepSeek** | ![DeepSeek](https://img.shields.io/badge/-DeepSeek_v4-0066FF?style=flat-square&logo=openai&logoColor=white) | Primary AI LLM for parsing, scoring, and tailoring (`deepseek-v4-flash` / `pro`) |
| **LangChain** | ![LangChain](https://img.shields.io/badge/-LangChain-1C3C3C?style=flat-square&logo=langchain&logoColor=white) | Structured output parsing and prompt orchestration |

### **Database, Cloud Storage & Caching**
| Technology | Badge | Description |
| :--- | :--- | :--- |
| **Supabase PostgreSQL** | ![Supabase](https://img.shields.io/badge/-PostgreSQL_15-3FCF8E?style=flat-square&logo=supabase&logoColor=white) | Managed relational database (10 indexed tables, RLS) |
| **Supabase Storage** | ![Supabase](https://img.shields.io/badge/-Storage_Buckets-3FCF8E?style=flat-square&logo=supabase&logoColor=white) | Cloud binary blob storage for PDFs & DOCX files |
| **Upstash Redis** | ![Redis](https://img.shields.io/badge/-Upstash_Redis-00E599?style=flat-square&logo=redis&logoColor=white) | Sub-50ms REST API caching for AI outputs & JDs |

### **Payments & Email Services**
| Technology | Badge | Description |
| :--- | :--- | :--- |
| **Stripe** | ![Stripe](https://img.shields.io/badge/-Stripe-635BFF?style=flat-square&logo=stripe&logoColor=white) | International payment checkout & subscriptions |
| **Razorpay** | ![Razorpay](https://img.shields.io/badge/-Razorpay-0C2340?style=flat-square&logo=razorpay&logoColor=white) | Domestic India region geo-routed checkout & UPI |
| **Resend** | ![Resend](https://img.shields.io/badge/-Resend_API-000000?style=flat-square&logo=resend&logoColor=white) | Transactional email delivery with SMTP fallback |

---

## ✨ Key System Features

- ⚡ **1-Click Active Tab JD Extraction**: Instantly scrapes and normalizes job descriptions from **LinkedIn**, **Indeed**, **Greenhouse**, and **Lever**.
- 🧠 **Resilient DeepSeek AI Engine**: 100% OpenAI-compatible DeepSeek pipeline (`deepseek-v4-flash` / `deepseek-v4-pro`) with automatic schema escalation.
- 🔒 **Single-Request Concurrency Lock**: Custom `_SINGLE_AI_REQUEST_LOCK` with 1.5s cooling intervals eliminates 429 quota exhaustion errors.
- 🔗 **Social Handle Hyperlink Embedding**: Automatically extracts candidate usernames (e.g. `@Narendra-bot07`) and embeds clickable links across all resume templates.
- 🖼️ **Intelligent Profile Photo Engine**: Seamless 100% gapless cover-scale photo cropping math with automatic visibility control (zero photo UI bloat for resumes without photos).
- 💳 **Dual-Gateway Geo-Routing**: Intelligently routes Indian candidates to **Razorpay** (UPI/Cards) and international candidates to **Stripe**.
- 🚀 **Cloud-Native Infrastructure**: Supabase PostgreSQL + Supabase Storage + Upstash Redis REST Caching + Resend Email Relay.

---

## 🏗️ High-Level System Architecture

```mermaid
graph TD
    subgraph Client Layer
        CE["Chrome Extension (Manifest V3)"]
        WEB["React 18 + Vite Web Dashboard"]
    end

    subgraph API Gateway & Security
        API["FastAPI Server Application"]
        AUTH["Supabase JWT Auth Guard"]
        LOCK["Single-AI-Request Concurrency Lock"]
    end

    subgraph Resilient AI Pipeline
        WRAP["ResilientLLMWrapper"]
        GEMINI_PRIMARY["Primary: Gemini 2.5 Flash"]
        GEMINI_FALLBACK["Fallback: Gemini 2.0 / 1.5 Flash"]
    end

    subgraph Billing Geo-Router
        BILLING["BillingService"]
        STRIPE["Stripe (Global Checkout)"]
        RAZORPAY["Razorpay (India UPI/Cards)"]
    end

    subgraph Data & Cloud Services
        REDIS[("Upstash Redis REST Cache")]
        SUPA_DB[("Supabase PostgreSQL DB")]
        SUPA_STORE[("Supabase Storage Buckets")]
        RESEND["Resend Email REST API"]
    end

    CE -->|HTTP / REST| API
    WEB -->|HTTP / REST| API
    API --> AUTH
    API --> LOCK
    LOCK --> WRAP
    WRAP -->|1st Choice| GEMINI_PRIMARY
    WRAP -->|Failover| GEMINI_FALLBACK
    API --> BILLING
    BILLING -->|Global| STRIPE
    BILLING -->|India| RAZORPAY
    API --> REDIS
    API --> SUPA_DB
    API --> SUPA_STORE
    API --> RESEND
```

---

## 📁 Repository Directory Structure

```text
chrome-extension/
├── backend/                        # FastAPI Backend Application Server
│   ├── api/v1/                     # REST API Endpoint Routers (Resume, Jobs, Tailoring)
│   ├── app/                        # Gemini AI Services, Schemas & Core Pipeline
│   │   ├── billing/                # Stripe & Razorpay Billing Routers & Providers
│   │   ├── gemini_service.py       # ResilientLLMWrapper & Concurrency Lock Engine
│   │   └── schemas.py              # Pydantic V2 Request / Response Schemas
│   ├── core/                       # App Configuration & PostgreSQL Database Connection
│   ├── services/                   # Storage, Caching, Scraper & Email Services
│   │   └── cache/redis_cache.py    # Upstash Redis REST & TLS Cache Service
│   ├── requirements.txt            # Python Dependencies
│   └── main.py                     # FastAPI Application Initialization
├── frontend/                       # React 18 + Vite Web App & Extension Popup
│   ├── src/                        # UI Components, Canvas Layouts & AppContext
│   ├── package.json                # Frontend NPM Dependencies
│   └── vite.config.js              # Vite Build Configuration
├── manifest.json                   # Chrome Extension Manifest V3 Manifest
├── DATABASE_DDL_MIGRATIONS.md      # Supabase PostgreSQL DDL Schemas & Indexes
└── README.md                       # Project Documentation
```

---

## ⚡ Quickstart & Setup Guide

### 1. Prerequisites
* **Python**: `v3.11` or higher
* **Node.js**: `v18.0` or higher
* **Package Managers**: `pip` and `npm`

---

### 2. Backend Setup
```bash
# Navigate to backend directory
cd backend

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env  # Update keys in .env

# Run FastAPI Development Server
uvicorn main:app --reload --port 8000
```

---

### 3. Frontend Setup
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite Development Server
npm run dev
```

---

### 4. Chrome Extension Setup
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the project root folder containing `manifest.json`.

---

## 🔑 Environment Variables Reference (`backend/.env`)

```env
# AI Engine Credentials
GEMINI_API_KEY=AIzaSy...

# Supabase Managed Database & Storage
SUPABASE_URL=https://yxgkgwrjbqssgdpugygq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...
SUPABASE_ANON_KEY=eyJhbGciOiJI...
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres

# Upstash Redis Cloud Caching
UPSTASH_REDIS_REST_URL=https://topical-katydid-92319.upstash.io
UPSTASH_REDIS_REST_TOKEN=gQAAAAAAAWif...

# Email Relay Service
RESEND_API_KEY=re_123456789...

# Payment Gateways
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=key_secret_...
```

---

## 📡 API Endpoint Overview

| Method | Endpoint | Description | Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/jobs/extract-url` | Scrapes job details from active browser tab URL | JWT |
| `POST` | `/api/v1/resumes/upload` | Stores candidate PDF/DOCX in Supabase Storage | JWT |
| `POST` | `/api/v1/resumes/{id}/parse` | Structured AI resume parsing | JWT |
| `POST` | `/api/v1/tailor` | Generates tailored resume modifications matching JD | JWT |
| `POST` | `/api/v1/compare` | Calculates exact ATS match score & keyword gaps | JWT |
| `POST` | `/api/v1/cover-letter/generate` | Drafts tailored cover letter | JWT |
| `POST` | `/api/v1/billing/checkout` | Generates Geo-routed Stripe or Razorpay checkout | JWT |
| `POST` | `/api/v1/billing/webhook/stripe` | Cryptographic Stripe webhook callback | Signature |
---

## 🔄 GitHub Actions Automation Workflows

We have implemented 3 automated GitHub Actions workflows under `.github/workflows/`:

| Workflow File | Trigger | Purpose |
| :--- | :--- | :--- |
| [ci.yml](file:///.github/workflows/ci.yml) | `push` / `pull_request` on `main` & `develop` | Runs Python backend verification, Node 20 Vite production build, and packages Chrome Extension ZIP artifact. |
| [db-migration-check.yml](file:///.github/workflows/db-migration-check.yml) | `push` to `migrations/` or `DATABASE_DDL_MIGRATIONS.md` | Validates Supabase PostgreSQL DDL migration syntax to prevent breaking schema changes. |
| `cd-deploy-backend.yml` | `push` to `main` (Post-CI) | Automated continuous deployment of FastAPI server to cloud platform. |

For full setup guidelines and required repository secrets, see [GITHUB_ACTIONS_WORKFLOW_SPECIFICATION.md](file:///e:/PICTURES/OneDrive/Desktop/chrome-extension/GITHUB_ACTIONS_WORKFLOW_SPECIFICATION.md).

---

## 📄 License & Attribution

Distributed under the **MIT License**. See `LICENSE` for more information.  
Built with ❤️ by **TailorFlow AI Team**.
