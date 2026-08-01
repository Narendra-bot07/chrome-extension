"""
Unified AI Service Provider Module.
All LLM orchestration is routed through app.ai_service using DeepSeek (deepseek-v4-flash / deepseek-v4-pro).
"""

from app.ai_service import (
    get_llm,
    get_provider,
    parse_resume,
    analyze_job_description,
    analyze_gaps,
    generate_tailoring_patch,
    apply_tailoring_patch,
    generate_cover_letter,
    refine_section_with_ai,
    calculate_resume_job_match_score,
    compare_resume_and_job,
    throttle_ai_call,
    throttle_gemini_call,
    throttle_groq_call,
)

__all__ = [
    "get_llm",
    "get_provider",
    "parse_resume",
    "analyze_job_description",
    "analyze_gaps",
    "generate_tailoring_patch",
    "apply_tailoring_patch",
    "generate_cover_letter",
    "refine_section_with_ai",
    "calculate_resume_job_match_score",
    "compare_resume_and_job",
    "throttle_ai_call",
    "throttle_gemini_call",
    "throttle_groq_call",
]
