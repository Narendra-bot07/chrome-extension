"""AIGovernanceGateway -- the one mandatory path for every LLM call in
Tailr4U. See docs/AI_GOVERNANCE.md for the full architecture.

    Feature / API Route / Agent
            v
    AIGovernanceGateway.execute()
            v
    Quota / Rate Limit
            v
    Input Size Validation -> Normalization -> PII/Secret Redaction
            v
    Prompt-Injection / Jailbreak / Abuse Classification
            v
    Task Policy Enforcement
            v
    Approved Prompt Builder
            v
    LLM Cache -> DeepSeek Provider
            v
    Output Schema Validation -> Safety Validation -> Domain Validation
            v
    AIExecutionResult (caller owns persistence/canonical-merge)

The LLM is not a security boundary, not an authorization authority, and not
trusted. Every gate above is enforced here, deterministically, regardless
of what the model does or doesn't do.
"""
from __future__ import annotations

import time
from typing import Any, Optional, Type

from pydantic import BaseModel

from api.dependencies import user_scoped_db_context
from services.ai_governance import audit
from services.ai_governance.errors import (
    AIGovernanceBlockedError,
    AIGovernanceQuotaError,
    AIGovernanceValidationError,
)
from services.ai_governance.injection_guardrails import GuardrailDecision, classify_request
from services.ai_governance import input_guardrails
from services.ai_governance.output_guardrails import check_section_scoping, run_generic_output_checks
from services.ai_governance.permissions import (
    AIExecutionOptions,
    AIExecutionResult,
    AIPermissions,
    SafeUserContext,
)
from services.ai_governance.policies import POLICY_REGISTRY, TaskPolicy
from services.ai_governance.prompt_builder import build_data_boundary, build_request_id, build_system_prompt
from services.ai_governance.task_types import LIVE_TASK_TYPES, AITaskType


class AIGovernanceGateway:
    def __init__(self) -> None:
        # Deferred imports: app.ai_service / services.cache.llm_cache pull in
        # a lot (DeepSeek client, Redis) that shouldn't load just from
        # importing this module (e.g. at test-collection time before env
        # vars are configured).
        pass

    def _resolve_policy(self, task: AITaskType) -> TaskPolicy:
        if not isinstance(task, AITaskType):
            raise AIGovernanceValidationError(
                "This AI feature is not available.",
                reason_code="unknown_task_type",
            )
        policy = POLICY_REGISTRY.get(task)
        if policy is None:
            raise AIGovernanceValidationError(
                "This AI feature is not available.",
                reason_code="missing_policy",
            )
        if task not in LIVE_TASK_TYPES:
            # Registered a policy but not yet wired to a real feature --
            # fail closed rather than silently allow an unfinished path.
            raise AIGovernanceValidationError(
                "This AI feature is not available yet.",
                reason_code="task_not_live",
            )
        return policy

    def _check_quota_and_rate_limit(
        self, *, task: AITaskType, policy: TaskPolicy, user_context: SafeUserContext, request_id: str,
    ) -> None:
        from app.services.rate_limiter_service import RateLimiterService

        try:
            # Redis-only (no DB connection needed) -- a per-user-per-task
            # rate limit is a NEW protection this gateway adds; every live
            # task gets one even if it never had per-minute limiting before.
            limiter = RateLimiterService(conn=None)
            if limiter.is_rate_limited(
                f"ai_gateway:{task.value}", user_context.user_id,
                max_requests=policy.rate_limit_per_minute,
                window_seconds=policy.rate_limit_window_seconds,
            ):
                audit.log_quota_rejected(task=task.value, request_id=request_id, user_id=user_context.user_id)
                raise AIGovernanceQuotaError(
                    "You're sending requests too quickly. Please wait a moment and try again.",
                    reason_code="rate_limit_exceeded",
                )
        except AIGovernanceQuotaError:
            raise
        except Exception:
            # Rate limiter itself failing is a telemetry-adjacent concern,
            # not a security-critical guarantee on its own (the monthly
            # quota check below is the hard product limit) -- fail open here
            # rather than block legitimate generation because Redis hiccuped.
            pass

        if policy.usage_feature_key:
            from services.subscriptions.usage_service import UsageService

            with user_scoped_db_context(user_context.user_id) as conn:
                try:
                    UsageService(conn).require_available(user_context.user_id, policy.usage_feature_key)
                except AIGovernanceQuotaError:
                    raise
                except Exception as exc:
                    audit.log_quota_rejected(task=task.value, request_id=request_id, user_id=user_context.user_id)
                    raise AIGovernanceQuotaError(
                        "You've reached your plan's usage limit for this feature.",
                        reason_code="product_quota_exceeded",
                    ) from exc

    def _consume_quota(self, *, policy: TaskPolicy, user_context: SafeUserContext, request_id: str) -> None:
        if not policy.usage_feature_key:
            return
        from services.subscriptions.usage_service import UsageService

        try:
            with user_scoped_db_context(user_context.user_id) as conn:
                UsageService(conn).consume_usage(
                    user_context.user_id, policy.usage_feature_key, request_id=request_id,
                )
        except Exception:
            # Usage accounting failing must not undo an already-successful,
            # already-validated generation the user is about to receive.
            pass

    def _validate_and_normalize_inputs(
        self, *, task: AITaskType, policy: TaskPolicy, inputs: dict[str, Any], request_id: str, user_id: str,
    ) -> dict[str, str]:
        from services.ai_governance.redaction import redact_payload

        normalized: dict[str, str] = {}
        total_bytes = 0
        for field_name, raw_value in inputs.items():
            value = "" if raw_value is None else str(raw_value)
            total_bytes += len(value.encode("utf-8", errors="ignore"))
            max_chars = (
                policy.max_instruction_chars if field_name == "instruction" else policy.max_document_chars
            )
            for check in (
                lambda: input_guardrails.check_field_size(field_name=field_name, value=value, max_chars=max_chars),
                lambda: input_guardrails.check_malformed_encoding(field_name=field_name, value=value),
                lambda: input_guardrails.check_token_bomb_patterns(field_name=field_name, value=value),
            ):
                result = check()
                if not result.ok:
                    audit.log_input_size_rejected(
                        task=task.value, request_id=request_id, user_id=user_id, reason_code=result.reason_code,
                    )
                    raise AIGovernanceValidationError(result.safe_message, reason_code=result.reason_code)
            # Normalize whitespace so downstream fingerprinting/classification
            # isn't defeated by trivial formatting differences, then redact
            # any secret-shaped substrings before this ever reaches a prompt.
            normalized[field_name] = redact_payload(" ".join(value.split()) if value else value)

        size_result = input_guardrails.check_request_size(total_bytes=total_bytes)
        if not size_result.ok:
            audit.log_input_size_rejected(
                task=task.value, request_id=request_id, user_id=user_id, reason_code=size_result.reason_code,
            )
            raise AIGovernanceValidationError(size_result.safe_message, reason_code=size_result.reason_code)
        return normalized

    def _classify_inputs(
        self, *, task: AITaskType, policy: TaskPolicy, normalized_inputs: dict[str, str], request_id: str, user_id: str,
    ) -> None:
        from observability.metrics import record_ai_security_classifier_duration

        started = time.perf_counter()
        worst: Optional[Any] = None
        for value in normalized_inputs.values():
            if not value:
                continue
            result = classify_request(value)
            if result.decision != GuardrailDecision.ALLOW:
                worst = result
                break
        duration = time.perf_counter() - started
        try:
            record_ai_security_classifier_duration(
                (worst.decision.value if worst else "ALLOW"), duration,
            )
        except Exception:
            pass

        if worst is not None and worst.decision == GuardrailDecision.BLOCK:
            audit.log_ai_security_event(
                event_type=(
                    "jailbreak_detected" if worst.reason_code == "jailbreak_signature"
                    else "prompt_injection_detected" if "injection" in worst.reason_code or "smuggling" in worst.reason_code
                    else "ai_request_blocked"
                ),
                task=task.value, decision="BLOCK", reason_code=worst.reason_code,
                policy_version=policy.policy_version, request_id=request_id, user_id=user_id,
            )
            raise AIGovernanceBlockedError(worst.safe_message, reason_code=worst.reason_code)

    def _enforce_task_policy(
        self, *, task: AITaskType, policy: TaskPolicy, permissions: AIPermissions, request_id: str, user_id: str,
    ) -> None:
        if policy.requires_section_scoping and not permissions.allowed_section_ids:
            audit.log_ai_security_event(
                event_type="ai_request_blocked", task=task.value, decision="BLOCK",
                reason_code="missing_section_scope", policy_version=policy.policy_version,
                request_id=request_id, user_id=user_id,
            )
            raise AIGovernanceValidationError(
                "This AI feature requires a specific section to be selected.",
                reason_code="missing_section_scope",
            )

    async def execute(
        self,
        *,
        task: AITaskType,
        user_context: SafeUserContext,
        inputs: dict[str, Any],
        prompt_version: str,
        schema: Type[BaseModel],
        permissions: AIPermissions,
        options: Optional[AIExecutionOptions] = None,
        # Feature-supplied callable that actually builds the (already
        # data-boundary-wrapped) human message and invokes the cached LLM
        # call. The gateway still owns everything BEFORE and AFTER this --
        # guardrails, cache key construction is the callable's job since it
        # varies by task, but the cache LOOKUP itself always happens here.
        build_human_message: Any = None,
    ) -> AIExecutionResult:
        options = options or AIExecutionOptions()
        request_id = user_context.request_id or build_request_id()
        policy = self._resolve_policy(task)

        self._check_quota_and_rate_limit(task=task, policy=policy, user_context=user_context, request_id=request_id)

        normalized_inputs = self._validate_and_normalize_inputs(
            task=task, policy=policy, inputs=inputs, request_id=request_id, user_id=user_context.user_id,
        )
        self._classify_inputs(
            task=task, policy=policy, normalized_inputs=normalized_inputs, request_id=request_id, user_id=user_context.user_id,
        )
        self._enforce_task_policy(task=task, policy=policy, permissions=permissions, request_id=request_id, user_id=user_context.user_id)

        system_prompt = build_system_prompt(task_name=task.value, policy=policy)
        boundaries = {
            name: build_data_boundary(name, value) for name, value in normalized_inputs.items()
        }

        from services.cache.llm_cache import llm_cache
        from services.cache.llm_fingerprint import LLMFingerprintBuilder
        from app.ai_service import get_provider

        def _llm_callable() -> BaseModel:
            provider = get_provider()
            human_message = (
                build_human_message(boundaries, normalized_inputs)
                if build_human_message
                else "\n\n".join(boundaries.values())
            )
            return provider.invoke_structured(
                prompt=human_message,
                schema_cls=schema,
                system_instruction=system_prompt,
                temperature=options.temperature,
                escalate_on_error=options.escalate_on_error,
            )

        cache_fingerprint_payload = {"task": task.value, "policy": policy.policy_version, **normalized_inputs}
        cache_hit = False
        if not options.bypass_cache:
            try:
                fingerprint = LLMFingerprintBuilder.build_fingerprint(cache_fingerprint_payload)
                # record_miss=False: this is a read-only peek purely to
                # report cache_hit on the result -- the authoritative
                # lookup (the one that actually counts for telemetry) is
                # the one inside execute_with_cache below.
                peek = llm_cache.get(
                    task=task.value, fingerprint=fingerprint,
                    expected_schema=schema, prompt_version=prompt_version,
                    record_miss=False,
                )
                cache_hit = peek is not None
            except Exception:
                cache_hit = False

        try:
            output = llm_cache.execute_with_cache(
                task=task.value,
                payload_to_fingerprint=cache_fingerprint_payload,
                llm_callable=_llm_callable,
                expected_schema=schema,
                prompt_version=prompt_version,
                bypass_cache=options.bypass_cache,
            )
        except Exception as exc:
            audit.capture_unexpected_guardrail_failure(
                exc, task=task.value, policy_version=policy.policy_version, reason_code="llm_call_failed",
            )
            raise AIGovernanceValidationError(
                "We couldn't generate that right now. Please try again.",
                reason_code="llm_call_failed",
            ) from exc

        # Cache does not bypass output validation -- re-validated on every
        # retrieval, hit or miss.
        generic_result = run_generic_output_checks(output)
        if not generic_result.ok:
            if generic_result.reason_code == "secret_leakage_blocked":
                audit.log_secret_leakage_blocked(
                    task=task.value, request_id=request_id, user_id=user_context.user_id, policy_version=policy.policy_version,
                )
            else:
                audit.log_output_policy_rejected(
                    task=task.value, request_id=request_id, user_id=user_context.user_id,
                    policy_version=policy.policy_version, reason_code=generic_result.reason_code,
                )
            raise AIGovernanceValidationError(generic_result.safe_message, reason_code=generic_result.reason_code)

        if policy.requires_section_scoping:
            output_section_ids = getattr(output, "section_ids", None) or getattr(output, "modified_sections", None) or []
            scope_result = check_section_scoping(list(output_section_ids), permissions=permissions)
            if not scope_result.ok:
                audit.log_output_policy_rejected(
                    task=task.value, request_id=request_id, user_id=user_context.user_id,
                    policy_version=policy.policy_version, reason_code=scope_result.reason_code,
                )
                raise AIGovernanceValidationError(scope_result.safe_message, reason_code=scope_result.reason_code)

        if policy.domain_validator:
            violations = policy.domain_validator(output, inputs, permissions)
            if violations:
                audit.log_output_policy_rejected(
                    task=task.value, request_id=request_id, user_id=user_context.user_id,
                    policy_version=policy.policy_version, reason_code="domain_validation_failed",
                )
                raise AIGovernanceValidationError(
                    "We couldn't safely validate the generated content. Please try again.",
                    reason_code="domain_validation_failed",
                )

        self._consume_quota(policy=policy, user_context=user_context, request_id=request_id)
        audit.log_ai_security_event(
            event_type="ai_request_allowed", task=task.value, decision="allowed",
            reason_code="ok", policy_version=policy.policy_version,
            request_id=request_id, user_id=user_context.user_id,
        )

        return AIExecutionResult(
            output=output,
            task=task.value,
            decision="allowed",
            prompt_version=prompt_version,
            policy_version=policy.policy_version,
            schema_version=policy.schema_version,
            cache_hit=cache_hit,
            request_id=request_id,
        )


_gateway_instance: Optional[AIGovernanceGateway] = None


def get_gateway() -> AIGovernanceGateway:
    global _gateway_instance
    if _gateway_instance is None:
        _gateway_instance = AIGovernanceGateway()
    return _gateway_instance
