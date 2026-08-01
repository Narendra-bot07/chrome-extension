import os
import requests
import logging
from typing import Optional, Any

logger = logging.getLogger("tailr4u.rate_limiter")

class RateLimiterService:
    def __init__(self, conn: Optional[Any] = None):
        self.conn = conn
        self.upstash_url = os.getenv("UPSTASH_REDIS_REST_URL")
        self.upstash_token = os.getenv("UPSTASH_REDIS_REST_TOKEN")

    def is_rate_limited(self, action_key: str, identifier: str, max_requests: int, window_seconds: int) -> bool:
        """
        Check and record rate limits using Upstash Redis if configured, or Postgres auth_rate_limits fallback.
        """
        key = f"rl:{action_key}:{identifier}"

        # 1. Primary: Upstash Redis REST API
        if self.upstash_url and self.upstash_token:
            try:
                headers = {"Authorization": f"Bearer {self.upstash_token}"}
                url = self.upstash_url.rstrip('/')
                # Pipeline INCR and EXPIRE
                resp = requests.post(
                    f"{url}/pipeline",
                    headers=headers,
                    json=[
                        ["INCR", key],
                        ["EXPIRE", key, window_seconds, "NX"]
                    ],
                    timeout=3
                )
                if resp.status_code == 200:
                    results = resp.json()
                    incr_res = results[0].get("result", 1)
                    if isinstance(incr_res, int) and incr_res > max_requests:
                        logger.warning(f"Upstash Rate Limit exceeded for key={key}: {incr_res}/{max_requests}")
                        return True
                    return False
            except Exception as e:
                logger.warning(f"Upstash REST API error: {e}. Falling back to DB rate limiting.")

        # 2. Secondary: Postgres DB Auth Rate Limits
        if self.conn:
            try:
                with self.conn.cursor() as cur:
                    cur.execute(
                        """SELECT COUNT(*) FROM public.auth_rate_limits
                           WHERE action = %s AND subject_hash = %s
                             AND created_at > NOW() - (%s || ' seconds')::INTERVAL""",
                        (action_key, identifier, window_seconds)
                    )
                    row = cur.fetchone()
                    count = row[0] if row else 0
                    if count >= max_requests:
                        return True
                    cur.execute(
                        "INSERT INTO public.auth_rate_limits (action, subject_hash) VALUES (%s, %s)",
                        (action_key, identifier)
                    )
                    self.conn.commit()
                    return False
            except Exception as exc:
                logger.error(f"DB rate limiter exception: {exc}")
                if self.conn:
                    self.conn.rollback()

        return False
