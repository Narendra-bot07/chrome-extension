import os
import json
from app.schemas import ResumeStructure
from app.services.agents import orchestrate_multi_agent_flow

def main():
    # Mock resume data structure
    resume_data = {
        "personal_info": {
            "name": "Narendra Bandi",
            "email": "bandinarendra3333@gmail.com",
            "phone": "+91-8341896988",
            "location": "Hyderabad, Telangana",
            "linkedin": "https://linkedin.com/in/narendra-bandi",
            "github": "https://github.com/narendra-bandi",
            "website": "https://narendra.dev",
            "job_title": "AI Engineer"
        },
        "summary": "AI Engineer specializing in LLMs and scalable systems.",
        "skills": ["Python", "SQL", "LangChain", "FastAPI"],
        "experience": [
            {
                "company": "Celebal Technologies",
                "role": "Data Engineer Intern",
                "location": "Hyderabad, India",
                "start_date": "Feb 2026",
                "end_date": "Present",
                "description": [
                    "Built PySpark schemas and validation pipelines.",
                    "Optimized Spark clusters for data ingestion pipelines."
                ]
            }
        ],
        "projects": [
            {
                "name": "Incident Intelligence Platform",
                "role": "Developer",
                "technology_stack": ["LangGraph", "Milvus"],
                "description": [
                    "Orchestrated 6-agent workflows for automatic incident alerts."
                ]
            }
        ],
        "education": [
            {
                "institution": "CVR College of Engineering",
                "degree": "B.Tech in Computer Science",
                "field_of_study": "Computer Science (AI & ML)",
                "location": "Hyderabad, India",
                "start_date": "Nov 2022",
                "end_date": "Apr 2026",
                "gpa": "8.57"
            }
        ]
    }
    
    resume_obj = ResumeStructure(**resume_data)
    jd_text = """
    We are looking for a Senior AI Engineer with expertise in Python, LangChain, and AI Agent workflows.
    You will design self-correcting prompt loops, manage vector database indexing (Milvus/Qdrant), 
    and optimize LLM application latency. Strong knowledge of FastAPI and PySpark is a plus.
    """
    
    print("--- Starting Multi-Agent Resume Tailoring Test ---")
    
    # Check if API key is present
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("[Warning] GROQ_API_KEY env var not found. Pipeline execution requires a valid key.")
        return
        
    try:
        result = orchestrate_multi_agent_flow(resume_obj, jd_text, api_key)
        print("\n--- Pipeline Execution Completed Successfully! ---")
        print(f"Aggregated ATS Score: {result['ats_score']}/100")
        print("\nAudit Logs:")
        for log in result["audit_logs"]:
            print(f" - {log}")
            
        print("\nRecruiter Strengths:")
        for s in result["recruiter_feedback"].get("strengths", []):
            print(f" - {s}")
            
        print("\nHiring Manager Strengths:")
        for s in result["hiring_feedback"].get("strengths", []):
            print(f" - {s}")
            
    except Exception as e:
        print(f"Pipeline failed with exception: {e}")

if __name__ == "__main__":
    main()
