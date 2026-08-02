import os
import time
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Type, Tuple, Callable
from pydantic import BaseModel, ValidationError

from core.config import settings
from services.cache.redis_cache import redis_cache
from services.cache.llm_fingerprint import LLMFingerprintBuilder
from services.cache.llm_cache_telemetry import llm_telemetry

logger = logging.getLogger("llm_cache")


class LLMCacheEnvelope(BaseModel):
    """
    Standard envelope schema for all LLM cached responses stored in Redis.
    """
    cache_version: str = "v1"
    task: str
    provider: str = "deepseek"
    model: str = "configured-model"
    prompt_version: str = "v1"
    schema_version: str = "v1"
    created_at: str
    expires_at: str
    input_fingerprint: str
    validated: bool = True
    result: Any
    usage: Dict[str, int] = {"original_input_tokens": 0, "original_output_tokens": 0}


class LLMCacheService:
    """
    Production-grade Redis caching layer for all Tailr4U LLM workflows.
    Provides deterministic fingerprinting, schema validation on hit,
    task-specific TTLs, distributed single-flight locking, and resilient fallback.
    """

    def __init__(self):
        self.namespace = os.getenv("LLM_CACHE_NAMESPACE", getattr(settings, "LLM_CACHE_NAMESPACE", "tailr4u"))
        self.schema_version = os.getenv("LLM_CACHE_SCHEMA_VERSION", getattr(settings, "LLM_CACHE_SCHEMA_VERSION", "v1"))
        self.enabled = os.getenv("LLM_CACHE_ENABLED", "true").lower() in ("true", "1", "yes")

        # Task TTL Defaults (configurable via environment variables)
        self.ttl_jd = int(os.getenv("LLM_CACHE_TTL_JD_SECONDS", getattr(settings, "LLM_CACHE_TTL_JD_SECONDS", 604800)))
        self.ttl_recovery = int(os.getenv("LLM_CACHE_TTL_RECOVERY_SECONDS", getattr(settings, "LLM_CACHE_TTL_RECOVERY_SECONDS", 604800)))
        self.ttl_tailoring = int(os.getenv("LLM_CACHE_TTL_TAILORING_SECONDS", getattr(settings, "LLM_CACHE_TTL_TAILORING_SECONDS", 86400)))
        self.ttl_summary = int(os.getenv("LLM_CACHE_TTL_SUMMARY_SECONDS", getattr(settings, "LLM_CACHE_TTL_SUMMARY_SECONDS", 86400)))
        self.ttl_cover_letter = int(os.getenv("LLM_CACHE_TTL_COVER_LETTER_SECONDS", getattr(settings, "LLM_CACHE_TTL_COVER_LETTER_SECONDS", 86400)))

        self.lock_ttl = int(os.getenv("LLM_CACHE_LOCK_TTL_SECONDS", getattr(settings, "LLM_CACHE_LOCK_TTL_SECONDS", 120)))
        self.lock_wait_timeout = float(os.getenv("LLM_CACHE_LOCK_WAIT_SECONDS", getattr(settings, "LLM_CACHE_LOCK_WAIT_SECONDS", 15.0)))

    def get_task_ttl(self, task: str) -> int:
        clean_task = task.lower()
        if "jd" in clean_task:
            return self.ttl_jd
        if "recovery" in clean_task or "resume_structure" in clean_task or "parse_resume" in clean_task:
            return self.ttl_recovery
        if "summary" in clean_task or "refinement" in clean_task:
            return self.ttl_summary
        if "cover_letter" in clean_task:
            return self.ttl_cover_letter
        return self.ttl_tailoring

    def get(
        self,
        *,
        task: str,
        fingerprint: str,
        expected_schema: Optional[Type[BaseModel]] = None,
        prompt_version: str = "v1",
        provider: str = "deepseek",
        bypass_cache: bool = False
    ) -> Optional[Tuple[Any, Dict[str, int]]]:
        """
        Fetch cached entry from Redis.
        Validates envelope metadata, prompt version, schema version, and Pydantic model.
        Returns Tuple[validated_result, usage_dict] or None on cache miss/invalid schema.
        """
        if not self.enabled or bypass_cache:
            if bypass_cache:
                llm_telemetry.record_request(task, "bypass")
            return None

        cache_key = LLMFingerprintBuilder.build_cache_key(
            namespace=self.namespace,
            schema_version=self.schema_version,
            provider=provider,
            task=task,
            fingerprint=fingerprint
        )

        try:
            raw_data = redis_cache.get(cache_key)
            if not raw_data:
                llm_telemetry.record_request(task, "miss")
                return None

            # Deserialize envelope
            if isinstance(raw_data, str):
                envelope = LLMCacheEnvelope.model_validate_json(raw_data)
            elif isinstance(raw_data, dict):
                envelope = LLMCacheEnvelope.model_validate(raw_data)
            else:
                envelope = LLMCacheEnvelope.model_validate(raw_data)

            # Verification 1: Cache Version & Task
            if envelope.cache_version != "v1" or envelope.task != task or envelope.input_fingerprint != fingerprint:
                logger.warning(f"[LLM_CACHE_INVALID] Envelope mismatch for key {cache_key[:30]}")
                redis_cache.delete(cache_key)
                llm_telemetry.record_request(task, "invalid")
                return None

            # Verification 2: Prompt Version
            if envelope.prompt_version != prompt_version:
                logger.info(f"[LLM_CACHE_STALE_PROMPT] Prompt version changed ({envelope.prompt_version} != {prompt_version}). Invalidating key.")
                redis_cache.delete(cache_key)
                llm_telemetry.record_request(task, "invalid")
                return None

            # Verification 3: Domain Pydantic Schema Validation
            result_data = envelope.result
            validated_obj = result_data

            if expected_schema:
                if isinstance(result_data, dict):
                    validated_obj = expected_schema.model_validate(result_data)
                elif isinstance(result_data, expected_schema):
                    validated_obj = result_data
                elif hasattr(expected_schema, "model_validate"):
                    validated_obj = expected_schema.model_validate(result_data)
                else:
                    validated_obj = expected_schema(**result_data)

            llm_telemetry.record_request(task, "hit")
            usage = envelope.usage or {"original_input_tokens": 0, "original_output_tokens": 0}
            llm_telemetry.record_token_savings(
                task,
                usage.get("original_input_tokens", 0),
                usage.get("original_output_tokens", 0)
            )
            return validated_obj, usage

        except (ValidationError, Exception) as err:
            logger.warning(f"[LLM_CACHE_VALIDATION_FAILED] Key {cache_key[:30]} failed validation: {err}")
            try:
                redis_cache.delete(cache_key)
            except Exception:
                pass
            llm_telemetry.record_request(task, "invalid")
            return None

    def set(
        self,
        *,
        task: str,
        fingerprint: str,
        value: Any,
        prompt_version: str = "v1",
        schema_version: str = "v1",
        provider: str = "deepseek",
        model: str = "deepseek-v4-flash",
        ttl_seconds: Optional[int] = None,
        usage: Optional[Dict[str, int]] = None
    ) -> bool:
        """
        Write a validated LLM output to Redis enveloped with metadata.
        Never write unvalidated or failed model outputs.
        """
        if not self.enabled or value is None:
            return False

        cache_key = LLMFingerprintBuilder.build_cache_key(
            namespace=self.namespace,
            schema_version=self.schema_version,
            provider=provider,
            task=task,
            fingerprint=fingerprint
        )

        effective_ttl = ttl_seconds if ttl_seconds is not None else self.get_task_ttl(task)
        now_dt = datetime.now(timezone.utc)
        exp_dt = datetime.fromtimestamp(now_dt.timestamp() + effective_ttl, timezone.utc)

        # Convert result object to JSON serializable dict/value
        if hasattr(value, "model_dump"):
            serializable_result = value.model_dump(mode="json")
        elif hasattr(value, "__dict__"):
            serializable_result = value.__dict__
        else:
            serializable_result = value

        envelope = LLMCacheEnvelope(
            cache_version="v1",
            task=task,
            provider=provider,
            model=model,
            prompt_version=prompt_version,
            schema_version=schema_version,
            created_at=now_dt.isoformat(),
            expires_at=exp_dt.isoformat(),
            input_fingerprint=fingerprint,
            validated=True,
            result=serializable_result,
            usage=usage or {"original_input_tokens": 0, "original_output_tokens": 0}
        )

        try:
            serialized_env = envelope.model_dump(mode="json")
            success = redis_cache.set(cache_key, serialized_env, ttl_seconds=effective_ttl)
            return success
        except Exception as err:
            llm_telemetry.record_write_failure(task, err)
            return False

    def acquire_lock(self, lock_key: str, owner_id: str, ttl_seconds: Optional[int] = None) -> bool:
        """
        Attempt to acquire short distributed SET NX lock to prevent concurrent stampedes.
        """
        ttl = ttl_seconds if ttl_seconds is not None else self.lock_ttl
        full_lock_key = f"lock:llm:{lock_key}"

        # 1. Standard redis client
        if redis_cache._redis_client:
            try:
                res = redis_cache._redis_client.set(full_lock_key, owner_id, nx=True, ex=ttl)
                return bool(res)
            except Exception:
                pass

        # 2. Upstash client / HTTP
        if redis_cache._upstash_client:
            try:
                res = redis_cache._upstash_client.set(full_lock_key, owner_id, nx=True, ex=ttl)
                return bool(res)
            except Exception:
                pass

        # 3. Fallback memory lock
        cached_lock = redis_cache._memory_cache.get(full_lock_key)
        if not cached_lock:
            redis_cache._memory_cache[full_lock_key] = owner_id
            return True
        return cached_lock == owner_id

    def release_lock(self, lock_key: str, owner_id: str) -> bool:
        """
        Release distributed lock only if owner_id matches.
        """
        full_lock_key = f"lock:llm:{lock_key}"

        if redis_cache._redis_client:
            try:
                val = redis_cache._redis_client.get(full_lock_key)
                if val == owner_id:
                    redis_cache._redis_client.delete(full_lock_key)
                    return True
                return False
            except Exception:
                pass

        if redis_cache._upstash_client:
            try:
                val = redis_cache._upstash_client.get(full_lock_key)
                if val == owner_id:
                    redis_cache._upstash_client.delete(full_lock_key)
                    return True
                return False
            except Exception:
                pass

        if redis_cache._memory_cache.get(full_lock_key) == owner_id:
            redis_cache._memory_cache.pop(full_lock_key, None)
            return True
        return False

    def execute_with_cache(
        self,
        *,
        task: str,
        payload_to_fingerprint: Any,
        llm_callable: Callable[[], BaseModel],
        expected_schema: Type[BaseModel],
        prompt_version: str = "v1",
        provider: str = "deepseek",
        model: str = "deepseek-v4-flash",
        bypass_cache: bool = False,
        ttl_seconds: Optional[int] = None
    ) -> BaseModel:
        """
        Single-flight LLM Execution Wrapper with Redis caching and distributed locking.
        """
        fingerprint = LLMFingerprintBuilder.build_fingerprint(payload_to_fingerprint)

        # 1. Attempt Cache Read
        cached = self.get(
            task=task,
            fingerprint=fingerprint,
            expected_schema=expected_schema,
            prompt_version=prompt_version,
            provider=provider,
            bypass_cache=bypass_cache
        )
        if cached is not None:
            result_obj, _ = cached
            return result_obj

        # 2. Acquire Single-Flight Distributed Lock to prevent duplicate concurrent generation
        owner_id = str(uuid.uuid4())
        lock_acquired = self.acquire_lock(fingerprint, owner_id)

        if not lock_acquired:
            llm_telemetry.record_lock_contention(task)
            start_wait = time.time()
            while time.time() - start_wait < self.lock_wait_timeout:
                time.sleep(0.25)
                cached = self.get(
                    task=task,
                    fingerprint=fingerprint,
                    expected_schema=expected_schema,
                    prompt_version=prompt_version,
                    provider=provider,
                    bypass_cache=bypass_cache
                )
                if cached is not None:
                    result_obj, _ = cached
                    return result_obj

            logger.warning(f"[LLM_CACHE_LOCK_TIMEOUT] Lock wait timed out for task={task}. Proceeding with fallback call.")

        # 3. Call DeepSeek LLM Function
        try:
            result_obj = llm_callable()

            # 4. Write Envelope to Cache after successful validation
            if result_obj is not None:
                self.set(
                    task=task,
                    fingerprint=fingerprint,
                    value=result_obj,
                    prompt_version=prompt_version,
                    schema_version=getattr(expected_schema, "__name__", "v1"),
                    provider=provider,
                    model=model,
                    ttl_seconds=ttl_seconds
                )
            return result_obj

        finally:
            if lock_acquired:
                self.release_lock(fingerprint, owner_id)


llm_cache = LLMCacheService()
