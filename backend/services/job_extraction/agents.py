"""Focused agents used by the job-intelligence LangGraph."""
from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from langchain_core.messages import HumanMessage, SystemMessage
from markdownify import markdownify

from app.groq_service import get_llm
from core.logging import logger
from services.job_extraction.schemas import (
    ClassificationDecision, ExtractedJob, JDState, ReviewDecision, SkillDecision,
)

LOG_PREFIX = "[JD-EXTRACTION][BACKEND]"
PORTALS = {
    "amazon": ("amazon.jobs", ["#job-detail-body", ".job-detail"]),
    "linkedin": ("linkedin.com", [".jobs-description", ".jobs-box__html-content"]),
    "workday": ("myworkdayjobs.com", ['[data-automation-id="jobPostingDescription"]']),
    "greenhouse": ("greenhouse.io", ["#content", ".job__description"]),
    "lever": ("lever.co", [".posting-page", ".section-wrapper"]),
    "indeed": ("indeed.com", ["#jobDescriptionText"]),
    "glassdoor": ("glassdoor.", ['[class*="JobDetails_jobDescription"]']),
}
BLOCK_SIGNALS = (
    "access denied", "verify you are human", "captcha", "security check",
    "sign in to continue", "temporarily unavailable",
)


def _state(value: JDState | dict[str, Any]) -> JDState:
    return value if isinstance(value, JDState) else JDState.model_validate(value)


def _event(state: JDState, agent: str, **details: Any) -> list[dict[str, Any]]:
    safe = {k: v for k, v in details.items() if k not in {"raw_html", "authorization", "cookies"}}
    return [*state.execution_log, {
        "agent": agent, "timestamp": datetime.now(timezone.utc).isoformat(), **safe
    }]


def _portal(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return next((name for name, (needle, _) in PORTALS.items() if needle in host), "generic")


def discovery_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    parsed = urlparse(state.url)
    portal = _portal(state.url)
    discovery = {
        "scheme": parsed.scheme, "host": parsed.hostname, "path": parsed.path,
        "has_job_path": bool(re.search(r"/(job|jobs|career|position|opening|viewjob)", parsed.path, re.I)),
        "likely_spa": portal in {"linkedin", "workday", "indeed", "glassdoor"},
        "language_hint": None,
    }
    logger.info("%s Discovery completed request_id=%s portal=%s", LOG_PREFIX, state.request_id, portal)
    return {
        "detected_portal": portal,
        "discovery": discovery,
        "browser_strategy": {"wait_until": "domcontentloaded", "timeout_ms": 30000},
        "execution_log": _event(state, "discovery", portal=portal),
    }


def browser_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    attempt = state.browser_attempts + 1
    logger.info("%s Browser launch request_id=%s attempt=%s", LOG_PREFIX, state.request_id, attempt)
    started = time.perf_counter()
    errors: list[str] = []
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)[:300]))
            page.goto(
                state.url,
                wait_until=state.browser_strategy.get("wait_until", "domcontentloaded"),
                timeout=state.browser_strategy.get("timeout_ms", 30000),
            )
            try:
                page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                pass
            selectors = PORTALS.get(state.detected_portal, ("", ["main", "article"]))[1]
            matched = next((selector for selector in selectors if page.locator(selector).count()), None)
            html = page.content()
            final_url = page.url
            title = page.title()
            browser.close()
    except Exception as exc:
        logger.exception("%s Browser failed request_id=%s attempt=%s", LOG_PREFIX, state.request_id, attempt)
        return {
            "browser_attempts": attempt,
            "error": {"code": "BROWSER_FAILED", "message": str(exc)[:500]},
            "execution_log": _event(state, "browser", attempt=attempt, error=type(exc).__name__),
        }
    duration = round((time.perf_counter() - started) * 1000)
    lower = html[:10000].lower()
    blocked = next((signal for signal in BLOCK_SIGNALS if signal in lower), None)
    logger.info(
        "%s Browser completed request_id=%s final_url=%s html_length=%s duration_ms=%s selector=%s",
        LOG_PREFIX, state.request_id, final_url, len(html), duration, matched,
    )
    return {
        "browser_attempts": attempt, "raw_html": html, "final_url": final_url,
        "page_title": title, "blocked_reason": blocked, "error": None,
        "metadata": {"browser_errors": errors, "matched_selector": matched, "load_duration_ms": duration},
        "execution_log": _event(state, "browser", attempt=attempt, html_length=len(html), matched_selector=matched),
    }


def _walk_jsonld(item: Any, all_items: list[dict[str, Any]], jobs: list[dict[str, Any]]) -> None:
    if isinstance(item, list):
        for child in item:
            _walk_jsonld(child, all_items, jobs)
    elif isinstance(item, dict):
        all_items.append(item)
        kinds = item.get("@type", [])
        kinds = kinds if isinstance(kinds, list) else [kinds]
        if "JobPosting" in kinds:
            jobs.append(item)
        if "@graph" in item:
            _walk_jsonld(item["@graph"], all_items, jobs)


def jsonld_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    soup = BeautifulSoup(state.raw_html, "lxml")
    all_items: list[dict[str, Any]] = []
    jobs: list[dict[str, Any]] = []
    malformed = 0
    for script in soup.find_all("script", attrs={"type": re.compile("ld\\+json", re.I)}):
        try:
            _walk_jsonld(json.loads(script.string or script.get_text()), all_items, jobs)
        except (json.JSONDecodeError, TypeError):
            malformed += 1
    logger.info("%s JSON-LD completed request_id=%s blocks=%s jobs=%s malformed=%s", LOG_PREFIX, state.request_id, len(all_items), len(jobs), malformed)
    return {
        "jsonld": all_items, "jobposting_jsonld": jobs,
        "execution_log": _event(state, "jsonld", blocks=len(all_items), job_postings=len(jobs), malformed=malformed),
    }


def dom_cleaner_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    soup = BeautifulSoup(state.raw_html, "lxml")
    for node in soup.select("script,style,svg,noscript,nav,header,footer,iframe,canvas"):
        node.decompose()
    noise = re.compile(r"(cookie|consent|advert|social|tracker|recommend|related.jobs|newsletter|modal|popup)", re.I)
    for node in list(soup.find_all(attrs={"class": noise})) + list(soup.find_all(attrs={"id": noise})):
        node.decompose()
    cleaned = str(soup)
    logger.info("%s DOM cleaned request_id=%s length=%s", LOG_PREFIX, state.request_id, len(cleaned))
    return {"cleaned_html": cleaned, "execution_log": _event(state, "dom_cleaner", length=len(cleaned))}


def markdown_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    raw = markdownify(state.cleaned_html, heading_style="ATX", bullets="-")
    lines, seen = [], set()
    for line in (re.sub(r"\n{3,}", "\n\n", raw).strip()).splitlines():
        normalized = re.sub(r"\s+", " ", line).strip()
        key = normalized.lower()
        if normalized and (key not in seen or normalized.startswith(("#", "-", "*"))):
            lines.append(normalized)
            seen.add(key)
    markdown = "\n".join(lines)[:60000]
    logger.info("%s Markdown completed request_id=%s length=%s", LOG_PREFIX, state.request_id, len(markdown))
    return {"markdown": markdown, "execution_log": _event(state, "markdown", length=len(markdown))}


def metadata_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    soup = BeautifulSoup(state.raw_html, "lxml")
    metadata = dict(state.metadata)
    metadata.update({
        "title": state.page_title or (soup.title.string.strip() if soup.title and soup.title.string else None),
        "description": (soup.find("meta", attrs={"name": "description"}) or {}).get("content"),
        "canonical_url": (soup.find("link", rel="canonical") or {}).get("href"),
        "language": (soup.html or {}).get("lang"),
        "page_url": state.final_url or state.url,
        "portal": state.detected_portal,
        "open_graph": {tag.get("property"): tag.get("content") for tag in soup.find_all("meta", property=re.compile("^og:"))},
        "twitter": {tag.get("name"): tag.get("content") for tag in soup.find_all("meta", attrs={"name": re.compile("^twitter:")})},
        "headings": [tag.get_text(" ", strip=True) for tag in soup.select("h1,h2,h3")][:40],
        "apply_links": [urljoin(state.final_url or state.url, a.get("href")) for a in soup.find_all("a", href=True) if re.search(r"\bapply\b", a.get_text(" ", strip=True), re.I)][:10],
    })
    return {"metadata": metadata, "execution_log": _event(state, "metadata", headings=len(metadata["headings"]))}


def planner_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    complete_jsonld = any(item.get("title") and item.get("description") for item in state.jobposting_jsonld)
    plan = {
        "primary_source": "jobposting_jsonld" if complete_jsonld else "markdown",
        "supplementary_sources": ["markdown", "metadata"] if complete_jsonld else ["metadata", "jobposting_jsonld"],
        "browser_retry_required": len(state.markdown) < 250 and state.browser_attempts < state.max_browser_attempts,
        "strategy": "structured_first" if complete_jsonld else "evidence_fusion",
    }
    logger.info("%s Planner completed request_id=%s strategy=%s", LOG_PREFIX, state.request_id, plan["strategy"])
    return {"plan": plan, "execution_log": _event(state, "planner", strategy=plan["strategy"])}


def _deterministic_classification(state: JDState) -> ClassificationDecision:
    text = f"{state.final_url} {state.page_title} {' '.join(state.metadata.get('headings', []))} {state.markdown[:12000]}".lower()
    if state.blocked_reason:
        return ClassificationDecision(page_type="non_job", confidence=1, reasons=["Page access is blocked"])
    if state.jobposting_jsonld:
        return ClassificationDecision(page_type="job_detail", confidence=.98, reasons=["JobPosting JSON-LD found"])

    apply_signals = len(re.findall(
        r"\b(?:apply now|apply for this job|submit application|start application|easy apply)\b",
        text,
    ))
    section_markers = (
        "job description", "job details", "what to expect", "what you'll do",
        "what you’ll do", "what you will do", "what you'll bring", "what you’ll bring",
        "what you will bring", "the role", "about the role", "your role",
        "responsibilities", "key job responsibilities", "requirements",
        "minimum qualifications", "basic qualifications", "preferred qualifications",
        "qualifications", "required skills", "experience required",
    )
    section_signals = [marker for marker in section_markers if marker in text]
    employment_signals = [
        marker for marker in (
            "full-time", "full time", "part-time", "part time", "contract",
            "internship", "remote", "hybrid", "on-site", "onsite",
        )
        if marker in text
    ]
    cards = len(re.findall(
        r"\b(?:view job|view opening|job card|open position|search jobs|see job)\b",
        text,
    ))
    listing_signals = [
        marker for marker in (
            "search results", "all jobs", "job alerts", "open positions",
            "recommended jobs", "jobs matching", "filter jobs",
        )
        if marker in text
    ]
    substantial = len(state.markdown) >= 500
    title = (state.page_title or "").strip()
    has_specific_title = bool(
        title
        and len(title) >= 5
        and not re.fullmatch(
            r"(?:careers?|jobs?|search jobs?|open positions?|home)",
            title,
            flags=re.I,
        )
    )

    logger.info(
        "%s Classifier signals request_id=%s apply=%s sections=%s "
        "employment=%s listing=%s cards=%s markdown_length=%s specific_title=%s",
        LOG_PREFIX,
        state.request_id,
        apply_signals,
        section_signals,
        employment_signals,
        listing_signals,
        cards,
        len(state.markdown),
        has_specific_title,
    )

    if listing_signals and cards >= 2 and apply_signals == 0 and len(section_signals) < 2:
        return ClassificationDecision(page_type="job_list", confidence=.88, reasons=["Repeated listing/search signals"])
    if substantial and apply_signals > 0 and section_signals and has_specific_title:
        return ClassificationDecision(
            page_type="job_detail",
            confidence=.93,
            reasons=[
                "Specific role title found",
                "Application action found",
                f"Job-detail sections found: {', '.join(section_signals[:5])}",
            ],
        )
    if substantial and len(section_signals) >= 2 and has_specific_title:
        return ClassificationDecision(
            page_type="job_detail",
            confidence=.86,
            reasons=[
                "Specific role title and multiple coherent job-description sections found"
            ],
        )
    if substantial and apply_signals > 0 and employment_signals and has_specific_title:
        return ClassificationDecision(
            page_type="job_detail",
            confidence=.82,
            reasons=["Role title, employment metadata, and application action found"],
        )
    if len(state.markdown) < 250:
        return ClassificationDecision(page_type="non_job", confidence=.55, reasons=["Insufficient page evidence"], action="browser_retry")
    return ClassificationDecision(page_type="non_job", confidence=.8, reasons=["No coherent single-job evidence"])


def classifier_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    decision = _deterministic_classification(state)
    logger.info("%s Classification completed request_id=%s page_type=%s confidence=%s reasons=%s", LOG_PREFIX, state.request_id, decision.page_type, decision.confidence, decision.reasons)
    return {
        "page_type": decision.page_type, "classification_confidence": decision.confidence,
        "classification_reasons": decision.reasons,
        "classification_attempts": state.classification_attempts + 1,
        "plan": {**state.plan, "classification_action": decision.action},
        "execution_log": _event(state, "classifier", page_type=decision.page_type, confidence=decision.confidence),
    }


def classification_review_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    action = state.plan.get("classification_action")
    retry = action == "browser_retry" and state.browser_attempts < state.max_browser_attempts
    manual = not retry and state.classification_confidence < .65
    return {
        "needs_manual_review": manual,
        "plan": {**state.plan, "classification_review_action": "browser_retry" if retry else ("manual_review" if manual else "accept")},
        "execution_log": _event(state, "classification_review", action="browser_retry" if retry else "manual_review"),
    }


def evidence_planner_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    scores = {
        "jobposting_jsonld": .95 if state.jobposting_jsonld else 0,
        "markdown": min(.85, len(state.markdown) / 5000),
        "metadata": .65 if state.metadata.get("title") else .25,
    }
    hints = {
        "identity": "jobposting_jsonld or metadata",
        "description": "jobposting_jsonld or markdown",
        "application_url": "apply_links or source URL",
    }
    return {
        "source_scores": scores,
        "evidence": {"field_source_hints": hints},
        "execution_log": _event(state, "evidence_planner", source_scores=scores),
    }


def source_builder_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    primary = state.plan.get("primary_source", "markdown")
    source = json.dumps(state.jobposting_jsonld, ensure_ascii=False) if primary == "jobposting_jsonld" else state.markdown
    payload = {
        "primary_source": primary,
        "supplementary_sources": state.plan.get("supplementary_sources", []),
        "detected_sections": state.detected_sections,
        "source_text": source[:30000],
        "source_urls": list(dict.fromkeys(filter(None, [state.original_url, state.final_url, state.metadata.get("canonical_url")]))),
        "source_scores": state.source_scores,
        "field_source_hints": state.evidence.get("field_source_hints", {}),
        "metadata": {k: state.metadata.get(k) for k in ("title", "description", "apply_links", "portal")},
    }
    logger.info(
        "%s Source builder completed request_id=%s primary=%s size=%s "
        "jobposting_count=%s markdown_length=%s heading_count=%s",
        LOG_PREFIX,
        state.request_id,
        primary,
        len(source),
        len(state.jobposting_jsonld),
        len(state.markdown),
        len(state.metadata.get("headings", [])),
    )
    return {"evidence": payload, "execution_log": _event(state, "source_builder", size=len(source))}


EXTRACTION_PROMPT = """You are the evidence-grounded extraction agent for one job posting.
Read ALL supplied primary and supplementary evidence before producing ExtractedJob.

Never invent factual values; use null/empty lists only when evidence is genuinely absent.

COMPANY IDENTITY:
- company_name is the recognizable public employer brand supported by domain, metadata,
  page content, and structured hiringOrganization evidence.
- When a posting names a legal hiring subsidiary/entity but clearly belongs to a known
  parent/public employer brand on the same page, return the public brand.
- Do not blindly copy legal suffixes or requisition/entity codes into company_name.
- Do not infer a parent brand without supporting page/domain evidence.

EXPLICIT SKILL COVERAGE:
- Scan the entire description, responsibilities, mandatory qualifications, and preferred
  qualifications for explicit skills.
- skills includes every explicitly named language, query/scripting language, framework,
  library, platform, cloud/service, software/tool, statistical or mathematical method,
  scientific/analytical technique, visualization technology, data/infrastructure capability,
  domain skill, and explicitly required professional competency.
- Convert examples into separate concise canonical labels when they are explicitly written.
- Do not omit a skill because it appears inside parentheses, an “e.g.” list, a responsibility,
  or a preferred qualification.
- Generic degrees and years of experience are requirements, not skills.

INFERRED SKILL RECOMMENDATIONS (REQUIRED):
- Always produce 4-10 atomic suggested_skills for a valid job detail page, including when
  the employer does not provide a dedicated skills section.
- Infer them from the complete role title, responsibilities, expected outcomes, seniority,
  business/technical domain, requirements, and preferred qualifications.
- Select concrete, resume-usable ATS labels that a strong candidate would reasonably need
  to perform this exact role. Prefer specific methods, tools, platforms, technical
  capabilities, or domain competencies over vague traits.
- Do not invent employer requirements: suggested_skills are clearly labeled recommendations.
- Include only high-confidence recommendations supported by the overall job context.
- suggested_skills must NOT repeat anything in skills, even under an alias.
- Never move an inferred recommendation into skills unless the source explicitly states it.

Keep responsibilities, mandatory requirements, preferred qualifications, salary, and benefits
separate. Deduplicate semantically equivalent items. Preserve the complete source URL."""


def extraction_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    logger.info("%s Extraction started request_id=%s", LOG_PREFIX, state.request_id)
    structured = get_llm(temperature=0).with_structured_output(ExtractedJob)
    job = structured.invoke([
        SystemMessage(content=EXTRACTION_PROMPT),
        HumanMessage(content=json.dumps(state.evidence, ensure_ascii=False)),
    ])
    job_dict = ExtractedJob.model_validate(job).model_dump(mode="json")
    job_dict["skills"] = _atomize_skill_labels(job_dict.get("skills", []))
    explicit_keys = {skill.casefold() for skill in job_dict["skills"]}
    job_dict["suggested_skills"] = [
        skill for skill in _atomize_skill_labels(job_dict.get("suggested_skills", []))
        if skill.casefold() not in explicit_keys
    ]
    job_dict["source_url"] = state.final_url or state.original_url
    logger.info(
        "%s Extraction completed request_id=%s title=%r company=%r "
        "skills_count=%s suggested_skills_count=%s responsibilities_count=%s "
        "requirements_count=%s preferred_qualifications_count=%s benefits_count=%s",
        LOG_PREFIX,
        state.request_id,
        job_dict.get("job_title"),
        job_dict.get("company_name"),
        len(job_dict.get("skills", [])),
        len(job_dict.get("suggested_skills", [])),
        len(job_dict.get("responsibilities", [])),
        len(job_dict.get("requirements", [])),
        len(job_dict.get("preferred_qualifications", [])),
        len(job_dict.get("benefits", [])),
    )
    logger.info(
        "%s Extraction explicit skills request_id=%s skills=%s",
        LOG_PREFIX,
        state.request_id,
        job_dict.get("skills", [])[:50],
    )
    logger.info(
        "%s Extraction suggested skills request_id=%s suggested_skills=%s",
        LOG_PREFIX,
        state.request_id,
        job_dict.get("suggested_skills", [])[:50],
    )
    return {
        "extracted_job": job_dict,
        "execution_log": _event(
            state,
            "extraction",
            completed=True,
            skills_count=len(job_dict.get("skills", [])),
            responsibilities_count=len(job_dict.get("responsibilities", [])),
            requirements_count=len(job_dict.get("requirements", [])),
        ),
    }


def _atomize_skill_labels(skills: list[str]) -> list[str]:
    """Split LLM-returned example phrases into atomic ATS labels."""
    atomic: list[str] = []
    seen: set[str] = set()
    for value in skills or []:
        text = re.sub(r"\s+", " ", str(value or "")).strip(" .;")
        if not text:
            continue
        example = re.search(
            r"\((?:e\.?\s*g\.?|for example|such as)\s*[:.]?\s*(.*?)\)",
            text,
            flags=re.I,
        )
        candidates = [text]
        if example:
            candidates = re.split(r"\s*(?:,|;|/|\bor\b|\band\b)\s*", example.group(1), flags=re.I)
        elif any(separator in text for separator in (",", ";")) and len(text) < 120:
            candidates = re.split(r"\s*(?:,|;|\bor\b)\s*", text, flags=re.I)
        for candidate in candidates:
            clean = re.sub(r"^(?:and|or)\s+", "", candidate, flags=re.I)
            clean = re.sub(r"\b(?:etc\.?|and so on)$", "", clean, flags=re.I).strip(" .;")
            if not clean:
                continue
            key = clean.casefold()
            if key not in seen:
                seen.add(key)
                atomic.append(clean)
    return atomic


SKILL_INTELLIGENCE_PROMPT = """You are the specialized Skill Intelligence Agent.
Analyze the complete job evidence plus the current extracted job.

EXPLICIT SKILLS:
- Return atomic canonical ATS labels, not sentence fragments or umbrella phrases when named
  examples are present.
- If evidence says a category followed by examples, emit every named example separately.
  For example, a phrase shaped like “languages (e.g. A, B, C)” must yield A, B, and C as
  individual skills rather than the complete phrase.
- Split comma-, slash-, “or”-, and parenthetical example lists into individual labels.
- Include explicitly named tools, technologies, languages, platforms, methods, models,
  analytical/scientific techniques, visualization tools, infrastructure/data capabilities,
  and domain competencies found anywhere in the posting.
- Preserve a broader capability only when it is itself a meaningful ATS competency in addition
  to its named examples.
- Deduplicate aliases and repeated mentions.
- Never place an unsupported item in explicit_skills.

SUGGESTED SKILLS:
- Infer useful atomic ATS keywords from the role, responsibilities, seniority, domain, and
  required outcomes.
- Add only high-confidence skills that a strong candidate for this exact role would reasonably
  surface in a resume.
- Do not claim these were stated by the employer.
- Never duplicate explicit_skills.

Return concise labels only. evidence_notes must briefly identify the supporting evidence for
each explicit skill."""


def skill_intelligence_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    current_job = ExtractedJob.model_validate(state.extracted_job or {})
    skill_model = get_llm(temperature=0).with_structured_output(SkillDecision)
    decision = skill_model.invoke([
        SystemMessage(content=SKILL_INTELLIGENCE_PROMPT),
        HumanMessage(content=json.dumps({
            "current_extraction": current_job.model_dump(mode="json"),
            "evidence": state.evidence,
        }, ensure_ascii=False)),
    ])
    skills = SkillDecision.model_validate(decision)
    explicit = list(dict.fromkeys(
        skill.strip() for skill in skills.explicit_skills if skill and skill.strip()
    ))
    explicit_keys = {skill.casefold() for skill in explicit}
    suggested = list(dict.fromkeys(
        skill.strip()
        for skill in skills.suggested_skills
        if skill and skill.strip() and skill.strip().casefold() not in explicit_keys
    ))
    updated_job = current_job.model_dump(mode="json")
    updated_job["skills"] = explicit
    updated_job["suggested_skills"] = suggested
    logger.info(
        "%s Skill intelligence completed request_id=%s explicit_count=%s "
        "suggested_count=%s explicit=%s suggested=%s",
        LOG_PREFIX,
        state.request_id,
        len(explicit),
        len(suggested),
        explicit[:60],
        suggested[:60],
    )
    logger.info(
        "%s Skill evidence map request_id=%s evidence_notes=%s",
        LOG_PREFIX,
        state.request_id,
        {key: value for key, value in list(skills.evidence_notes.items())[:60]},
    )
    return {
        "extracted_job": updated_job,
        "execution_log": _event(
            state,
            "skill_intelligence",
            explicit_skills_count=len(explicit),
            suggested_skills_count=len(suggested),
        ),
    }


REVIEW_PROMPT = """Act as a strict evidence-grounded reviewer. Compare every extracted field with
all primary and supplementary evidence.

For skills, independently scan responsibilities, requirements, preferred qualifications, examples,
and parenthetical lists. Flag `skills` for repair when any explicitly named language, tool, platform,
framework, statistical/mathematical method, analytical technique, visualization technology,
data/infrastructure capability, domain skill, or required professional competency was omitted.
Also flag `skills` when a parenthetical/example list remains as one long phrase instead of atomic
canonical labels for each named skill.
Flag unsupported explicit skills and any inferred skill incorrectly placed in `skills`.

For company_name, verify that it represents the recognizable employer brand supported by the
page/domain evidence, not a requisition code or blindly copied legal subsidiary suffix. Do not
invent a parent brand when evidence does not support it.

Also flag unsupported claims, missing important fields, wrong section mappings, duplicates,
salary/benefit confusion, and unrelated text. Null optional fields are valid when evidence does not
contain those facts; do not request repair merely because seniority, department, salary, dates, or
benefits are absent. List every genuinely incorrect field in repair_fields. If needs_repair is true,
is_valid must be false."""


def reviewer_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    job = ExtractedJob.model_validate(state.extracted_job or {})
    evidence_text = json.dumps(state.evidence, ensure_ascii=False).casefold()
    field_issues: dict[str, list[str]] = {}

    if not job.job_title:
        field_issues["job_title"] = ["Missing job title."]
    if not job.company_name:
        field_issues["company_name"] = ["Missing company name."]
    if not job.description and not job.responsibilities:
        field_issues["description"] = ["Missing both description and responsibilities."]

    unsupported_skills = [
        skill for skill in job.skills
        if skill.casefold() not in evidence_text
    ]
    if unsupported_skills:
        logger.info(
            "%s Reviewer canonicalized skills not found verbatim request_id=%s "
            "skills=%s action=accepted_for_nonverbatim_review",
            LOG_PREFIX,
            state.request_id,
            unsupported_skills,
        )
    skill_evidence_markers = re.search(
        r"\b(?:skills?|languages?|software|frameworks?|platforms?|models?|"
        r"visualization|pipelines?|sql|python|requirements?|qualifications?)\b",
        evidence_text,
        flags=re.I,
    )
    if skill_evidence_markers and not job.skills:
        field_issues.setdefault("skills", []).append(
            "Evidence contains skill signals but no explicit skills were extracted."
        )
    if len(job.suggested_skills) < 4:
        field_issues.setdefault("suggested_skills", []).append(
            "Provide 4-10 atomic, high-confidence skill recommendations inferred from "
            "the role, responsibilities, outcomes, seniority, and domain. Keep them "
            "separate from explicitly stated skills."
        )

    repair_fields = list(field_issues)
    needs_repair = bool(repair_fields)
    review_issues = [
        issue
        for issues in field_issues.values()
        for issue in issues
    ]
    logger.info(
        "%s Deterministic reviewer completed request_id=%s valid=%s "
        "needs_repair=%s repair_fields=%s extracted_skills_count=%s issues=%s "
        "groq_calls_so_far=1",
        LOG_PREFIX,
        state.request_id,
        not needs_repair,
        needs_repair,
        repair_fields,
        len(job.skills),
        review_issues,
    )
    return {
        "review_issues": review_issues,
        "field_issues": field_issues,
        "repair_fields": repair_fields,
        "needs_repair": needs_repair,
        "is_valid": not needs_repair,
        "validation_errors": review_issues,
        "execution_log": _event(
            state, "reviewer", valid=not needs_repair,
            repair_fields=repair_fields, llm_call=False,
        ),
    }


def repair_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    attempt = state.repair_attempts + 1
    repair_model = get_llm(temperature=0).with_structured_output(ExtractedJob)
    repaired = repair_model.invoke([
        SystemMessage(content=EXTRACTION_PROMPT + "\nRepair only listed fields; preserve all other validated fields exactly."),
        HumanMessage(content=json.dumps({
            "current_job": state.extracted_job, "repair_fields": state.repair_fields,
            "field_issues": state.field_issues, "evidence": state.evidence,
        }, ensure_ascii=False)),
    ])
    job = ExtractedJob.model_validate(repaired).model_dump(mode="json")
    job["skills"] = _atomize_skill_labels(job.get("skills", []))
    explicit_keys = {skill.casefold() for skill in job["skills"]}
    job["suggested_skills"] = [
        skill for skill in _atomize_skill_labels(job.get("suggested_skills", []))
        if skill.casefold() not in explicit_keys
    ]
    logger.info(
        "%s Repair completed request_id=%s attempt=%s fields=%s "
        "skills_before=%s skills_after=%s suggested_skills_after=%s "
        "repaired_skills=%s repaired_suggested_skills=%s",
        LOG_PREFIX,
        state.request_id,
        attempt,
        state.repair_fields,
        len((state.extracted_job or {}).get("skills", [])),
        len(job.get("skills", [])),
        len(job.get("suggested_skills", [])),
        job.get("skills", [])[:50],
        job.get("suggested_skills", [])[:50],
    )
    return {
        "extracted_job": job, "repair_attempts": attempt, "needs_repair": False,
        "execution_log": _event(state, "repair", attempt=attempt, fields=state.repair_fields),
    }


def extraction_manual_review_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    logger.warning("%s Manual review routing request_id=%s issues=%s", LOG_PREFIX, state.request_id, state.review_issues)
    return {
        "needs_manual_review": True, "is_valid": False,
        "execution_log": _event(state, "extraction_manual_review", unresolved_fields=state.repair_fields),
    }


def final_response_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    completed = datetime.now(timezone.utc)
    started = datetime.fromisoformat(state.started_at)
    duration = max(0, round((completed - started).total_seconds() * 1000))
    error = state.error
    if state.blocked_reason:
        error = {"code": "PAGE_BLOCKED", "message": "The page could not be accessed."}
    success = error is None
    extracted = state.extracted_job if state.page_type == "job_detail" else None
    response = {
        "success": success, "request_id": state.request_id,
        "page_type": state.page_type if success else None,
        "classification_confidence": state.classification_confidence,
        "classification_reasons": state.classification_reasons,
        "extracted_job": extracted, "review_issues": state.review_issues,
        "needs_manual_review": state.needs_manual_review,
        "execution_summary": {
            "portal": state.detected_portal, "browser_attempts": state.browser_attempts,
            "repair_attempts": state.repair_attempts, "duration_ms": duration,
        },
    }
    if error:
        response["error"] = error
    # Temporary shape aliases consumed by the existing review/tailoring UI.
    response.update({
        "pageType": response["page_type"], "confidence": response["classification_confidence"],
        "hasValidJobDescription": bool(extracted and state.is_valid and not state.needs_manual_review),
        "job": _compat_job(extracted) if extracted else None,
        "reason": "; ".join(state.classification_reasons),
    })
    logger.info(
        "%s Final response request_id=%s success=%s page_type=%s "
        "skills_count=%s ui_required_skills_count=%s duration_ms=%s",
        LOG_PREFIX,
        state.request_id,
        success,
        response["page_type"],
        len((extracted or {}).get("skills", [])),
        len((response.get("job") or {}).get("required_skills", [])),
        duration,
    )
    return {
        "completed_at": completed.isoformat(), "duration_ms": duration,
        "final_response": response, "execution_log": _event(state, "final_response", success=success),
    }


def _compat_job(job: dict[str, Any]) -> dict[str, Any]:
    salary = job.get("salary")
    if isinstance(salary, dict):
        raw = salary.get("raw")
        if raw:
            salary_display = str(raw)
        else:
            minimum = salary.get("minimum", salary.get("min"))
            maximum = salary.get("maximum", salary.get("max"))
            currency = salary.get("currency") or ""
            period = salary.get("period") or ""
            if minimum is not None and maximum is not None:
                amount = f"{minimum} - {maximum}"
            elif minimum is not None:
                amount = str(minimum)
            elif maximum is not None:
                amount = str(maximum)
            else:
                amount = ""
            salary_display = " ".join(
                part for part in (currency, amount, period) if part
            )
    else:
        salary_display = str(salary or "")

    explicit_skills = list(dict.fromkeys(job.get("skills", []) or []))
    suggested_skills = list(dict.fromkeys(job.get("suggested_skills", []) or []))
    requirements = job.get("requirements", []) or []
    preferred_qualifications = job.get("preferred_qualifications", []) or []
    skills_categories = {}
    if explicit_skills:
        skills_categories["Explicit"] = explicit_skills
    if suggested_skills:
        skills_categories["Suggested"] = suggested_skills

    return {
        **job, "title": job.get("job_title"), "company": job.get("company_name"),
        "salary": salary_display,
        "job_type": job.get("employment_type"),
        "work_mode": job.get("workplace_type"),
        "qualifications": requirements,
        "required_skills": explicit_skills,
        "preferred_skills": suggested_skills,
        "skills_categories": skills_categories,
        "employmentType": job.get("employment_type"), "workplaceType": job.get("workplace_type"),
        "requiredQualifications": requirements,
        "preferredQualifications": preferred_qualifications,
        "requiredSkills": explicit_skills, "preferredSkills": suggested_skills,
        "applicationUrl": job.get("application_url"), "postingDate": job.get("date_posted"),
        "closingDate": job.get("valid_through"),
    }
