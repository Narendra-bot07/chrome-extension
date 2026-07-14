from typing import List, Optional
from services.ai.llm_service import LLMService
from schemas.resume import ResumeStructure
from schemas.jobs import JobAnalysis
from schemas.tailoring import ComparisonResult, CoverLetterResult

class GeminiService(LLMService):
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    def parse_resume(self, raw_text: str) -> ResumeStructure:
        raise NotImplementedError("Gemini parsing is not implemented yet.")

    def analyze_job(self, jd_text: str) -> JobAnalysis:
        raise NotImplementedError("Gemini job analysis is not implemented yet.")

    def compare_resume_to_job(self, resume: ResumeStructure, job: JobAnalysis, sections: Optional[List[str]] = None, intensity: Optional[str] = "balanced") -> ComparisonResult:
        raise NotImplementedError("Gemini compare is not implemented yet.")

    def generate_cover_letter(self, resume: ResumeStructure, job: JobAnalysis) -> CoverLetterResult:
        raise NotImplementedError("Gemini cover letter is not implemented yet.")
