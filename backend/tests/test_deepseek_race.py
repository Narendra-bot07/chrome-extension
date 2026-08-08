"""Regression tests for DeepSeekProvider's flash/pro racing.

Production incident (2026-08-08): a single JD extraction routinely took
90-150s+. The old escalation path was strictly sequential -- wait for flash
to fully finish (including its own empty-content retry), THEN only start
pro from a standing start -- so a schema-validation failure or a slow flash
response paid flash's FULL duration and then pro's FULL duration on top.
invoke_structured now races the two models concurrently (via
_invoke_with_race) instead, bounding the wait to roughly whichever model is
slower rather than both added together, while keeping per-call cost the
same as before whenever flash alone succeeds (pro is skipped entirely).
"""

import time
from unittest.mock import MagicMock, patch

import pytest
from pydantic import BaseModel

from app.llm.deepseek_provider import DeepSeekProvider


class _Widget(BaseModel):
    name: str


def _provider(monkeypatch, head_start=0.2):
    monkeypatch.setattr(DeepSeekProvider, "_RACE_HEAD_START_SECONDS", head_start)
    return DeepSeekProvider(api_key="test_key", flash_model="flash", pro_model="pro")


def test_fast_flash_success_never_calls_pro(monkeypatch):
    provider = _provider(monkeypatch)
    calls = []

    def fake_chat_completion(model, **kwargs):
        calls.append(model)
        if model == "flash":
            return '{"name": "flash-result"}'
        raise AssertionError("pro should never have been called")

    with patch.object(provider, "_chat_completion", side_effect=fake_chat_completion):
        result = provider.invoke_structured("prompt", _Widget)

    assert result.name == "flash-result"
    assert calls == ["flash"]


def test_flash_failure_lets_pro_win_without_waiting_out_the_head_start(monkeypatch):
    provider = _provider(monkeypatch, head_start=5.0)  # would time out the test if not woken early
    started = time.perf_counter()

    def fake_chat_completion(model, **kwargs):
        if model == "flash":
            raise ValueError("DeepSeek returned empty content in response_format json_object mode.")
        return '{"name": "pro-result"}'

    with patch.object(provider, "_chat_completion", side_effect=fake_chat_completion):
        result = provider.invoke_structured("prompt", _Widget)

    elapsed = time.perf_counter() - started
    assert result.name == "pro-result"
    # Proves pro started as soon as flash's failure resolved, not after the
    # full 5s head start -- the whole point of the fix.
    assert elapsed < 4.0


def test_slow_flash_races_pro_and_takes_whichever_finishes_first(monkeypatch):
    provider = _provider(monkeypatch, head_start=0.1)

    def fake_chat_completion(model, **kwargs):
        if model == "flash":
            time.sleep(0.5)
            return '{"name": "flash-slow"}'
        return '{"name": "pro-fast"}'

    with patch.object(provider, "_chat_completion", side_effect=fake_chat_completion):
        result = provider.invoke_structured("prompt", _Widget)

    # pro started after the 0.1s head start and returns instantly; flash is
    # still sleeping -- pro's result must win since flash hasn't resolved yet.
    assert result.name == "pro-fast"


def test_both_models_failing_raises_an_informative_error(monkeypatch):
    provider = _provider(monkeypatch, head_start=0.1)

    def fake_chat_completion(model, **kwargs):
        raise ValueError(f"{model} exploded")

    with patch.object(provider, "_chat_completion", side_effect=fake_chat_completion):
        with pytest.raises(ValueError):
            provider.invoke_structured("prompt", _Widget)


def test_escalate_on_error_false_never_calls_pro_even_on_failure(monkeypatch):
    provider = _provider(monkeypatch, head_start=0.05)
    calls = []

    def fake_chat_completion(model, **kwargs):
        calls.append(model)
        raise ValueError("flash broke")

    with patch.object(provider, "_chat_completion", side_effect=fake_chat_completion):
        with pytest.raises(ValueError):
            provider.invoke_structured("prompt", _Widget, escalate_on_error=False)

    assert calls == ["flash"]
