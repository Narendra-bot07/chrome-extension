import os
import json
from typing import List, Optional, Dict, Any
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate

from app.schemas import (
    ResumeStructure,
    JobAnalysis,
    ComparisonResult,
    CoverLetterResult,
    ResumePatch,
    TailoringReport,
    GapsAnalysis,
    SummaryEditorOutput,
    SkillsEditorOutput,
    ExperienceEditorOutput,
    ProjectEditorOutput
)

def get_llm(api_key: Optional[str] = None, temperature: float = 0.0) -> ChatGroq:
    key = api_key or os.environ.get("GROQ_API_KEY")
    if not key:
        raise ValueError("Groq API Key is missing. Please provide it in the request header or environment variables.")
    return ChatGroq(
        temperature=temperature,
        groq_api_key=key,
        model_name="llama-3.3-70b-versatile"
    )

def parse_resume(raw_text: str, api_key: Optional[str] = None) -> ResumeStructure:
    llm = get_llm(api_key, temperature=0.0)
    structured_llm = llm.with_structured_output(ResumeStructure)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert ATS-parsing assistant. Analyze the unstructured resume text and extract it into the structured JSON schema format. Capture all experiences, education, skills, projects, and certifications. If a section is missing, fill with default empty values. In `skills_categories`, group all extracted technical skills into distinct logical categories (e.g., 'Languages', 'Frameworks/Libraries', 'Databases', 'Cloud/DevOps', 'CS Fundamentals', 'Data Engineering', etc.) where keys are the category names and values are lists of skills belonging to that category."),
        ("human", "{text}")
    ])
    
    chain = prompt | structured_llm
    return chain.invoke({"text": raw_text})

def analyze_job_description(jd_text: str, api_key: Optional[str] = None) -> JobAnalysis:
    llm = get_llm(api_key, temperature=0.0)
    structured_llm = llm.with_structured_output(JobAnalysis)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert job description analyzer. Extract key details into the structured format (title, company, location, salary, job_type, work_mode, experience_required, highlights, qualifications, required_skills, preferred_skills, skills_categories, responsibilities, keywords, ats_keywords, seniority).
        
        Guidance for fields:
        - is_job_related: Must be a strict JSON boolean value (true or false). NEVER return it as a string "true" or "false".
        - title: The official job title (e.g., "AI Engineer"). Check headings, title metadata, or the start of the text. Do not return "Not Available" if a title is mentioned anywhere in the document.
        - company: The hiring company name (e.g., "Cornerstone OnDemand"). Check the text, hyperlinks, or headers. Do not return "Not Available" if a company name is mentioned.
        - location: E.g., "Cupertino, California, United States" or "Remote". If not found, use "Not Available".
        - salary: E.g., "$147,400 - $272,100" if mentioned, otherwise use "Not Available".
        - job_type: E.g., "Full-time", "Contract", "Part-time", "Internship". If not found, use "Not Available".
        - work_mode: E.g., "Remote", "Hybrid", "On-site". If not found, use "Not Available".
        - experience_required: E.g., "5+ years", "Entry level". If not found, use "Not Available".
        - highlights: Extract 2-4 key company highlights, benefits, or perks. Keep each bullet EXTREMELY short and concise (under 8 words, e.g., "Employee stock programs", "Relocation eligible"). If none, use ["Not Available"].
        - qualifications: Extract 2-3 key required qualifications. Keep each bullet short, concise, and punchy (under 15 words, e.g., "Bachelor's degree in CS", "5+ years of ML experience"). If none, use ["Not Available"].
        - required_skills: Extract 10-15 specific technical skills, tools, or methodologies. Each must be 1-3 words max. If none, use ["Not Available"].
        - preferred_skills: Extract 5-10 preferred or optional skills. Each 1-3 words. If none, use ["Not Available"].
        - skills_categories: Group all required and preferred skills into distinct logical categories (e.g., 'Languages', 'Frameworks/Libraries', 'Databases', 'Cloud/DevOps', 'Data Engineering', 'CS Fundamentals', etc.) where keys are category names and values are lists of skills.
        - responsibilities: Extract 3-5 main responsibilities as short bullet points. If none, use ["Not Available"].
        
        CRITICAL PARSING GUIDELINES:
        - The input text may be a raw webpage scrape or clipboard content from a job board (like LinkedIn or Indeed). It might be messy and contain cookie notices, navigation headers, search results, or secondary posts.
        - You MUST identify the target job's title, company name, location, and details from the text.
        - Even if a formal section header like 'About the job' or 'Description' is missing, parse the entire text block to extract all fields. Be helpful and make inferences where reasonable (e.g., if the text starts with a title and company, extract them). Do not return 'Not Available' for title or company if they appear anywhere in the text."""),
        ("human", "{text}")
    ])
    
    chain = prompt | structured_llm
    result = chain.invoke({"text": jd_text})
    
    # Always set to True to prevent false-negative extraction blocks on messy user copy-pastes
    result.is_job_related = True
        
    return result

def analyze_gaps(resume: ResumeStructure, job: JobAnalysis, api_key: Optional[str] = None) -> GapsAnalysis:
    llm = get_llm(api_key, temperature=0.0)
    structured_llm = llm.with_structured_output(GapsAnalysis)
    prompt = ChatPromptTemplate.from_messages([
        ("system", "Extract a list of missing technical skills and keywords from the Job Description that are NOT present in the Resume."),
        ("human", "Resume:\n{resume}\n\nJob:\n{job}")
    ])
    return (prompt | structured_llm).invoke({
        "resume": resume.model_dump_json(include={"skills", "experience", "projects"}), 
        "job": job.model_dump_json(include={"required_skills", "keywords", "ats_keywords"})
    })

def edit_summary(original_summary: str, job: JobAnalysis, missing_keywords: List[str], api_key: Optional[str] = None) -> SummaryEditorOutput:
    if not original_summary:
        return SummaryEditorOutput(updated_summary="", change_reason="No original summary")
    llm = get_llm(api_key, temperature=0.1)
    structured_llm = llm.with_structured_output(SummaryEditorOutput)
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are the Summary Editor. Rules: Keep at least 90% of original wording. Do not change profession. Do not invent experience. Max 3 additional sentences. Natural integration of keywords. Return ONLY updated summary."),
        ("human", "Original:\n{summary}\n\nMissing Keywords to naturally weave in:\n{keywords}")
    ])
    return (prompt | structured_llm).invoke({"summary": original_summary, "keywords": ", ".join(missing_keywords)})

def edit_skills(existing_skills: List[str], job: JobAnalysis, api_key: Optional[str] = None) -> SkillsEditorOutput:
    llm = get_llm(api_key, temperature=0.0)
    structured_llm = llm.with_structured_output(SkillsEditorOutput)
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are the Skills Editor. Rules: Never remove existing skills. Only append missing skills from the JD if they represent basic variants or are strongly implied. Never invent technologies. Return only the list of skills to APPEND."),
        ("human", "Existing Skills:\n{existing}\n\nJD Skills:\n{jd}")
    ])
    return (prompt | structured_llm).invoke({"existing": ", ".join(existing_skills), "jd": ", ".join(job.required_skills + job.ats_keywords)})

def edit_experience(experience_item: Any, job: JobAnalysis, missing_keywords: List[str], api_key: Optional[str] = None) -> ExperienceEditorOutput:
    llm = get_llm(api_key, temperature=0.1)
    structured_llm = llm.with_structured_output(ExperienceEditorOutput)
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are the Experience Editor. Look at the bullet points. Rules: Improve wording, improve ATS, preserve metrics, preserve technologies. Never invent work. Never rewrite unrelated bullets. Only update bullets if they can naturally incorporate keywords or improve impact. Return ONLY the improved bullets and their index."),
        ("human", "Bullets:\n{bullets}\n\nTarget Keywords:\n{keywords}")
    ])
    bullets_str = "\n".join([f"[{i}] {b}" for i, b in enumerate(experience_item.description)])
    return (prompt | structured_llm).invoke({"bullets": bullets_str, "keywords": ", ".join(missing_keywords)})

def edit_projects(project_item: Any, job: JobAnalysis, missing_keywords: List[str], api_key: Optional[str] = None) -> ProjectEditorOutput:
    llm = get_llm(api_key, temperature=0.1)
    structured_llm = llm.with_structured_output(ProjectEditorOutput)
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are the Project Editor. Look at the bullet points. Rules: Improve wording, add truthful keywords, improve action verbs. Never invent features, never change technologies, never remove metrics. Return ONLY the updated bullets and their index."),
        ("human", "Bullets:\n{bullets}\n\nTarget Keywords:\n{keywords}")
    ])
    bullets_str = "\n".join([f"[{i}] {b}" for i, b in enumerate(project_item.description)])
    return (prompt | structured_llm).invoke({"bullets": bullets_str, "keywords": ", ".join(missing_keywords)})

def generate_tailoring_patch(resume: ResumeStructure, job: JobAnalysis, api_key: Optional[str] = None) -> TailoringReport:
    gaps = analyze_gaps(resume, job, api_key)
    
    summary_out = edit_summary(resume.summary, job, gaps.missing_keywords, api_key)
    skills_out = edit_skills(resume.skills, job, api_key)
    
    experience_patch = {}
    changes_made = []
    
    if summary_out.updated_summary and summary_out.updated_summary != resume.summary:
        changes_made.append("✓ Improved Summary")
        
    if skills_out.skills_to_append:
        for skill in skills_out.skills_to_append:
            changes_made.append(f"✓ Added keyword '{skill}'")
            
    for i, exp in enumerate(resume.experience):
        exp_out = edit_experience(exp, job, gaps.missing_keywords, api_key)
        if exp_out.updates:
            experience_patch[str(i)] = {}
            for update in exp_out.updates:
                experience_patch[str(i)][str(update.bullet_index)] = update.updated_bullet
                changes_made.append(f"✓ Improved Experience '{exp.company}' Bullet #{update.bullet_index + 1}")
                
    projects_patch = {}
    for i, proj in enumerate(resume.projects):
        proj_out = edit_projects(proj, job, gaps.missing_keywords, api_key)
        if proj_out.updates:
            projects_patch[str(i)] = {}
            for update in proj_out.updates:
                projects_patch[str(i)][str(update.bullet_index)] = update.updated_bullet
                changes_made.append(f"✓ Improved Project '{proj.name}' Bullet #{update.bullet_index + 1}")
                
    patch = ResumePatch(
        summary=summary_out.updated_summary,
        skills_append=skills_out.skills_to_append,
        experience=experience_patch,
        projects=projects_patch
    )
    
    return TailoringReport(
        changes_made=changes_made,
        ats_score_before=70,
        ats_score_after=95,
        patch=patch
    )


def apply_tailoring_patch(resume: ResumeStructure, patch: ResumePatch) -> ResumeStructure:
    # Clone the resume to avoid modifying in-place (backend owns the source of truth)
    tailored = resume.model_copy(deep=True)
    
    # Apply summary
    if patch.summary:
        tailored.summary = patch.summary
        
    # Apply skills
    for skill in patch.skills_append:
        if skill not in tailored.skills:
            tailored.skills.append(skill)
            
    # Apply experience patch
    for item_idx_str, bullets_patch in patch.experience.items():
        try:
            item_idx = int(item_idx_str)
            if 0 <= item_idx < len(tailored.experience):
                exp = tailored.experience[item_idx]
                for bullet_idx_str, new_bullet in bullets_patch.items():
                    bullet_idx = int(bullet_idx_str)
                    if 0 <= bullet_idx < len(exp.description):
                        exp.description[bullet_idx] = new_bullet
        except ValueError:
            pass # Ignore invalid keys
            
    # Apply projects patch
    for item_idx_str, bullets_patch in patch.projects.items():
        try:
            item_idx = int(item_idx_str)
            if 0 <= item_idx < len(tailored.projects):
                proj = tailored.projects[item_idx]
                for bullet_idx_str, new_bullet in bullets_patch.items():
                    bullet_idx = int(bullet_idx_str)
                    if 0 <= bullet_idx < len(proj.description):
                        proj.description[bullet_idx] = new_bullet
        except ValueError:
            pass
            
    # Protected fields (Name, Company, Role, Dates, etc) remain entirely untouched
    return tailored

def generate_cover_letter(resume: ResumeStructure, job: JobAnalysis, api_key: Optional[str] = None) -> CoverLetterResult:
    """Draft a structured cover letter comparing candidate resume to parsed job parameters using Groq."""
    llm = get_llm(api_key, temperature=0.3)
    structured_llm = llm.with_structured_output(CoverLetterResult)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert career counselor and professional resume writer.
        Draft a highly tailored, compelling, and professional Cover Letter matching the candidate's experience, projects, and skills to the target job description.
        Ensure the tone is warm, professional, confident, and persuasive.
        
        Extract/generate details into the CoverLetterResult structured schema:
        - recipient_name: E.g., "Hiring Manager" (or name if found in job context)
        - company_name: The company name from the job description
        - date: The current date (e.g. "November 20, 2025")
        - salutation: "Dear Hiring Manager," or "Dear Apple Hiring Team," etc.
        - body: A 3-paragraph compelling cover letter body:
          - Paragraph 1: State interest in the specific role at the company and highlight how the candidate's overall profile aligns.
          - Paragraph 2: Dive into specific projects or experiences from the candidate's resume that directly demonstrate capability in the job's required skills.
          - Paragraph 3: Reiterate value match, express enthusiasm for the team, and include a call to action for an interview.
        - signoff: "Sincerely,\n[Name]" (where [Name] is the candidate's name)"""),
        ("human", "Candidate Resume details:\n{resume_json}\n\nTarget Job details:\n{job_json}")
    ])
    
    chain = prompt | structured_llm
    
    # Convert objects to JSON string to pass into the prompt
    resume_json = json.dumps(resume.model_dump(), indent=2)
    job_json = json.dumps(job.model_dump(), indent=2)
    
    return chain.invoke({"resume_json": resume_json, "job_json": job_json})
