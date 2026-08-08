# Tailr4U — Observability, Monitoring & Alerting Runbook

> **Stack**: FastAPI (Render) · React/Vite (Vercel) · Chrome Extension · Supabase PostgreSQL · Upstash Redis · Cloudflare R2 · DeepSeek API · Resend · GitHub Actions
>
> **Tools**: Sentry Cloud · Prometheus client · Grafana Cloud · OpenTelemetry · UptimeRobot · Structured JSON logs

> **Note**: There is no in-app admin dashboard for metrics/requests — that was removed. `/admin/observability` and its backend router (`api/v1/admin_observability.py`) were a stopgap web view over the same Prometheus registry `/metrics` exposes; it duplicated what Grafana is meant to own and never had retention beyond a live process. All observability now flows through Sentry, Prometheus (`/metrics`), and Grafana Cloud as described below. `/admin/users` (user list/roles/suspend) is unrelated and still exists.

---

## 1. Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                      Tailr4U Components                    │
│  FastAPI Backend  ·  React Frontend  ·  Chrome Extension   │
└──────┬────────────────────┬──────────────────────┬─────────┘
       │                    │                      │
       ▼                    ▼                      ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│ Sentry Cloud │  │ Grafana Cloud    │  │ UptimeRobot          │
│ (Errors +    │  │ ├─ Prometheus    │  │ (External uptime     │
│  Perf traces)│  │ ├─ Loki logs     │  │  checks every 5 min) │
└──────────────┘  │ ├─ Tempo traces  │  └──────────────────────┘
                  │ └─ Dashboards +  │
                  │    Alerting      │
                  └──────────────────┘
                         ▲                    ▲
              backend pushes its own    OTLP traces pushed
              Prometheus registry via   directly from the app
              remote_write every 30s    (observability/tracing.py)
              (observability/remote_write.py)
```

Render runs the API as a single process with no sidecar, so metrics are **pushed from the app itself** on an interval rather than pulled by an external scraper — see §5.

---

## 2. Environment Variables Reference

All observability variables must be set in the backend `.env` (Render dashboard in production) and in the frontend Vercel project environment variables.

### 2.1 Backend (Render)

| Variable | Required | Purpose |
|---|---|---|
| `OBSERVABILITY_ENABLED` | Yes | Master switch — set `true` in all non-local envs |
| `APP_ENV` | Yes | `local` / `staging` / `production` |
| `APP_RELEASE` | Yes | `tailr4u-api@1.2.3` — set in CI via git tag |
| `SERVICE_NAME` | No | `tailr4u-api` (default) |
| `SENTRY_BACKEND_DSN` | Yes | From Sentry project settings (Python FastAPI project) |
| `SENTRY_TRACES_SAMPLE_RATE` | No | `0.05` (5 %) for prod |
| `SENTRY_PROFILES_SAMPLE_RATE` | No | `0` for prod until needed |
| `METRICS_ENABLED` | Yes | `true` |
| `METRICS_PATH` | No | `/metrics` (default and Prometheus convention) |
| `METRICS_BEARER_TOKEN` | Yes | Random 32-char secret; protects the raw `/metrics` pull endpoint (still available for manual `curl`/debugging even though nothing scrapes it in prod) |
| `GRAFANA_CLOUD_PROM_REMOTE_WRITE_URL` | Yes | From Grafana Cloud → My Account → your stack → Prometheus card. Blank = push disabled. |
| `GRAFANA_CLOUD_PROM_USERNAME` | Yes | Numeric instance ID shown on the same Prometheus card |
| `GRAFANA_CLOUD_PROM_API_KEY` | Yes | API key generated on the same Prometheus card |
| `GRAFANA_CLOUD_PROM_PUSH_INTERVAL_SECONDS` | No | `30` (default) |
| `OTEL_ENABLED` | No | `false` until Grafana Tempo is wired up |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | Grafana Cloud OTLP endpoint when enabled |
| `OTEL_EXPORTER_OTLP_HEADERS` | No | `Authorization=Basic <base64-creds>` |
| `LOG_LEVEL` | No | `INFO` for prod |
| `LOG_FORMAT` | No | `json` for prod |

### 2.2 Frontend (Vercel)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SENTRY_DSN` | Yes | From Sentry project (React project) — matches `frontend/.env.example`; the code reads this exact name, not `VITE_SENTRY_FRONTEND_DSN` |
| `VITE_APP_ENV` | Yes | `production` |
| `VITE_APP_RELEASE` | Yes | Set by GitHub Actions on deploy |

### 2.3 Chrome Extension

The extension DSN constant is currently a hardcoded string at the top of `background.js` (empty by default). `content_snapshot.js` was removed as orphaned dead code — it was never referenced by the manifest or injected anywhere; the actual JD collector is `frontend/src/services/jdExtractionFlow.js`, which reports errors through the web app's normal Sentry frontend integration rather than its own DSN constant. Set `SENTRY_EXTENSION_DSN` before publishing a Chrome Web Store build.

---

## 3. Health Probe Endpoints

| Endpoint | Purpose | Auth | Expected Response |
|---|---|---|---|
| `GET /live` | Liveness — process alive | None | `200 Process is running.` |
| `GET /ready` | Readiness — DB + Redis + Storage reachable | None | `200` or `503` |
| `GET /health` | High-level component status for dashboards | None | `200 {"status":"healthy",...}` |
| `GET /api/observability/status` | LangSmith config status | None | `200 {...}` |
| `GET /metrics` | Prometheus metrics scrape | Bearer token | `200 text/plain; version=0.0.4` |

### 3.1 Render Health Check Configuration

In Render dashboard → Service → Health & Alerts:

```
Health Check Path:  /ready
Initial Delay:      30s
Period:             10s
Failure Threshold:  3
```

---

## 4. Prometheus Metrics Catalogue

All metrics are exported at `GET /metrics` (requires `Authorization: Bearer <METRICS_BEARER_TOKEN>`).

### 4.1 HTTP Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `http_requests_total` | Counter | `method, route, status_class` | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | `method, route` | Request latency buckets |
| `http_requests_in_progress` | Gauge | `method, route` | Concurrent active requests |

### 4.2 Business / Workflow Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `resume_tailoring_requests_total` | Counter | `status` | Resume tailoring lifecycle |
| `resume_tailoring_duration_seconds` | Histogram | `status` | End-to-end tailoring latency |
| `resume_generation_total` | Counter | `status, template` | Rendered resume documents |
| `cover_letter_generation_total` | Counter | `status` | Cover letter completions |
| `jd_extraction_total` | Counter | `status, source_type` | JD extraction from URL/text |
| `pdf_render_total` | Counter | `status` | PDF render outcomes |
| `pdf_render_duration_seconds` | Histogram | `status` | Playwright PDF render latency |
| `notification_delivery_total` | Counter | `channel, status` | Email sends via Resend |

### 4.2a JD Extraction Worker Metrics (added 2026-08-09, actually wired and emitting)

Unlike the AI-governance guardrail metrics in §4.3a below (defined but dead until a feature migrates to the gateway), these are called from live code today — `.labels(...).observe()`/`.inc()` fires from inside `extraction_agent` (`services/job_extraction/agents.py`) and `extract_job_from_provided_url` (`api/v1/jobs.py`) on every real request. Added as part of the [3.17.0](CHANGELOG.md) Pro-only/four-worker JD extraction rewrite — see [JD_EXTRACTION_ENGINE_DOCUMENTATION.md](JD_EXTRACTION_ENGINE_DOCUMENTATION.md) §8.18. No label ever carries a URL, company name, user ID, or job ID.

| Metric | Type | Labels | Description |
|---|---|---|---|
| `jd_extraction_stage_duration_seconds` | Histogram | `stage, status` | Per-stage latency (`cache_lookup`, `deterministic_extraction`, `time_to_first_result`, `time_to_minimum_ready`, `semantic_extraction`, `total_extraction`) |
| `jd_worker_duration_seconds` | Histogram | `worker, status, attempt` | Latency of each of the 4 Pro workers (`role`/`skills`/`responsibilities`/`requirements`), `attempt` = `initial`/`retry` |
| `jd_worker_output_tokens` | Counter | `worker` | Estimated output tokens per worker (chars/4 heuristic) |
| `jd_extraction_worker_failures_total` | Counter | `worker, reason, attempt` | Worker failures (`reason` = exception class name) and their targeted retries |
| `jd_worker_timeout_total` | Counter | `worker, attempt` | Workers that hit the per-call timeout specifically (subset of the failures above) |
| `jd_extraction_cache_total` | Counter | `status` | URL-level result cache lookups (§8 in [CACHING.md](CACHING.md)) — `hit`/`miss` |
| `jd_cache_lookup_seconds` | Histogram | `status` | Latency of that same cache lookup |
| `jd_deterministic_extraction_seconds` | Histogram | — | Latency of the zero-LLM deterministic baseline pass |
| `jd_time_to_first_result_seconds` | Histogram | — | Time from extraction start to the first worker resolving |
| `jd_time_to_minimum_ready_seconds` | Histogram | `status` | Time until title/company/description/skills-or-requirements/responsibilities are all present (`status` = `success`/`partial`) — not yet exposed to the frontend as an early-continue signal, see §8.18's "not yet done" note |
| `jd_total_extraction_seconds` | Histogram | `status` | End-to-end latency including the URL-level cache check |
| `jd_partial_completion_total` | Counter | `reason` | Extractions where fewer than 4/4 workers succeeded (`reason` = `deadline`/`worker_failure`) |

### 4.3 LLM Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `llm_requests_total` | Counter | `provider, model, task, status` | DeepSeek API calls |
| `llm_request_duration_seconds` | Histogram | `provider, model, task` | LLM API latency |
| `llm_input_tokens_total` | Counter | `provider, model, task` | Input token consumption |
| `llm_output_tokens_total` | Counter | `provider, model, task` | Output token count |
| `llm_retries_total` | Counter | `provider, reason` | LLM retry events |
| `llm_validation_failures_total` | Counter | `provider, task, reason` | Response schema failures |
| `llm_cache_hits_total` | Counter | `task` | Cache-bypassed LLM calls |
| `llm_escalations_total` | Counter | `from_model, to_model, reason` | Flash→Pro escalations |

### 4.3a AI Governance Guardrail Metrics (added 2026-08-07, not yet emitting — no live route calls the gateway yet)

Defined in `observability/metrics.py`; will start populating once a feature migrates to `AIGovernanceGateway` (see [AI_GOVERNANCE.md](AI_GOVERNANCE.md)). Deliberately low-cardinality only — never `user_id`, `email`, `resume_id`, `request_id`, `prompt`, or raw reason text as a label value.

| Metric | Type | Labels | Description |
|---|---|---|---|
| `ai_guardrail_requests_total` | Counter | `task, decision` | Every request seen by the gateway |
| `ai_guardrail_blocks_total` | Counter | `task, reason` | Requests blocked, by bounded reason code |
| `ai_prompt_injection_total` | Counter | `task` | Prompt injection attempts detected |
| `ai_jailbreak_attempts_total` | Counter | `task` | Jailbreak attempts detected |
| `ai_output_rejections_total` | Counter | `task, reason` | LLM output rejected by output guardrails |
| `ai_quota_rejections_total` | Counter | `task` | Rate-limit or product-quota rejections |
| `ai_input_size_rejections_total` | Counter | `task` | Input size/token-bomb rejections |
| `ai_security_classifier_duration_seconds` | Histogram | `decision` | Deterministic guardrail classification latency |

### 4.4 Dependency Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `supabase_request_duration_seconds` | Histogram | `operation, status` | DB query latency |
| `supabase_errors_total` | Counter | `operation, error_category` | DB errors |
| `redis_operations_total` | Counter | `operation, status` | Cache commands |
| `redis_operation_duration_seconds` | Histogram | `operation` | Cache latency |
| `r2_operations_total` | Counter | `operation, status` | Object storage operations |
| `resend_requests_total` | Counter | `template, status` | Email delivery outcomes |

---

## 5. Grafana Cloud Setup Guide

### 5.1 Metrics ingestion — implemented approach: app pushes its own registry

Render runs the API as one process with no sidecar, so rather than standing up a separate always-on scraper, `observability/remote_write.py` pushes the existing Prometheus registry (`observability/metrics.py`) straight to Grafana Cloud's hosted Prometheus (Mimir) every `GRAFANA_CLOUD_PROM_PUSH_INTERVAL_SECONDS` (default 30s), via the standard `remote_write` protocol (hand-rolled protobuf + raw-block Snappy via `cramjam` — a maintained `remote_write` client library pulls in `grpcio-tools`, which force-upgrades `protobuf` to a version incompatible with this project's `google-ai-generativelanguage`/`grpcio-status` pins). Started from `main.py`'s `lifespan()` alongside the other background tickers; it's a silent no-op whenever `GRAFANA_CLOUD_PROM_REMOTE_WRITE_URL` is blank.

**Setup — three values from the Grafana Cloud UI, no separate agent to run:**

1. [grafana.com](https://grafana.com) → log in → **My Account** → open your stack.
2. Find the **Prometheus** card (or **Connections → Add new connection → Prometheus**) → click **"Details"** / **"Send metrics"**.
3. Copy the **Remote Write Endpoint** URL, the **Username** (numeric instance ID), and generate an **API key** if none exists.
4. Set on Render (and locally in `.env` for testing):
   ```bash
   GRAFANA_CLOUD_PROM_REMOTE_WRITE_URL=https://prometheus-prod-XX-prod-XX.grafana.net/api/prom/push
   GRAFANA_CLOUD_PROM_USERNAME=<numeric instance ID>
   GRAFANA_CLOUD_PROM_API_KEY=<generated API key>
   ```
5. Redeploy. Within ~30s, Grafana Cloud → **Explore** → Prometheus data source → query `up` or `application_info` should return data.

**Alternative (not implemented, listed for reference only)**: a standalone Grafana Alloy agent pull-scraping `/metrics` and forwarding via `remote_write` — decouples collection from the app process, but needs its own always-on host (Fly.io, a VPS, etc.) to run continuously, which the push-based approach above avoids entirely.

```yaml
# alloy.river — only needed if you deliberately switch to the pull model later
prometheus.scrape "tailr4u_backend" {
  targets = [{ __address__ = "https://your-render-url.onrender.com" }]
  metrics_path = "/metrics"
  scheme       = "https"
  authorization {
    type        = "Bearer"
    credentials = env("METRICS_BEARER_TOKEN")
  }
  scrape_interval = "15s"
}

prometheus.remote_write "grafana_cloud" {
  endpoint {
    url = env("GRAFANA_CLOUD_PROM_REMOTE_WRITE_URL")
    basic_auth {
      username = env("GRAFANA_CLOUD_PROM_USERNAME")
      password = env("GRAFANA_CLOUD_PROM_API_KEY")
    }
  }
}
```

### 5.2 Recommended Dashboard Panels

Import the following PromQL-based panels into a new Grafana dashboard named **`Tailr4U — Production Overview`**:

```promql
# Request Rate (per minute)
rate(http_requests_total[1m]) * 60

# Error Rate % (5xx)
sum(rate(http_requests_total{status_class="5xx"}[5m])) /
sum(rate(http_requests_total[5m])) * 100

# P95 Request Latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# LLM API P95 Latency
histogram_quantile(0.95, rate(llm_request_duration_seconds_bucket[5m]))

# DeepSeek Token Burn Rate (per minute)
rate(llm_input_tokens_total[1m]) * 60

# Resume Tailoring Success Rate
rate(resume_tailoring_requests_total{status="success"}[5m]) /
rate(resume_tailoring_requests_total[5m]) * 100

# PDF Render P95 Latency
histogram_quantile(0.95, rate(pdf_render_duration_seconds_bucket[5m]))

# Redis Cache Hit Rate
rate(cache_hits_total[5m]) /
(rate(cache_hits_total[5m]) + rate(cache_misses_total[5m])) * 100
```

### 5.2a JD Extraction Worker Panels (added 2026-08-09)

Companion panels for the metrics in §4.2a — not yet built into a saved dashboard, but every query below works against what's actually emitting today:

```promql
# P50 / P95 time to first worker result
histogram_quantile(0.50, rate(jd_time_to_first_result_seconds_bucket[15m]))
histogram_quantile(0.95, rate(jd_time_to_first_result_seconds_bucket[15m]))

# P50 / P95 time to minimum-viable-for-tailoring
histogram_quantile(0.50, rate(jd_time_to_minimum_ready_seconds_bucket[15m]))
histogram_quantile(0.95, rate(jd_time_to_minimum_ready_seconds_bucket[15m]))

# P50 / P95 total extraction latency
histogram_quantile(0.50, rate(jd_total_extraction_seconds_bucket[15m]))
histogram_quantile(0.95, rate(jd_total_extraction_seconds_bucket[15m]))

# Per-worker P95 latency
histogram_quantile(0.95, sum by (worker, le) (rate(jd_worker_duration_seconds_bucket[15m])))

# Per-worker token usage (avg)
rate(jd_worker_output_tokens[15m]) / rate(jd_worker_duration_seconds_count[15m])

# Worker failure rate (targeted retries triggered)
sum by (worker) (rate(jd_extraction_worker_failures_total{attempt="initial"}[15m]))

# Retry rate (initial attempts that needed a retry)
sum(rate(jd_extraction_worker_failures_total{attempt="initial"}[15m])) /
sum(rate(jd_worker_duration_seconds_count{attempt="initial"}[15m])) * 100

# URL-level cache hit %
sum(rate(jd_extraction_cache_total{status="hit"}[15m])) /
sum(rate(jd_extraction_cache_total[15m])) * 100

# Partial-completion % (fewer than 4/4 workers succeeded)
sum(rate(jd_partial_completion_total[15m])) /
sum(rate(jd_total_extraction_seconds_count[15m])) * 100
```

---

## 6. Alerting Rules

Configure the following alerts in Grafana Cloud → Alerting → Alert rules.

### 6.1 Critical Alerts (PagerDuty / Slack #incidents)

| Alert | Condition | Window | Severity |
|---|---|---|---|
| `HighErrorRate` | `5xx rate > 2%` | 5m | Critical |
| `BackendDown` | `up == 0` (scrape fails) | 1m | Critical |
| `LLMAPIFailureSpike` | `llm_requests_total{status="error"} > 10` | 2m | Critical |
| `DatabaseErrorSpike` | `supabase_errors_total > 5` | 2m | Critical |

### 6.2 Warning Alerts (Slack #ops)

| Alert | Condition | Window | Severity |
|---|---|---|---|
| `HighP95Latency` | `P95 latency > 5s` | 5m | Warning |
| `PDFRenderSlow` | `pdf_render P95 > 15s` | 5m | Warning |
| `LLMLatencyDegraded` | `llm P95 > 20s` | 5m | Warning |
| `RedisCacheHitRateLow` | `cache hit rate < 60%` | 10m | Warning |
| `HighTokenBurnRate` | `llm input tokens > 50k/min` | 5m | Warning |

### 6.3 Alert Contact Points

In Grafana Cloud → Alerting → Contact points:

```yaml
# Slack contact point
name: slack-ops
type: slack
settings:
  url: <SLACK_WEBHOOK_URL>
  channel: "#tailr4u-ops"
  title: "{{ .GroupLabels.alertname }}"
  text: "{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}"

# Email contact point
name: email-oncall
type: email
settings:
  addresses: "oncall@tailr4u.com"
```

---

## 7. UptimeRobot Configuration

UptimeRobot provides external black-box availability checks independent of all internal monitoring.

### 7.1 Monitors to Create

Log into [uptimerobot.com](https://uptimerobot.com) and create the following monitors:

| Monitor Name | URL | Type | Interval | Expected |
|---|---|---|---|---|
| `Tailr4U API — Live` | `https://api.tailr4u.com/live` | HTTPS | 5 min | Status 200 |
| `Tailr4U API — Ready` | `https://api.tailr4u.com/ready` | HTTPS | 5 min | Status 200 |
| `Tailr4U Frontend` | `https://app.tailr4u.com` | HTTPS | 5 min | Status 200 |
| `Tailr4U API Root` | `https://api.tailr4u.com/` | HTTPS | 5 min | Status 200, body contains `healthy` |

### 7.2 Alert Contact

In UptimeRobot → My Settings → Alert Contacts: add a Slack alert contact or email on each monitor.

### 7.3 Status Page

Create a **public status page** at `status.tailr4u.com` inside UptimeRobot by adding all monitors to a Public Status Page group.

---

## 8. Structured JSON Log Format

All backend logs are emitted as single-line JSON to stdout, collected by Render's log aggregator, and can be forwarded to Grafana Loki via the Grafana Alloy Loki `loki.source.api` receiver.

```json
{
  "timestamp": "2026-08-02T08:00:00.000Z",
  "level": "INFO",
  "service": "tailr4u-api",
  "environment": "production",
  "release": "tailr4u-api@1.2.3",
  "request_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "trace_id": "",
  "message": "http_request_completed",
  "extra_info": {
    "method": "POST",
    "route": "/api/v1/tailor/resume",
    "status_code": 200,
    "duration_ms": 1420.85
  }
}
```

**Sensitive fields that are always redacted**: `password`, `access_token`, `refresh_token`, `authorization`, `email`, `phone`, `resume`, `job_description`, `prompt`, `response`, `api_key`, `bearer_token`, `client_secret`.

---

## 9. OpenTelemetry Distributed Tracing

OpenTelemetry is configured in `backend/observability/tracing.py` and is **disabled by default** (`OTEL_ENABLED=false`). Enable it once a Grafana Tempo endpoint is provisioned.

### 9.1 Activation

Set in Render environment:

```bash
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=https://tempo-prod-xx-prod-xx.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(userid:grafana_api_key)>
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_TRACES_SAMPLER_ARG=0.05
```

### 9.2 Instrumented Components

| Component | Auto-instrumented | Manual span |
|---|---|---|
| FastAPI HTTP handlers | ✅ `FastAPIInstrumentor` | — |
| Outbound HTTPX calls | ✅ `HTTPXClientInstrumentor` | — |
| DeepSeek LLM calls | — | ✅ `@trace_llm_call` decorator |
| Supabase DB queries | — | ✅ `@trace_db_operation` decorator |
| Redis operations | — | ✅ `@trace_cache_operation` decorator |

### 9.3 Correlation with Logs and Metrics

The `request_id` in JSON logs maps to the Sentry `event_id` tag and the OTLP `trace_id` via the `CorrelationAndLoggingMiddleware`.

---

## 10. Release Tagging in CI (GitHub Actions)

Add the following step to `.github/workflows/deploy.yml` to propagate release metadata:

```yaml
- name: Set release version
  run: |
    RELEASE="tailr4u-api@$(git describe --tags --always)"
    echo "APP_RELEASE=$RELEASE" >> $GITHUB_ENV

- name: Deploy to Render
  env:
    APP_RELEASE: ${{ env.APP_RELEASE }}
  run: |
    curl -X POST "https://api.render.com/deploy/srv-XXXX?key=YOUR_DEPLOY_KEY"
```

Set `APP_RELEASE` as a Render environment variable override per-deploy, or use Render's native deploy hooks.

---

## 11. Sentry Projects Reference

| Project | Platform | DSN env var |
|---|---|---|
| `tailr4u-api` | Python/FastAPI | `SENTRY_BACKEND_DSN` |
| `tailr4u-frontend` | JavaScript/React | `VITE_SENTRY_DSN` |
| `tailr4u-extension` | JavaScript/Browser | Hardcoded in `background.js` |

Create each project at [sentry.io](https://sentry.io) → New Project, then paste the DSN into the appropriate environment.

### 11.1 What the backend project actually captures

As of 2026-08-07, the backend Sentry project captures **every non-2xx HTTP response**, not just unhandled Python exceptions:

- `observability/middleware.py`'s `CorrelationAndLoggingMiddleware` calls `_capture_non_2xx()` on both the normal success path and the `BaseAppException` path — any response with `status_code` outside 200-299 (3xx/4xx/5xx) gets sent to Sentry as its own `capture_message` event, even if no exception was ever raised for it (e.g. FastAPI's own validation-error responses, or a route that returns `JSONResponse(status_code=...)` directly).
- Severity level follows status range: 3xx → `info`, 4xx → `warning`, 5xx → `error`.
- Events are fingerprinted by `[method, route, status_code]`, so repeated hits on the same route/status combination group into one Sentry issue instead of creating a new one per request.
- `observability/sentry.py`'s `before_send` no longer filters by status code at all (it previously dropped every exception-based event under 500) — it only redacts sensitive fields now.
- **Volume implication**: routine client errors (expired-token 401s, not-found 404s, request-validation 422s) are now visible Sentry issues, not just genuine 500s. If this proves too noisy in practice, the fix is a targeted ignore-list inside `_capture_non_2xx` for specific expected status/route combinations — not reverting to exception-only capture.

---

## 12. Runbook: Responding to Alerts

### `HighErrorRate` firing

1. Check Sentry → Issues → Latest unresolved issues
2. Check Render → Logs → filter for `"level":"ERROR"`
3. Check `GET /health` response for degraded components
4. If database issue: check Supabase dashboard → Database → Connections
5. If LLM issue: check DeepSeek API status page

### `BackendDown` firing

1. Check UptimeRobot status page for confirmation
2. Check Render → Service → Events for crash/restart logs
3. SSH or exec into dyno if available
4. Re-deploy last known-good commit

### `LLMLatencyDegraded` firing

1. Check `llm_request_duration_seconds_bucket` in Grafana — which `model` label is slow
2. Check DeepSeek API latency from their status page
3. Consider reducing `DEEPSEEK_TIMEOUT_SECONDS` to fail fast and surface errors in Sentry sooner
