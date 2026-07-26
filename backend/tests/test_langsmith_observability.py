import os

from core import observability


def test_langsmith_stays_disabled_without_api_key(monkeypatch):
    monkeypatch.setattr(observability.settings, "LANGSMITH_TRACING", True)
    monkeypatch.setattr(observability.settings, "LANGSMITH_API_KEY", "")
    assert observability.configure_langsmith() is False
    assert os.environ["LANGSMITH_TRACING"] == "false"


def test_langsmith_configuration_never_exposes_key(monkeypatch):
    monkeypatch.setattr(observability.settings, "LANGSMITH_TRACING", True)
    monkeypatch.setattr(observability.settings, "LANGSMITH_API_KEY", "secret-key")
    monkeypatch.setattr(
        observability.settings,
        "LANGSMITH_PROJECT",
        "tailorflow-test",
    )
    assert observability.configure_langsmith() is True
    status = observability.langsmith_status()
    assert status["enabled"] is True
    assert status["project"] == "tailorflow-test"
    assert "secret-key" not in repr(status)
