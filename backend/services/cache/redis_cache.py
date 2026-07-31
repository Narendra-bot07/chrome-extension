import os
import json
import logging
import requests
from typing import Any, Optional
from core.config import settings

logger = logging.getLogger("redis_cache")

class RedisCacheService:
    """
    Unified Caching Service for Upstash Redis.
    Supports both standard Redis TLS (rediss://) and Upstash REST API.
    Falls back gracefully to in-memory caching if Redis is offline or unconfigured.
    """

    def __init__(self):
        self._redis_client = None
        self._upstash_client = None
        self._memory_cache = {}
        self._init_connection()

    def _init_connection(self):
        redis_url = (settings.UPSTASH_REDIS_URL or os.getenv("UPSTASH_REDIS_URL", "")).strip().strip('"').strip("'")
        if redis_url:
            try:
                import redis
                self._redis_client = redis.from_url(redis_url, decode_responses=True, socket_timeout=3.0)
                self._redis_client.ping()
                logger.info("[REDIS_CACHE] Connected to Upstash Redis via TLS protocol.")
                return
            except Exception as e:
                logger.warning(f"[REDIS_CACHE] Failed to connect via rediss:// ({e}). Checking REST API fallback...")

        rest_url = (settings.UPSTASH_REDIS_REST_URL or os.getenv("UPSTASH_REDIS_REST_URL", "")).strip().strip('"').strip("'")
        rest_token = (settings.UPSTASH_REDIS_REST_TOKEN or os.getenv("UPSTASH_REDIS_REST_TOKEN", "")).strip().strip('"').strip("'")
        if rest_url and rest_token:
            try:
                from upstash_redis import Redis
                self._upstash_client = Redis(url=rest_url, token=rest_token)
                logger.info("[REDIS_CACHE] Connected to Upstash Redis via official upstash_redis SDK.")
                return
            except Exception as e:
                logger.warning(f"[REDIS_CACHE] upstash_redis SDK init error ({e}). Using REST HTTP fallback...")

            self.rest_url = rest_url.rstrip("/")
            self.rest_token = rest_token
            logger.info("[REDIS_CACHE] Configured Upstash Redis via REST API.")
        else:
            logger.info("[REDIS_CACHE] Upstash Redis credentials not set. Using fallback in-memory cache.")

    def get(self, key: str) -> Optional[Any]:
        # 1. Try official Upstash Redis SDK
        if self._upstash_client:
            try:
                val = self._upstash_client.get(key)
                if val:
                    return json.loads(val) if isinstance(val, str) else val
                return None
            except Exception as e:
                logger.warning(f"[REDIS_CACHE] Upstash SDK get error for key '{key}': {e}")

        # 2. Try standard Redis TCP client
        if self._redis_client:
            try:
                val = self._redis_client.get(key)
                if val:
                    return json.loads(val)
                return None
            except Exception as e:
                logger.warning(f"[REDIS_CACHE] Redis get error for key '{key}': {e}")

        # 2. Try Upstash REST API
        rest_url = getattr(self, "rest_url", None)
        rest_token = getattr(self, "rest_token", None)
        if rest_url and rest_token:
            try:
                headers = {"Authorization": f"Bearer {rest_token}"}
                res = requests.get(f"{rest_url}/get/{key}", headers=headers, timeout=3.0)
                if res.status_code == 200:
                    result = res.json().get("result")
                    if result:
                        return json.loads(result)
            except Exception as e:
                logger.warning(f"[REDIS_CACHE] Upstash REST get error for key '{key}': {e}")

        # 3. Fallback to in-memory dict
        return self._memory_cache.get(key)

    def set(self, key: str, value: Any, ttl_seconds: int = 86400) -> bool:
        serialized = json.dumps(value, default=str)

        # 1. Try official Upstash Redis SDK
        if self._upstash_client:
            try:
                self._upstash_client.set(key, serialized, ex=ttl_seconds)
                return True
            except Exception as e:
                logger.warning(f"[REDIS_CACHE] Upstash SDK set error for key '{key}': {e}")

        # 2. Try standard Redis TCP client
        if self._redis_client:
            try:
                self._redis_client.setex(key, ttl_seconds, serialized)
                return True
            except Exception as e:
                logger.warning(f"[REDIS_CACHE] Redis set error for key '{key}': {e}")

        # 3. Try Upstash REST API
        rest_url = getattr(self, "rest_url", None)
        rest_token = getattr(self, "rest_token", None)
        if rest_url and rest_token:
            try:
                headers = {"Authorization": f"Bearer {rest_token}"}
                res = requests.get(f"{rest_url}/set/{key}/{serialized}?EX={ttl_seconds}", headers=headers, timeout=3.0)
                if res.status_code == 200:
                    return True
            except Exception as e:
                logger.warning(f"[REDIS_CACHE] Upstash REST set error for key '{key}': {e}")

        # 4. Fallback to in-memory dict
        if len(self._memory_cache) >= 500:
            first_k = next(iter(self._memory_cache))
            self._memory_cache.pop(first_k, None)
        self._memory_cache[key] = value
        return True

    def delete(self, key: str) -> bool:
        if self._upstash_client:
            try:
                self._upstash_client.delete(key)
            except Exception:
                pass
        if self._redis_client:
            try:
                self._redis_client.delete(key)
            except Exception:
                pass
        self._memory_cache.pop(key, None)
        return True

    def health_check(self) -> dict:
        if self._upstash_client:
            try:
                val = self._upstash_client.get("ping")
                return {"status": "online", "mode": "upstash_sdk", "connected": True}
            except Exception as e:
                return {"status": "degraded", "mode": "upstash_sdk", "error": str(e)}

        if self._redis_client:
            try:
                self._redis_client.ping()
                return {"status": "online", "mode": "redis_tls", "connected": True}
            except Exception as e:
                return {"status": "degraded", "mode": "redis_tls", "error": str(e)}

        rest_url = getattr(self, "rest_url", None)
        if rest_url:
            return {"status": "online", "mode": "upstash_rest", "connected": True}

        return {"status": "online", "mode": "in_memory_fallback", "connected": True}

redis_cache = RedisCacheService()
