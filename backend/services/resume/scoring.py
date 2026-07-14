from schemas.resume import ResumeStructure
from schemas.jobs import JobAnalysis

class ATSScoringEngine:
    @staticmethod
    def calculate_score(resume: ResumeStructure, job: JobAnalysis) -> float:
        # Simplistic score calculation logic based on skill match
        matched_skills = set(resume.skills).intersection(set(job.required_skills))
        if not job.required_skills:
            return 100.0
        return round((len(matched_skills) / len(job.required_skills)) * 100.0, 2)
