import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from core.config import settings
from core.logging import logger
from typing import Generator
import threading
import time

_db_pool: ThreadedConnectionPool | None = None
_pool_lock = threading.Lock()


class BlockingThreadedConnectionPool(ThreadedConnectionPool):
    """Thread-safe psycopg2 pool that queues callers instead of failing fast."""

    def __init__(self, *args, checkout_timeout: float = 30.0, **kwargs):
        super().__init__(*args, **kwargs)
        self.checkout_timeout = checkout_timeout
        self._availability = threading.Condition()

    def getconn(self, key=None, timeout=None):
        wait_timeout = self.checkout_timeout if timeout is None else timeout
        deadline = time.monotonic() + wait_timeout
        while True:
            try:
                return super().getconn(key)
            except psycopg2.pool.PoolError:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    logger.error(
                        "[DATABASE_POOL] Checkout timed out after %.1fs (maxconn=%s)",
                        wait_timeout,
                        self.maxconn,
                    )
                    raise
                with self._availability:
                    self._availability.wait(timeout=min(remaining, 0.5))

    def putconn(self, conn, key=None, close=False):
        try:
            return super().putconn(conn, key=key, close=close)
        finally:
            with self._availability:
                self._availability.notify()

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
                _db_pool = BlockingThreadedConnectionPool(
                    minconn=2,
                    maxconn=pool_maxconn,
                    dsn=dsn,
                    checkout_timeout=30.0,
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
    conn = pool.getconn()

    try:
        if conn.closed != 0:
            pool.putconn(conn, close=True)
            conn = None
            conn = pool.getconn()
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
