import pytest
import time
from unittest.mock import MagicMock, patch
from pydantic import BaseModel, ConfigDict

from services.cache.llm_fingerprint import LLMFingerprintBuilder
from services.cache.llm_cache import LLMCacheService, LLMCacheEnvelope
from services.cache.llm_cache_telemetry import llm_telemetry
from services.cache.redis_cache import redis_cache as _redis_cache_singleton


class MockSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = ""
    skills: list[str] = []


@pytest.fixture(autouse=True)
def isolated_memory_cache():
    """
    Replace the shared redis_cache._memory_cache with a fresh dict for each test.
    Also disables all real Redis/Upstash clients so tests never touch production infrastructure.
    """
    original_memory = _redis_cache_singleton._memory_cache
    original_upstash = _redis_cache_singleton._upstash_client
    original_redis = _redis_cache_singleton._redis_client
    original_rest_url = getattr(_redis_cache_singleton, "rest_url", None)
    original_rest_token = getattr(_redis_cache_singleton, "rest_token", None)

    # Isolate: fresh memory, no real connections
    _redis_cache_singleton._memory_cache = {}
    _redis_cache_singleton._upstash_client = None
    _redis_cache_singleton._redis_client = None
    if hasattr(_redis_cache_singleton, "rest_url"):
        _redis_cache_singleton.rest_url = None
    if hasattr(_redis_cache_singleton, "rest_token"):
        _redis_cache_singleton.rest_token = None

    yield

    # Restore originals
    _redis_cache_singleton._memory_cache = original_memory
    _redis_cache_singleton._upstash_client = original_upstash
    _redis_cache_singleton._redis_client = original_redis
    if hasattr(_redis_cache_singleton, "rest_url"):
        _redis_cache_singleton.rest_url = original_rest_url
    if hasattr(_redis_cache_singleton, "rest_token"):
        _redis_cache_singleton.rest_token = original_rest_token


def test_fingerprint_builder_idempotency():
    """Verify identical inputs with different key ordering or whitespace produce identical fingerprints."""
    payload1 = {
        "text": "  Hello World!\r\nThis is a test.  ",
        "skills": ["python", "react"],
        "sections": {"b": 2, "a": 1}
    }
    payload2 = {
        "sections": {"a": 1, "b": 2},
        "text": "Hello World!\nThis is a test.",
        "skills": ["python", "react"]
    }

    fp1 = LLMFingerprintBuilder.build_fingerprint(payload1)
    fp2 = LLMFingerprintBuilder.build_fingerprint(payload2)

    assert fp1 == fp2, "Fingerprints must match across key reordering and whitespace normalization"


def test_fingerprint_builder_different_payloads():
    """Verify different payloads produce distinct fingerprints."""
    payload1 = {"text": "Job A"}
    payload2 = {"text": "Job B"}

    fp1 = LLMFingerprintBuilder.build_fingerprint(payload1)
    fp2 = LLMFingerprintBuilder.build_fingerprint(payload2)

    assert fp1 != fp2, "Different payloads must produce distinct fingerprints"


def test_cache_hit_and_miss():
    """Verify basic get/set operations on LLMCacheService."""
    cache = LLMCacheService()
    task = "test_task"
    fingerprint = "fp1234567890"

    # Initial get should be a miss
    cached = cache.get(task=task, fingerprint=fingerprint, expected_schema=MockSchema)
    assert cached is None

    # Set valid object
    val = MockSchema(title="Software Engineer", skills=["Python", "FastAPI"])
    set_ok = cache.set(
        task=task,
        fingerprint=fingerprint,
        value=val,
        prompt_version="v1",
        usage={"original_input_tokens": 100, "original_output_tokens": 50}
    )
    assert set_ok is True

    # Subsequent get should be a hit
    hit = cache.get(task=task, fingerprint=fingerprint, expected_schema=MockSchema)
    assert hit is not None
    result_obj, usage = hit
    assert result_obj.title == "Software Engineer"
    assert result_obj.skills == ["Python", "FastAPI"]
    assert usage["original_input_tokens"] == 100


def test_stale_prompt_version_invalidation():
    """Verify changing prompt version results in a cache miss and purges the old key."""
    cache = LLMCacheService()
    task = "test_prompt_invalidation"
    fingerprint = "fp_prompt_test"

    val = MockSchema(title="DevOps", skills=["Docker"])
    cache.set(task=task, fingerprint=fingerprint, value=val, prompt_version="v1")

    # Call with prompt_version="v2" should fail validation and return None
    hit = cache.get(task=task, fingerprint=fingerprint, expected_schema=MockSchema, prompt_version="v2")
    assert hit is None


def test_invalid_schema_purging():
    """Verify corrupted cache data purges automatically on get."""
    cache = LLMCacheService()
    task = "test_schema_corrupt"
    fingerprint = "fp_corrupt"

    # Set an invalid dict structure for MockSchema
    corrupt_data = {"invalid_field": 123}
    cache.set(task=task, fingerprint=fingerprint, value=corrupt_data, prompt_version="v1")

    # Get with expected_schema=MockSchema should fail validation and return None
    hit = cache.get(task=task, fingerprint=fingerprint, expected_schema=MockSchema)
    assert hit is None


def test_execute_with_cache_single_flight():
    """Verify execute_with_cache executes LLM callable once and caches subsequent calls."""
    cache = LLMCacheService()
    task = "test_execute_single_flight"
    payload = {"input": "test input payload"}

    mock_llm_call = MagicMock(return_value=MockSchema(title="Frontend Developer", skills=["React"]))

    # First call - should trigger mock_llm_call
    res1 = cache.execute_with_cache(
        task=task,
        payload_to_fingerprint=payload,
        llm_callable=mock_llm_call,
        expected_schema=MockSchema
    )
    assert res1.title == "Frontend Developer"
    assert mock_llm_call.call_count == 1

    # Second call - should return cached result without calling mock_llm_call again
    res2 = cache.execute_with_cache(
        task=task,
        payload_to_fingerprint=payload,
        llm_callable=mock_llm_call,
        expected_schema=MockSchema
    )
    assert res2.title == "Frontend Developer"
    assert mock_llm_call.call_count == 1, "LLM callable must NOT be executed on cache hit"


def test_distributed_lock_acquisition_and_release():
    """Verify lock acquisition and release behavior."""
    cache = LLMCacheService()
    lock_key = "lock_test_123"
    owner_1 = "owner_alice"
    owner_2 = "owner_bob"

    # Owner 1 acquires lock
    assert cache.acquire_lock(lock_key, owner_1) is True

    # Owner 2 attempts to acquire lock (should fail)
    assert cache.acquire_lock(lock_key, owner_2) is False

    # Owner 2 tries to release Owner 1's lock (should fail)
    assert cache.release_lock(lock_key, owner_2) is False

    # Owner 1 releases lock
    assert cache.release_lock(lock_key, owner_1) is True

    # Owner 2 can now acquire lock
    assert cache.acquire_lock(lock_key, owner_2) is True
    cache.release_lock(lock_key, owner_2)


def test_redis_failure_graceful_fallback():
    """Verify that if Redis throws an exception during get/set, cache falls back gracefully to direct LLM execution."""
    cache = LLMCacheService()
    task = "test_redis_outage"
    payload = {"data": "outage"}

    mock_llm_call = MagicMock(return_value=MockSchema(title="Backend Dev", skills=["Python"]))

    with patch("services.cache.redis_cache.redis_cache.get", side_effect=Exception("Redis connection refused")):
        res = cache.execute_with_cache(
            task=task,
            payload_to_fingerprint=payload,
            llm_callable=mock_llm_call,
            expected_schema=MockSchema
        )
        assert res.title == "Backend Dev"
        assert mock_llm_call.call_count == 1
