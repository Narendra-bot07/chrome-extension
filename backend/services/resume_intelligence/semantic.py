"""Single-call semantic enrichment backed by DeepSeek with a deterministic no-op fallback."""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, Field


class SemanticCapability(BaseModel):
    name: str
    supporting_quote: str
    inference_reason: str
    limitations: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class SemanticDomain(BaseModel):
    domain: str
    supporting_quote: str
    explicit: bool
    confidence: float = Field(ge=0, le=1)


class SemanticInsights(BaseModel):
    inferred_capabilities: list[SemanticCapability] = Field(default_factory=list)
    domains: list[SemanticDomain] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)


class SemanticAnalyzer(Protocol):
    def analyze(self, normalized_resume: str) -> SemanticInsights:
        pass


class DeepSeekSemanticAnalyzer:
    """
    One bounded structured call to DeepSeek; never receives another resume or a JD.
    Replaces the former GroqSemanticAnalyzer — same interface, same contract.
    """

    SYSTEM_PROMPT = (
        "You analyze exactly one selected resume.\n"
        "Return only evidence-grounded semantic insights.\n"
        "Never add dates, employers, titles, metrics, technologies, responsibilities,\n"
        "mastery levels, personal attributes, or facts absent from the resume.\n"
        "Inferred capabilities must remain inferred and include an exact supporting\n"
        "quote, reason, limitations, and conservative confidence.\n"
        "Domains require an exact supporting quote. Do not use outside knowledge about\n"
        "an employer. Report ambiguities; do not repair or rewrite the resume."
    )

    def __init__(self, api_key: str | None = None):
        from app.llm.deepseek_provider import DeepSeekProvider
        self._provider = DeepSeekProvider(api_key=api_key)

    def analyze(self, normalized_resume: str) -> SemanticInsights:
        from services.cache.llm_cache import llm_cache
        prompt = f"SELECTED RESUME ONLY:\n{normalized_resume}"

        def _call_llm():
            return self._provider.invoke_structured(
                prompt=prompt,
                schema_cls=SemanticInsights,
                system_instruction=self.SYSTEM_PROMPT,
                temperature=0.0,
            )

        return llm_cache.execute_with_cache(
            task="semantic_insights",
            payload_to_fingerprint=normalized_resume,
            llm_callable=_call_llm,
            expected_schema=SemanticInsights,
            prompt_version="semantic-insights-v1"
        )



