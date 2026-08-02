import json
from typing import List, Optional, Any
from core.config import settings
from services.ai.llm_service import LLMService
from schemas.resume import ResumeStructure
from schemas.jobs import JobAnalysis
from schemas.tailoring import ComparisonResult, CoverLetterResult, TailoringReport
from app.ai_service import (
    parse_resume as legacy_parse,
    analyze_job_description as legacy_analyze,
    generate_cover_letter as legacy_cover_letter,
    generate_tailoring_patch as legacy_generate_patch
)

class AIService(LLMService):
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.DEEPSEEK_API_KEY

    def _ensure_schema(self, res: Any, schema_cls: Any) -> Any:
        if isinstance(res, schema_cls):
            return res
        if isinstance(res, str):
            try:
                res = json.loads(res)
            except Exception:
                return schema_cls()
        if isinstance(res, dict):
            return schema_cls(**res)
        if hasattr(res, 'dict'):
            return schema_cls(**res.dict())
        if hasattr(res, 'model_dump'):
            return schema_cls(**res.model_dump())
        return schema_cls()

    def parse_resume(self, raw_text: str) -> ResumeStructure:
        res = legacy_parse(raw_text, api_key=self.api_key)
        return self._ensure_schema(res, ResumeStructure)

    def analyze_job(self, jd_text: str, url: Optional[str] = "", page_title: Optional[str] = "", page_company: Optional[str] = "") -> JobAnalysis:
        res = legacy_analyze(jd_text, api_key=self.api_key, url=url, page_title=page_title, page_company=page_company)
        return self._ensure_schema(res, JobAnalysis)

    def generate_tailoring_patch(self, resume: ResumeStructure, job: JobAnalysis) -> TailoringReport:
        res = legacy_generate_patch(resume, job, api_key=self.api_key)
        return self._ensure_schema(res, TailoringReport)

    def generate_cover_letter(self, resume: ResumeStructure, job: JobAnalysis) -> CoverLetterResult:
        res = legacy_cover_letter(resume, job, api_key=self.api_key)
        return self._ensure_schema(res, CoverLetterResult)

# AIService is the single provider — backed by DeepSeek via app.ai_service.
