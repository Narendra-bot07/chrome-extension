from typing import List, Set
from schemas.resume import ResumeStructure
from schemas.jobs import JobAnalysis

class KeywordMatcher:
    @staticmethod
    def extract_missing_keywords(resume: ResumeStructure, job: JobAnalysis) -> List[str]:
        resume_skills_lower = {s.lower() for s in resume.skills}
        job_keywords = set(job.ats_keywords or [])
        
        missing = [kw for kw in job_keywords if kw.lower() not in resume_skills_lower]
        return missing
