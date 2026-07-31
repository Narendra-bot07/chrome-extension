from typing import List, Optional, Dict, Any
from app.gemini_service import (
    parse_resume,
    analyze_job_description,
    compare_resume_and_job,
    apply_tailoring,
    generate_cover_letter
)
from app.schemas import ResumeStructure, JobAnalysis, ComparisonResult, CoverLetterResult

class AIService:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    def parse_resume(self, raw_text: str) -> ResumeStructure:
        return parse_resume(raw_text, api_key=self.api_key)

    def analyze_job(self, jd_text: str) -> JobAnalysis:
        return analyze_job_description(jd_text, api_key=self.api_key)

    def compare_resume_to_job(self, resume: ResumeStructure, job: JobAnalysis, sections: Optional[List[str]] = None, intensity: Optional[str] = "balanced") -> ComparisonResult:
        return compare_resume_and_job(resume, job, sections=sections, intensity=intensity, api_key=self.api_key)

    def tailor_resume(self, resume: ResumeStructure, job_analysis: JobAnalysis, selected_missing_skills: List[str], selected_bullet_rewrites: List[Dict[str, str]], accept_summary_rewrite: bool, suggested_summary: Optional[str]) -> ResumeStructure:
        return apply_tailoring(
            resume=resume,
            job_analysis=job_analysis,
            selected_missing_skills=selected_missing_skills,
            selected_bullet_rewrites=selected_bullet_rewrites,
            accept_summary_rewrite=accept_summary_rewrite,
            suggested_summary=suggested_summary
        )

    def generate_cover_letter(self, resume: ResumeStructure, job: JobAnalysis) -> CoverLetterResult:
        return generate_cover_letter(resume, job, api_key=self.api_key)
