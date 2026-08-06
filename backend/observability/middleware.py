import time
import uuid
import sentry_sdk
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from core.exceptions import BaseAppException
from observability.context import set_request_id, set_trace_id, clear_context, get_request_id, get_trace_id
from observability.logging import logger
from observability.metrics import record_http_request


def _capture_non_2xx(method: str, route_path: str, status_code: int, duration_ms: float, request_id: str, exception: str = None) -> None:
    """Sends every non-2xx response (3xx/4xx/5xx) to Sentry as its own event,
    not just unhandled Python exceptions -- a route that returns a 404/400/422
    Response directly (no exception raised) never reaches Sentry's automatic
    exception capture at all, and the previous before_send filter dropped
    every <500 status outright. A no-op if Sentry was never initialized
    (missing DSN / OBSERVABILITY_ENABLED=false) -- capture_message is safe to
    call unconditionally per the SDK's own documented behavior."""
    if 200 <= status_code < 300:
        return
    level = "info" if status_code < 400 else ("warning" if status_code < 500 else "error")
    try:
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("http.method", method)
            scope.set_tag("http.route", route_path)
            scope.set_tag("http.status_code", status_code)
            scope.set_context("http_response", {
                "method": method,
                "route": route_path,
                "status_code": status_code,
                "duration_ms": duration_ms,
                "request_id": request_id,
                "exception": exception
            })
            scope.fingerprint = ["non-2xx-response", method, route_path, str(status_code)]
            sentry_sdk.capture_message(f"HTTP {status_code} {method} {route_path}", level=level)
    except Exception as err:
        logger.warning(f"[SENTRY_NON_2XX] Failed to capture non-2xx response: {err}")


class CorrelationAndLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.time()
        
        # 1. Request ID correlation
        request_id = request.headers.get("x-request-id")
        if not request_id:
            request_id = str(uuid.uuid4())
        set_request_id(request_id)
        
        # 2. Extract OTEL Trace ID if available (from headers or context)
        trace_id = request.headers.get("x-trace-id") or ""
        set_trace_id(trace_id)

        # Log inbound request. The route hasn't been matched yet at this point
        # (routing happens inside call_next(), below) so only the raw path is
        # known here — this line is for correlation only, not metrics.
        logger.info(
            f"http_request_inbound",
            extra={
                "method": request.method,
                "route": request.url.path,
                "client_ip": request.client.host if request.client else "unknown"
            }
        )

        def resolve_route_path() -> str:
            """Read the matched route TEMPLATE (e.g. '/resumes/{resume_id}') off the
            shared ASGI scope. Only valid after call_next() has run — the Router
            populates scope['route'] during dispatch, mutating the same scope dict
            this Request wraps. Falls back to the raw path for unmatched routes
            (404s) to avoid an 'unknown' bucket swallowing real 404 signal."""
            route = request.scope.get("route")
            return route.path if route is not None else request.url.path

        try:
            response = await call_next(request)
            duration_ms = (time.time() - start_time) * 1000
            route_path = resolve_route_path()

            # Record Prometheus Metrics
            record_http_request(
                method=request.method,
                route=route_path,
                status_code=response.status_code,
                duration_sec=duration_ms / 1000.0
            )
            # Log outbound response
            logger.info(
                f"http_request_completed",
                extra={
                    "method": request.method,
                    "route": route_path,
                    "status_code": response.status_code,
                    "duration_ms": duration_ms
                }
            )

            # Add Request ID correlation response header
            response.headers["X-Request-ID"] = request_id
            _capture_non_2xx(request.method, route_path, response.status_code, duration_ms, request_id)
            return response

        except BaseAppException as exc:
            duration_ms = (time.time() - start_time) * 1000
            route_path = resolve_route_path()

            # Record Prometheus Metrics for exceptions
            record_http_request(
                method=request.method,
                route=route_path,
                status_code=exc.status_code,
                duration_sec=duration_ms / 1000.0
            )
            logger.error(
                f"http_request_app_exception",
                extra={
                    "method": request.method,
                    "route": route_path,
                    "status_code": exc.status_code,
                    "exception": exc.message,
                    "duration_ms": duration_ms
                }
            )
            
            resp = JSONResponse(
                status_code=exc.status_code,
                content={"status": "error", "detail": exc.message}
            )
            resp.headers["X-Request-ID"] = request_id
            _capture_non_2xx(request.method, route_path, exc.status_code, duration_ms, request_id, exception=exc.message)
            return resp

        except Exception as unhandled:
            duration_ms = (time.time() - start_time) * 1000
            route_path = resolve_route_path()

            # Record Prometheus Metrics for 500 error
            record_http_request(
                method=request.method,
                route=route_path,
                status_code=500,
                duration_sec=duration_ms / 1000.0
            )
            logger.error(
                f"http_request_unhandled_exception",
                extra={
                    "method": request.method,
                    "route": route_path,
                    "status_code": 500,
                    "exception": f"{type(unhandled).__name__}: {str(unhandled)}",
                    "duration_ms": duration_ms
                }
            )
            
            # Let the exception handler or uvicorn handle it, but keep response context clean
            clear_context()
            raise unhandled
        
        finally:
            clear_context()
