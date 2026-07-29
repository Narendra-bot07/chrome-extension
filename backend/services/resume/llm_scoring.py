from typing import Any, Dict, List

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field, field_validator

from app.groq_service import get_llm


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


def calculate_llm_live_scores(
    original_resume: Dict[str, Any],
    current_resume: Dict[str, Any],
    potential_resume: Dict[str, Any],
    job: Dict[str, Any],
    api_key: str | None = None,
) -> LiveSemanticScores:
    """Score three concrete resume snapshots against one canonical JD."""
    structured_llm = get_llm(api_key, temperature=0.0).with_structured_output(
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
  readability, and parseability for this exact job. It is not a generic resume score.
- Potential is not a promised score. Score only the supplied potential snapshot.
- Do not force scores to improve. Similar snapshots should receive similar scores.
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
    return (prompt | structured_llm).invoke(
        {
            "job": job,
            "original": original_resume,
            "current": current_resume,
            "potential": potential_resume,
        }
    )

