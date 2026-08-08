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

---

## Amendment (2026-08-09): JD extraction is a documented exception to the Flash-default / Pro-escalation policy

The "Model Routing Policy" section above (Flash for structured JD extraction, Pro only for escalation) is **no longer accurate for JD extraction specifically**. Live-URL testing found single JD extractions taking 46-92s; tracing the root cause required deviating from this ADR's default routing for that one pipeline. Full detail: [JD_EXTRACTION_ENGINE_DOCUMENTATION.md](JD_EXTRACTION_ENGINE_DOCUMENTATION.md) §8.18 and [CHANGELOG.md](CHANGELOG.md) 3.17.0.

**What changed, scoped to `services/job_extraction/agents.py` only:**

- JD extraction (the four Role/Skills/Responsibilities/Requirements workers, plus the now-unreachable `repair_agent`) calls `deepseek-v4-pro` **exclusively** via a new `model_override` parameter on `DeepSeekProvider.invoke_structured` — no Flash call, no escalation, no race, no head-start delay for this pipeline. Enforced by a new `DEEPSEEK_JD_MODEL` setting (`core/config.py`), hard-validated at startup to equal exactly `"deepseek-v4-pro"` — the app refuses to boot with any other value.
- **New provider-level capability, additive and opt-in**: `disable_reasoning: bool = False` on `DeepSeekProvider.invoke_structured` / `_chat_completion`, sent to the API as `extra_body={"reasoning_effort": "none"}` when `True`. Measured directly against the live API (not assumed): `deepseek-v4-pro` spends `completion_tokens` on an invisible `reasoning_tokens` phase before any real output — a 300-token JD-worker budget came back as 300 reasoning tokens / 0 content / `finish_reason: "length"` with reasoning on, vs. 17 tokens total and correct output with it off. JD extraction sets `disable_reasoning=True` on every worker call (classification/extraction/normalization, not open-ended reasoning — matches this ADR's existing framing of what Flash-tier tasks are for). Resume-tailoring's `generate_tailoring_patch` (`app/ai_service.py`) also opts in (`disable_reasoning=True`) after the same call shape measured 22.7s with reasoning vs 5.1s without, same-or-better output quality.
- **This is a per-call-site opt-in, not a change to the shared provider's defaults.** Every other caller (cover letters, resume parsing, semantic insights, skill categorization, resume-tailoring's own Flash attempt before Pro) still gets the Flash-default / Pro-escalation-with-reasoning-enabled behavior described above unless it explicitly passes `disable_reasoning=True`. Do not lower `DeepSeekProvider._RACE_HEAD_START_SECONDS` or flip `disable_reasoning` on for any other call site without measuring that task's actual reasoning-token overhead and output-quality delta first, the same way this amendment did — reasoning may be genuinely load-bearing for tasks this ADR still routes through the default policy.
- **Practical implication for anyone adding a new JD-extraction-adjacent LLM call**: use `model_override=settings.DEEPSEEK_JD_MODEL` + `disable_reasoning=True`, not the default `invoke_structured(...)` call shape this ADR otherwise recommends.
