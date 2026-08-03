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
# process_resident_memory_bytes, etc. never appear in /internal/metrics —
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
