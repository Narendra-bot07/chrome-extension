import logging
from typing import Dict, Any

logger = logging.getLogger("llm_cache_telemetry")

class LLMCacheTelemetry:
    """
    In-memory metrics tracker and privacy-preserving logger for LLM Cache operations.
    Track hits, misses, validation failures, saved calls, and saved token counts.
    """

    def __init__(self):
        self._metrics = {
            "requests_total": {},  # (task, result) -> count
            "hits_total": {},      # task -> count
            "misses_total": {},    # task -> count
            "validation_failures_total": {}, # task -> count
            "write_failures_total": {},      # task -> count
            "lock_contention_total": {},     # task -> count
            "saved_calls_total": {},         # task -> count
            "saved_input_tokens_total": {},  # task -> count
            "saved_output_tokens_total": {}, # task -> count
        }

    def _inc(self, metric_name: str, key: str, amount: int = 1):
        d = self._metrics[metric_name]
        d[key] = d.get(key, 0) + amount

    def record_request(self, task: str, result: str):
        """result: hit, miss, invalid, bypass, error"""
        req_key = f"{task}:{result}"
        self._inc("requests_total", req_key)

        if result == "hit":
            self._inc("hits_total", task)
            self._inc("saved_calls_total", task)
            logger.info(f"[LLM_CACHE_HIT] task={task}")
        elif result == "miss":
            self._inc("misses_total", task)
            logger.info(f"[LLM_CACHE_MISS] task={task}")
        elif result == "invalid":
            self._inc("validation_failures_total", task)
            logger.warning(f"[LLM_CACHE_INVALID] task={task} (Purged stale or malformed schema envelope)")
        elif result == "bypass":
            logger.info(f"[LLM_CACHE_BYPASS] task={task}")
        elif result == "error":
            logger.error(f"[LLM_CACHE_ERROR] task={task}")

    def record_token_savings(self, task: str, input_tokens: int, output_tokens: int):
        if input_tokens > 0:
            self._inc("saved_input_tokens_total", task, input_tokens)
        if output_tokens > 0:
            self._inc("saved_output_tokens_total", task, output_tokens)
        logger.info(
            f"[LLM_CACHE_SAVINGS] task={task} saved_input_tokens={input_tokens} saved_output_tokens={output_tokens}"
        )

    def record_lock_contention(self, task: str):
        self._inc("lock_contention_total", task)
        logger.info(f"[LLM_CACHE_LOCK_WAIT] task={task} (Waiting for concurrent LLM generation)")

    def record_write_failure(self, task: str, err: Any):
        self._inc("write_failures_total", task)
        logger.warning(f"[LLM_CACHE_WRITE_FAILURE] task={task} error={err}")

    def get_summary(self) -> Dict[str, Any]:
        """Return a snapshot of all cache metrics."""
        return {
            "requests": dict(self._metrics["requests_total"]),
            "hits": dict(self._metrics["hits_total"]),
            "misses": dict(self._metrics["misses_total"]),
            "validation_failures": dict(self._metrics["validation_failures_total"]),
            "write_failures": dict(self._metrics["write_failures_total"]),
            "lock_contention": dict(self._metrics["lock_contention_total"]),
            "saved_calls": dict(self._metrics["saved_calls_total"]),
            "saved_input_tokens": dict(self._metrics["saved_input_tokens_total"]),
            "saved_output_tokens": dict(self._metrics["saved_output_tokens_total"]),
        }

llm_telemetry = LLMCacheTelemetry()
