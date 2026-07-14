import logging
import sys
import time
from fastapi import Request

# Configure basic structured logging format
logging.basicConfig(
    level=logging.INFO,
    format='{"time": "%(asctime)s", "level": "%(levelname)s", "message": "%(message)s"}',
    stream=sys.stdout
)

logger = logging.getLogger("app")

def log_request_performance(request: Request, duration_ms: float, status_code: int):
    logger.info(
        f"Request: {request.method} {request.url.path} | Status: {status_code} | Duration: {duration_ms:.2f}ms"
    )
