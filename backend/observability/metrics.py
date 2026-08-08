import time
from typing import Dict, Any, Optional
from prometheus_client import (
    Counter, Histogram, Gauge, CollectorRegistry, CONTENT_TYPE_LATEST,
    ProcessCollector, PlatformCollector, GCCollector,
)
from observability.config import METRICS_ENABLED, SERVICE_NAME, APP_ENV, APP_RELEASE

# Initialize global registry or use default
registry = CollectorRegistry()

# prometheus_client auto-registers these onto its own default REGISTRY at
# import time, not onto a custom CollectorRegistry() like the one above.
# Without registering them here explicitly, process_cpu_seconds_total,
# process_resident_memory_bytes, etc. never appear in /metrics —
# which is exactly why CPU/memory panels in Grafana have nothing to plot.
ProcessCollector(registry=registry)
PlatformCollector(registry=registry)
GCCollector(registry=registry)

# ----------------- HTTP METRICS -----------------
http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests received",
    ["method", "route", "status_class"],
    registry=registry
)

http_request_duration_seconds = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "route"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0),
    registry=registry
)

http_requests_in_progress = Gauge(
    "http_requests_in_progress",
    "Total in-progress HTTP requests",
    ["method", "route"],
    registry=registry
)

# ----------------- BUSINESS METRICS -----------------
resume_tailoring_requests_total = Counter(
    "resume_tailoring_requests_total",
    "Total resume tailoring requests processed",
    ["status"],
    registry=registry
)

resume_tailoring_duration_seconds = Histogram(
    "resume_tailoring_duration_seconds",
    "Resume tailoring process latency in seconds",
    ["status"],
    buckets=(1.0, 5.0, 10.0, 20.0, 30.0, 60.0, 120.0),
    registry=registry
)

resume_tailoring_validation_failures_total = Counter(
    "resume_tailoring_validation_failures_total",
    "Total resume tailoring validation check failures",
    ["reason"],
    registry=registry
)

resume_generation_total = Counter(
    "resume_generation_total",
    "Total resumes generated",
    ["status", "template"],
    registry=registry
)

cover_letter_generation_total = Counter(
    "cover_letter_generation_total",
    "Total cover letters generated",
    ["status"],
    registry=registry
)

jd_extraction_total = Counter(
    "jd_extraction_total",
    "Total job description extractions",
    ["status", "source_type"],
    registry=registry
)

jd_extraction_stage_duration_seconds = Histogram(
    "jd_extraction_stage_duration_seconds",
    "JD extraction stage latency in seconds",
    ["stage", "status"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 8.0, 10.0, 15.0, 30.0),
    registry=registry,
)

jd_extraction_worker_duration_seconds = Histogram(
    "jd_worker_duration_seconds",
    "DeepSeek Pro JD worker latency in seconds",
    ["worker", "status", "attempt"],
    buckets=(0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 8.0, 10.0, 15.0),
    registry=registry,
)

jd_extraction_worker_output_tokens_total = Counter(
    "jd_worker_output_tokens",
    "Estimated schema output tokens returned by JD workers",
    ["worker"],
    registry=registry,
)

jd_extraction_worker_failures_total = Counter(
    "jd_extraction_worker_failures_total",
    "JD worker failures and targeted retries",
    ["worker", "reason", "attempt"],
    registry=registry,
)

jd_extraction_cache_total = Counter(
    "jd_extraction_cache_total",
    "Exact JD extraction cache lookups",
    ["status"],
    registry=registry,
)

jd_extraction_partial_total = Counter(
    "jd_partial_completion_total",
    "JD extractions completed with deterministic fields for failed Pro workers",
    ["reason"],
    registry=registry,
)

# Stable dashboard-facing names from the JD extraction SLO contract.
jd_deterministic_extraction_seconds = Histogram(
    "jd_deterministic_extraction_seconds", "Deterministic JD extraction latency",
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0), registry=registry,
)
jd_cache_lookup_seconds = Histogram(
    "jd_cache_lookup_seconds", "Exact JD Redis cache lookup latency", ["status"],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5), registry=registry,
)
jd_time_to_first_result_seconds = Histogram(
    "jd_time_to_first_result_seconds", "Time until the first validated Pro worker result",
    buckets=(0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 8.0, 10.0, 15.0), registry=registry,
)
jd_time_to_minimum_ready_seconds = Histogram(
    "jd_time_to_minimum_ready_seconds", "Time until minimum viable JD fields are ready", ["status"],
    buckets=(0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 8.0, 10.0, 15.0), registry=registry,
)
jd_total_extraction_seconds = Histogram(
    "jd_total_extraction_seconds", "End-to-end JD extraction latency", ["status"],
    buckets=(0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 8.0, 10.0, 15.0, 30.0), registry=registry,
)
jd_worker_timeout_total = Counter(
    "jd_worker_timeout_total", "Timed-out JD Pro workers", ["worker", "attempt"], registry=registry,
)

pdf_render_total = Counter(
    "pdf_render_total",
    "Total PDF renders executed",
    ["status"],
    registry=registry
)

pdf_render_duration_seconds = Histogram(
    "pdf_render_duration_seconds",
    "PDF render latency in seconds",
    ["status"],
    buckets=(0.5, 1.0, 2.5, 5.0, 10.0, 20.0),
    registry=registry
)

reminder_jobs_total = Counter(
    "reminder_jobs_total",
    "Total notification reminders processed",
    ["status"],
    registry=registry
)

notification_delivery_total = Counter(
    "notification_delivery_total",
    "Total email notifications sent",
    ["channel", "status"],
    registry=registry
)

# ----------------- LLM METRICS -----------------
llm_requests_total = Counter(
    "llm_requests_total",
    "Total requests to DeepSeek LLM API",
    ["provider", "model", "task", "status"],
    registry=registry
)

llm_request_duration_seconds = Histogram(
    "llm_request_duration_seconds",
    "DeepSeek LLM API request duration in seconds",
    ["provider", "model", "task"],
    buckets=(0.5, 1.0, 2.5, 5.0, 10.0, 20.0, 30.0, 60.0),
    registry=registry
)

llm_input_tokens_total = Counter(
    "llm_input_tokens_total",
    "Total input tokens consumed in DeepSeek API requests",
    ["provider", "model", "task"],
    registry=registry
)

llm_output_tokens_total = Counter(
    "llm_output_tokens_total",
    "Total output tokens returned by DeepSeek API",
    ["provider", "model", "task"],
    registry=registry
)

llm_retries_total = Counter(
    "llm_retries_total",
    "Total DeepSeek invocation retries",
    ["provider", "reason"],
    registry=registry
)

llm_validation_failures_total = Counter(
    "llm_validation_failures_total",
    "Total DeepSeek response schema validation failures",
    ["provider", "task", "reason"],
    registry=registry
)

llm_cache_hits_total = Counter(
    "llm_cache_hits_total",
    "Total DeepSeek response cache hits",
    ["task"],
    registry=registry
)

llm_escalations_total = Counter(
    "llm_escalations_total",
    "Total DeepSeek model escalations from flash to pro",
    ["from_model", "to_model", "reason"],
    registry=registry
)

# ----------------- DEPENDENCIES METRICS -----------------
supabase_request_duration_seconds = Histogram(
    "supabase_request_duration_seconds",
    "Supabase database connection latency",
    ["operation", "status"],
    buckets=(0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0),
    registry=registry
)

supabase_errors_total = Counter(
    "supabase_errors_total",
    "Total Supabase operation errors",
    ["operation", "error_category"],
    registry=registry
)

redis_operations_total = Counter(
    "redis_operations_total",
    "Total Redis commands executed",
    ["operation", "status"],
    registry=registry
)

redis_operation_duration_seconds = Histogram(
    "redis_operation_duration_seconds",
    "Redis operation latency",
    ["operation"],
    buckets=(0.001, 0.005, 0.01, 0.05, 0.1, 0.25),
    registry=registry
)

cache_hits_total = Counter(
    "cache_hits_total",
    "Total general cache hits",
    ["cache_type"],
    registry=registry
)

cache_misses_total = Counter(
    "cache_misses_total",
    "Total general cache misses",
    ["cache_type"],
    registry=registry
)

r2_operations_total = Counter(
    "r2_operations_total",
    "Total Cloudflare R2 operations executed",
    ["operation", "status"],
    registry=registry
)

r2_operation_duration_seconds = Histogram(
    "r2_operation_duration_seconds",
    "Cloudflare R2 operation latency",
    ["operation"],
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0),
    registry=registry
)

resend_requests_total = Counter(
    "resend_requests_total",
    "Total Resend email delivery requests",
    ["template", "status"],
    registry=registry
)

deepseek_provider_health = Gauge(
    "deepseek_provider_health",
    "Active DeepSeek provider health indicator (1=healthy, 0=offline)",
    ["state"],
    registry=registry
)

# ----------------- AI GOVERNANCE GUARDRAIL METRICS -----------------
# Low-cardinality only: task + decision/reason. Never user_id, email,
# resume_id, request_id, prompt, or raw reason text as a label value --
# see docs/AI_GOVERNANCE.md "Prometheus Metrics".
ai_guardrail_requests_total = Counter(
    "ai_guardrail_requests_total",
    "Total requests seen by the AI governance gateway",
    ["task", "decision"],
    registry=registry
)

ai_guardrail_blocks_total = Counter(
    "ai_guardrail_blocks_total",
    "Requests blocked by the AI governance gateway",
    ["task", "reason"],
    registry=registry
)

ai_prompt_injection_total = Counter(
    "ai_prompt_injection_total",
    "Prompt injection attempts detected",
    ["task"],
    registry=registry
)

ai_jailbreak_attempts_total = Counter(
    "ai_jailbreak_attempts_total",
    "Jailbreak attempts detected",
    ["task"],
    registry=registry
)

ai_output_rejections_total = Counter(
    "ai_output_rejections_total",
    "LLM output rejected by output guardrails",
    ["task", "reason"],
    registry=registry
)

ai_quota_rejections_total = Counter(
    "ai_quota_rejections_total",
    "Requests rejected by quota or rate limiting",
    ["task"],
    registry=registry
)

ai_input_size_rejections_total = Counter(
    "ai_input_size_rejections_total",
    "Requests rejected for exceeding input size limits",
    ["task"],
    registry=registry
)

ai_security_classifier_duration_seconds = Histogram(
    "ai_security_classifier_duration_seconds",
    "Deterministic guardrail classification latency in seconds",
    ["decision"],
    buckets=(0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25),
    registry=registry
)

# ----------------- RELEASE / SERVICE INFO -----------------
application_info = Gauge(
    "application_info",
    "Application release metadata indicator",
    ["service", "environment", "release"],
    registry=registry
)
# Set constant metadata
application_info.labels(
    service=SERVICE_NAME,
    environment=APP_ENV,
    release=APP_RELEASE
).set(1.0)


# ----------------- RECORD HELPER UTILITIES -----------------

def record_http_request(method: str, route: str, status_code: int, duration_sec: float):
    """Safely log HTTP performance metrics to Prometheus."""
    if not METRICS_ENABLED:
        return
    status_class = f"{status_code // 100}xx"
    try:
        http_requests_total.labels(method=method, route=route, status_class=status_class).inc()
        http_request_duration_seconds.labels(method=method, route=route).observe(duration_sec)
    except Exception:
        # Observability operations must never raise production runtime exceptions
        pass


def record_ai_guardrail_request(task: str, decision: str) -> None:
    """Fail-open: a telemetry failure must never block a safe generation --
    see docs/AI_GOVERNANCE.md 'Guardrail Failure Behavior'."""
    if not METRICS_ENABLED:
        return
    try:
        ai_guardrail_requests_total.labels(task=task, decision=decision).inc()
    except Exception:
        pass


def record_ai_guardrail_block(task: str, reason: str) -> None:
    if not METRICS_ENABLED:
        return
    try:
        ai_guardrail_blocks_total.labels(task=task, reason=reason).inc()
    except Exception:
        pass


def record_ai_prompt_injection(task: str) -> None:
    if not METRICS_ENABLED:
        return
    try:
        ai_prompt_injection_total.labels(task=task).inc()
    except Exception:
        pass


def record_ai_jailbreak_attempt(task: str) -> None:
    if not METRICS_ENABLED:
        return
    try:
        ai_jailbreak_attempts_total.labels(task=task).inc()
    except Exception:
        pass


def record_ai_output_rejection(task: str, reason: str) -> None:
    if not METRICS_ENABLED:
        return
    try:
        ai_output_rejections_total.labels(task=task, reason=reason).inc()
    except Exception:
        pass


def record_ai_quota_rejection(task: str) -> None:
    if not METRICS_ENABLED:
        return
    try:
        ai_quota_rejections_total.labels(task=task).inc()
    except Exception:
        pass


def record_ai_input_size_rejection(task: str) -> None:
    if not METRICS_ENABLED:
        return
    try:
        ai_input_size_rejections_total.labels(task=task).inc()
    except Exception:
        pass


def record_ai_security_classifier_duration(decision: str, duration_sec: float) -> None:
    if not METRICS_ENABLED:
        return
    try:
        ai_security_classifier_duration_seconds.labels(decision=decision).observe(duration_sec)
    except Exception:
        pass
