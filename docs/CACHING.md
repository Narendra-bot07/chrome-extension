# Tailr4U - Caching Architecture & Redis Specification

This document details the multi-tiered caching architecture, Upstash Redis integration, SHA-256 prompt hashing protocols, TTL retention policies, and in-memory fallback strategies for **Tailr4U**.

---

## 1. Caching System Overview

Tailr4U implements a resilient caching service (`RedisCacheService` in `services/cache/redis_cache.py`) designed to eliminate redundant LLM API invocations, reduce end-to-end tailoring latency to sub-50ms for cached prompts, and prevent rate-limit penalties.

```mermaid
graph TD
    subgraph Client & Service Layer
        SERVICE["Gemini / Tailoring Service"]
        HASH_GEN["SHA-256 Key Generator<br/>(prefix:sha256(content))"]
    end

    subgraph Caching Layer (RedisCacheService)
        SDK["1. Upstash Redis SDK<br/>(upstash_redis.Redis)"]
        TCP["2. Standard Redis TCP<br/>(rediss:// TLS connection)"]
        REST["3. Upstash REST HTTP API<br/>(https://...upstash.io/get/key)"]
        MEM["4. Local In-Memory LRU Cache<br/>(500-item dict fallback)"]
    end

    SERVICE --> HASH_GEN
    HASH_GEN --> SDK
    SDK -.->|"Failover on Error"| TCP
    TCP -.->|"Failover on Network Error"| REST
    REST -.->|"Failover if Unconfigured"| MEM
```

---

## 2. Upstash Redis Connection Modes & Failover

`RedisCacheService` supports 4 automated transport modes in order of priority:

1. **Official Upstash Redis SDK (`upstash_redis.Redis`)**: Uses `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
2. **Standard Redis TCP (`rediss://`)**: Uses TLS-encrypted socket connection via `redis.from_url()`.
3. **Upstash REST HTTP API**: Direct HTTP GET/SET calls (`https://api.upstash.io/get/{key}`) with Bearer authorization headers when TCP ports are blocked by cloud firewall environments.
4. **Local In-Memory Fallback Cache**: In-memory Python dictionary limited to 500 items using Least Recently Used (LRU) eviction when no external Redis server is reachable.

---

## 3. Key Naming & SHA-256 Hashing Conventions

All cached entries utilize deterministic, namespace-prefixed keys hashed with SHA-256:

```python
def _get_cache_key(prefix: str, content: str) -> str:
    return f"{prefix}:{hashlib.sha256(content.encode('utf-8')).hexdigest()}"
```

### Active Cache Key Types & TTLs

| Cache Key Pattern | TTL Duration | Purpose | Payload Content |
| :--- | :--- | :--- | :--- |
| `llm_tailor:{sha256_hash}` | `86400s` (24 hrs) | Tailored Resume Output | `ResumePatch` JSON |
| `llm_cover_letter:{sha256}` | `86400s` (24 hrs) | Generated Cover Letter | `CoverLetterResult` JSON |
| `jd_parse:{sha256}` | `604800s` (7 days)| Extracted Job Description | `JobAnalysis` JSON |
| `ats_score:{sha256}` | `86400s` (24 hrs) | ATS Match Score Calculation | `{"score": 88, "gaps": [...]}` |

---

## 4. Health Check Probe (`redis_cache.health_check()`)

The cache health status is reported via `/ready` and `/api/observability/status` endpoints:

```json
{
  "status": "online",
  "mode": "upstash_sdk",
  "connected": true
}
```
