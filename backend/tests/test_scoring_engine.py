import pytest
from services.resume.scoring import ATSScoringEngine
from schemas.resume import ResumeStructure, PersonalInfo, ExperienceItem, EducationItem, ProjectItem
from schemas.jobs import JobAnalysis

def test_deterministic_ats_scoring_repeatability():
    """Verify that calculate_score returns 100% deterministic, identical scores across multiple calls."""
    resume = ResumeStructure(
        personal_info=PersonalInfo(name="Narendra Bandi", email="narendra@example.com", phone="123-456-7890"),
        skills=["Python", "FastAPI", "React", "TypeScript", "PostgreSQL", "Docker"],
        experience=[
            ExperienceItem(
                company="Tech Corp",
                role="Software Engineer",
                description=["Developed microservices using Python and FastAPI.", "Integrated PostgreSQL database."]
            )
        ],
        education=[EducationItem(degree="Bachelor of Science in Computer Science", institution="University")],
        projects=[ProjectItem(name="AI Tailoring App", description=["Built using React, FastAPI, and Docker."])]
    )

    job = JobAnalysis(
        title="Software Engineer",
        required_skills=["Python", "FastAPI", "PostgreSQL", "Docker"],
        preferred_skills=["React", "TypeScript"],
        keywords=["microservices", "database"]
    )

    # First Call
    res1 = ATSScoringEngine.calculate_score(resume, job)
    # Second Call
    res2 = ATSScoringEngine.calculate_score(resume, job)

    assert res1["resume_match_score"] == res2["resume_match_score"]
    assert res1["ats_score"] == res2["ats_score"]
    assert res1["breakdown"] == res2["breakdown"]
    assert isinstance(res1["resume_match_score"], (int, float))
    assert 0 <= res1["resume_match_score"] <= 100
    assert 0 <= res1["ats_score"] <= 100

def test_empty_inputs_safety():
    """Verify scoring engine handles empty/missing sections gracefully without errors."""
    empty_resume = ResumeStructure()
    empty_job = JobAnalysis()

    res = ATSScoringEngine.calculate_score(empty_resume, empty_job)
    assert "resume_match_score" in res
    assert "ats_score" in res
    assert res["resume_match_score"] >= 0
    assert res["ats_score"] >= 0
