import os
import json
import re
from typing import List, Optional, Dict, Any, TypedDict
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END
from app.groq_service import get_llm, parse_resume, analyze_job_description, analyze_gaps
from app.schemas import (
    ResumeStructure,
    JobAnalysis,
    GapsAnalysis,
    TailoringStrategy,
    FactVerificationResult,
    ReviewReport
)


def enforce_lossless_tailoring(
    original: ResumeStructure,
    candidate: ResumeStructure,
) -> ResumeStructure:
    """Project AI wording edits onto the immutable source structure.

    Full-schema LLM generation is intentionally treated as an untrusted draft.
    Only prose fields that have a one-to-one source slot are accepted. All
    identity, evidence, cardinality, ordering, links, and source-owned sections
    come from the uploaded resume.
    """
    result = original.model_copy(deep=True)

    if candidate.summary and original.summary:
        result.summary = candidate.summary

    for section in ("experience", "projects"):
        source_items = getattr(original, section)
        draft_items = getattr(candidate, section)
        if len(source_items) != len(draft_items):
            continue
        result_items = getattr(result, section)
        for index, (source_item, draft_item) in enumerate(zip(source_items, draft_items)):
            source_bullets = list(source_item.description or [])
            draft_bullets = list(draft_item.description or [])
            if len(source_bullets) != len(draft_bullets):
                continue
            # Metrics are immutable evidence. Reject a rewritten bullet if its
            # numeric claims differ from the corresponding source bullet.
            for bullet_index, (source_bullet, draft_bullet) in enumerate(
                zip(source_bullets, draft_bullets)
            ):
                source_metrics = re.findall(r"(?:\$\s*)?\d[\d,.]*(?:%|\+|x|k|m|b)?", source_bullet, re.I)
                draft_metrics = re.findall(r"(?:\$\s*)?\d[\d,.]*(?:%|\+|x|k|m|b)?", draft_bullet, re.I)
                if draft_bullet and source_metrics == draft_metrics:
                    result_items[index].description[bullet_index] = draft_bullet

    return result

# 1. ParserAgent wrapper
def run_parser_agent(raw_text: str, api_key: Optional[str] = None) -> ResumeStructure:
    return parse_resume(raw_text, api_key)

# 2. JDIntelligenceAgent wrapper
def run_jd_intelligence_agent(jd_text: str, api_key: Optional[str] = None) -> JobAnalysis:
    return analyze_job_description(jd_text, api_key)

# 3. GapAnalysisAgent wrapper
def run_gap_analysis_agent(resume: ResumeStructure, job: JobAnalysis, api_key: Optional[str] = None) -> GapsAnalysis:
    return analyze_gaps(resume, job, api_key)

# 4. TailoringStrategyAgent
def run_tailoring_strategy_agent(
    resume: ResumeStructure,
    job: JobAnalysis,
    gaps: GapsAnalysis,
    api_key: Optional[str] = None
) -> TailoringStrategy:
    llm = get_llm(api_key, temperature=0.1)
    structured_llm = llm.with_structured_output(TailoringStrategy)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are the Tailoring Strategy Agent. Your job is to define a high-level tailoring plan for adapting the resume to the target Job Description.
        
        Focus on:
        1. Designing a professional summary focus.
        2. Identifying which target skills can be truthfully added.
        3. Formulating bullet-by-bullet improvement goals for experiences and projects (e.g. what impact, keywords, or metrics to focus on).
        
        Do not generate any changes to the text yet. Only produce the strategy outline in the requested JSON structure."""),
        ("human", "Resume Content:\n{resume}\n\nJob Analysis:\n{job}\n\nMissing Keywords:\n{keywords}")
    ])
    
    chain = prompt | structured_llm
    return chain.invoke({
        "resume": resume.model_dump_json(include={"summary", "skills", "experience", "projects"}),
        "job": job.model_dump_json(include={"title", "company", "required_skills", "keywords"}),
        "keywords": ", ".join(gaps.missing_keywords)
    })

# 5. ResumeTailoringAgent
def run_resume_tailoring_agent(
    resume: ResumeStructure,
    job: JobAnalysis,
    strategy: TailoringStrategy,
    api_key: Optional[str] = None
) -> ResumeStructure:
    llm = get_llm(api_key, temperature=0.1)
    structured_llm = llm.with_structured_output(ResumeStructure)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are the Resume Tailoring Agent. Your job is to rewrite the resume text to align with the target job and tailoring strategy.
        
        Strict Rules:
        1. Maintain the overall structure. Do NOT delete existing jobs or education.
        2. Tailor the professional summary.
        3. Rewrite experiences and projects to highlight target impact, keywords, and action verbs as outlined in the strategy goals.
        4. Integrate matching skills naturally.
        5. Never fabricate metrics, dates, or credentials. Do not invent new skills or technologies that the candidate does not have background in.
        
        Output the full updated ResumeStructure JSON."""),
        ("human", "Resume:\n{resume}\n\nTailoring Strategy:\n{strategy}\n\nTarget Job:\n{job}")
    ])
    
    chain = prompt | structured_llm
    candidate = chain.invoke({
        "resume": resume.model_dump_json(),
        "strategy": strategy.model_dump_json(),
        "job": job.model_dump_json()
    })
    return enforce_lossless_tailoring(resume, candidate)

# 6. FactVerificationAgent
def run_fact_verification_agent(
    original_resume: ResumeStructure,
    tailored_resume: ResumeStructure,
    api_key: Optional[str] = None
) -> FactVerificationResult:
    llm = get_llm(api_key, temperature=0.0)
    structured_llm = llm.with_structured_output(FactVerificationResult)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are the Fact Verification Agent. Your job is to audit the tailored resume against the original resume.
        
        Verify:
        - Did the tailoring agent invent or exaggerate metrics (e.g. inflating numbers, adding $ millions of revenue or % efficiency changes not justified by original text)?
        - Did the tailoring agent add skills or programming languages that the candidate never listed in the original resume or projects?
        - Did the tailoring agent change dates or job roles?
        
        If any hallucinations or exaggerations are found:
        1. List them in `hallucinations`.
        2. Set `is_valid` to false.
        3. Provide the corrected/reverted wording in the `corrections` dict where the key is the exact path (e.g., 'experience.0.description.1' or 'summary') and the value is the corrected text (reverted back to original or rewritten truthfully).
        
        If it is fully honest and accurate, set `is_valid` to true."""),
        ("human", "Original Resume:\n{original}\n\nTailored Resume:\n{tailored}")
    ])
    
    chain = prompt | structured_llm
    return chain.invoke({
        "original": original_resume.model_dump_json(include={"summary", "skills", "experience", "projects"}),
        "tailored": tailored_resume.model_dump_json(include={"summary", "skills", "experience", "projects"})
    })

# Helper to apply fact verification corrections to resume
def apply_verification_corrections(resume: ResumeStructure, corrections: Dict[str, str]) -> ResumeStructure:
    updated = resume.model_copy(deep=True)
    for path, corrected_val in corrections.items():
        try:
            parts = path.split('.')
            if len(parts) == 1 and parts[0] == 'summary':
                updated.summary = corrected_val
            elif len(parts) == 4 and parts[0] == 'experience':
                idx = int(parts[1])
                bullet_idx = int(parts[3])
                if idx < len(updated.experience) and bullet_idx < len(updated.experience[idx].description):
                    updated.experience[idx].description[bullet_idx] = corrected_val
            elif len(parts) == 4 and parts[0] == 'projects':
                idx = int(parts[1])
                bullet_idx = int(parts[3])
                if idx < len(updated.projects) and bullet_idx < len(updated.projects[idx].description):
                    updated.projects[idx].description[bullet_idx] = corrected_val
        except Exception as e:
            print(f"Error applying correction for path {path}: {e}")
    return updated

# 7. ATSOptimizationAgent
def run_ats_optimization_agent(
    resume: ResumeStructure,
    job: JobAnalysis,
    gaps: GapsAnalysis,
    api_key: Optional[str] = None
) -> ResumeStructure:
    llm = get_llm(api_key, temperature=0.1)
    structured_llm = llm.with_structured_output(ResumeStructure)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are the ATS Optimization Agent. Your job is to ensure the resume is optimized for ATS parsing without reducing readability.
        
        Steps:
        1. Check missing keywords and skills.
        2. Ensure they are naturally integrated into the summary, skills list, or relevant bullets.
        3. Keep the layout standard, making sure no section names or details are garbled.
        
        Output the final optimized ResumeStructure JSON."""),
        ("human", "Resume:\n{resume}\n\nTarget Job:\n{job}\n\nMissing Keywords:\n{keywords}")
    ])
    
    chain = prompt | structured_llm
    candidate = chain.invoke({
        "resume": resume.model_dump_json(),
        "job": job.model_dump_json(include={"title", "required_skills", "keywords", "ats_keywords"}),
        "keywords": ", ".join(gaps.missing_keywords)
    })
    return enforce_lossless_tailoring(resume, candidate)

# 8. RecruiterReviewAgent
def run_recruiter_review_agent(
    resume: ResumeStructure,
    job: JobAnalysis,
    api_key: Optional[str] = None
) -> ReviewReport:
    llm = get_llm(api_key, temperature=0.1)
    structured_llm = llm.with_structured_output(ReviewReport)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are the Recruiter Review Agent. Review the resume from a professional recruiter's perspective.
        
        Evaluate:
        - Impact and results (presense of metrics, action verbs).
        - Clarity, structure, and brevity.
        - senior alignment / buzzwords.
        
        Provide a score from 0 to 100, strengths, weaknesses, and actionable feedback."""),
        ("human", "Resume:\n{resume}\n\nJob requirements:\n{job}")
    ])
    
    chain = prompt | structured_llm
    return chain.invoke({
        "resume": resume.model_dump_json(),
        "job": job.model_dump_json()
    })

# 9. HiringManagerReviewAgent
def run_hiring_manager_review_agent(
    resume: ResumeStructure,
    job: JobAnalysis,
    api_key: Optional[str] = None
) -> ReviewReport:
    llm = get_llm(api_key, temperature=0.1)
    structured_llm = llm.with_structured_output(ReviewReport)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are the Hiring Manager Review Agent. Review the resume from a technical Hiring Manager's perspective.
        
        Evaluate:
        - Technical depth and stack alignment.
        - Problem-solving ability shown in projects/experience.
        - Practicality and team fit based on bullets.
        
        Provide a score from 0 to 100, strengths, weaknesses, and actionable feedback."""),
        ("human", "Resume:\n{resume}\n\nJob requirements:\n{job}")
    ])
    
    chain = prompt | structured_llm
    return chain.invoke({
        "resume": resume.model_dump_json(),
        "job": job.model_dump_json()
    })

# --- LangGraph Integration ---

class AgentState(TypedDict):
    original_resume: ResumeStructure
    jd_text: str
    job: Optional[JobAnalysis]
    gaps: Optional[GapsAnalysis]
    strategy: Optional[TailoringStrategy]
    tailored_resume: Optional[ResumeStructure]
    verification: Optional[FactVerificationResult]
    optimized_resume: Optional[ResumeStructure]
    recruiter_feedback: Optional[ReviewReport]
    hiring_feedback: Optional[ReviewReport]
    ats_score: int
    audit_logs: List[str]
    attempt: int
    api_key: Optional[str]

# Graph Node 1: Analyze JD
def analyze_jd_node(state: AgentState) -> Dict[str, Any]:
    job = run_jd_intelligence_agent(state["jd_text"], state["api_key"])
    return {"job": job}

# Graph Node 2: Gap Analysis
def gap_analysis_node(state: AgentState) -> Dict[str, Any]:
    gaps = run_gap_analysis_agent(state["original_resume"], state["job"], state["api_key"])
    return {"gaps": gaps}

# Graph Node 3: Strategy Design
def strategy_node(state: AgentState) -> Dict[str, Any]:
    strategy = run_tailoring_strategy_agent(state["original_resume"], state["job"], state["gaps"], state["api_key"])
    return {"strategy": strategy}

# Graph Node 4: Resume Tailoring
def tailor_resume_node(state: AgentState) -> Dict[str, Any]:
    tailored = run_resume_tailoring_agent(state["original_resume"], state["job"], state["strategy"], state["api_key"])
    return {"tailored_resume": tailored, "attempt": state["attempt"] + 1}

# Graph Node 5: Fact Verification
def verify_facts_node(state: AgentState) -> Dict[str, Any]:
    verification = run_fact_verification_agent(state["original_resume"], state["tailored_resume"], state["api_key"])
    logs = list(state["audit_logs"])
    current_resume = state["tailored_resume"]
    
    if verification.is_valid:
        logs.append(f"Attempt {state['attempt']}: Validated successfully.")
    else:
        logs.append(f"Attempt {state['attempt']}: Hallucinations found: {verification.hallucinations}. Applying corrections.")
        if verification.corrections:
            current_resume = apply_verification_corrections(state["tailored_resume"], verification.corrections)
            # Re-verify and update log
            revised_verification = run_fact_verification_agent(state["original_resume"], current_resume, state["api_key"])
            if revised_verification.is_valid:
                logs.append("Corrections applied. Facts verified.")
                verification = revised_verification
                
    return {"verification": verification, "tailored_resume": current_resume, "audit_logs": logs}

# Conditional Routing Choice Logic
def should_continue_or_optimize(state: AgentState) -> str:
    verification = state["verification"]
    attempt = state["attempt"]
    
    if verification and verification.is_valid:
        return "optimize_ats"
    elif attempt >= 3:
        return "optimize_ats"
    else:
        return "tailor"

# Graph Node 6: ATS Optimization
def optimize_ats_node(state: AgentState) -> Dict[str, Any]:
    optimized = run_ats_optimization_agent(state["tailored_resume"], state["job"], state["gaps"], state["api_key"])
    return {"optimized_resume": optimized}

# Graph Node 7: Recruiter Review
def recruiter_review_node(state: AgentState) -> Dict[str, Any]:
    review = run_recruiter_review_agent(state["optimized_resume"], state["job"], state["api_key"])
    return {"recruiter_feedback": review}

# Graph Node 8: Hiring Manager Review
def hiring_manager_review_node(state: AgentState) -> Dict[str, Any]:
    review = run_hiring_manager_review_agent(state["optimized_resume"], state["job"], state["api_key"])
    return {"hiring_feedback": review}

# Graph Node 9: Final Schema Audit & Score aggregation
def final_audit_node(state: AgentState) -> Dict[str, Any]:
    final_resume = enforce_lossless_tailoring(
        state["original_resume"],
        state["optimized_resume"],
    )
    if not final_resume.experience: final_resume.experience = []
    if not final_resume.projects: final_resume.projects = []
    if not final_resume.skills: final_resume.skills = []
    if not final_resume.certifications: final_resume.certifications = []
    if not final_resume.achievements: final_resume.achievements = []
    
    recruiter = state["recruiter_feedback"]
    hiring = state["hiring_feedback"]
    avg_score = int((recruiter.score + hiring.score) / 2) if recruiter and hiring else 0
    
    return {
        "optimized_resume": final_resume,
        "ats_score": avg_score
    }

# Build and Compile the State Graph workflow
workflow = StateGraph(AgentState)

workflow.add_node("analyze_jd", analyze_jd_node)
workflow.add_node("gap_analysis", gap_analysis_node)
workflow.add_node("strategy", strategy_node)
workflow.add_node("tailor", tailor_resume_node)
workflow.add_node("verify_facts", verify_facts_node)
workflow.add_node("optimize_ats", optimize_ats_node)
workflow.add_node("recruiter_review", recruiter_review_node)
workflow.add_node("hiring_review", hiring_manager_review_node)
workflow.add_node("final_audit", final_audit_node)

workflow.set_entry_point("analyze_jd")

workflow.add_edge("analyze_jd", "gap_analysis")
workflow.add_edge("gap_analysis", "strategy")
workflow.add_edge("strategy", "tailor")
workflow.add_edge("tailor", "verify_facts")

workflow.add_conditional_edges(
    "verify_facts",
    should_continue_or_optimize,
    {
        "tailor": "tailor",
        "optimize_ats": "optimize_ats"
    }
)

workflow.add_edge("optimize_ats", "recruiter_review")
workflow.add_edge("recruiter_review", "hiring_review")
workflow.add_edge("hiring_review", "final_audit")
workflow.add_edge("final_audit", END)

compiled_graph = workflow.compile()

# Orchestrator entrypoint
def orchestrate_multi_agent_flow(
    original_resume: ResumeStructure,
    jd_text: str,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    initial_state: AgentState = {
        "original_resume": original_resume,
        "jd_text": jd_text,
        "job": None,
        "gaps": None,
        "strategy": None,
        "tailored_resume": None,
        "verification": None,
        "optimized_resume": None,
        "recruiter_feedback": None,
        "hiring_feedback": None,
        "ats_score": 0,
        "audit_logs": [],
        "attempt": 0,
        "api_key": api_key
    }
    
    final_state = compiled_graph.invoke(initial_state)
    
    return {
        "tailored_content": final_state["optimized_resume"].model_dump(),
        "ats_score": final_state["ats_score"],
        "audit_logs": final_state["audit_logs"],
        "recruiter_feedback": final_state["recruiter_feedback"].model_dump() if final_state["recruiter_feedback"] else {},
        "hiring_feedback": final_state["hiring_feedback"].model_dump() if final_state["hiring_feedback"] else {},
        "strategy": final_state["strategy"].model_dump() if final_state["strategy"] else {}
    }
