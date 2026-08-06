# Tailr4U - Caching Architecture & Redis Specification

This document details the production-grade, multi-tiered caching architecture, Redis integration, input normalization, canonical SHA-256 fingerprinting, envelope schemas, distributed locking protocols, TTL retention policies, and in-memory fallback strategies for **Tailr4U**.

> **Vendor note**: Only the REST fallback tier (`https://api.upstash.io`) is genuinely Upstash-specific. The primary TCP path (`redis_cache.py:24-31`) is plain `redis-py` calling `redis.from_url()` against any `rediss://` URL — it will work against any TLS-capable Redis host, not just Upstash. "Upstash Redis" below refers to the specific instance currently configured in `.env`, not a hard vendor dependency in the code.

---

## 1. Caching System Overview

Tailr4U implements a multi-tier, provider-neutral LLM caching service (`LLMCacheService` in `services/cache/llm_cache.py`, backed by `RedisCacheService` in `services/cache/redis_cache.py`). The system is engineered to:
- **Reduce DeepSeek API calls and token usage**.
- **Reduce latency** for duplicate requests from ~12 seconds to `< 50ms`.
- **Prevent duplicate concurrent requests** via single-flight distributed locking (`SET NX`).
- **Preserve zero-hallucination contracts** through Pydantic domain schema validation on every cache hit.
- **Fail gracefully to direct LLM execution** if Redis becomes unreachable.

```mermaid
graph TD
    subgraph Client & LLM Workflow
        CALL["LLM Workflow Call<br/>(e.g., analyze_job_description)"]
        FINGERPRINT["LLMFingerprintBuilder<br/>(Canonical Normalization + SHA-256)"]
    end

    subgraph LLM Caching Engine (LLMCacheService)
        GET["1. Read Cache Envelope<br/>(llm_cache.get)"]
        VALIDATE["2. Pydantic Domain Model<br/>& Version Verification"]
        LOCK["3. Single-Flight Lock<br/>(SET NX lock:llm:{fingerprint})"]
        EXEC["4. Direct LLM Execution<br/>(DeepSeek Flash -> Pro)"]
        SET["5. Envelope Write<br/>(llm_cache.set)"]
    end

    subgraph Redis Transport (RedisCacheService)
        UPSTASH["Upstash Redis SDK / REST / TCP"]
        MEM["In-Memory LRU Dict Fallback"]
    end

    CALL --> FINGERPRINT
    FINGERPRINT --> GET
    GET -->|Cache Hit & Valid| VALIDATE
    VALIDATE -->|Valid| RETURN["Return Cached Result"]
    GET -->|Cache Miss / Stale| LOCK
    LOCK -->|Acquired Lock| EXEC
    LOCK -->|Lock Contention Wait| GET
    EXEC --> SET
    SET --> RETURN
    UPSTASH --- GET
    MEM --- UPSTASH
```

---

## 2. Upstash Redis Transport & Failover

`RedisCacheService` provides a unified transport layer supporting 4 fallback mechanisms:

1. **Official Upstash Redis SDK (`upstash_redis.Redis`)**: Uses `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
2. **Standard Redis TCP (`rediss://`)**: Uses TLS-encrypted socket connection via `redis.from_url()`.
3. **Upstash REST HTTP API**: Direct HTTP POST/GET calls (`https://api.upstash.io`) with Bearer authorization headers for serverless environments.
4. **Local In-Memory Fallback Cache**: In-memory Python dictionary capped at 500 entries, evicting the oldest-inserted key first (FIFO via `next(iter(dict))`, `redis_cache.py:124-126`) when no external Redis server is reachable. This is insertion-order eviction, not true LRU — there is no access-time tracking on `get()`.

---

## 3. Canonical Fingerprinting (`LLMFingerprintBuilder`)

To ensure deterministic fingerprints across formatting variations (whitespace, line endings, unordered dict keys):

1. **Unicode & Line Ending Unification**: Normalizes Unicode to NFC and converts `\r\n` line endings to `\n`.
2. **Canonical JSON Serialization**: Recursively sorts dictionary keys alphabetically and strips redundant whitespace.
3. **Collection Ordering**: Sorts unordered sets while strictly preserving ordered list sequences (e.g., section bullet lists).
4. **PII Safety**: Redis keys store ONLY the SHA-256 digest of the canonical input. Raw resume text, user emails, or user IDs are never stored in cache keys.

### Cache Key Structure
Keys follow a strict versioned namespace format:
`{namespace}:{schema_version}:{provider}:{task}:{sha256_fingerprint}`

**Example Key**:
`tailr4u:v1:deepseek:jd_structured_analysis:a3f8b91c0e4479...`

---

## 4. Metadata Envelope Schema (`LLMCacheEnvelope`)

Entries in Redis are wrapped in a standard JSON metadata envelope:

```json
{
  "cache_version": "v1",
  "task": "jd_structured_analysis",
  "provider": "deepseek",
  "model": "deepseek-v4-flash",
  "prompt_version": "analyze-jd-v3",
  "schema_version": "JobAnalysis-v1",
  "created_at": "2026-08-02T21:40:00Z",
  "expires_at": "2026-08-09T21:40:00Z",
  "input_fingerprint": "a3f8b91c0e4479...",
  "validated": true,
  "result": { ... },
  "usage": {
    "original_input_tokens": 1250,
    "original_output_tokens": 420
  }
}
```

---

## 5. Cache Retention & Task-Specific TTLs

TTL retention policies are configured per workflow task via environment variables:

| Workflow Task | Namespace Key Pattern | Default TTL | Environment Variable |
| :--- | :--- | :--- | :--- |
| **JD Structured Analysis** | `jd_structured_analysis` | `604,800s` (7 days) | `LLM_CACHE_TTL_JD_SECONDS` |
| **Resume Structure Recovery** | `resume_structure_recovery` | `604,800s` (7 days) | `LLM_CACHE_TTL_RECOVERY_SECONDS` |
| **Resume Patch Tailoring** | `resume_patch_tailoring` | `86,400s` (24 hrs) | `LLM_CACHE_TTL_TAILORING_SECONDS` |
| **Section Content Refinement** | `refine_*` | `86,400s` (24 hrs) | `LLM_CACHE_TTL_SUMMARY_SECONDS` |
| **Cover Letter Generation** | `cover_letter_generation` | `86,400s` (24 hrs) | `LLM_CACHE_TTL_COVER_LETTER_SECONDS` |
| **Semantic Live Scoring** | `live_scoring` | `86,400s` (24 hrs) | `LLM_CACHE_TTL_TAILORING_SECONDS` |
| **Semantic Resume Analysis** | `semantic_insights` | `86,400s` (24 hrs) — falls through to the tailoring default | `LLM_CACHE_TTL_TAILORING_SECONDS` |

> `get_task_ttl()` (`llm_cache.py:57-67`) matches by substring against `task`: `"jd"` → JD TTL, `"recovery"`/`"resume_structure"`/`"parse_resume"` → recovery TTL, `"summary"`/`"refinement"` → summary TTL, `"cover_letter"` → cover-letter TTL, everything else (including `"semantic_insights"`, used by `services/resume_intelligence/semantic.py:70`) falls through to the tailoring TTL. The table above previously claimed `semantic_insights` got the 7-day recovery TTL — it does not, since the string doesn't match any of the substring checks.

---

## 6. Distributed Single-Flight Locking (`SET NX`)

To prevent **Cache Stampedes** (multiple concurrent processes executing identical DeepSeek calls for the same payload):

1. **Lock Acquisition**: On cache miss, worker attempts `SET NX lock:llm:{fingerprint}` with 120s TTL and a unique owner UUID.
2. **Lock Owner**: Executes LLM call, validates output, writes envelope to Redis, and releases lock.
3. **Lock Waiters**: Poll cache every `0.25s` up to `LLM_CACHE_LOCK_WAIT_SECONDS` (default `100.0s`, `core/config.py` — raised from an original `15.0s` after production logs showed a waiter timing out and falling through to its own full redundant LLM call, even though real `jd_agent_extraction`/`resume_patch_tailoring` calls routinely take 28-90s and the lock's own TTL is 120s; 15s was never long enough to actually benefit from the lock, just a guaranteed extra 15s wasted before doing the duplicate work anyway). Once the owner writes the result, waiters return the validated result directly from cache without hitting DeepSeek.
4. **Safety**: Non-owner processes cannot release another worker's lock.

---

## 7. Metrics & Observability (`LLMCacheTelemetry`)

Telemetry metrics are tracked in `services/cache/llm_cache_telemetry.py`:
- `requests_total` (`hit`, `miss`, `invalid`, `bypass`, `error`)
- `saved_calls_total`
- `saved_input_tokens_total`
- `saved_output_tokens_total`
- `lock_contention_total`
- `validation_failures_total`

---

## 8. URL-Level Result Caching (JD Extraction)

`POST /jobs/extract-url` (`backend/api/v1/jobs.py`) sits above the `LLMCacheService` tier described in §1-7 and caches the whole extraction pipeline's *final result*, not an individual LLM call — a genuinely separate, simpler cache tier using `redis_cache` (the raw `RedisCacheService` transport) directly rather than going through `LLMFingerprintBuilder`/envelope versioning.

**Why a separate tier**: JD extraction (Playwright scrape + LLM classification/extraction) is one of the slowest, most expensive things this API does, and a job posting's URL is a genuinely shared/public resource — a trending posting gets hit by many different users within the same window. The LLM-call-level cache (§1-7) already avoids redundant *identical-payload* LLM calls, but each user's scrape still produces a slightly different evidence payload (different `browser_evidence`, different scrape timing), so it doesn't naturally collapse into one LLM-cache entry the way this URL-level cache does.

- **Key construction** (`_job_extraction_cache_key` in `api/v1/jobs.py`): SHA-256 of a normalized URL (`_normalize_job_url_for_cache` — lowercased host, tracking params like `utm_*`/`fbclid`/`gclid` stripped, fragment and trailing slash stripped, remaining params sorted), further combined with a rendered-DOM identity fingerprint (from `browser_evidence.capture.dom_fingerprint` + a title hint) when available, so SPA career portals that keep a generic/unchanged URL while swapping the visible job in place (confirmed real on jobs.nvidia.com) still get distinct cache entries per posting. Key prefix is versioned (`jd_extraction:v3:...`) so a schema/behavior change can invalidate all prior entries by bumping the version string.
- **TTL**: 24h (`JD_EXTRACTION_CACHE_TTL_SECONDS`). Job postings rarely change same-day; this balances freshness against hit rate.
- **Write gating**: only cached when `result.get("success") and result.get("status") == "extracted"`. Explicitly excludes:
  - Failures ("blocked", "manual_review", etc.) — these can legitimately depend on the *specific request's* `browser_evidence`, so caching one could wrongly deny a different user (with better evidence) a real shot at extraction.
  - `status == "partial"` — covers a "skills only" extraction (real description text, but empty `responsibilities`/`requirements`) that still returns `success: true`. Caching that would turn a one-off extraction miss into a persistent bug served to every subsequent user for the full TTL. See `reviewer_agent`/`final_response_agent` in `services/job_extraction/agents.py` for how that case is detected.
- **Usage accounting**: unaffected by cache hits/misses — `UsageService.consume_usage` still fires on a cache hit, same quota cost as a fresh extraction, just served instantly instead of in 5-30s+.
