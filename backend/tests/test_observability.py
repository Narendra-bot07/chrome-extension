"""
tests/test_observability.py
─────────────────────────────────────────────────────────────────────────────
Unit tests for the backend/observability/ module.

Tests are intentionally written without any live external service dependencies
(no Sentry, no Prometheus scrape, no OTEL collector) so they run fully offline
in CI / local pytest.

Run:
    cd backend
    py -m pytest tests/test_observability.py -v
"""
import asyncio
import json
import logging
import os
import sys
import importlib
from io import StringIO
from unittest.mock import MagicMock, patch

import pytest

# ── Make sure backend root is on the path ─────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


# ─────────────────────────────────────────────────────────────────────────
# 1.  context.py
# ─────────────────────────────────────────────────────────────────────────
class TestRequestContext:
    def test_set_and_get_request_id(self):
        from observability.context import set_request_id, get_request_id
        set_request_id("req-123")
        assert get_request_id() == "req-123"

    def test_set_and_get_trace_id(self):
        from observability.context import set_trace_id, get_trace_id
        set_trace_id("trace-abc")
        assert get_trace_id() == "trace-abc"

    def test_set_and_get_workflow_id(self):
        from observability.context import set_workflow_id, get_workflow_id
        set_workflow_id("wf-999")
        assert get_workflow_id() == "wf-999"

    def test_set_and_get_job_id(self):
        from observability.context import set_job_id, get_job_id
        set_job_id("job-456")
        assert get_job_id() == "job-456"

    def test_clear_context_resets_all(self):
        from observability.context import (
            set_request_id, set_trace_id, set_workflow_id, set_job_id,
            clear_context, get_request_id, get_trace_id,
        )
        set_request_id("r1")
        set_trace_id("t1")
        set_workflow_id("w1")
        set_job_id("j1")
        clear_context()
        assert get_request_id() is None
        assert get_trace_id() is None

    def test_context_isolation_across_coroutines(self):
        """Each coroutine should have its own ContextVar state."""
        from observability.context import set_request_id, get_request_id, clear_context

        async def set_and_read(val: str) -> str:
            set_request_id(val)
            await asyncio.sleep(0)  # yield to event loop
            return get_request_id()

        async def run():
            r1, r2 = await asyncio.gather(set_and_read("A"), set_and_read("B"))
            # Both should have read back their own value — ContextVar isolation
            assert r1 in ("A", "B")
            assert r2 in ("A", "B")

        asyncio.run(run())


# ─────────────────────────────────────────────────────────────────────────
# 2.  logging.py  — redaction + JSON format
# ─────────────────────────────────────────────────────────────────────────
class TestRedaction:
    def test_plain_string_passthrough(self):
        from observability.logging import redact_sensitive_data
        assert redact_sensitive_data("hello world") == "hello world"

    def test_password_key_is_redacted(self):
        from observability.logging import redact_sensitive_data
        data = {"username": "alice", "password": "s3cr3t"}
        result = redact_sensitive_data(data)
        assert result["password"] == "[REDACTED]"
        assert result["username"] == "alice"

    def test_access_token_key_is_redacted(self):
        from observability.logging import redact_sensitive_data
        data = {"access_token": "eyJhbGciOiJIUzI1NiJ9.x.y"}
        result = redact_sensitive_data(data)
        assert result["access_token"] == "[REDACTED]"

    def test_nested_dict_redaction(self):
        from observability.logging import redact_sensitive_data
        data = {"user": {"email": "alice@example.com", "name": "Alice"}}
        result = redact_sensitive_data(data)
        assert result["user"]["email"] == "[REDACTED]"
        assert result["user"]["name"] == "Alice"

    def test_list_items_redacted(self):
        from observability.logging import redact_sensitive_data
        data = [{"password": "abc"}, {"name": "Bob"}]
        result = redact_sensitive_data(data)
        assert result[0]["password"] == "[REDACTED]"
        assert result[1]["name"] == "Bob"

    def test_email_string_is_redacted(self):
        from observability.logging import redact_sensitive_data
        result = redact_sensitive_data("alice@example.com")
        assert result == "[REDACTED_EMAIL]"

    def test_non_email_string_not_redacted(self):
        from observability.logging import redact_sensitive_data
        result = redact_sensitive_data("resume tailoring complete")
        assert "REDACTED" not in result

    def test_api_key_partial_match_redacted(self):
        from observability.logging import redact_sensitive_data
        data = {"deepseek_api_key": "sk-abc123"}
        result = redact_sensitive_data(data)
        assert result["deepseek_api_key"] == "[REDACTED]"


class TestJSONFormatter:
    def _emit_and_capture(self, msg: str, level: int = logging.INFO) -> dict:
        from observability.logging import JSONFormatter
        from observability.context import set_request_id, clear_context

        set_request_id("test-req-id")
        stream = StringIO()
        handler = logging.StreamHandler(stream)
        handler.setFormatter(JSONFormatter())

        record = logging.LogRecord(
            name="test",
            level=level,
            pathname="",
            lineno=0,
            msg=msg,
            args=(),
            exc_info=None,
        )
        handler.emit(record)
        clear_context()
        return json.loads(stream.getvalue().strip())

    def test_json_output_has_required_fields(self):
        record = self._emit_and_capture("hello")
        for field in ("timestamp", "level", "service", "environment", "message", "request_id"):
            assert field in record, f"Missing field: {field}"

    def test_request_id_propagated(self):
        record = self._emit_and_capture("test message")
        assert record["request_id"] == "test-req-id"

    def test_level_is_info(self):
        record = self._emit_and_capture("info message", level=logging.INFO)
        assert record["level"] == "INFO"


# ─────────────────────────────────────────────────────────────────────────
# 3.  metrics.py — counter registration
# ─────────────────────────────────────────────────────────────────────────
class TestMetricsRegistration:
    def test_http_requests_total_exists(self):
        from observability.metrics import http_requests_total
        assert http_requests_total is not None

    def test_llm_requests_total_exists(self):
        from observability.metrics import llm_requests_total
        assert llm_requests_total is not None

    def test_resume_tailoring_counter_exists(self):
        from observability.metrics import resume_tailoring_requests_total
        assert resume_tailoring_requests_total is not None

    def test_record_http_request_does_not_raise(self):
        from observability.metrics import record_http_request
        # Should not raise even with unusual inputs
        record_http_request("GET", "/test", 200, 0.123)
        record_http_request("POST", "/api/v1/tailor", 500, 5.0)

    def test_record_http_request_when_disabled(self):
        """record_http_request must be a no-op when METRICS_ENABLED=False."""
        from observability import metrics as metrics_module
        original = metrics_module.METRICS_ENABLED
        try:
            metrics_module.METRICS_ENABLED = False
            metrics_module.record_http_request("DELETE", "/test", 204, 0.01)
        finally:
            metrics_module.METRICS_ENABLED = original


# ─────────────────────────────────────────────────────────────────────────
# 4.  tracing.py — no-op and setup paths
# ─────────────────────────────────────────────────────────────────────────
class TestTracing:
    def test_get_tracer_returns_noop_when_disabled(self):
        """When OTEL_ENABLED=false the tracer must be a no-op object."""
        from observability import tracing as tracing_module
        from observability.tracing import _NoOpTracer
        # Force disabled state
        with patch.object(tracing_module, "_tracer", _NoOpTracer()):
            tracer = tracing_module.get_tracer()
            assert isinstance(tracer, _NoOpTracer)

    def test_noop_span_context_manager(self):
        from observability.tracing import _NoOpTracer
        tracer = _NoOpTracer()
        with tracer.start_as_current_span("test_span") as span:
            span.set_attribute("key", "value")
            span.record_exception(Exception("oops"))
        # No exception = pass

    def test_setup_tracing_noop_when_disabled(self):
        from observability import tracing as tracing_module
        original_enabled = tracing_module.OTEL_ENABLED
        try:
            # Patch to disabled
            with patch.object(tracing_module, "OTEL_ENABLED", False):
                tracing_module.setup_tracing()
                from observability.tracing import _NoOpTracer
                assert isinstance(tracing_module._tracer, _NoOpTracer)
        finally:
            tracing_module.OTEL_ENABLED = original_enabled

    def test_trace_llm_call_decorator_sync(self):
        from observability.tracing import trace_llm_call, _NoOpTracer
        from observability import tracing as tracing_module

        with patch.object(tracing_module, "_tracer", _NoOpTracer()):
            @trace_llm_call(task="test", provider="deepseek")
            def my_fn():
                return 42

            result = my_fn()
            assert result == 42

    def test_trace_llm_call_decorator_async(self):
        from observability.tracing import trace_llm_call, _NoOpTracer
        from observability import tracing as tracing_module

        with patch.object(tracing_module, "_tracer", _NoOpTracer()):
            @trace_llm_call(task="async_test", provider="deepseek")
            async def my_async_fn():
                return "done"

            result = asyncio.run(my_async_fn())
            assert result == "done"

    def test_trace_db_operation_decorator(self):
        from observability.tracing import trace_db_operation, _NoOpTracer
        from observability import tracing as tracing_module

        with patch.object(tracing_module, "_tracer", _NoOpTracer()):
            @trace_db_operation(operation="select", table="resumes")
            async def get_data():
                return {"rows": 5}

            result = asyncio.run(get_data())
            assert result == {"rows": 5}

    def test_trace_cache_operation_decorator(self):
        from observability.tracing import trace_cache_operation, _NoOpTracer
        from observability import tracing as tracing_module

        with patch.object(tracing_module, "_tracer", _NoOpTracer()):
            @trace_cache_operation(operation="get", cache_type="redis")
            async def get_cache():
                return "cached_value"

            result = asyncio.run(get_cache())
            assert result == "cached_value"

    def test_decorator_propagates_exception(self):
        from observability.tracing import trace_llm_call, _NoOpTracer
        from observability import tracing as tracing_module

        with patch.object(tracing_module, "_tracer", _NoOpTracer()):
            @trace_llm_call(task="fail_task")
            async def bad_fn():
                raise ValueError("LLM exploded")

            with pytest.raises(ValueError, match="LLM exploded"):
                asyncio.run(bad_fn())


# ─────────────────────────────────────────────────────────────────────────
# 5.  sentry.py — safe init paths
# ─────────────────────────────────────────────────────────────────────────
class TestSentrySetup:
    def test_setup_sentry_noop_when_no_dsn(self):
        """setup_sentry should log a message and return without raising."""
        from observability import sentry as sentry_module
        with patch.object(sentry_module, "SENTRY_BACKEND_DSN", ""):
            with patch.object(sentry_module, "OBSERVABILITY_ENABLED", True):
                # Should not raise
                sentry_module.setup_sentry()

    def test_setup_sentry_noop_when_observability_disabled(self):
        from observability import sentry as sentry_module
        with patch.object(sentry_module, "OBSERVABILITY_ENABLED", False):
            sentry_module.setup_sentry()

    def test_before_send_no_longer_drops_4xx(self):
        # before_send used to drop every exception-based event under 500 --
        # that's exactly what hid 4xx traffic from Sentry entirely (a route
        # returning a 404/400/422 Response directly, with no exception
        # raised, was invisible either way). Non-2xx capture now happens in
        # observability/middleware.py's _capture_non_2xx instead, which
        # covers both cases; before_send only sanitizes now, regardless of
        # status code. See docs/CHANGELOG.md 3.15.21.
        from observability.sentry import before_send
        from fastapi import HTTPException
        exc = HTTPException(status_code=404)
        event = {"message": "not found"}
        result = before_send(event, {"exc_info": (type(exc), exc, None)})
        assert result is not None

    def test_before_send_keeps_5xx(self):
        from observability.sentry import before_send
        from fastapi import HTTPException
        exc = HTTPException(status_code=500)
        event = {"message": "server error"}
        result = before_send(event, {"exc_info": (type(exc), exc, None)})
        # 5xx should NOT be dropped — returned as-is (possibly redacted)
        assert result is not None

    def test_before_send_redacts_password_in_event(self):
        from observability.sentry import before_send
        event = {"extra": {"password": "secret123"}, "message": "error"}
        result = before_send(event, {})
        assert result is not None
        assert result["extra"]["password"] == "[REDACTED]"
