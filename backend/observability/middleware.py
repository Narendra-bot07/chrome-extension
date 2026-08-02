import time
import uuid
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from core.exceptions import BaseAppException
from observability.context import set_request_id, set_trace_id, clear_context, get_request_id, get_trace_id
from observability.logging import logger
from observability.metrics import record_http_request

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

        # Retrieve matching route path template to prevent cardinality explosions
        route_path = "unknown"
        if "route" in request.scope:
            route_path = request.scope["route"].path
        else:
            # Fallback to path parsing if match is pending
            route_path = request.url.path

        # Log inbound request
        logger.info(
            f"http_request_inbound",
            extra={
                "method": request.method,
                "route": route_path,
                "client_ip": request.client.host if request.client else "unknown"
            }
        )

        try:
            response = await call_next(request)
            duration_ms = (time.time() - start_time) * 1000
            
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
            return response

        except BaseAppException as exc:
            duration_ms = (time.time() - start_time) * 1000
            
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
            return resp

        except Exception as unhandled:
            duration_ms = (time.time() - start_time) * 1000
            
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
