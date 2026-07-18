import time
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from core.exceptions import BaseAppException
from core.logging import log_request_performance

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        try:
            response = await call_next(request)
        except BaseAppException as exc:
            response = JSONResponse(
                status_code=exc.status_code,
                content={"status": "error", "detail": exc.message}
            )
        finally:
            duration_ms = (time.time() - start_time) * 1000

        log_request_performance(request, duration_ms, response.status_code)
        return response
