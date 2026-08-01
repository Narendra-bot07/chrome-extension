"""
Unified AIService Module Alias for backward compatibility.
"""
from services.ai.ai_service import AIService, GeminiService, GroqService

__all__ = ["AIService", "GeminiService", "GroqService"]
