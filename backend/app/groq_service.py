import os
import re
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

def _unique_keep_order(items: List[str]) -> List[str]:
    seen = set()
    out = []
    for item in items:
        clean = re.sub(r"\s+", " ", str(item or "")).strip(" -•\t\n\r")
        key = clean.lower()
        if clean and key not in seen:
            seen.add(key)
            out.append(clean)
    return out


def _extract_section_items(text: str, heading: str) -> List[str]:
    pattern = rf"{re.escape(heading)}:?\s*(.*?)(?=\n\s*(?:Minimum qualifications|Preferred qualifications|About the job|Responsibilities|Requirements|Qualifications|Benefits|Google is proud|Apply)\b|$)"
    match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return []
    section = match.group(1)
    bullets = re.findall(r"(?:^|\n)\s*(?:[-•*]\s*)?(.+?)(?=\n\s*(?:[-•*]\s*)|\Z)", section.strip(), flags=re.DOTALL)
    return _unique_keep_order([b for b in bullets if len(b.strip()) > 8])


def _infer_skills_from_text(text: str) -> List[str]:
    skill_patterns = [
        r"\bPython\b", r"\bJavaScript\b", r"\bTypeScript\b", r"\bJava\b", r"\bC\+\+\b", r"\bC\b",
        r"\bGo\b", r"\bGolang\b", r"\bRust\b", r"\bSQL\b", r"\bNoSQL\b",
        r"\bReact\b", r"\bNode\.?js\b", r"\bSpring\b", r"\bDjango\b", r"\bFastAPI\b",
        r"\bAWS\b", r"\bAzure\b", r"\bGoogle Cloud\b", r"\bGCP\b", r"\bKubernetes\b", r"\bDocker\b",
        r"\bLinux\b", r"\bUnix\b", r"\bMachine Learning\b", r"\bML\b", r"\bAI\b", r"\bGenAI\b",
        r"\bLLM'?s?\b", r"\bAgentic\b", r"\bNLP\b", r"\bdata structures\b", r"\balgorithms\b",
        r"\bdistributed systems\b", r"\bcloud services\b", r"\bsecurity\b"
    ]
    found = []
    for pattern in skill_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            value = match.group(0)
            if value.lower() == "gcp":
                value = "Google Cloud"
            elif value.lower() == "llm's":
                value = "LLMs"
            found.append(value)
    return _unique_keep_order(found)


def _infer_experience(text: str) -> str:
    years = [int(y) for y in re.findall(r"\b(\d{1,2})\+?\s+years?\s+of\s+experience\b", text, flags=re.IGNORECASE)]
    if not years:
        return ""
    max_years = max(years)
    return f"{max_years}+ years" if "+" in text else f"{max_years} years"


def _enrich_job_analysis(result: JobAnalysis, jd_text: str) -> JobAnalysis:
    minimum = _extract_section_items(jd_text, "Minimum qualifications")
    preferred = _extract_section_items(jd_text, "Preferred qualifications")

    if not result.qualifications:
        result.qualifications = _unique_keep_order(minimum + preferred)

    inferred_skills = _infer_skills_from_text(jd_text)
    if not result.required_skills:
        result.required_skills = inferred_skills[:12]
    else:
        result.required_skills = _unique_keep_order(result.required_skills + inferred_skills[:8])

    if not result.preferred_skills and preferred:
        result.preferred_skills = _infer_skills_from_text("\n".join(preferred))

    if not result.experience_required:
        result.experience_required = _infer_experience(jd_text)

    if not result.seniority and result.experience_required:
        years_match = re.search(r"\d+", result.experience_required)
        years = int(years_match.group(0)) if years_match else 0
        result.seniority = "Senior" if years >= 5 else "Mid" if years >= 2 else "Entry"

    if not result.skills_categories:
        result.skills_categories = {}
    if result.required_skills:
        result.skills_categories["Required"] = result.required_skills
    if result.preferred_skills:
        result.skills_categories["Preferred"] = result.preferred_skills

    return result


def analyze_job_description(jd_text: str, api_key: Optional[str] = None, url: Optional[str] = "", page_title: Optional[str] = "", page_company: Optional[str] = "") -> JobAnalysis:
    llm = get_llm(api_key, temperature=0.0)
    structured_llm = llm.with_structured_output(JobAnalysis)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert Job Description Structured Extraction Engine.
Your responsibility is to extract exact structured fields from the provided single job posting text.

The input text is the pre-validated, high-scoring main job container from the DOM.
Always set is_job_related = true and extract these exact schema fields:
- title
- company
- location
- work_mode (Remote, Hybrid, On-site)
- job_type (Full-time, Part-time, Contract, Internship)
- experience_required (e.g. "2 years", "5+ years")
- seniority (Entry, Mid, Senior, Lead, Executive)
- highlights (list of strings)
- responsibilities (list of strings)
- qualifications (list of strings)
- required_skills (list of strings)
- preferred_skills (list of strings)
- skills_categories (object grouping Required/Preferred or technical categories)
- salary
- keywords
- ats_keywords

=========================================================
RULES
=========================================================
- Build the structured job object using ONLY information that actually exists in the provided text.
- Never invent or hallucinate information.
- Never fabricate missing fields. If a field is not stated, leave it empty/null/default.
- Extract required_skills from programming languages, frameworks, platforms, tools, cloud, AI/ML, security, infrastructure, and domain skills mentioned inside qualifications or responsibilities.
- Extract experience_required from phrases like "2 years of experience".
- Do not leave skills empty when the JD explicitly names technologies.
- Return valid JSON matching the exact schema only.
- No markdown or explanations outside the JSON."""),
        ("human", "Page Title: {page_title}\nDetected Company: {page_company}\nURL: {url}\n\nMain Job Container Text:\n{text}")
    ])
    
    chain = prompt | structured_llm
    result = chain.invoke({
        "text": jd_text,
        "url": url or "",
        "page_title": page_title or "",
        "page_company": page_company or ""
    })
    
    return _enrich_job_analysis(result, jd_text)

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

def _match_norm(value: Any) -> str:
    return re.sub(r"[^a-z0-9+#.]+", " ", str(value or "").lower()).strip()

def _match_compact(value: Any) -> str:
    return re.sub(r"[^a-z0-9+#.]+", "", str(value or "").lower())

def _flatten_values(value: Any) -> List[str]:
    out: List[str] = []
    if value is None:
        return out
    if isinstance(value, list):
        for item in value:
            out.extend(_flatten_values(item))
    elif isinstance(value, dict):
        for item in value.values():
            out.extend(_flatten_values(item))
    else:
        text = str(value).strip()
        if text:
            out.append(text)
    return out

def _resume_search_text(resume: ResumeStructure) -> str:
    parts = [
        resume.summary,
        resume.raw_text or "",
        json.dumps([item.model_dump() for item in resume.experience], default=str),
        json.dumps([item.model_dump() for item in resume.projects], default=str),
        json.dumps(resume.skills, default=str),
        json.dumps(resume.skills_categories or {}, default=str),
        json.dumps([item.model_dump() for item in resume.certifications], default=str),
        json.dumps(resume.achievements, default=str),
    ]
    return _match_norm(" ".join(parts))

def _job_match_terms(job: JobAnalysis) -> List[str]:
    explicit = []
    explicit.extend(_flatten_values(job.required_skills))
    explicit.extend(_flatten_values(job.preferred_skills))
    explicit.extend(_flatten_values(job.skills_categories or {}))
    explicit.extend(_flatten_values(job.ats_keywords))
    explicit.extend(_flatten_values(job.keywords))

    jd_text = " ".join(_flatten_values([
        job.title,
        job.experience_required,
        job.qualifications,
        job.responsibilities,
        job.highlights,
    ]))
    known_terms = [
        "python", "java", "javascript", "typescript", "c++", "c#", "sql", "react",
        "node.js", "nodejs", "spring", "fastapi", "django", "aws", "azure",
        "google cloud", "gcp", "docker", "kubernetes", "linux", "unix",
        "machine learning", "ml", "ai", "genai", "llm", "llms", "nlp",
        "data analysis", "risk management", "compliance", "communication",
        "security", "distributed systems", "microservices", "backend", "frontend",
        "api", "apis", "algorithms", "data structures",
    ]
    jd_norm = _match_norm(jd_text)
    explicit.extend(term for term in known_terms if _match_norm(term) in jd_norm)

    terms = []
    seen = set()
    for term in explicit:
        clean = _match_norm(term)
        key = _match_compact(clean)
        if len(clean) >= 2 and key not in seen:
            seen.add(key)
            terms.append(clean)
    return terms[:30]

def calculate_resume_job_match_score(resume: ResumeStructure, job: JobAnalysis) -> int:
    """Deterministic backend source of truth for active-resume vs extracted-JD match."""
    resume_text = _resume_search_text(resume)
    resume_compact = _match_compact(resume_text)
    jd_terms = _job_match_terms(job)
    if not resume_text or not jd_terms:
        return 0

    matched = 0
    for term in jd_terms:
        if _match_norm(term) in resume_text or _match_compact(term) in resume_compact:
            matched += 1

    skill_score = matched / len(jd_terms)
    required_years = re.findall(r"\b(\d{1,2})\+?\s+years?\b", " ".join(_flatten_values([
        job.experience_required,
        job.qualifications,
        job.responsibilities,
    ])).lower())
    has_experience_signal = bool(resume.experience or re.search(r"\b(19|20)\d{2}\b", resume_text))
    experience_score = 1.0 if not required_years or has_experience_signal else 0.0
    structure_score = sum([
        bool(resume.summary),
        bool(resume.experience),
        bool(resume.projects),
        bool(resume.skills or resume.skills_categories),
    ]) / 4

    return max(0, min(100, round((skill_score * 70) + (experience_score * 20) + (structure_score * 10))))

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
    
    ats_score_before = calculate_resume_job_match_score(resume, job)
    # Score the materialized resume, not an estimated improvement based on the
    # number of generated edits. Rejected/no-op changes therefore add nothing.
    tailored_for_scoring = apply_tailoring_patch(resume, patch)
    ats_score_after = calculate_resume_job_match_score(tailored_for_scoring, job)

    return TailoringReport(
        changes_made=changes_made,
        ats_score_before=ats_score_before,
        ats_score_after=ats_score_after,
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

from pydantic import BaseModel
class RefinedSkills(BaseModel):
    skills: List[str]

class RefinedBullets(BaseModel):
    bullets: List[str]

def refine_section_with_ai(
    section_type: str,
    section_data: Any,
    prompt: str,
    job: JobAnalysis,
    api_key: Optional[str] = None
) -> Any:
    llm = get_llm(api_key, temperature=0.2)
    
    if section_type == "summary":
        sys_prompt = (
            "You are an expert resume writer. Refine the professional summary of the candidate "
            "based on the user's instruction and the target Job Description. "
            "Maintain the core truth of the candidate's background. Do not invent facts.\n"
            "Target Job:\n"
            f"- Title: {job.title}\n"
            f"- Company: {job.company}\n"
            f"- Required Skills: {', '.join(job.required_skills)}\n"
            "\n"
            f"User Instruction: {prompt}\n"
            "Return ONLY the refined summary text. Do not include any tags, notes, markdown formatting, or intros."
        )
        messages = [
            ("system", sys_prompt),
            ("human", f"Original: {section_data.get('original')}\nCurrent Suggested: {section_data.get('current_suggested')}")
        ]
        res = llm.invoke(messages)
        return res.content.strip().replace('"', '')
        
    elif section_type == "skills":
        structured_llm = llm.with_structured_output(RefinedSkills)
        sys_prompt = (
            "You are an expert technical resume editor. Refine the candidate's skills list "
            "based on the user's instruction and the target Job Description.\n"
            f"User Instruction: {prompt}\n"
            "Return the list of skills as a JSON array matching the structure."
        )
        messages = [
            ("system", sys_prompt),
            ("human", f"Current Skills List: {', '.join(section_data)}")
        ]
        res = structured_llm.invoke(messages)
        return res.skills

    elif section_type in ("experience", "projects"):
        structured_llm = llm.with_structured_output(RefinedBullets)
        sys_prompt = (
            "You are an expert resume writer. Refine the following list of bullet points for a "
            f"resume section ({section_type}) based on the user's instruction and target Job Description. "
            "IMPORTANT Rules:\n"
            "1. You must return exactly the same number of bullet points as the input.\n"
            "2. Preserve metrics, numbers, and technologies. Never invent false achievements.\n"
            "3. Apply the user's refinement instruction to every bullet point where applicable.\n"
            "\n"
            f"User Instruction: {prompt}\n"
            f"Target Job: {job.title} at {job.company}"
        )
        bullets_input = "\n".join([f"- {b}" for b in section_data])
        messages = [
            ("system", sys_prompt),
            ("human", f"Bullets to refine:\n{bullets_input}")
        ]
        res = structured_llm.invoke(messages)
        return res.bullets

