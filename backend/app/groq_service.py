"""
Legacy alias module for backward compatibility.
All underlying calls are routed through app.gemini_service (Gemini 2.5 Flash).
"""

from app.gemini_service import (
    get_llm,
    parse_resume,
    analyze_job_description,
    analyze_gaps,
    generate_tailoring_patch,
    apply_tailoring_patch,
    generate_cover_letter,
    refine_section_with_ai,
    calculate_resume_job_match_score,
    compare_resume_and_job,
    throttle_gemini_call,
    throttle_groq_call,
)

__all__ = [
    "get_llm",
    "parse_resume",
    "analyze_job_description",
    "analyze_gaps",
    "generate_tailoring_patch",
    "apply_tailoring_patch",
    "generate_cover_letter",
    "refine_section_with_ai",
    "calculate_resume_job_match_score",
    "compare_resume_and_job",
    "throttle_gemini_call",
    "throttle_groq_call",
]
