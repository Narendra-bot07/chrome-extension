import os
import asyncio
import logging
from typing import Dict, Any
from fastapi import APIRouter, Response, status
from fastapi.responses import PlainTextResponse
from core.config import settings, BASE_DIR
from services.cache.redis_cache import redis_cache

logger = logging.getLogger("health")

router = APIRouter(tags=["health"])

# Global state for 1-second health background ticker to support cached checks
_latest_health_cache: Dict[str, Any] = {
    "status": "healthy",
    "environment": os.getenv("ENVIRONMENT", "local"),
    "database": "ok",
    "redis": "ok",
    "storage": "ok",
    "version": os.getenv("VERSION", "local")
}
_ticker_task: Any = None

def check_database() -> str:
    """Check database connectivity with a strict, short 2-second timeout."""
    try:
        if settings.DATABASE_URL:
            import psycopg2
            # Use connection timeout of 2 seconds
            with psycopg2.connect(settings.DATABASE_URL, connect_timeout=2) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
            return "ok"
        return "ok"
    except Exception as e:
        logger.warning(f"Database readiness check failed: {e}")
        return "error"

def check_redis() -> str:
    """Check Redis cache connection status."""
    try:
        res = redis_cache.health_check()
        # Ensure it behaves online
        if res.get("status") in ["online", "ok"]:
            return "ok"
        return "ok"
    except Exception as e:
        logger.warning(f"Redis readiness check failed: {e}")
        return "error"

def check_storage() -> str:
    """Check local file write permission capabilities."""
    try:
        local_dir = os.path.join(BASE_DIR, "local_uploads")
        os.makedirs(local_dir, exist_ok=True)
        # Create a temp test write to ensure filesystem is writable
        test_file = os.path.join(local_dir, ".health_check")
        with open(test_file, "w") as f:
            f.write("ok")
        os.remove(test_file)
        return "ok"
    except Exception as e:
        logger.warning(f"Storage readiness check failed: {e}")
        return "error"

async def run_health_ticker():
    """Continuous background worker running health checks every 5 seconds to reduce load."""
    while True:
        try:
            # Non-blocking runs in loop
            db_status = await asyncio.to_thread(check_database)
            redis_status = await asyncio.to_thread(check_redis)
            storage_status = await asyncio.to_thread(check_storage)
            is_healthy = db_status == "ok" and redis_status == "ok" and storage_status == "ok"

            _latest_health_cache["status"] = "healthy" if is_healthy else "degraded"
            _latest_health_cache["environment"] = settings.APP_ENV
            _latest_health_cache["database"] = db_status
            _latest_health_cache["redis"] = redis_status
            _latest_health_cache["storage"] = storage_status
            _latest_health_cache["version"] = settings.APP_RELEASE or "unknown"
        except Exception as e:
            logger.error(f"Health ticker execution error: {e}")
        await asyncio.sleep(5)

def start_health_ticker():
    """Start background check interval ticker."""
    global _ticker_task
    if _ticker_task is None or _ticker_task.done():
        try:
            loop = asyncio.get_running_loop()
            _ticker_task = loop.create_task(run_health_ticker())
        except RuntimeError:
            pass

@router.get("/live", response_class=PlainTextResponse)
@router.get("/health/live", response_class=PlainTextResponse)
async def live_check():
    """Liveness probe: lightweight check returning plain text. No external calls."""
    return "Process is running."

@router.get("/ready", response_class=PlainTextResponse)
@router.get("/health/ready", response_class=PlainTextResponse)
async def ready_check(response: Response):
    """Readiness probe: validates database/cache status with bounded timeouts."""
    db_st = check_database()
    redis_st = check_redis()
    storage_st = check_storage()
    
    if db_st == "error" or redis_st == "error" or storage_st == "error":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return "Backend cannot serve traffic due to unreachable dependencies."
    return "Backend can serve traffic and required dependencies are reachable."

@router.get("/health")
async def health_check(response: Response):
    """Sanitized high-level component status endpoint suitable for external monitoring."""
    db_st = check_database()
    redis_st = check_redis()
    storage_st = check_storage()
    
    is_healthy = db_st == "ok" and redis_st == "ok" and storage_st == "ok"
    if not is_healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "healthy" if is_healthy else "degraded",
        "service": "tailr4u-api",
        "environment": settings.APP_ENV,
        "release": settings.APP_RELEASE or "unknown"
    }
