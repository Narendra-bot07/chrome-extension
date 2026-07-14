from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from schemas.resume import ResumeStructure
from schemas.jobs import JobAnalysis
from schemas.tailoring import ComparisonResult, CoverLetterResult, TailoringReport

class LLMService(ABC):
    @abstractmethod
    def parse_resume(self, raw_text: str) -> ResumeStructure:
        pass

    @abstractmethod
    def analyze_job(self, jd_text: str) -> JobAnalysis:
        pass

    @abstractmethod
    def generate_tailoring_patch(self, resume: ResumeStructure, job: JobAnalysis) -> TailoringReport:
        pass

    @abstractmethod
    def generate_cover_letter(self, resume: ResumeStructure, job: JobAnalysis) -> CoverLetterResult:
        pass
