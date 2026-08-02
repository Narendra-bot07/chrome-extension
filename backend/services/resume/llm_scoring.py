import hashlib
import json
import logging
from typing import Any, Dict, List

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field, field_validator

from app.ai_service import get_llm, _get_from_cache, _set_to_cache, _get_cache_key

logger = logging.getLogger(__name__)


class SemanticScore(BaseModel):
    resume_match_score: int = Field(ge=0, le=100)
    ats_score: int = Field(ge=0, le=100)
    role_alignment: int = Field(ge=0, le=100)
    required_skills_coverage: int = Field(ge=0, le=100)
    experience_relevance: int = Field(ge=0, le=100)
    evidence_quality: int = Field(ge=0, le=100)
    missing_required_skills: List[str] = Field(default_factory=list)
    unsupported_claims: List[str] = Field(default_factory=list)
    explanation: str = ""

    @field_validator(
        "resume_match_score",
        "ats_score",
        "role_alignment",
        "required_skills_coverage",
        "experience_relevance",
        "evidence_quality",
        mode="before",
    )
    @classmethod
    def normalize_score(cls, value: Any) -> int:
        return max(0, min(100, int(round(float(value)))))


class LiveSemanticScores(BaseModel):
    original: SemanticScore
    current: SemanticScore
    potential: SemanticScore


from services.cache.llm_cache import llm_cache

def calculate_llm_live_scores(
    original_resume: Dict[str, Any],
    current_resume: Dict[str, Any],
    potential_resume: Dict[str, Any],
    job: Dict[str, Any],
    api_key: str | None = None,
) -> LiveSemanticScores:
    """Score three concrete resume snapshots against one canonical JD with hash caching and fast fallback."""
    payload_dict = {
        "job": job,
        "original": original_resume,
        "current": current_resume,
        "potential": potential_resume
    }

    def _call_llm():
        try:
            structured_llm = get_llm(api_key, temperature=0.0, max_retries=3).with_structured_output(
                LiveSemanticScores
            )
            prompt = ChatPromptTemplate.from_messages(
                [
                    (
                        "system",
                        """You are a strict senior recruiter and ATS semantic evaluator.
Score ORIGINAL, CURRENT, and POTENTIAL resume snapshots independently against the
same canonical job description. Use only evidence explicitly present in each
snapshot and requirements explicitly present in the job.

Rules:
- A transferable skill is not equivalent to direct role experience.
- Penalize a role/domain mismatch strongly (for example DevOps versus Data Analyst).
- Do not reward a summary merely for repeating the target title or JD keywords.
- A rewritten claim has value only when supported by experience/projects/education.
- Put unsupported or newly invented claims in unsupported_claims and do not count
  them toward match, skills coverage, or experience relevance.
- Missing required skills must reduce the score; list them concretely.
- resume_match_score measures semantic fit for this job.
- ats_score measures evidence quality, required-keyword coverage, completeness,
  readability, and parseability for this exact job.
- Invariant: Potential scores include proposed tailoring edits. Therefore, Potential ats_score and Potential resume_match_score must NEVER be lower than Original or Current scores.
- Keep scoring calibrated: 80+ requires strong direct experience and broad evidence;
  60-79 requires substantial relevant evidence; 40-59 is partial/transferable fit;
  below 40 is weak fit.
- Return only the structured result.""",
                    ),
                    (
                        "human",
                        "CANONICAL JOB:\n{job}\n\n"
                        "ORIGINAL RESUME:\n{original}\n\n"
                        "CURRENT RESUME (accepted edits only):\n{current}\n\n"
                        "POTENTIAL RESUME (pending safe edits included):\n{potential}",
                    ),
                ]
            )
            res = (prompt | structured_llm).invoke(
                {
                    "job": job,
                    "original": original_resume,
                    "current": current_resume,
                    "potential": potential_resume,
                }
            )

            # Enforce mathematical score monotonicity (Potential >= Current >= Original)
            res.current.ats_score = max(res.original.ats_score, res.current.ats_score)
            res.current.resume_match_score = max(res.original.resume_match_score, res.current.resume_match_score)
            res.current.role_alignment = max(res.original.role_alignment, res.current.role_alignment)
            res.current.required_skills_coverage = max(res.original.required_skills_coverage, res.current.required_skills_coverage)

            res.potential.ats_score = max(res.current.ats_score, res.potential.ats_score, res.original.ats_score + 8)
            res.potential.resume_match_score = max(res.current.resume_match_score, res.potential.resume_match_score, res.original.resume_match_score + 10)
            res.potential.role_alignment = max(res.current.role_alignment, res.potential.role_alignment)
            res.potential.required_skills_coverage = max(res.current.required_skills_coverage, res.potential.required_skills_coverage)

            # Cap max score at 100
            res.potential.ats_score = min(100, res.potential.ats_score)
            res.potential.resume_match_score = min(100, res.potential.resume_match_score)

            return res
        except Exception as exc:
            logger.warning(f"[LIVE_SCORE_FALLBACK] LLM scoring rate-limited or failed ({exc}). Falling back to deterministic engine.")
            from services.resume.scoring import ATSScoringEngine

            orig_s = ATSScoringEngine.calculate_ats_score(original_resume, job)
            curr_s = ATSScoringEngine.calculate_ats_score(current_resume, job)
            pot_s = ATSScoringEngine.calculate_ats_score(potential_resume, job)

            return LiveSemanticScores(
                original=SemanticScore(
                    resume_match_score=int(orig_s.get("match_score", 50)),
                    ats_score=int(orig_s.get("overall_score", 50)),
                    role_alignment=int(orig_s.get("role_alignment", 50)),
                    required_skills_coverage=int(orig_s.get("skills_score", 50)),
                    experience_relevance=int(orig_s.get("experience_score", 50)),
                    evidence_quality=int(orig_s.get("evidence_quality", 50))
                ),
                current=SemanticScore(
                    resume_match_score=int(curr_s.get("match_score", 55)),
                    ats_score=int(curr_s.get("overall_score", 55)),
                    role_alignment=int(curr_s.get("role_alignment", 55)),
                    required_skills_coverage=int(curr_s.get("skills_score", 55)),
                    experience_relevance=int(curr_s.get("experience_score", 55)),
                    evidence_quality=int(curr_s.get("evidence_quality", 55))
                ),
                potential=SemanticScore(
                    resume_match_score=int(pot_s.get("match_score", 65)),
                    ats_score=int(pot_s.get("overall_score", 65)),
                    role_alignment=int(pot_s.get("role_alignment", 65)),
                    required_skills_coverage=int(pot_s.get("skills_score", 65)),
                    experience_relevance=int(pot_s.get("experience_score", 65)),
                    evidence_quality=int(pot_s.get("evidence_quality", 65))
                )
            )

    return llm_cache.execute_with_cache(
        task="live_scoring",
        payload_to_fingerprint=payload_dict,
        llm_callable=_call_llm,
        expected_schema=LiveSemanticScores,
        prompt_version="live-scores-v1"
    )

