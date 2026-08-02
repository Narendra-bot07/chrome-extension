# ADR: DeepSeek is the Sole LLM Provider

**Date**: 2026-08-02  
**Status**: Accepted  
**Deciders**: Engineering Team  

---

## Context

Tailr4U originally used a dual-provider LLM architecture:

- **Primary**: Google Gemini (`gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-2.5-flash`)
- **Fallback**: Groq (`llama-3.3-70b-versatile`)

This resulted in:
- Two SDK dependencies (`google-generativeai`, `groq`)
- Cross-provider schema inconsistencies on failover
- Two sets of API keys and secrets
- Gemini free-tier `429 RESOURCE_EXHAUSTED` errors on rapid requests
- Complex retry logic spanning two external vendors

## Decision

**DeepSeek is the sole LLM provider for all production LLM calls.**

No production code path may call Gemini or Groq. The only allowed escalation is:

```
DeepSeek V4 Flash (default)
  → bounded retry (same model)
  → DeepSeek V4 Pro (optional escalation on schema failure)
  → normalized provider-neutral error
```

## Provider Configuration

| Setting | Value |
| :--- | :--- |
| **API Base URL** | `https://api.deepseek.com` |
| **Primary Model** | `deepseek-v4-flash` |
| **Escalation Model** | `deepseek-v4-pro` |
| **Client** | OpenAI-compatible SDK (`openai.AsyncOpenAI`) |
| **Environment Variable** | `DEEPSEEK_API_KEY` |
| **LLM Provider Setting** | `LLM_PROVIDER=deepseek` |

## Model Routing Policy

Use `deepseek-v4-flash` for:
- Resume tailoring, summary generation, cover letters
- Section classification, grammar improvement
- Structured JD extraction, ATS scoring, AI chat edits

Use `deepseek-v4-pro` **only** for:
- Malformed resume recovery that Flash cannot complete
- Repeated schema validation failure after bounded Flash retries

Do not expose model selection to users.

## Retry and Error Handling

| Condition | Behavior |
| :--- | :--- |
| Timeout, connection failure, 429, temporary 500/503 | Retry |
| Empty JSON response | Retry with repair instruction |
| 401, 402, invalid API key | Fail fast (do not retry) |
| Deterministic schema rejection | Fail fast |

## Consequences

- `DEEPSEEK_API_KEY` is the single backend LLM secret required.
- `GEMINI_API_KEY` and `GROQ_API_KEY` are obsolete (manual deletion required).
- Cache namespace: `tailr4u:v1:deepseek:<task>:<fingerprint>`.
- Google OAuth is NOT affected — independent of LLM provider.

## Files Deleted

| File | Reason |
| :--- | :--- |
| `backend/app/gemini_service.py` | Gemini shim — deleted |
| `backend/app/groq_service.py` | Groq shim — deleted |
| `backend/services/ai/gemini_service.py` | Gemini service — deleted |
| `backend/services/ai/groq_service.py` | Groq service — deleted |

## Files Modified (Key Changes)

| File | Change |
| :--- | :--- |
| `backend/app/ai_service.py` | Unified through `DeepSeekProvider` |
| `backend/app/routers/api.py` | Removed all `x_groq_key` / `x_gemini_key` headers |
| `backend/core/config.py` | Added startup LLM provider validation |
| `backend/services/cache/llm_cache.py` | Fixed deserialization; cache isolation tests |
| `backend/.env.example` | DeepSeek vars only |
| `docs/DEPLOYMENT.md` | Updated env vars + §6 secret-removal checklist |
| `docs/ADR_DEEPSEEK_SOLE_PROVIDER.md` | This file |

## Alternatives Considered

- **Option A: Retain Groq + Gemini** — Rejected (two external API contracts)
- **Option B: Three-provider cascade** — Rejected (multiplies retry complexity)
- **Option C: DeepSeek sole provider** — Accepted

## Manual Post-Deployment Checklist

See `docs/DEPLOYMENT.md` §6 for the full checklist.

- [ ] Remove `GEMINI_API_KEY` from Render & GitHub
- [ ] Remove `GROQ_API_KEY` from Render & GitHub
- [ ] Remove legacy keys from local `.env` files
- [ ] Revoke Gemini key in Google AI Studio
- [ ] Revoke Groq key in Groq Console
- [ ] Verify DeepSeek billing activity
- [ ] Confirm zero Gemini/Groq traffic in Render logs (24h)
