import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from core.logging import log_request_performance

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        duration_ms = (time.time() - start_time) * 1000
        log_request_performance(request, duration_ms, response.status_code)
        return response
