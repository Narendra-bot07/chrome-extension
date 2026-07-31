"""
Legacy GroqService alias module. All AI capabilities use Gemini 2.5 Flash via GeminiService.
"""
from services.ai.gemini_service import GeminiService, GroqService

__all__ = ["GeminiService", "GroqService"]
