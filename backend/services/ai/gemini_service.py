from typing import List, Optional
from core.config import settings
from services.ai.llm_service import LLMService
from schemas.resume import ResumeStructure
from schemas.jobs import JobAnalysis
from schemas.tailoring import ComparisonResult, CoverLetterResult, TailoringReport
from app.gemini_service import (
    parse_resume as legacy_parse,
    analyze_job_description as legacy_analyze,
    generate_cover_letter as legacy_cover_letter,
    generate_tailoring_patch as legacy_generate_patch
)

class GeminiService(LLMService):
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.GEMINI_API_KEY or settings.GROQ_API_KEY

    def parse_resume(self, raw_text: str) -> ResumeStructure:
        res = legacy_parse(raw_text, api_key=self.api_key)
        return ResumeStructure(**res.dict())

    def analyze_job(self, jd_text: str, url: Optional[str] = "", page_title: Optional[str] = "", page_company: Optional[str] = "") -> JobAnalysis:
        res = legacy_analyze(jd_text, api_key=self.api_key, url=url, page_title=page_title, page_company=page_company)
        return JobAnalysis(**res.dict())

    def generate_tailoring_patch(self, resume: ResumeStructure, job: JobAnalysis) -> TailoringReport:
        res = legacy_generate_patch(resume, job, api_key=self.api_key)
        return TailoringReport(**res.dict())

    def generate_cover_letter(self, resume: ResumeStructure, job: JobAnalysis) -> CoverLetterResult:
        res = legacy_cover_letter(resume, job, api_key=self.api_key)
        return CoverLetterResult(**res.dict())

# Alias for backward compatibility
GroqService = GeminiService
