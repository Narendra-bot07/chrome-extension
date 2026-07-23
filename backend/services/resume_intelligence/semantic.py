"""Single-call semantic enrichment with a deterministic no-op fallback."""

from __future__ import annotations

from typing import Protocol

from langchain_core.prompts import ChatPromptTemplate
from langchain_groq import ChatGroq
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


class GroqSemanticAnalyzer:
    """One bounded structured call; never receives another resume or a JD."""

    def __init__(self, api_key: str, model: str = "llama-3.3-70b-versatile"):
        self.llm = ChatGroq(
            api_key=api_key,
            model=model,
            temperature=0,
            timeout=45,
            max_retries=0,
        )

    def analyze(self, normalized_resume: str) -> SemanticInsights:
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    """You analyze exactly one selected resume.
Return only evidence-grounded semantic insights.
Never add dates, employers, titles, metrics, technologies, responsibilities,
mastery levels, personal attributes, or facts absent from the resume.
Inferred capabilities must remain inferred and include an exact supporting
quote, reason, limitations, and conservative confidence.
Domains require an exact supporting quote. Do not use outside knowledge about
an employer. Report ambiguities; do not repair or rewrite the resume.""",
                ),
                ("human", "SELECTED RESUME ONLY:\n{resume}"),
            ]
        )
        return (prompt | self.llm.with_structured_output(SemanticInsights)).invoke(
            {"resume": normalized_resume}
        )
