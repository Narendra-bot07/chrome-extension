"""
backend/observability/tracing.py
─────────────────────────────────────────────────────────────────────────────
OpenTelemetry distributed tracing for Tailr4U.

  • Disabled by default (OTEL_ENABLED=false) – zero runtime cost when off.
  • When enabled, exports traces to a Grafana Tempo OTLP endpoint via
    HTTP/protobuf (Grafana Cloud Traces free tier).
  • FastAPI and outbound HTTPX calls are auto-instrumented.
  • Utility decorators (@trace_llm_call, @trace_db_operation,
    @trace_cache_operation) allow manual spans with Tailr4U-specific
    attributes to be added to any coroutine or function.

Usage:
    # In backend/main.py, after setup_observability_logging():
    from observability.tracing import setup_tracing
    setup_tracing(app)          # accepts the FastAPI app instance
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Callable, Optional

from observability.config import (
    OTEL_ENABLED,
    OTEL_SERVICE_NAME,
    OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_EXPORTER_OTLP_HEADERS,
    OTEL_EXPORTER_OTLP_PROTOCOL,
    OTEL_TRACES_SAMPLER_ARG,
    APP_ENV,
    APP_RELEASE,
)

logger = logging.getLogger("tailr4u-api.tracing")

# ──────────────────────────────────────────────────────────────────────────
# Lazy-loaded tracer — only resolved after setup_tracing() is called.
# ──────────────────────────────────────────────────────────────────────────
_tracer: Any = None


def get_tracer() -> Any:
    """Return the active OTEL tracer, or a no-op stub when OTEL is disabled."""
    if _tracer is not None:
        return _tracer
    # Return a lightweight no-op compatible object so decorators work safely
    # without importing opentelemetry when it's disabled.
    return _NoOpTracer()


# ──────────────────────────────────────────────────────────────────────────
# No-op tracer stub — used when OTEL_ENABLED=false
# ──────────────────────────────────────────────────────────────────────────
class _NoOpSpan:
    """A span that does nothing."""
    def __enter__(self): return self
    def __exit__(self, *_): pass
    def set_attribute(self, *_, **__): pass
    def set_status(self, *_, **__): pass
    def record_exception(self, *_, **__): pass


class _NoOpTracer:
    def start_as_current_span(self, name: str, **__):
        return _NoOpSpan()


# ──────────────────────────────────────────────────────────────────────────
# Main setup function — called once at application startup
# ──────────────────────────────────────────────────────────────────────────
def setup_tracing(app: Any = None) -> None:
    """
    Initialise the OpenTelemetry SDK and instrument FastAPI + HTTPX.

    Parameters
    ----------
    app : FastAPI instance (optional)
        When provided, FastAPIInstrumentor will be applied to it directly.
        If None, it will attempt to auto-detect the running application.
    """
    global _tracer

    if not OTEL_ENABLED:
        logger.info("[OTEL] Tracing is disabled (OTEL_ENABLED=false). Using no-op tracer.")
        _tracer = _NoOpTracer()
        return

    if not OTEL_EXPORTER_OTLP_ENDPOINT:
        logger.warning(
            "[OTEL] OTEL_ENABLED=true but OTEL_EXPORTER_OTLP_ENDPOINT is not set. "
            "Tracing will be disabled to avoid startup failure."
        )
        _tracer = _NoOpTracer()
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.trace.sampling import (
            ParentBasedTraceIdRatio,
            TraceIdRatioBased,
        )

        # Parse OTLP headers from "Key=Value,Key2=Value2" string format
        headers: dict[str, str] = {}
        if OTEL_EXPORTER_OTLP_HEADERS:
            for pair in OTEL_EXPORTER_OTLP_HEADERS.split(","):
                pair = pair.strip()
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    headers[k.strip()] = v.strip()

        # Build resource attributes
        resource = Resource.create({
            SERVICE_NAME: OTEL_SERVICE_NAME,
            SERVICE_VERSION: APP_RELEASE,
            "deployment.environment": APP_ENV,
        })

        # Sampler: parentbased_traceidratio — respects parent decision, then
        # samples at the configured ratio for new root spans.
        sampler = ParentBasedTraceIdRatio(OTEL_TRACES_SAMPLER_ARG)

        provider = TracerProvider(resource=resource, sampler=sampler)

        exporter = OTLPSpanExporter(
            endpoint=OTEL_EXPORTER_OTLP_ENDPOINT,
            headers=headers,
        )
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        _tracer = trace.get_tracer(OTEL_SERVICE_NAME)

        # ── Auto-instrument FastAPI ──────────────────────────────────────
        try:
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
            if app is not None:
                FastAPIInstrumentor.instrument_app(app)
            else:
                FastAPIInstrumentor().instrument()
            logger.info("[OTEL] FastAPI auto-instrumentation applied.")
        except ImportError:
            logger.warning("[OTEL] opentelemetry-instrumentation-fastapi not installed; skipping FastAPI auto-instrumentation.")

        # ── Auto-instrument HTTPX (outbound calls to DeepSeek, Resend, etc.) ──
        try:
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
            HTTPXClientInstrumentor().instrument()
            logger.info("[OTEL] HTTPX auto-instrumentation applied.")
        except ImportError:
            logger.warning("[OTEL] opentelemetry-instrumentation-httpx not installed; skipping HTTPX auto-instrumentation.")

        logger.info(
            f"[OTEL] Tracing initialised — endpoint={OTEL_EXPORTER_OTLP_ENDPOINT}, "
            f"sampler=parentbased_traceidratio({OTEL_TRACES_SAMPLER_ARG})"
        )

    except Exception as exc:
        logger.error(f"[OTEL] Tracing setup failed — continuing without tracing. Error: {exc}")
        _tracer = _NoOpTracer()


# ──────────────────────────────────────────────────────────────────────────
# Manual span decorators
# ──────────────────────────────────────────────────────────────────────────
def trace_llm_call(task: str, provider: str = "deepseek", model: str = ""):
    """
    Decorator to wrap an async LLM call in an OTEL span.

    Usage::

        @trace_llm_call(task="resume_tailoring", provider="deepseek", model="deepseek-v4-flash")
        async def invoke_deepseek(...):
            ...
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        async def async_wrapper(*args, **kwargs):
            tracer = get_tracer()
            with tracer.start_as_current_span(f"llm.{task}") as span:
                span.set_attribute("llm.provider", provider)
                span.set_attribute("llm.model", model or "unknown")
                span.set_attribute("llm.task", task)
                try:
                    result = await fn(*args, **kwargs)
                    span.set_attribute("llm.success", True)
                    return result
                except Exception as exc:
                    span.record_exception(exc)
                    span.set_attribute("llm.success", False)
                    raise

        @functools.wraps(fn)
        def sync_wrapper(*args, **kwargs):
            tracer = get_tracer()
            with tracer.start_as_current_span(f"llm.{task}") as span:
                span.set_attribute("llm.provider", provider)
                span.set_attribute("llm.model", model or "unknown")
                span.set_attribute("llm.task", task)
                try:
                    result = fn(*args, **kwargs)
                    span.set_attribute("llm.success", True)
                    return result
                except Exception as exc:
                    span.record_exception(exc)
                    span.set_attribute("llm.success", False)
                    raise

        import asyncio
        return async_wrapper if asyncio.iscoroutinefunction(fn) else sync_wrapper

    return decorator


def trace_db_operation(operation: str, table: str = ""):
    """
    Decorator to wrap a Supabase / psycopg2 database call in an OTEL span.

    Usage::

        @trace_db_operation(operation="select", table="resumes")
        async def get_resume(user_id: str):
            ...
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        async def async_wrapper(*args, **kwargs):
            tracer = get_tracer()
            with tracer.start_as_current_span(f"db.{operation}") as span:
                span.set_attribute("db.system", "postgresql")
                span.set_attribute("db.operation", operation)
                if table:
                    span.set_attribute("db.table", table)
                try:
                    result = await fn(*args, **kwargs)
                    span.set_attribute("db.success", True)
                    return result
                except Exception as exc:
                    span.record_exception(exc)
                    span.set_attribute("db.success", False)
                    raise

        @functools.wraps(fn)
        def sync_wrapper(*args, **kwargs):
            tracer = get_tracer()
            with tracer.start_as_current_span(f"db.{operation}") as span:
                span.set_attribute("db.system", "postgresql")
                span.set_attribute("db.operation", operation)
                if table:
                    span.set_attribute("db.table", table)
                try:
                    result = fn(*args, **kwargs)
                    span.set_attribute("db.success", True)
                    return result
                except Exception as exc:
                    span.record_exception(exc)
                    span.set_attribute("db.success", False)
                    raise

        import asyncio
        return async_wrapper if asyncio.iscoroutinefunction(fn) else sync_wrapper

    return decorator


def trace_cache_operation(operation: str, cache_type: str = "redis"):
    """
    Decorator to wrap an Upstash Redis / in-memory cache call in an OTEL span.

    Usage::

        @trace_cache_operation(operation="get", cache_type="redis")
        async def get_cached_jd(key: str):
            ...
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        async def async_wrapper(*args, **kwargs):
            tracer = get_tracer()
            with tracer.start_as_current_span(f"cache.{operation}") as span:
                span.set_attribute("cache.system", cache_type)
                span.set_attribute("cache.operation", operation)
                try:
                    result = await fn(*args, **kwargs)
                    span.set_attribute("cache.success", True)
                    return result
                except Exception as exc:
                    span.record_exception(exc)
                    span.set_attribute("cache.success", False)
                    raise

        @functools.wraps(fn)
        def sync_wrapper(*args, **kwargs):
            tracer = get_tracer()
            with tracer.start_as_current_span(f"cache.{operation}") as span:
                span.set_attribute("cache.system", cache_type)
                span.set_attribute("cache.operation", operation)
                try:
                    result = fn(*args, **kwargs)
                    span.set_attribute("cache.success", True)
                    return result
                except Exception as exc:
                    span.record_exception(exc)
                    span.set_attribute("cache.success", False)
                    raise

        import asyncio
        return async_wrapper if asyncio.iscoroutinefunction(fn) else sync_wrapper

    return decorator
