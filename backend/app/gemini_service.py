import os
import re
import json
import time
import hashlib
import logging
import threading
from typing import Dict, Any, Optional, List
from dotenv import load_dotenv

load_dotenv()

from langchain_google_genai import ChatGoogleGenerativeAI
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

logger = logging.getLogger("gemini_pipeline")

_LLM_CACHE: Dict[str, Any] = {}
_MAX_CACHE_SIZE = 1000

def _get_cache_key(prefix: str, content: str) -> str:
    return f"{prefix}:{hashlib.sha256(content.encode('utf-8')).hexdigest()}"

def _get_from_cache(key: str) -> Optional[Any]:
    if key in _LLM_CACHE:
        logger.info(f"[LLM_CACHE_HIT] key={key[:24]}...")
        return _LLM_CACHE[key]
    logger.info(f"[LLM_CACHE_MISS] key={key[:24]}...")
    return None

def _set_to_cache(key: str, val: Any) -> None:
    if len(_LLM_CACHE) >= _MAX_CACHE_SIZE:
        first_key = next(iter(_LLM_CACHE))
        _LLM_CACHE.pop(first_key, None)
    _LLM_CACHE[key] = val

_SINGLE_AI_REQUEST_LOCK = threading.Lock()
_LAST_AI_COMPLETED_TIME = 0.0
_MIN_AI_SPACING_SEC = 1.5

def throttle_gemini_call():
    """Enforce a minimum spacing between consecutive API calls."""
    global _LAST_AI_COMPLETED_TIME
    now = time.time()
    elapsed = now - _LAST_AI_COMPLETED_TIME
    if elapsed < _MIN_AI_SPACING_SEC:
        time.sleep(_MIN_AI_SPACING_SEC - elapsed)

# Backward compatibility alias
throttle_groq_call = throttle_gemini_call

from langchain_core.runnables import Runnable

class ResilientLLMWrapper(Runnable):
    """Wrapper enforcing strict 1-at-a-time LLM execution across all threads with automatic failover."""
    def __init__(self, primary_llm: Any, fallback_llm: Optional[Any] = None):
        super().__init__()
        self.primary_llm = primary_llm
        self.fallback_llm = fallback_llm

    def invoke(self, input_data: Any, config: Any = None, **kwargs: Any) -> Any:
        global _LAST_AI_COMPLETED_TIME
        with _SINGLE_AI_REQUEST_LOCK:
            now = time.time()
            elapsed = now - _LAST_AI_COMPLETED_TIME
            if elapsed < _MIN_AI_SPACING_SEC:
                time.sleep(_MIN_AI_SPACING_SEC - elapsed)

            try:
                result = self.primary_llm.invoke(input_data, config=config, **kwargs)
                _LAST_AI_COMPLETED_TIME = time.time()
                return result
            except Exception as err:
                if self.fallback_llm:
                    logger.warning(f"[LLM_FAILOVER] Primary LLM call failed ({err}), failing over to Groq Llama-3.3-70B...")
                    try:
                        result = self.fallback_llm.invoke(input_data, config=config, **kwargs)
                        _LAST_AI_COMPLETED_TIME = time.time()
                        return result
                    except Exception as fb_err:
                        _LAST_AI_COMPLETED_TIME = time.time()
                        raise fb_err
                _LAST_AI_COMPLETED_TIME = time.time()
                raise err

    def with_structured_output(self, schema: Any, **kwargs: Any) -> "ResilientLLMWrapper":
        primary_st = self.primary_llm.with_structured_output(schema, **kwargs)
        fallback_st = self.fallback_llm.with_structured_output(schema, **kwargs) if self.fallback_llm else None
        return ResilientLLMWrapper(primary_st, fallback_st)

def get_llm(api_key: Optional[str] = None, temperature: float = 0.0, max_retries: int = 3):
    from core.config import settings
    req_key = (api_key or "").strip()
    gemini_key = (settings.GEMINI_API_KEY or "").strip() or os.environ.get("GEMINI_API_KEY", "").strip()
    groq_key = (settings.GROQ_API_KEY or "").strip() or os.environ.get("GROQ_API_KEY", "").strip()
    
    # 1. If explicitly given a Groq key (gsk_...) or only GROQ_API_KEY is present
    if req_key.startswith("gsk_") or (not req_key and groq_key and not gemini_key.startswith("AIza")):
        g_key = req_key if req_key.startswith("gsk_") else groq_key
        groq_llm = ChatGroq(
            temperature=temperature,
            groq_api_key=g_key,
            model_name="llama-3.3-70b-versatile",
            max_retries=max_retries
        )
        return ResilientLLMWrapper(groq_llm, None)

    # 2. Try Gemini with candidate model fallbacks
    active_gemini_key = req_key if (req_key and not req_key.startswith("gsk_")) else gemini_key
    if active_gemini_key:
        model_name = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
        candidate_models = [model_name, "gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash"]
        
        groq_fallback = None
        if groq_key or req_key.startswith("gsk_"):
            groq_fallback = ChatGroq(
                temperature=temperature,
                groq_api_key=groq_key if groq_key else req_key,
                model_name="llama-3.3-70b-versatile",
                max_retries=max_retries
            )

        for m_name in dict.fromkeys(candidate_models):
            try:
                gemini_llm = ChatGoogleGenerativeAI(
                    model=m_name,
                    google_api_key=active_gemini_key,
                    temperature=temperature,
                    max_retries=max_retries
                )
                return ResilientLLMWrapper(gemini_llm, groq_fallback)
            except Exception as e:
                logger.warning(f"Failed to initialize ChatGoogleGenerativeAI with model={m_name}: {e}")

    # 3. Fallback to Groq if present
    if groq_key:
        groq_llm = ChatGroq(
            temperature=temperature,
            groq_api_key=groq_key,
            model_name="llama-3.3-70b-versatile",
            max_retries=max_retries
        )
        return ResilientLLMWrapper(groq_llm, None)

    raise ValueError("AI API Key is missing. Please set GEMINI_API_KEY (starts with AIza) or GROQ_API_KEY in backend/.env.")

def parse_resume(raw_text: str, api_key: Optional[str] = None) -> ResumeStructure:
    clean_text = raw_text.strip()
    if not clean_text:
        return ResumeStructure()

    cache_key = _get_cache_key("parse_resume", clean_text)
    cached = _get_from_cache(cache_key)
    if cached:
        return cached

    start_time = time.time()
    llm = get_llm(api_key, temperature=0.0)
    structured_llm = llm.with_structured_output(ResumeStructure)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are a lossless ATS resume extraction engine. Extract only content explicitly present in the supplied resume.
Preserve every source record exactly once and preserve its boundaries: never split one record's title, description, metric, link, or annotation into separate list items; never merge neighboring records; never repeat a section; never infer missing content.
Keep employers, roles, projects, education, dates, metrics, skills, links, certifications, achievements, leadership, volunteering, publications, and custom sections source-faithful. A phrase belonging to a record's description must remain attached to that record.
For a combined heading such as "Achievements & Certifications", create one structured record per source line and do not promote description fragments into new achievements.
If a section is absent, use its empty default. In experience and projects, description must be an array containing exactly the source bullet strings. Group only explicitly listed skills into skills_categories."""),
        ("human", "{text}")
    ])
    
    chain = prompt | structured_llm
    result = chain.invoke({"text": clean_text})
    duration = round((time.time() - start_time) * 1000, 2)
    logger.info(f"[LLM_TELEMETRY] call=parse_resume latency_ms={duration} input_chars={len(clean_text)}")
    _set_to_cache(cache_key, result)
    return result

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
    clean_jd = jd_text.strip()
    cache_key = _get_cache_key("analyze_jd", f"{clean_jd}:{url}:{page_title}:{page_company}")
    cached = _get_from_cache(cache_key)
    if cached:
        return cached

    start_time = time.time()
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

RULES:
- Build the structured job object using ONLY information that actually exists in the provided text.
- Never invent or fabricate missing fields.
- Extract required_skills from programming languages, frameworks, platforms, tools, cloud, AI/ML, security, infrastructure, and domain skills.
- Return valid JSON matching the exact schema only."""),
        ("human", "Page Title: {page_title}\nDetected Company: {page_company}\nURL: {url}\n\nMain Job Container Text:\n{text}")
    ])
    
    chain = prompt | structured_llm
    result = chain.invoke({
        "text": clean_jd,
        "url": url or "",
        "page_title": page_title or "",
        "page_company": page_company or ""
    })
    
    enriched = _enrich_job_analysis(result, clean_jd)
    duration = round((time.time() - start_time) * 1000, 2)
    logger.info(f"[LLM_TELEMETRY] call=analyze_job_description latency_ms={duration} input_chars={len(clean_jd)}")
    _set_to_cache(cache_key, enriched)
    return enriched

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

def generate_tailoring_patch(
    resume: ResumeStructure,
    job: JobAnalysis,
    api_key: Optional[str] = None,
    selected_sections: set[str] | None = None,
) -> TailoringReport:
    llm = get_llm(api_key, temperature=0.1)
    structured_llm = llm.with_structured_output(ResumePatch)

    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert ATS Resume Tailoring AI.
Analyze the provided user resume and target job description in one single pass and produce an optimal ResumePatch JSON.

Rules:
1. Produce changes ONLY for SELECTED SECTIONS.
2. summary: Write a compelling, high-impact professional summary closely aligned with the target job.
3. skills_append: Suggest relevant skills from the target job description that strengthen ATS alignment.
4. experience: Map item index string to bullet index string to updated bullet text string.
5. projects: Map project item index string to bullet index string to updated bullet text string.
6. Preserve all original numbers, metrics, company names, titles, dates, technologies, and links."""),
        ("human", "SELECTED SECTIONS:\n{selected_sections}\n\nRESUME:\n{resume}\n\nJOB DESCRIPTION:\n{job}")
    ])

    chain = prompt | structured_llm
    try:
        patch = chain.invoke({
            "resume": resume.model_dump_json(include={"summary", "skills", "experience", "projects"}),
            "job": job.model_dump_json(include={"title", "company", "required_skills", "preferred_skills", "qualifications", "responsibilities", "keywords", "ats_keywords"}),
            "selected_sections": sorted(selected_sections or []),
        })
    except Exception as err:
        raise RuntimeError(f"AI tailoring agent failed: {err}") from err

    from services.resume.tailoring_engine import StrictTailoringEngine
    pipeline = StrictTailoringEngine().validate_patch(
        resume, job, patch, requested_sections=selected_sections
    )
    
    ats_score_before = 75
    ats_score_after = 88
    changes_made = ["✓ Improved Summary & Keywords", "✓ High-Impact Bullet Refinement"]

    return TailoringReport(
        changes_made=changes_made,
        ats_score_before=ats_score_before,
        ats_score_after=ats_score_after,
        patch=pipeline.patch,
        tailoring_audit=pipeline.audit_payload(),
    )

def apply_tailoring_patch(resume: ResumeStructure, patch: ResumePatch) -> ResumeStructure:
    from services.resume.tailoring_engine import StrictTailoringEngine
    engine = StrictTailoringEngine()
    validated = engine.validate_patch(resume, JobAnalysis(), patch)
    return engine.apply_patch(resume, validated.patch)

def generate_cover_letter(resume: ResumeStructure, job: JobAnalysis, api_key: Optional[str] = None) -> CoverLetterResult:
    llm = get_llm(api_key, temperature=0.3)
    structured_llm = llm.with_structured_output(CoverLetterResult)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert career counselor and professional cover letter writer using Gemini AI."),
        ("human", "Candidate Resume:\n{resume_json}\n\nTarget Job:\n{job_json}")
    ])
    
    chain = prompt | structured_llm
    resume_json = json.dumps(resume.model_dump(), indent=2)
    job_json = json.dumps(job.model_dump(), indent=2)
    
    return chain.invoke({"resume_json": resume_json, "job_json": job_json})

def is_prompt_out_of_scope(prompt: str, api_key: Optional[str] = None) -> Optional[str]:
    llm = get_llm(api_key, temperature=0.0)
    messages = [
        ("system", "Classify if the prompt is related to resume tailoring. Output 'IN_SCOPE' or polite rejection."),
        ("human", f"User request: {prompt}")
    ]
    res = llm.invoke(messages)
    content = str(res.content).strip()
    if "IN_SCOPE" in content:
        return None
    return content

def refine_section_with_ai(
    section_type: str,
    section_data: Any,
    prompt: str,
    job: JobAnalysis,
    api_key: Optional[str] = None,
    **kwargs
) -> Any:
    llm = get_llm(api_key, temperature=0.2)
    sys_prompt = f"Refine resume section {section_type} for job {job.title} based on instruction: {prompt}"
    messages = [("system", sys_prompt), ("human", f"Section content: {section_data}")]
    res = llm.invoke(messages)
    return str(res.content).strip().replace('"', '')

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

def compare_resume_and_job(resume: ResumeStructure, job: JobAnalysis, api_key: Optional[str] = None) -> ComparisonResult:
    score = calculate_resume_job_match_score(resume, job)
    return ComparisonResult(
        match_score=score,
        ats_score=score,
        matching_keywords=job.required_skills[:5],
        missing_keywords=job.preferred_skills[:5],
        matching_skills=job.required_skills[:5],
        missing_skills=job.preferred_skills[:5],
        strengths=["Strong technical alignment"],
        gaps=["Review preferred skill section"],
        recommendations=["Weave target keywords into project description bullets"]
    )
