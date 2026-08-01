import time
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from core.exceptions import BaseAppException
from core.logging import logger

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        client_ip = request.client.host if request.client else "unknown"
        query_str = f"?{request.query_params}" if request.query_params else ""
        auth_header = "Bearer ***" if request.headers.get("authorization") else "None"
        
        # Log Inbound Request
        logger.info(
            f"[DEBUG][HTTP INBOUND] -> {request.method} {request.url.path}{query_str} | IP={client_ip} | Auth={auth_header}"
        )
        
        try:
            response = await call_next(request)
            duration_ms = (time.time() - start_time) * 1000
            logger.info(
                f"[DEBUG][HTTP OUTBOUND] <- {request.method} {request.url.path} | Status={response.status_code} | Duration={duration_ms:.2f}ms"
            )
            return response
        except BaseAppException as exc:
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                f"[DEBUG][HTTP ERROR] <- {request.method} {request.url.path} | Status={exc.status_code} | Exception={exc.message} | Duration={duration_ms:.2f}ms"
            )
            return JSONResponse(
                status_code=exc.status_code,
                content={"status": "error", "detail": exc.message}
            )
        except Exception as unhandled:
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                f"[DEBUG][HTTP UNHANDLED ERROR] <- {request.method} {request.url.path} | Exception={type(unhandled).__name__}: {str(unhandled)} | Duration={duration_ms:.2f}ms"
            )
            raise unhandled
