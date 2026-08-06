import logging
from typing import Dict, List

from pydantic import BaseModel, Field

from services.cache.redis_cache import redis_cache

logger = logging.getLogger("skill_categorizer_service")

# Mirrors frontend/src/utils/skillCategorizer.js CATEGORY_ORDER exactly -- the
# AI must classify into this fixed taxonomy, not invent its own category
# names, or the rule-based and AI paths would drift and label the same skill
# differently depending on which one happened to handle it.
SKILL_CATEGORIES = [
    'Languages', 'Software Engineering', 'Frontend & Backend', 'AI & GenAI',
    'Data Engineering', 'Databases', 'Cloud', 'DevOps', 'Machine Learning',
    'Visualization', 'Observability', 'Computer Science Fundamentals',
    'Frameworks and Libraries', 'Other'
]

# A skill's category is stable over time ("Python" is always "Languages"),
# and skill vocabulary is heavily repeated across different users' resumes --
# so a long TTL turns almost every call after the first-ever classification
# of any given skill, for any user, into a pure cache hit.
CACHE_TTL_SECONDS = 60 * 60 * 24 * 30


class _SkillCategoryBatch(BaseModel):
    categories: Dict[str, str] = Field(
        description="Maps each input skill name (verbatim, exact same casing/spelling as given) to exactly one category from the allowed list."
    )


def _cache_key(skill: str) -> str:
    return f"skill_category:{skill.strip().lower()}"


def classify_skills(skill_names: List[str]) -> Dict[str, str]:
    """Classifies each skill name into one of SKILL_CATEGORIES, preferring a
    per-skill Redis cache over calling the LLM. Returns whatever it could
    resolve; skills that fail classification (cache miss + LLM error) are
    simply absent from the result, letting the caller keep its existing
    fallback for those rather than raising and losing everything."""
    cleaned = [s.strip() for s in skill_names if s and s.strip()]
    if not cleaned:
        return {}

    result: Dict[str, str] = {}
    to_classify: List[str] = []
    for skill in cleaned:
        cached = redis_cache.get(_cache_key(skill))
        if cached:
            result[skill] = cached
        else:
            to_classify.append(skill)

    if not to_classify:
        return result

    try:
        from app.ai_service import get_provider

        provider = get_provider()
        category_list = ", ".join(SKILL_CATEGORIES)
        prompt = (
            "Classify each of these resume/job skills into exactly one category "
            f"from this fixed list: {category_list}.\n\n"
            "Rules:\n"
            "- Use 'Other' only if truly none of the categories fit.\n"
            "- Programming languages (Python, Java, C++, Bash, Go, C, C#, etc.) always go to 'Languages'.\n"
            "- Soft/leadership/process skills (mentoring, technical leadership, code review, "
            "pair programming, distributed systems, microservices, API design, backend "
            "development) go to 'Software Engineering'.\n"
            "- Return every input skill name exactly as given, as a key in `categories`.\n\n"
            f"Skills: {', '.join(to_classify)}"
        )
        parsed = provider.invoke_structured(
            prompt=prompt,
            schema_cls=_SkillCategoryBatch,
            system_instruction=(
                "You are a precise technical skill taxonomist. Output strict JSON "
                "matching the schema. Never invent a category outside the given list."
            ),
            temperature=0.0,
            escalate_on_error=False
        )
        for skill, category in (parsed.categories or {}).items():
            normalized_category = category if category in SKILL_CATEGORIES else "Other"
            result[skill] = normalized_category
            redis_cache.set(_cache_key(skill), normalized_category, ttl_seconds=CACHE_TTL_SECONDS)
    except Exception as exc:
        logger.warning(
            f"[SKILL_CATEGORIZER] AI classification failed, leaving {len(to_classify)} skill(s) unclassified: {exc}"
        )

    return result
