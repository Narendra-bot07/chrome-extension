import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from core.config import settings
from core.logging import logger
from typing import Generator
import threading
import time

_db_pool: ThreadedConnectionPool | None = None
_pool_lock = threading.Lock()

def get_db_pool() -> ThreadedConnectionPool:
    """
    Get or create the global ThreadedConnectionPool singleton.
    Pre-warms persistent database connections for sub-millisecond checkouts.
    """
    global _db_pool
    if _db_pool is None:
        with _pool_lock:
            if _db_pool is None:
                if not settings.DATABASE_URL:
                    raise ValueError("DATABASE_URL is not set in environment settings.")
                # maxconn must never exceed what Supabase's own pooler will actually
                # grant this project (Database Settings -> Connection Pooling ->
                # "Connection pool size", tied to compute add-on size -- 15 on the
                # default Nano tier). Asking psycopg2's own pool for more than that
                # doesn't get you more real connections; it just means the (n+1)th
                # checkout hangs/fails against Supabase's pooler instead of failing
                # cleanly against this pool's own ceiling. Keep a small margin below
                # the real limit for other clients (migrations, Supabase Studio, etc).
                # If the Supabase compute tier changes, update this to match.
                pool_maxconn = 12
                logger.info(f"[DATABASE_POOL] Pre-warming ThreadedConnectionPool (minconn=2, maxconn={pool_maxconn})...")
                dsn = settings.DATABASE_URL
                if "connect_timeout" not in dsn.lower():
                    sep = "&" if "?" in dsn else "?"
                    dsn = f"{dsn}{sep}connect_timeout=10&keepalives=1"
                _db_pool = ThreadedConnectionPool(
                    minconn=2,
                    maxconn=pool_maxconn,
                    dsn=dsn
                )
                logger.info("[DATABASE_POOL] Connection pool initialized successfully.")
    return _db_pool

def close_db_pool():
    """
    Gracefully close all pooled database connections on application shutdown.
    """
    global _db_pool
    if _db_pool is not None:
        with _pool_lock:
            if _db_pool is not None:
                logger.info("[DATABASE_POOL] Closing database connection pool...")
                _db_pool.closeall()
                _db_pool = None

def get_db_connection() -> Generator[psycopg2.extensions.connection, None, None]:
    """
    FastAPI Dependency injection provider yielding a pre-warmed connection from the pool.
    Includes automatic queueing retry to prevent PoolError: connection pool exhausted.
    """
    pool = get_db_pool()
    conn = None
    start_time = time.time()
    
    # Retry checkout for up to 5 seconds if pool is temporarily saturated under high concurrency
    while conn is None:
        try:
            conn = pool.getconn()
        except psycopg2.pool.PoolError:
            if time.time() - start_time > 5.0:
                logger.error("[DATABASE_POOL] Connection checkout timed out after 5.0s!")
                raise
            time.sleep(0.05)

    try:
        if conn.closed != 0:
            pool.putconn(conn, close=True)
            conn = None
            # Checkout a fresh connection with retry
            start_time = time.time()
            while conn is None:
                try:
                    conn = pool.getconn()
                except psycopg2.pool.PoolError:
                    if time.time() - start_time > 5.0:
                        raise
                    time.sleep(0.05)
        yield conn
    except Exception:
        if conn and conn.closed == 0:
            conn.rollback()
        raise
    finally:
        if conn and conn.closed == 0:
            pool.putconn(conn)
        elif conn:
            pool.putconn(conn, close=True)
