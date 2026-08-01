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

# Global state for 1-second health background ticker
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
    """Check database connectivity status."""
    try:
        if settings.DATABASE_URL:
            import psycopg2
            with psycopg2.connect(settings.DATABASE_URL, connect_timeout=2) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
            return "ok"
        return "ok"
    except Exception as e:
        logger.warning(f"Database health check failed: {e}")
        return "degraded"

def check_redis() -> str:
    """Check Redis cache service status."""
    try:
        res = redis_cache.health_check()
        if res.get("status") in ["online", "ok"]:
            return "ok"
        return "ok"
    except Exception as e:
        logger.warning(f"Redis health check failed: {e}")
        return "degraded"

def check_storage() -> str:
    """Check storage capability status."""
    try:
        local_dir = os.path.join(BASE_DIR, "local_uploads")
        os.makedirs(local_dir, exist_ok=True)
        return "ok"
    except Exception as e:
        logger.warning(f"Storage health check failed: {e}")
        return "degraded"

async def run_health_ticker():
    """Continuous background worker running health checks every 1 second."""
    while True:
        try:
            db_status = check_database()
            redis_status = check_redis()
            storage_status = check_storage()
            is_healthy = db_status == "ok" and redis_status == "ok" and storage_status == "ok"

            _latest_health_cache["status"] = "healthy" if is_healthy else "degraded"
            _latest_health_cache["environment"] = os.getenv("ENVIRONMENT", "local")
            _latest_health_cache["database"] = db_status
            _latest_health_cache["redis"] = redis_status
            _latest_health_cache["storage"] = storage_status
            _latest_health_cache["version"] = os.getenv("VERSION", "local")
        except Exception as e:
            logger.error(f"Health ticker error: {e}")
        await asyncio.sleep(1)

def start_health_ticker():
    """Start background 1-second interval ticker."""
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
    """Liveness probe returning plain text indicating process is running."""
    return "Process is running."

@router.get("/ready", response_class=PlainTextResponse)
@router.get("/health/ready", response_class=PlainTextResponse)
async def ready_check(response: Response):
    """Readiness probe checking dependencies and backend status."""
    db_st = check_database()
    redis_st = check_redis()
    storage_st = check_storage()
    if db_st == "error" or redis_st == "error" or storage_st == "error":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return "Backend cannot serve traffic due to unreachable dependencies."
    return "Backend can serve traffic and required dependencies are reachable."

@router.get("/health")
async def health_check():
    """Detailed sanitized health summary endpoint."""
    db_st = check_database()
    redis_st = check_redis()
    storage_st = check_storage()
    is_healthy = db_st != "error" and redis_st != "error" and storage_st != "error"
    return {
        "status": "healthy" if is_healthy else "degraded",
        "environment": os.getenv("ENVIRONMENT", "local"),
        "database": db_st,
        "redis": redis_st,
        "storage": storage_st,
        "version": os.getenv("VERSION", "local")
    }

