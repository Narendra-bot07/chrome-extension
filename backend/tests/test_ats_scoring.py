import pytest
from services.resume.scoring import ATSScoringEngine
from schemas.resume import ResumeStructure
from app.schemas import JobAnalysis

def sample_resume():
    return ResumeStructure(**{
        "personal_info": {
            "name": "Jane Doe",
            "email": "jane@example.com",
            "phone": "+123456789",
            "linkedin": "linkedin.com/in/janedoe"
        },
        "summary": "Experienced Software Engineer with expertise in Python, React, and SQL database design.",
        "skills": ["Python", "React", "SQL", "Git"],
        "experience": [
            {
                "company": "Tech Corp",
                "role": "Senior Software Engineer",
                "duration": "3 years",
                "description": ["Developed python backend services and web applications with React.", "Optimized SQL queries."]
            }
        ],
        "projects": [
            {
                "name": "E-Commerce Platform",
                "description": ["Built using Python and SQL.", "Deployed to cloud systems."]
            }
        ],
        "education": [
            {
                "degree": "Bachelor of Science in Computer Science",
                "school": "State University"
            }
        ]
    })

def sample_job():
    return JobAnalysis(**{
        "title": "Software Engineer",
        "company": "Tech Corp",
        "description": "Looking for a Software Engineer with Python and SQL experience. Bachelor's in Computer Science required.",
        "requirements": ["Python", "SQL", "Git", "React"],
        "min_experience_years": 2,
        "keywords": ["Python", "SQL", "React", "git", "Computer Science"],
        "skills": ["Python", "SQL", "React", "git"],
        "degrees": ["Computer Science", "BS"]
    })

def test_scoring_engine_basic_calculation():
    resume = sample_resume()
    job = sample_job()
    
    result = ATSScoringEngine.calculate_score(resume, job)
    
    assert "resume_match_score" in result
    assert "ats_score" in result
    assert "breakdown" in result
    
    assert isinstance(result["resume_match_score"], int)
    assert 0 <= result["resume_match_score"] <= 100
    
    assert isinstance(result["ats_score"], int)
    assert 0 <= result["ats_score"] <= 100
    
    breakdown = result["breakdown"]
    assert "resume_match" in breakdown
    assert "ats_optimization" in breakdown
    
    match_breakdown = breakdown["resume_match"]
    for category in ["Skills Match", "Keyword Relevance", "Experience Alignment", "Role Similarity", "Project Relevance", "Education Fit", "Certification Relevance"]:
        assert category in match_breakdown
        assert 0 <= match_breakdown[category] <= 100
        
    opt_breakdown = breakdown["ats_optimization"]
    for category in ["ATS Parseability", "Keyword Optimization", "Required Skills Coverage", "Formatting & Action Verbs", "Section Completeness", "Readability", "Measurable Impact", "Overall Optimization"]:
        assert category in opt_breakdown
        assert 0 <= opt_breakdown[category] <= 100

def test_scoring_engine_consistency():
    resume = sample_resume()
    job = sample_job()
    
    score1 = ATSScoringEngine.calculate_score(resume, job)
    score2 = ATSScoringEngine.calculate_score(resume, job)
    
    assert score1["resume_match_score"] == score2["resume_match_score"]
    assert score1["ats_score"] == score2["ats_score"]
    assert score1["breakdown"] == score2["breakdown"]

def test_scoring_engine_apply_suggestions():
    resume = sample_resume()
    job = sample_job()
    
    # Original score calculation
    orig_res = ATSScoringEngine.calculate_score(resume, job)
    
    # Define suggestions (impactful ones, like adding missing keywords/skills)
    suggestions = [
        {
            "id": "skills:docker",
            "sectionType": "skills",
            "status": "accepted",
            "suggested": "Docker",
            "skillName": "Docker"
        },
        {
            "id": "summary:0",
            "sectionType": "summary",
            "status": "accepted",
            "suggested": "Experienced Software Engineer with expertise in Python, React, SQL, and Docker containers."
        }
    ]
    
    tailored_resume = ATSScoringEngine.apply_suggestions(resume, suggestions, {"accepted"})
    new_res = ATSScoringEngine.calculate_score(tailored_resume, job)
    
    # Verify suggestions merged correctly
    assert "Docker" in tailored_resume.skills
    assert "Docker" in tailored_resume.summary
    
    # Estimated suggestions (both accepted and pending)
    pending_suggestions = [
        {
            "id": "skills:kubernetes",
            "sectionType": "skills",
            "status": "pending",
            "suggested": "Kubernetes",
            "skillName": "Kubernetes"
        }
    ]
    
    est_resume = ATSScoringEngine.apply_suggestions(resume, suggestions + pending_suggestions, {"accepted", "pending"})
    assert "Kubernetes" in est_resume.skills
