"""Focused agents used by the job-intelligence LangGraph."""
from __future__ import annotations

import json
import html as html_lib
import os
import re
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from langchain_core.messages import HumanMessage, SystemMessage
from markdownify import markdownify

from app.ai_service import get_llm
from services.cache.llm_cache import llm_cache
from core.logging import logger
from services.job_extraction.browser_pool import BrowserPoolBusyError, run_on_browser_pool
from services.job_extraction.ssrf_guard import is_request_url_safe
from services.job_extraction.salary_parser import parse_salary_from_text
from services.job_extraction.schemas import (
    ClassificationDecision, EvidenceSource, ExtractedJob, JDState,
    ReviewDecision, SalaryInfo, SkillDecision,
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
    # Added for broader ATS coverage. Selector hints are best-effort (some
    # unverified against live pages) but zero-risk either way: browser_agent
    # only ever does a non-blocking page.locator(selector).count() with
    # these, never a blocking wait_for_selector -- a wrong/stale selector
    # just means `matched` stays None, identical to having no entry at all.
    # The real, load-bearing value of adding a platform here is `_portal()`
    # recognizing its host (used by _fallback_company_name's ATS blocklist
    # below, so a Workday/Ashby/... hostname is never mistaken for a real
    # employer brand name) and future platform-specific handling having a
    # place to attach without another silent gap.
    "ashby": ("ashbyhq.com", ['[class*="job-posting"]', "main"]),
    "icims": ("icims.com", [".iCIMS_JobContent", "#iCIMS_JobContent"]),
    "smartrecruiters": ("smartrecruiters.com", [".job-sections", "#st-jobPosting"]),
    "bamboohr": ("bamboohr.com", [".job-description", "main"]),
    "jobvite": ("jobvite.com", [".jv-job-detail-description", ".jv-page-body"]),
    "workable": ("workable.com", ['[data-ui="job-description"]']),
    "successfactors": ("successfactors.", ["main", "article"]),
    "taleo": ("taleo.net", [".requisitionDescriptionInterface", "main"]),
    "oraclecloud_hcm": ("oraclecloud.com", ["main", '[role="main"]']),
}
# Hostname labels PORTALS is keyed on (the eTLD+1-ish label a URL like
# jobs.ashbyhq.com/greenhouse.io/myworkdayjobs.com resolves to at
# `host.split(".")[-2]`) -- used by _fallback_company_name to recognize an
# ATS's own hosting domain and never return it as a fabricated "company
# name". Single source of truth instead of a second, independently
# maintained blocklist that drifts out of sync with PORTALS (confirmed
# drifted before this fix: myworkdayjobs/ashbyhq/icims/bamboohr/jobvite/
# workable/successfactors/taleo/oraclecloud were all missing).
_ATS_HOST_LABELS = frozenset(
    needle.split(".")[0] for needle, _ in PORTALS.values()
) | {"ziprecruiter", "jobs", "careers", "remote"}
# Query-param names various ATS platforms use to identify one specific job
# (LinkedIn/Indeed's currentJobId/jobId, Greenhouse's gh_jid, Ashby's
# ashby_jid, Workday's requisitionId, etc). This used to be duplicated
# inline in three separate places (discovery_agent's job_in_query,
# _explicit_job_id, and frontend/src/context/AppContext.jsx's
# getJobIdentityFromUrl) that drifted out of sync -- confirmed for real
# when ashby_jid was added to two of the three but missed in the third.
# Single source of truth backend-side; the frontend copy still needs its
# own list (can't share a Python constant across languages) but should be
# kept in sync with this one when either changes.
JOB_ID_QUERY_PARAMS = (
    "currentJobId", "jobId", "job_id", "jobid", "jk", "gh_jid", "ashby_jid",
    "requisitionId", "requisition_id", "postingId",
)
BLOCK_SIGNALS = (
    "access denied", "verify you are human", "captcha", "security check",
    "sign in to continue", "temporarily unavailable", "too many requests",
    "checking your browser", "enable javascript and cookies",
)
GENERIC_JOB_TITLE = re.compile(
    r"^(?:jobs?|careers?|job search|search jobs|opportunities|open positions|"
    r"single position|job details?|join us|home)$",
    re.I,
)
RECOMMENDATION_SECTION = re.compile(
    r"(?:^|\n)\s*(?:similar jobs?|related jobs?|recommended jobs?|"
    r"jobs you may be interested in|other opportunities|"
    r"you might also like|you may also like|more jobs (?:at|like this))\s*(?:\n|$)",
    re.I,
)
# Confirmed on a real LinkedIn posting: a "Compensation & Perks" list ran
# straight into LinkedIn's own Premium-subscription upsell module ("Job
# search faster with Premium", "millions of other members use Premium",
# "Try Premium for", "1-month free trial...") with no heading in between,
# so it kept getting swept in as if it were more real perks. This platform
# chrome is never job-description content on ANY job board it appears on,
# so it's always safe to treat as a hard section boundary, same as
# RECOMMENDATION_SECTION above.
PLATFORM_UPSELL_BOILERPLATE = re.compile(
    r"(?:premium membership|try premium|\bpremium\b.{0,20}\bfree\b|"
    r"free trial|easy to cancel|millions of other members|"
    r"job search faster|unlock (?:premium|insights)|upgrade to premium|"
    r"see who('s| is) hiring|company insights like|headcount trends|"
    # Confirmed real-world case: a LinkedIn job panel's "See the full list
    # of jobs where you'd be a top applicant" Premium promo line, sitting
    # ABOVE the real job title in DOM order, was longer than the actual
    # title and won _infer_rendered_job_title's longest-candidate pick.
    r"see the full list of jobs|top applicant|see how you (?:compare|rank)|"
    r"how you match|salary insights|see similar (?:jobs|companies))",
    re.I,
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


def _infer_rendered_job_title(evidence: dict[str, Any]) -> str:
    hint = str(evidence.get("job_title_hint") or "").strip()
    if hint and not GENERIC_JOB_TITLE.fullmatch(hint):
        return hint

    panel = str(evidence.get("selected_panel_text") or evidence.get("visible_text") or "")
    lines = [re.sub(r"\s+", " ", line).strip() for line in panel.splitlines()]
    lines = [line for line in lines if line]
    apply_index = next(
        (index for index, line in enumerate(lines) if re.fullmatch(r"apply(?: now)?", line, re.I)),
        -1,
    )
    candidates = lines[max(0, apply_index - 12):apply_index] if apply_index > 0 else lines[:30]
    noise = re.compile(
        r"^(?:upload your resume.*|view all jobs?|join talent network|sign in|"
        r"find out how well you match.*|job description|company)$",
        re.I,
    )
    candidates = [
        line for line in candidates
        if 4 <= len(line) <= 180
        and not noise.fullmatch(line)
        and not GENERIC_JOB_TITLE.fullmatch(line)
        # Confirmed real-world case: a LinkedIn Premium promo line ("See the
        # full list of jobs where you'd be a top applicant") sitting above
        # the real title in DOM order was longer than it and won the
        # longest-candidate pick below, since `noise` only rejected EXACT
        # whole-line matches against a short fixed list and never saw this
        # phrasing. PLATFORM_UPSELL_BOILERPLATE is a substring search, so it
        # catches promo text embedded in a longer captured line too.
        and not PLATFORM_UPSELL_BOILERPLATE.search(line)
        and not re.match(r"^(?:remote|hybrid|on.site)(?:\b|\s*-)", line, re.I)
    ]
    return max(candidates, key=len, default="")


def _focused_extension_panel(evidence: dict[str, Any]) -> str:
    title = _infer_rendered_job_title(evidence)

    def focus(value: Any) -> str:
        text = str(value or "").strip()
        if title:
            index = text.casefold().find(title.casefold())
            if index >= 0:
                text = text[index:]
        boundaries = [
            match.start()
            for match in (RECOMMENDATION_SECTION.search(text), PLATFORM_UPSELL_BOILERPLATE.search(text))
            if match and match.start() > 0
        ]
        if boundaries:
            text = text[:min(boundaries)]
        return text.strip()

    # A generic SPA container can win the frontend candidate ranking while
    # containing only the role's top card (the production LinkedIn regression
    # was 137 chars). Do not let that tiny panel discard the much richer text
    # captured from the same rendered tab. Focus both candidates on the active
    # title and choose the one with the strongest job-section evidence.
    panel = focus(evidence.get("selected_panel_text"))
    visible = focus(evidence.get("visible_text"))

    def quality(text: str, *, selected: bool) -> tuple[int, int, int]:
        section_hits = sum(
            marker in text.casefold()
            for marker in (
                "job description", "responsibilities", "requirements",
                "minimum qualifications", "preferred qualifications",
                "about the role", "what you'll do", "what you will do",
            )
        )
        return (section_hits, int(selected and len(text) >= 250), min(len(text), 60000))

    if visible and quality(visible, selected=False) > quality(panel, selected=True):
        return visible
    return panel or visible


def _extension_rendered_html(evidence: dict[str, Any]) -> str:
    """Prefer the focused panel while retaining extension-visible JSON-LD."""
    panel = _focused_extension_panel(evidence)
    visible = str(evidence.get("visible_text") or "").strip()
    if panel or visible:
        title_hint = html_lib.escape(_infer_rendered_job_title(evidence))
        company_hint = html_lib.escape(str(evidence.get("company_hint") or "").strip())
        location_hint = html_lib.escape(str(evidence.get("location_hint") or "").strip())
        if not company_hint:
            page_title = str(evidence.get("title") or "").strip()
            if page_title:
                parts = [p.strip() for p in re.split(r"\s+[|\-–—]\s+|\s+at\s+", page_title, flags=re.I) if p.strip()]
                company_candidates = [
                    p for p in parts[1:]
                    if p.lower() not in {"linkedin", "indeed", "glassdoor", "ziprecruiter", "jobs", "careers", "remote"}
                ]
                if company_candidates:
                    company_hint = html_lib.escape(company_candidates[0])
        scripts = ""
        for item in (evidence.get("jsonld") or [])[:20]:
            if isinstance(item, (dict, list)):
                payload = json.dumps(item, ensure_ascii=False).replace("</", "<\\/")
                scripts += f'<script type="application/ld+json">{payload}</script>'
        return (
            f"<html><head>{scripts}</head><body><main>"
            f"<h1>{title_hint}</h1>"
            f"<div data-field='employer'>{company_hint}</div>"
            f"<div data-field='location'>{location_hint}</div>"
            f"<section data-field='job-description'>{html_lib.escape(panel or visible)}</section>"
            f"</main></body></html>"
        )
    return str(evidence.get("html") or "")


def discovery_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    parsed = urlparse(state.url)
    portal = _portal(state.url)
    # Detect job identity in URL path OR query string (e.g. LinkedIn search results with currentJobId)
    query_params = dict(re.findall(r"([^=&?]+)=([^&]+)", parsed.query))
    job_in_query = any(query_params.get(k) for k in JOB_ID_QUERY_PARAMS)
    has_job_path_in_url = bool(
        # Requires a segment AFTER the keyword (e.g. /careers/software-
        # engineer-123, /jobs/12345) -- a bare /careers or /jobs (the
        # listing root / company careers homepage itself, no specific
        # posting) previously matched too, since the old regex had no
        # trailing-segment requirement. That fed has_job_identity below,
        # letting a careers homepage's own marketing copy ("Apply now
        # for full-time and remote roles... About us: we build...")
        # satisfy a job_detail branch purely because its URL contained
        # "/careers", with no specific job title anywhere on the page.
        re.search(r"/(?:job|jobs|career|careers|position|opening|viewjob)/[^/?#]+", parsed.path, re.I)
    )
    discovery = {
        "scheme": parsed.scheme, "host": parsed.hostname, "path": parsed.path,
        "has_job_path": has_job_path_in_url or job_in_query,
        "likely_spa": portal in {"linkedin", "workday", "indeed", "glassdoor"},
        "language_hint": None,
    }
    logger.info("%s Discovery completed request_id=%s portal=%s job_in_query=%s", LOG_PREFIX, state.request_id, portal, job_in_query)
    return {
        "detected_portal": portal,
        "discovery": discovery,
        # Browser acquisition is a recovery path, not the extension's normal
        # path. Bound it tightly so an inaccessible portal cannot dominate
        # request latency for 30-45 seconds. The networkidle budget is the
        # one exception: a URL that itself identifies one specific job
        # (path-based, e.g. /job/210747568, or query-param-based, e.g.
        # ?ashby_jid=...) is strong, specific evidence that this exact page
        # still needs to render widget/AJAX-driven content via client-side
        # JS after domcontentloaded fires -- confirmed directly against two
        # real postings: langchain.com/careers?ashby_jid=... (query-param
        # case) and an Oracle Cloud HCM /job/<id> posting (path case) both
        # needed several extra seconds of real idle time before their
        # actual job content (title, location, description) rendered, even
        # though a generic "main" selector matched the surrounding shell
        # instantly in both cases. A longer, real networkidle wait
        # (meaningful here since it's driven by the page's own finite
        # fetch, not generic page chrome) only applies to these
        # specifically-identified pages -- every other page keeps the
        # short, generic-marketing-copy-safe 500ms budget unchanged.
        "browser_strategy": {
            "wait_until": "domcontentloaded",
            # Confirmed live (2026-08-08) against disneycareers.com and a
            # JPMC Oracle Cloud HCM posting: BOTH failed at this very first
            # page.goto() with "Timeout 5000ms exceeded" before any content
            # was ever fetched -- 5s is not a realistic navigation budget for
            # real enterprise career sites (CDN/bot-check redirects, heavy
            # corporate JS bundles, Oracle Cloud's own slow cold starts).
            # _scrape_job_page's own _SCRAPE_OVERALL_BUDGET_SECONDS=22s
            # shared deadline (see there) already caps every stage's actual
            # wait via _remaining_ms(), so raising this ceiling doesn't
            # reopen the run_on_browser_pool 30s-timeout incident that
            # budget was built to prevent -- it just stops an artificially
            # tight sub-ceiling from cutting navigation short while 15+
            # unused seconds of that budget sit idle.
            "timeout_ms": 15000,
            "networkidle_wait_ms": 4000 if (has_job_path_in_url or job_in_query) else 500,
        },
        "execution_log": _event(state, "discovery", portal=portal),
    }


_ATS_IFRAME_HOST_NEEDLES = tuple(needle for needle, _ in PORTALS.values())


def _find_ats_iframe_url(page, top_host: str) -> str | None:
    """Some ATS platforms (Ashby chief among them) are embedded via a
    cross-origin <iframe> on the company's OWN careers page rather than
    hosted directly -- confirmed real-world case: langchain.com/careers
    embeds jobs.ashbyhq.com/... in an iframe. page.content() never
    captures iframe content at all (it's a wholly separate document), so
    no amount of waiting on the parent page recovers it -- the fix is to
    re-navigate straight to the ATS's own iframe URL, which then gets all
    of PORTALS' existing ATS-specific handling for free."""
    for frame in page.frames:
        frame_url = frame.url
        if not frame_url:
            continue
        host = (urlparse(frame_url).hostname or "").lower()
        if host and host != top_host and any(needle in host for needle in _ATS_IFRAME_HOST_NEEDLES):
            return frame_url
    return None


# A production incident (real TimeoutError from run_on_browser_pool) traced
# to this: the selector-wait, networkidle-wait, and iframe-redirect budgets
# added below were each given their OWN independent ceiling with no shared
# accounting, so worst case (goto 5s + selector wait 6s + networkidle 4s,
# THEN the same three again for an iframe redirect) summed to exactly 30s --
# browser_pool's own _POOL_CALL_TIMEOUT_SECONDS, with zero margin for actual
# network latency or Playwright IPC/render overhead. Hitting that ceiling is
# far worse than a single slow request: run_on_browser_pool's timeout
# handler abandons and replaces the ENTIRE shared browser pool, so one slow
# page degrades every concurrent user, not just this request. Every wait
# below now draws from one shared deadline comfortably under that ceiling.
_SCRAPE_OVERALL_BUDGET_SECONDS = 22.0


def _scrape_job_page(
    context, fetch_url: str, wait_until: str, timeout_ms: int, selectors: list[str],
    networkidle_wait_ms: int = 500,
):
    """Runs on the dedicated browser-pool thread (see browser_pool.py) against
    the shared, persistent BrowserContext -- gets its own fresh Page, closes
    it when done, but never closes the context/browser themselves so the next
    call can reuse them without paying a fresh Chromium launch."""
    errors: list[str] = []
    page = context.new_page()
    try:
        page.on("pageerror", lambda error: errors.append(str(error)[:300]))
        # Re-validates the host of EVERY request this page makes -- not just
        # the URL passed to page.goto() below -- so a redirect chain or a
        # JS-initiated fetch/XHR from within the rendered page can't reach a
        # private/internal address that only becomes known after navigation
        # starts. See ssrf_guard.py for why one upfront check isn't enough.
        def _guard_request(route):
            try:
                safe = is_request_url_safe(route.request.url)
            except Exception:
                safe = False
            if safe:
                route.continue_()
            else:
                route.abort()
        page.route("**/*", _guard_request)

        overall_deadline = time.monotonic() + _SCRAPE_OVERALL_BUDGET_SECONDS

        def _remaining_ms(floor: float = 0.0) -> float:
            return max(floor, (overall_deadline - time.monotonic()) * 1000)

        page.goto(fetch_url, wait_until=wait_until, timeout=min(timeout_ms, _remaining_ms(500)))
        # domcontentloaded above only guarantees the initial HTML shell --
        # confirmed directly against real postings (Oracle Cloud HCM,
        # Ashby-embedded career pages): the actual job content on many
        # modern ATS platforms renders client-side AFTER that point, so
        # capturing content immediately just got an empty/generic shell,
        # with none of the portal's own selectors ever matching. Actively
        # waiting for one of them exits the INSTANT real content appears --
        # a page that's already fully rendered pays nothing extra for this
        # -- so it only helps genuinely slow pages instead of taxing fast
        # ones with a fixed delay.
        matched = None
        for selector in selectors:
            remaining_ms = _remaining_ms()
            if remaining_ms <= 0:
                break
            try:
                page.wait_for_selector(selector, timeout=min(remaining_ms, 6000), state="attached")
                matched = selector
                break
            except Exception:
                continue
        try:
            # Best-effort only: JS-heavy SPAs (LinkedIn, Workday) rarely go
            # fully idle (analytics/chat beacons keep polling), so this
            # routinely burns its entire timeout for no extra content on
            # most pages. networkidle_wait_ms is only raised above the
            # default 500ms for URLs discovery_agent already identified as
            # carrying a specific job's query-param identity (see there for
            # why that's a meaningfully different, more patient case).
            page.wait_for_load_state("networkidle", timeout=min(networkidle_wait_ms, _remaining_ms()))
        except Exception:
            pass
        if matched is None:
            matched = next((selector for selector in selectors if page.locator(selector).count()), None)
        # Checked regardless of whether `matched` already found something on
        # the top-level page: a generic selector like "main" can match the
        # wrapping marketing page's own static shell even when the actual
        # job content lives entirely inside a cross-origin ATS iframe (the
        # LangChain/Ashby case) -- an ATS-hosted iframe is always a
        # strictly more specific, more reliable source than that shell.
        # Only attempted with meaningful budget left; otherwise this would
        # just be a doomed navigation eating into an already-tight deadline.
        iframe_url = _find_ats_iframe_url(page, (urlparse(page.url).hostname or "").lower())
        if iframe_url and _remaining_ms() > 1500:
            iframe_portal = _portal(iframe_url)
            iframe_selectors = PORTALS.get(iframe_portal, ("", selectors))[1]
            try:
                page.goto(iframe_url, wait_until=wait_until, timeout=min(timeout_ms, _remaining_ms(500)))
                iframe_matched = None
                for selector in iframe_selectors:
                    remaining_ms = _remaining_ms()
                    if remaining_ms <= 0:
                        break
                    try:
                        page.wait_for_selector(selector, timeout=min(remaining_ms, 6000), state="attached")
                        iframe_matched = selector
                        break
                    except Exception:
                        continue
                try:
                    page.wait_for_load_state(
                        "networkidle",
                        timeout=min(max(networkidle_wait_ms, 2000), _remaining_ms()),
                    )
                except Exception:
                    pass
                if iframe_matched is None:
                    iframe_matched = next((s for s in iframe_selectors if page.locator(s).count()), None)
                html = page.content()
                final_url = page.url
                title = page.title()
                matched = iframe_matched
            except Exception:
                # The iframe redirect is a best-effort upgrade; any failure
                # (navigation timeout, blocked by SSRF guard, etc.) falls
                # back to whatever the top-level page already captured.
                html = page.content()
                final_url = page.url
                title = page.title()
        else:
            html = page.content()
            final_url = page.url
            title = page.title()
        return html, final_url, title, matched, errors
    finally:
        page.close()


def browser_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    attempt = state.browser_attempts + 1

    # Rewrite LinkedIn /jobs/search-results/?currentJobId=XXX → /jobs/view/XXX/
    # The search-results page requires login in the backend but the canonical
    # job-view URL is publicly accessible for many postings.
    fetch_url = state.url
    parsed_url = urlparse(fetch_url)
    if "linkedin.com" in (parsed_url.hostname or "") and "/jobs/search-results" in parsed_url.path:
        query_params = dict(re.findall(r"([^=&?]+)=([^&]+)", parsed_url.query))
        job_id = query_params.get("currentJobId") or query_params.get("jobId")
        if job_id:
            fetch_url = f"https://www.linkedin.com/jobs/view/{job_id}/"
            logger.info(
                "%s LinkedIn search-results URL rewritten to canonical request_id=%s original=%s canonical=%s",
                LOG_PREFIX, state.request_id, state.url, fetch_url,
            )

    # This upper clamp used to equal discovery_agent's own default (5000),
    # making it a silent no-op that quietly re-imposed a 5s navigation
    # ceiling no matter what discovery_agent asked for. The real safety
    # ceiling is _scrape_job_page's own 22s shared deadline (_remaining_ms);
    # this is just a sanity bound on a single request, raised to actually
    # sit above discovery_agent's real budget.
    base_timeout_ms = state.browser_strategy.get("timeout_ms", 15000)
    timeout_ms = min(base_timeout_ms, 18000)

    logger.info(
        "%s Browser launch request_id=%s attempt=%s timeout_ms=%s",
        LOG_PREFIX, state.request_id, attempt, timeout_ms,
    )
    started = time.perf_counter()
    try:
        selectors = PORTALS.get(state.detected_portal, ("", ["main", "article"]))[1]
        html, final_url, title, matched, errors = run_on_browser_pool(
            _scrape_job_page,
            fetch_url,
            state.browser_strategy.get("wait_until", "domcontentloaded"),
            timeout_ms,
            selectors,
            state.browser_strategy.get("networkidle_wait_ms", 500),
        )
    except BrowserPoolBusyError as exc:
        # This recovery source is deliberately non-queueing. The extension's
        # rendered DOM remains available to evidence evaluation, so pool
        # contention is an acquisition miss rather than an application error.
        logger.warning(
            "%s Recovery browser busy request_id=%s attempt=%s",
            LOG_PREFIX, state.request_id, attempt,
        )
        return {
            "browser_attempts": attempt,
            "backend_raw_html": "",
            "backend_final_url": None,
            "backend_page_title": None,
            "raw_html": "",
            "final_url": None,
            "page_title": None,
            "error": {"code": "BROWSER_BUSY", "message": str(exc)},
            "metadata": {"browser_errors": [str(exc)]},
            "execution_log": _event(state, "browser", attempt=attempt, error="BrowserPoolBusyError"),
        }
    except Exception as exc:
        logger.exception("%s Browser failed request_id=%s attempt=%s", LOG_PREFIX, state.request_id, attempt)
        return {
            "browser_attempts": attempt,
            "backend_raw_html": "",
            "backend_final_url": None,
            "backend_page_title": None,
            "raw_html": "",
            "final_url": None,
            "page_title": None,
            "error": {"code": "BROWSER_FAILED", "message": str(exc)[:500]},
            "metadata": {"browser_errors": [str(exc)[:300]]},
            "execution_log": _event(state, "browser", attempt=attempt, error=type(exc).__name__),
        }
    duration = round((time.perf_counter() - started) * 1000)
    logger.info(
        "%s Browser completed request_id=%s final_url=%s html_length=%s duration_ms=%s selector=%s",
        LOG_PREFIX, state.request_id, final_url, len(html), duration, matched,
    )
    return {
        "browser_attempts": attempt, "raw_html": html, "final_url": final_url,
        "backend_raw_html": html,
        "backend_final_url": final_url,
        "backend_page_title": title,
        "page_title": title, "blocked_reason": None, "error": None,
        "metadata": {"browser_errors": errors, "matched_selector": matched, "load_duration_ms": duration},
        "execution_log": _event(
            state, "browser", attempt=attempt, html_length=len(html),
            matched_selector=matched, acquisition_only=True,
        ),
    }


RESTRICTION_PATTERNS = (
    ("captcha", .99, ("captcha", "verify you are human", "i'm not a robot", "recaptcha")),
    ("cloudflare", .98, ("cloudflare ray id", "attention required! | cloudflare")),
    ("security_challenge", .96, ("checking your browser", "security check", "challenge-platform")),
    ("access_denied", .96, ("access denied", "request blocked", "not authorized", "forbidden")),
    ("rate_limited", .95, ("too many requests", "rate limit exceeded", "temporarily rate limited")),
    ("session_expired", .93, ("session expired", "your session has expired")),
    # "employee login" was deliberately removed: confirmed directly against a
    # real, fully public posting (github.careers) that a site-wide header nav
    # link ("Employee Login for US Jobs", pointing to a SEPARATE internal
    # iCIMS instance for employee-only postings) false-positived this on
    # every single page of that career site, regardless of whether the
    # specific posting being scraped was actually restricted. "employees
    # only" / "internal candidates only" describe THIS posting's own
    # eligibility and don't share that false-positive risk.
    ("employee_only", .92, ("employees only", "internal candidates only")),
    ("geo_restricted", .9, ("not available in your region", "not available in your country")),
    ("cookie_wall", .86, ("accept cookies to continue", "cookie consent required")),
    ("consent_wall", .84, ("consent required", "please provide consent")),
    ("login_required", .9, ("sign in to continue", "log in to continue", "login required")),
)


def _content_text(content: Any) -> str:
    if isinstance(content, str):
        if "<" in content and ">" in content:
            return BeautifulSoup(content, "lxml").get_text(" ", strip=True)
        return content
    return json.dumps(content, ensure_ascii=False, default=str)


def _restriction_for_source(
    content: Any, *, final_url: str = "", source_url: str = "", failed: bool = False,
    extension_source: bool = False,
) -> tuple[str | None, float, list[str]]:
    """Detect access restrictions in scraped content.

    For extension-sourced evidence the user is already logged in, so:
    - URL redirect detection is skipped (final_url == source_url by design).
    - Text scan uses only the first 6 000 chars to avoid false positives from
      LinkedIn / Indeed navigation noise (e.g. "not authorized" in nav links).
    - Only the highest-confidence patterns (captcha, cloudflare, security
      challenge, rate-limit) are applied; softer signals like "access denied"
      and "not authorized" that routinely appear in SPA navigation are ignored.
    """
    if failed:
        return "network_failure", .9, ["browser acquisition failed"]

    signals: list[str] = []
    restriction = None
    confidence = 0.0

    if extension_source:
        # Extension evidence: user is logged in. Only scan selected/focused text
        # (first 6 000 chars) for the most definitive restriction signals.
        # Full-page visible_text and full DOM clones are intentionally NOT scanned
        # because they routinely contain "not authorized", "sign in", "access denied"
        # in LinkedIn / Indeed navigation elements even when the user IS authenticated.
        EXTENSION_RESTRICTION_PATTERNS = (
            ("captcha", .99, ("captcha", "verify you are human", "i'm not a robot", "recaptcha")),
            ("cloudflare", .98, ("cloudflare ray id",)),
            ("security_challenge", .96, ("checking your browser", "challenge-platform")),
            ("rate_limited", .95, ("too many requests", "rate limit exceeded")),
            ("login_required", .90, ("sign in to view this job", "log in to view this job",
                                     "please sign in", "create a free account to apply")),
        )
        text = _content_text(content).casefold()[:6000]
        for kind, score, patterns in EXTENSION_RESTRICTION_PATTERNS:
            matched = [p for p in patterns if p in text]
            if matched and score > confidence:
                restriction, confidence = kind, score
                signals = matched[:4]
        return restriction, confidence, signals

    # Backend sources: full strict scan
    text = _content_text(content).casefold()[:30000]
    final_path = (urlparse(final_url).path or "").casefold()
    source_path = (urlparse(source_url).path or "").casefold()
    auth_path = r"/(?:login|signin|sign-in|auth|checkpoint)(?:/|$)"
    if re.search(auth_path, final_path) and not re.search(auth_path, source_path):
        restriction, confidence = "login_required", .98
        signals.append("authentication redirect")
    challenge_path = r"/(?:challenge|captcha|security-check)(?:/|$)"
    if re.search(challenge_path, final_path) and not re.search(challenge_path, source_path):
        restriction, confidence = "security_challenge", .97
        signals.append("security challenge redirect")
    for kind, score, patterns in RESTRICTION_PATTERNS:
        matched = [pattern for pattern in patterns if pattern in text]
        if matched and score > confidence:
            restriction, confidence = kind, score
            signals = matched[:4]
    if isinstance(content, str) and "<" in content and ">" in content:
        soup = BeautifulSoup(content, "lxml")
        visible = soup.get_text(" ", strip=True)
        password_input = soup.find("input", attrs={"type": re.compile("^password$", re.I)})
        if password_input and confidence < .92:
            restriction, confidence = "login_required", .92
            signals = ["password form"]
        script_count = len(soup.find_all("script"))
        if not restriction and len(visible) < 30 and script_count >= 2:
            restriction, confidence = "javascript_shell", .78
            signals = ["script-only application shell", f"visible_text_length={len(visible)}"]
        elif not restriction and not visible and len(content) > 100:
            restriction, confidence = "empty_shell", .8
            signals = ["empty rendered body"]
    return restriction, confidence, signals


def _job_signal_score(content: Any, *, selected: bool = False, structured: bool = False) -> float:
    if structured:
        raw = json.dumps(content, ensure_ascii=False, default=str).casefold()
        return 1.0 if "jobposting" in raw else 0.15
    text = _content_text(content).casefold()[:40000]
    sections = sum(
        marker in text for marker in (
            "job description", "responsibilities", "requirements",
            "minimum qualifications", "preferred qualifications",
            "what you'll do", "what you will do", "what to expect", "about the role",
        )
    )
    apply = bool(re.search(r"\b(?:apply now|easy apply|apply for this job|submit application)\b", text))
    employment = bool(re.search(
        r"\b(?:full[ -]?time|part[ -]?time|contract|internship|remote|hybrid|on[ -]?site)\b",
        text,
    ))
    score = min(1.0, sections * .16 + apply * .2 + employment * .1 + selected * .2)
    return round(score, 3)


def _make_evidence_source(
    source_type: str,
    content: Any,
    *,
    selected: bool = False,
    structured: bool = False,
    final_url: str = "",
    source_url: str = "",
    failed: bool = False,
    freshness: float = 1.0,
    metadata: dict[str, Any] | None = None,
    extension_source: bool = False,
) -> EvidenceSource:
    length = len(_content_text(content))
    restriction, restriction_confidence, restriction_signals = _restriction_for_source(
        content, final_url=final_url, source_url=source_url, failed=failed,
        extension_source=extension_source,
    )
    available = content not in (None, "", [], {}) or failed
    job_score = _job_signal_score(content, selected=selected, structured=structured)
    min_length = 40 if structured else 150
    usable = bool(available and not restriction and length >= min_length)
    quality = min(1.0, length / (1800 if selected else 4500)) if available else 0
    if structured and job_score >= .9:
        quality = max(quality, .95)
        usable = not restriction
    specificity = .98 if selected else (.94 if structured and job_score >= .9 else min(.8, job_score + .15))
    status = (
        "failed" if failed else
        "restricted" if restriction else
        "empty" if not available or length == 0 else
        "usable" if usable else
        "partial"
    )
    return EvidenceSource(
        source_type=source_type,
        access_status=status,
        available=available,
        usable=usable,
        restricted=bool(restriction),
        restriction_type=restriction,
        restriction_confidence=restriction_confidence,
        restriction_signals=restriction_signals,
        content_length=length,
        job_signal_score=job_score,
        quality_score=round(quality, 3),
        freshness_score=freshness,
        specificity_score=round(specificity, 3),
        selected_job_signal=selected,
        contains_security_challenge=restriction in {"captcha", "cloudflare", "security_challenge"},
        contains_login_wall=restriction in {"login_required", "session_expired", "employee_only"},
        content=content,
        warnings=["Excluded from classification and extraction"] if restriction else [],
        metadata=metadata or {},
    )


def _source_rank(source: EvidenceSource) -> float:
    if not source.usable or source.restricted:
        return -1
    agreement_bonus = float(source.metadata.get("agreement_bonus", 0))
    return round(
        source.job_signal_score * .34
        + source.quality_score * .27
        + source.specificity_score * .25
        + source.freshness_score * .14
        + (.25 if source.selected_job_signal else 0)
        + agreement_bonus,
        4,
    )


def _explicit_job_id(url: str) -> str | None:
    try:
        parsed = urlparse(url)
        for key in JOB_ID_QUERY_PARAMS:
            values = dict(re.findall(r"([^=&?]+)=([^&]+)", parsed.query))
            if values.get(key):
                return values[key]
        match = re.search(r"/(?:jobs?|positions?|openings?)/(?:view/)?(\d{4,})", parsed.path, re.I)
        return match.group(1) if match else None
    except Exception:
        return None


def evidence_evaluation_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    """Evaluate, sanitize, rank, and select evidence without portal branching."""
    state = _state(value)
    extension = state.extension_evidence
    backend_html = state.backend_raw_html
    backend_failed = bool(
        (state.error and state.error.get("code") == "BROWSER_FAILED")
        or (not backend_html and state.metadata.get("browser_errors"))
    )
    soup = BeautifulSoup(backend_html, "lxml") if backend_html else BeautifulSoup("", "lxml")
    backend_jsonld: list[Any] = []
    for script in soup.find_all("script", attrs={"type": re.compile("ld\\+json", re.I)}):
        try:
            backend_jsonld.append(json.loads(script.string or script.get_text()))
        except (json.JSONDecodeError, TypeError):
            pass
    backend_metadata = {
        "title": state.backend_page_title,
        "final_url": state.backend_final_url,
        "description": (soup.find("meta", attrs={"name": "description"}) or {}).get("content"),
    }
    extension_panel_text = _focused_extension_panel(extension)
    extension_title = _infer_rendered_job_title(extension).casefold().strip()
    normalized_extension_title = re.sub(r"[^a-z0-9]+", " ", extension_title).strip()
    extension_jsonld = extension.get("jsonld") or []
    extension_job_titles: list[str] = []
    for item in extension_jsonld:
        candidates: list[dict[str, Any]] = []
        _walk_jsonld(item, candidates, candidates)
        extension_job_titles.extend(
            str(candidate.get("title") or "").strip()
            for candidate in candidates
            if candidate.get("title")
        )
    extension_jsonld_matches_visible = any(
        candidate_normalized
        and normalized_extension_title
        and (
            candidate_normalized in normalized_extension_title
            or normalized_extension_title in candidate_normalized
        )
        for candidate_normalized in (
            re.sub(r"[^a-z0-9]+", " ", title.casefold()).strip()
            for title in extension_job_titles
        )
    )
    stale_extension_jsonld = bool(
        extension_job_titles
        and normalized_extension_title
        and not extension_jsonld_matches_visible
    )
    trusted_extension_jsonld = [] if stale_extension_jsonld else extension_jsonld
    extension_panel_selected = bool(
        extension_panel_text
        and (
            (extension.get("capture") or {}).get("portal_optimized_panel")
            or _job_signal_score(extension_panel_text) >= .35
        )
    )
    sources = [
        _make_evidence_source(
            "extension_selected_panel", extension_panel_text,
            selected=extension_panel_selected,
            final_url=extension.get("url", ""), source_url=state.url,
            extension_source=True,
            metadata={
                "captured_at": (extension.get("capture") or {}).get("captured_at"),
                "selector": extension.get("selected_panel_selector"),
            },
        ),
        _make_evidence_source(
            "extension_jsonld", trusted_extension_jsonld,
            structured=True, final_url=extension.get("url", ""), source_url=state.url,
            extension_source=True,
        ),
        _make_evidence_source(
            "extension_dom", extension.get("html"),
            final_url=extension.get("url", ""), source_url=state.url,
            extension_source=True,
        ),
        _make_evidence_source(
            "extension_visible_text", extension.get("visible_text"),
            final_url=extension.get("url", ""), source_url=state.url,
            extension_source=True,
        ),
        _make_evidence_source(
            "backend_jsonld", backend_jsonld, structured=True,
            final_url=state.backend_final_url or "", source_url=state.url,
        ),
        _make_evidence_source(
            "backend_playwright", backend_html,
            final_url=state.backend_final_url or "", source_url=state.url,
            failed=backend_failed,
            metadata={"final_url": state.backend_final_url, "title": state.backend_page_title},
        ),
        _make_evidence_source(
            "backend_metadata", backend_metadata if any(backend_metadata.values()) else {},
            final_url=state.backend_final_url or "", source_url=state.url,
        ),
        _make_evidence_source("cleaned_html", None),
        _make_evidence_source("markdown", None),
        _make_evidence_source("manual_input", None),
    ]
    rankings = {source.source_type: _source_rank(source) for source in sources}
    usable = [source for source in sources if rankings[source.source_type] >= 0]
    usable.sort(key=lambda source: rankings[source.source_type], reverse=True)
    primary = usable[0] if usable else None
    supplementary = [
        source.source_type for source in usable[1:4]
        if source.job_signal_score >= .25
    ]
    excluded = [
        source.source_type for source in sources
        if source.restricted or source.access_status in {"failed", "empty", "malformed", "stale"}
    ]
    if stale_extension_jsonld:
        excluded.append("extension_jsonld")
    restrictions = {
        source.source_type: {
            "restriction_type": source.restriction_type,
            "confidence": source.restriction_confidence,
            "signals": source.restriction_signals,
        }
        for source in sources if source.restricted or source.access_status == "failed"
    }
    conflicts: list[str] = []
    backend_title = ""
    for item in backend_jsonld:
        candidates: list[dict[str, Any]] = []
        _walk_jsonld(item, candidates, candidates)
        backend_title = next(
            (str(candidate.get("title") or "").casefold().strip() for candidate in candidates if candidate.get("title")),
            backend_title,
        )
    if extension_title and backend_title and extension_title not in backend_title and backend_title not in extension_title:
        conflicts.append("Extension selected-job title conflicts with backend structured title.")
    extension_job_id = _explicit_job_id(str(extension.get("selected_job_url") or extension.get("url") or ""))
    backend_job_id = _explicit_job_id(str(state.backend_final_url or ""))
    if extension_job_id and backend_job_id and extension_job_id != backend_job_id:
        conflicts.append("Extension and backend evidence refer to different explicit job IDs.")
    if primary:
        if primary.source_type.startswith("extension"):
            page_access = "extension_accessible" if restrictions else "fully_accessible"
        elif primary.source_type.startswith("backend"):
            page_access = "backend_accessible"
        else:
            page_access = "evidence_available"
        selected_job = primary.selected_job_signal or primary.job_signal_score >= .55
        readiness = "READY" if selected_job else "PARTIAL"
    else:
        page_access = "fully_blocked" if restrictions else "insufficient_evidence"
        selected_job = False
        readiness = "BLOCKED" if restrictions else "NOT_READY"
    warnings = list(conflicts)
    if stale_extension_jsonld:
        warnings.append(
            "Stale JobPosting JSON-LD was ignored in favor of the current rendered job panel."
        )
    if conflicts and primary and not primary.selected_job_signal:
        readiness = "MANUAL_REVIEW"
        warnings.append("Conflicting job identity could not be resolved safely.")

    # Planner invariant repair: restricted/empty evidence can never be primary.
    if primary and (primary.restricted or not primary.usable):
        warnings.append(f"Invalid primary source {primary.source_type} was automatically removed.")
        excluded.append(primary.source_type)
        primary = next((candidate for candidate in usable if candidate.usable and not candidate.restricted), None)
    if readiness == "READY" and not primary:
        warnings.append("READY without usable evidence corrected to BLOCKED.")
        readiness = "BLOCKED" if restrictions else "NOT_READY"

    selected_html = ""
    if primary:
        if primary.source_type.startswith("extension"):
            selected_html = _extension_rendered_html(extension)
        elif primary.source_type == "backend_jsonld":
            # backend_jsonld is always parsed OUT OF backend_html itself (see
            # the scan a few lines above this function), so whenever it wins
            # as primary, backend_html is already known present and usable.
            # A synthetic JSON-LD-only shell here used to throw the full
            # rendered page away right at the source -- dom_cleaner_agent/
            # markdown_agent then had nothing but that shell to work with
            # (confirmed directly: a real posting's DOM-cleaned text dropped
            # to ~40 chars, all downstream markdown empty), silently starving
            # the extraction LLM of the actual page content whenever
            # JSON-LD -- which ranks highest and is picked whenever present,
            # the common case on modern ATS platforms -- won as primary.
            # Falls back to the synthetic shell only in the unreachable case
            # where backend_html is somehow empty despite backend_jsonld
            # having been parsed from it.
            scripts = "".join(
                f'<script type="application/ld+json">{json.dumps(item, ensure_ascii=False)}</script>'
                for item in backend_jsonld
            )
            selected_html = backend_html or f"<html><head>{scripts}</head><body></body></html>"
        elif primary.source_type == "backend_metadata":
            selected_html = (
                f"<html><head><title>{html_lib.escape(str(state.backend_page_title or ''))}</title>"
                f"<meta name='description' content='{html_lib.escape(str(backend_metadata.get('description') or ''))}'>"
                f"</head><body></body></html>"
            )
        else:
            selected_html = backend_html

    if primary and primary.source_type.startswith("extension") and "backend_playwright" in restrictions:
        reason = "backend_restricted_extension_job_evidence_available"
    elif primary:
        reason = f"selected_highest_ranked_usable_source:{primary.source_type}"
    else:
        reason = "no_usable_unrestricted_evidence_source_remains"
    logger.info(
        "%s Evidence evaluation request_id=%s source_status=%s restrictions=%s "
        "ranking_scores=%s primary=%s supplementary=%s excluded=%s reason=%s "
        "page_access=%s readiness=%s selected_job=%s conflicts=%s",
        LOG_PREFIX, state.request_id,
        {source.source_type: source.access_status for source in sources},
        restrictions, rankings, primary.source_type if primary else None,
        supplementary, excluded, reason, page_access, readiness,
        selected_job, conflicts,
    )
    error = None if primary else {
        "code": "ALL_EVIDENCE_UNUSABLE" if restrictions else "INSUFFICIENT_EVIDENCE",
        "message": (
            "The page could not be inspected using the available evidence sources."
            if restrictions else
            "The available page evidence is insufficient for job extraction."
        ),
    }
    return {
        "raw_html": selected_html,
        "final_url": extension.get("url") if primary and primary.source_type.startswith("extension") else state.backend_final_url,
        "page_title": extension.get("title") if primary and primary.source_type.startswith("extension") else state.backend_page_title,
        "error": error,
        "blocked_reason": None,
        "evidence_sources": [source.model_dump(mode="json") for source in sources],
        "evidence_sources_discovered": [source.source_type for source in sources if source.available],
        "selected_evidence_source": primary.source_type if primary else None,
        "primary_source": primary.source_type if primary else None,
        "source_selection_reason": reason,
        "supplementary_sources": supplementary,
        "excluded_sources": list(dict.fromkeys(excluded)),
        "source_restrictions": restrictions,
        "source_scores": rankings,
        "page_access_status": page_access,
        "extraction_readiness": readiness,
        "selected_job_detected": selected_job,
        "selected_job_identity": {
            "url": extension.get("selected_job_url") or extension.get("url") or state.url,
            "job_id": extension_job_id or backend_job_id,
            "title": _infer_rendered_job_title(extension),
            "company": extension.get("company_hint"),
            "dom_fingerprint": (extension.get("capture") or {}).get("dom_fingerprint"),
        } if selected_job else None,
        "evidence_conflicts": conflicts,
        "planner_warnings": warnings,
        "needs_manual_review": readiness == "MANUAL_REVIEW",
        "execution_log": _event(
            state, "evidence_evaluation", primary=primary.source_type if primary else None,
            supplementary=supplementary, excluded=excluded, rankings=rankings,
            selection_reason=reason, page_access=page_access,
            readiness=readiness, conflicts=conflicts,
        ),
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
    selected_is_extension = (state.selected_evidence_source or "").startswith("extension")
    backend_job_count = 0 if selected_is_extension else len(jobs)
    if not selected_is_extension:
        for item in state.extension_evidence.get("jsonld", []) or []:
            _walk_jsonld(item, all_items, jobs)

    # SPA job portals frequently leave the previous posting's JSON-LD in the
    # document after swapping the visible detail panel. Never allow that stale
    # structured record to override the user's currently rendered job.
    if selected_is_extension and jobs:
        extension = state.extension_evidence or {}
        visible_job_text = " ".join(filter(None, (
            str(extension.get("selected_panel_text") or ""),
            str(extension.get("visible_text") or "")[:30000],
        )))
        normalized_visible = re.sub(r"[^a-z0-9]+", " ", visible_job_text.casefold()).strip()
        title_hint = _infer_rendered_job_title(extension)
        generic_hint = GENERIC_JOB_TITLE.fullmatch(title_hint)

        def title_is_current(job: dict[str, Any]) -> bool:
            candidate = re.sub(
                r"[^a-z0-9]+", " ", str(job.get("title") or "").casefold()
            ).strip()
            if not candidate:
                return False
            normalized_hint = re.sub(r"[^a-z0-9]+", " ", title_hint.casefold()).strip()
            if normalized_hint and not generic_hint:
                return candidate in normalized_hint or normalized_hint in candidate
            return candidate in normalized_visible

        current_jobs = [job for job in jobs if title_is_current(job)]
        if current_jobs:
            jobs = current_jobs
        elif normalized_visible:
            logger.warning(
                "%s Rejected stale SPA JobPosting JSON-LD request_id=%s titles=%s visible_hint=%s",
                LOG_PREFIX,
                state.request_id,
                [job.get("title") for job in jobs],
                title_hint,
            )
            jobs = []
    extension_job_count = len(jobs) - backend_job_count
    selected_source = state.selected_evidence_source
    logger.info(
        "%s JSON-LD completed request_id=%s blocks=%s jobs=%s malformed=%s "
        "backend_jobs=%s extension_jobs=%s selected_source=%s titles=%s companies=%s",
        LOG_PREFIX, state.request_id, len(all_items), len(jobs), malformed,
        backend_job_count, extension_job_count, selected_source,
        [job.get("title") for job in jobs][:5],
        [((job.get("hiringOrganization") or {}).get("name") if isinstance(job.get("hiringOrganization"), dict) else job.get("hiringOrganization")) for job in jobs][:5],
    )
    return {
        "jsonld": all_items, "jobposting_jsonld": jobs,
        "selected_evidence_source": selected_source,
        "execution_log": _event(
            state, "jsonld", blocks=len(all_items), job_postings=len(jobs),
            malformed=malformed, backend_jobs=backend_job_count,
            extension_jobs=extension_job_count, selected_source=selected_source,
        ),
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
    text_preview = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))[:300]
    logger.info(
        "%s DOM cleanser completed request_id=%s input_length=%s output_length=%s "
        "removed_length=%s selected_source=%s text_preview=%r",
        LOG_PREFIX, state.request_id, len(state.raw_html), len(cleaned),
        max(0, len(state.raw_html) - len(cleaned)), state.selected_evidence_source,
        text_preview,
    )
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
    logger.info(
        "%s Markdown conversion completed request_id=%s html_length=%s "
        "markdown_length=%s line_count=%s preview=%r",
        LOG_PREFIX, state.request_id, len(state.cleaned_html), len(markdown), len(lines),
        markdown[:500],
    )
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
    logger.info(
        "%s Metadata completed request_id=%s title=%r description_length=%s "
        "headings=%s apply_links_count=%s portal=%s",
        LOG_PREFIX, state.request_id, metadata.get("title"),
        len(metadata.get("description") or ""), metadata["headings"][:8],
        len(metadata["apply_links"]), state.detected_portal,
    )
    return {"metadata": metadata, "execution_log": _event(state, "metadata", headings=len(metadata["headings"]))}


def block_detection_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    """Validate source-level restriction invariants after source selection."""
    state = _state(value)
    primary = state.primary_source or state.selected_evidence_source
    primary_record = next(
        (item for item in state.evidence_sources if item.get("source_type") == primary),
        None,
    )
    violation = bool(
        primary_record
        and (primary_record.get("restricted") or not primary_record.get("usable"))
    )
    warnings = list(state.planner_warnings)
    if violation:
        warnings.append(
            f"Selected source invariant violation detected for {primary}; "
            "classification evidence was rejected."
        )
    logger.info(
        "%s Block detection request_id=%s source_restrictions=%s primary=%s "
        "primary_usable=%s invariant_violation=%s page_access=%s",
        LOG_PREFIX, state.request_id, state.source_restrictions, primary,
        primary_record.get("usable") if primary_record else None,
        violation, state.page_access_status,
    )
    return {
        # Page-level restriction remains clear whenever at least one usable
        # source survived evaluation. Source restrictions stay diagnostic.
        "restriction_type": None,
        "blocked_reason": None,
        "planner_warnings": warnings,
        "needs_manual_review": state.needs_manual_review or violation,
        "extraction_readiness": "MANUAL_REVIEW" if violation else state.extraction_readiness,
        "execution_log": _event(
            state, "block_detection", primary=primary,
            invariant_violation=violation,
            source_restrictions=state.source_restrictions,
        ),
    }


def planner_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    complete_jsonld = any(item.get("title") and item.get("description") for item in state.jobposting_jsonld)
    selected = state.selected_evidence_source or "backend_playwright"
    text_length = len(state.markdown)
    # Evidence evaluation owns readiness. Structured JobPosting evidence may
    # promote PARTIAL to READY, but text length alone can never do so.
    readiness = (
        "READY"
        if complete_jsonld and state.extraction_readiness in {"READY", "PARTIAL"}
        else state.extraction_readiness
    )
    plan = {
        "primary_source": "jobposting_jsonld" if complete_jsonld else "markdown",
        "supplementary_sources": ["markdown", "metadata"] if complete_jsonld else ["metadata", "jobposting_jsonld"],
        "browser_retry_required": len(state.markdown) < 250 and state.browser_attempts < state.max_browser_attempts,
        "strategy": "structured_first" if complete_jsonld else "evidence_fusion",
        "selected_acquisition_source": selected,
        "extraction_readiness": readiness,
    }
    logger.info(
        "%s Planner completed request_id=%s strategy=%s selected_source=%s "
        "readiness=%s sources=%s restriction=%s",
        LOG_PREFIX, state.request_id, plan["strategy"], selected, readiness,
        state.evidence_sources_discovered, state.restriction_type,
    )
    return {
        "plan": plan,
        "extraction_readiness": readiness,
        "execution_log": _event(
            state, "planner", strategy=plan["strategy"],
            selected_source=selected, readiness=readiness,
            sources=state.evidence_sources_discovered,
        ),
    }


def _deterministic_classification(state: JDState) -> ClassificationDecision:
    url_text = str(state.final_url or state.url or "")
    text = f"{url_text} {state.page_title or ''} {' '.join(state.metadata.get('headings', []))} {state.markdown[:12000]}".lower()
    if state.blocked_reason:
        return ClassificationDecision(page_type="non_job", confidence=1, reasons=["Page access is blocked"])
    if state.jobposting_jsonld:
        return ClassificationDecision(page_type="job_detail", confidence=.98, reasons=["JobPosting JSON-LD found"])

    apply_signals = len(re.findall(
        r"\b(?:apply now|apply for this job|submit application|start application|easy apply|apply)\b",
        text,
    ))
    section_markers = (
        "job description", "job details", "what to expect", "what you'll do",
        "what you’ll do", "what you will do", "what you'll bring", "what you’ll bring",
        "what you will bring", "the role", "about the role", "your role", "about the job",
        "about us", "about the company", "role overview", "job overview", "position summary",
        "responsibilities", "key job responsibilities", "key responsibilities", "requirements",
        "minimum qualifications", "basic qualifications", "preferred qualifications",
        "qualifications", "required skills", "preferred skills", "experience required",
        "what you'll need", "what you need", "what we're looking for", "what we are looking for",
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
        r"\b(?:view job|view opening|job card|open position|open positions|search jobs|see job)\b",
        text,
    ))
    listing_signals = [
        marker for marker in (
            "search results", "all jobs", "job alerts", "open positions",
            "recommended jobs", "jobs matching", "filter jobs",
        )
        if marker in text
    ]
    substantial = len(state.markdown) >= 150
    markdown_title_match = re.search(r"^#+\s+(.+)$", state.markdown, flags=re.M)
    title = (
        state.page_title
        or state.metadata.get("title")
        or (markdown_title_match.group(1) if markdown_title_match else None)
        or (state.metadata.get("headings") or [""])[0]
        or _infer_rendered_job_title(state.extension_evidence or {})
        or ""
    ).strip()
    has_specific_title = bool(
        title
        # Was >=5, rejecting genuinely valid short titles ("CFO", "CTO",
        # "COO", "QA", "PM" are all <5 chars) outright as if no title had
        # been found at all. The generic-placeholder fullmatch check right
        # below already filters out non-titles regardless of length ("CFO"
        # doesn't match any of those literal words), so the length
        # threshold's only real job is rejecting empty/near-empty noise.
        and len(title) >= 2
        and not re.fullmatch(
            r"(?:careers?|jobs?|search jobs?|open positions?|home)",
            title,
            flags=re.I,
        )
    )
    # has_specific_title is an AND-gate on every job_detail branch below, but
    # title extraction only has platform-specific help for a few hardcoded
    # ATS hosts (PORTALS above) -- an ATS widget embedded on a company's own
    # domain (e.g. Ashby's ?ashby_jid=... embed, confirmed real-world case:
    # langchain.com/careers?ashby_jid=... classified non_job at confidence
    # .8 despite being a genuine job-detail page) commonly renders inside
    # non-semantic markup our generic title/heading heuristics can't
    # reliably extract a title from, even though document.title/headings
    # never update because the widget is a tab/query-param-driven SPA
    # panel, not a real navigation. A URL that itself carries a
    # known-ATS specific-job identifier (discovery_agent's job_in_query
    # check, folded into discovery.has_job_path) is strong, independent
    # evidence this is one specific job -- used here only as an alternative
    # to title-extraction success, and only in branches that already
    # require real section/apply/employment content evidence on top, so it
    # can't turn a listing page into a false job_detail on its own.
    url_has_job_identity = bool((state.discovery or {}).get("has_job_path"))
    has_job_identity = has_specific_title or url_has_job_identity

    logger.info(
        "%s Classifier signals request_id=%s apply=%s sections=%s "
        "employment=%s listing=%s cards=%s markdown_length=%s specific_title=%s "
        "url_job_identity=%s selected_job_detected=%s",
        LOG_PREFIX,
        state.request_id,
        apply_signals,
        section_signals,
        employment_signals,
        listing_signals,
        cards,
        len(state.markdown),
        has_specific_title,
        url_has_job_identity,
        state.selected_job_detected,
    )

    if state.selected_job_detected and has_specific_title:
        return ClassificationDecision(
            page_type="job_detail",
            confidence=.96,
            reasons=["Evidence evaluation verified a single rendered job page"],
        )

    if (state.extraction_readiness == "READY" or state.selected_evidence_source == "extension_selected_panel") and has_specific_title and substantial:
        return ClassificationDecision(
            page_type="job_detail",
            confidence=.96,
            reasons=["Verified single job description panel extracted by browser extension"],
        )

    if listing_signals and (cards >= 1 or re.search(r"/(?:jobs?|careers?|positions?|openings?)(?:[/?#]|$)", url_text, re.I)) and apply_signals == 0 and len(section_signals) < 2:
        return ClassificationDecision(page_type="job_list", confidence=.88, reasons=["Repeated listing/search signals"])
    # `cards` (count of "view job"/"see job"/"open position(s)" style CTAs)
    # is a proxy for "how many distinct job entries does this page show".
    # None of the three job_detail branches below previously gated on it at
    # all -- a real search-results page (LinkedIn/Indeed/Glassdoor, 10-20
    # job cards, several individually mentioning "Requirements:"/"Apply
    # now" in their teaser text) could rack up 2+ section_signals plus
    # apply_signals>0 plus a URL path like /jobs, satisfying the .93-
    # confidence branch below as a single job_detail even though it's
    # unambiguously a listing. Requiring cards<2 targets exactly that
    # multi-card shape without penalizing a genuine single-job page that
    # happens to show a small "similar jobs" sidebar (which usually
    # doesn't repeat the specific CTA phrasing `cards` looks for per item).
    is_multi_job_listing = cards >= 2
    if substantial and apply_signals > 0 and section_signals and has_job_identity and not is_multi_job_listing:
        return ClassificationDecision(
            page_type="job_detail",
            confidence=.93,
            reasons=[
                "Specific role title found" if has_specific_title else "URL identifies a specific job posting",
                "Application action found",
                f"Job-detail sections found: {', '.join(section_signals[:5])}",
            ],
        )
    if substantial and len(section_signals) >= 2 and has_job_identity and not is_multi_job_listing:
        return ClassificationDecision(
            page_type="job_detail",
            confidence=.86,
            reasons=[
                "Specific role title and multiple coherent job-description sections found"
                if has_specific_title
                else "URL identifies a specific job posting with multiple coherent job-description sections found"
            ],
        )
    if substantial and apply_signals > 0 and employment_signals and has_job_identity and not is_multi_job_listing:
        return ClassificationDecision(
            page_type="job_detail",
            confidence=.82,
            reasons=[
                "Role title, employment metadata, and application action found"
                if has_specific_title
                else "URL identifies a specific job posting, with employment metadata and an application action found"
            ],
        )
    if is_multi_job_listing and listing_signals:
        return ClassificationDecision(
            page_type="job_list",
            confidence=.85,
            reasons=["Multiple job cards with listing/search signals found"],
        )
    if len(state.markdown) < 250:
        return ClassificationDecision(page_type="non_job", confidence=.55, reasons=["Insufficient page evidence"], action="browser_retry")
    return ClassificationDecision(page_type="non_job", confidence=.8, reasons=["No coherent single-job evidence"])


def classifier_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    decision = _deterministic_classification(state)
    logger.info("%s Classification completed request_id=%s page_type=%s confidence=%s reasons=%s", LOG_PREFIX, state.request_id, decision.page_type, decision.confidence, decision.reasons)
    listing_surface = bool(
        state.extension_evidence.get("selected_panel_text")
        and re.search(
            r"\b(?:search results|job results|recommended jobs|jobs matching|filter jobs)\b",
            str(state.extension_evidence.get("visible_text") or ""),
            flags=re.I,
        )
    )
    surface_type = state.surface_type or (
        "job_list" if listing_surface and decision.page_type == "job_detail"
        else decision.page_type
    )
    return {
        "page_type": decision.page_type, "classification_confidence": decision.confidence,
        "surface_type": surface_type,
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
        **state.source_scores,
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
    # The extraction LLM must always see the actual rendered page text.
    # JSON-LD used to REPLACE it whenever the planner picked JSON-LD as
    # "primary" (i.e. whenever title+description exist -- a low bar most
    # ATS platforms clear), so a JobPosting JSON-LD `description` that's a
    # shortened SEO summary silently hid the real requirements/skills text
    # that only appears in the rendered DOM/markdown. JSON-LD is still
    # surfaced -- it's a higher-trust structured signal for fields like
    # employment_type/dates -- but always alongside the page text, never
    # instead of it.
    jsonld_hints = json.dumps(
        state.jobposting_jsonld,
        ensure_ascii=False,
        separators=(",", ":"),
    )[:2000] if state.jobposting_jsonld else ""
    source = (
        f"STRUCTURED_JOBPOSTING_JSONLD (supplementary, may be incomplete):\n{jsonld_hints}\n\n"
        f"RENDERED_PAGE_TEXT (primary; authoritative for skills/requirements/responsibilities):\n{state.markdown}"
    ) if jsonld_hints else state.markdown
    payload = {
        "primary_source": primary,
        "acquisition_primary_source": state.primary_source,
        "supplementary_sources": state.supplementary_sources,
        "excluded_sources": state.excluded_sources,
        "source_boundaries": [
            {
                "source_type": item.get("source_type"),
                "access_status": item.get("access_status"),
                "content_length": item.get("content_length"),
                "job_signal_score": item.get("job_signal_score"),
                "quality_score": item.get("quality_score"),
                "specificity_score": item.get("specificity_score"),
                "selected_job_signal": item.get("selected_job_signal"),
            }
            for item in state.evidence_sources
            if item.get("usable") and item.get("source_type") not in state.excluded_sources
        ],
        "evidence_conflicts": state.evidence_conflicts,
        "planner_warnings": state.planner_warnings,
        "detected_sections": state.detected_sections,
        # A focused evidence window is enough for one posting while
        # materially reducing LLM prompt ingestion latency. The source is
        # already selected/cleaned before this node. Budget: up to ~2k for
        # the optional JSON-LD prefix (see above) plus the same 12k of
        # actual page text as before, so combining the two never starves
        # the page text of the room it previously had on its own.
        # The LLM is the organizer of record. Do not starve it of later JD
        # sections (JPMC commonly places responsibilities after a long About
        # Us block). markdown_agent already enforces the 60k safety ceiling.
        "source_text": source[:62000],
        "source_urls": list(dict.fromkeys(filter(None, [state.original_url, state.final_url, state.metadata.get("canonical_url")]))),
        "source_scores": state.source_scores,
        "field_source_hints": state.evidence.get("field_source_hints", {}),
        "metadata": {k: state.metadata.get(k) for k in ("title", "description", "apply_links", "portal")},
        "browser_session_hints": {
            "job_title": state.extension_evidence.get("job_title_hint"),
            "company_name": state.extension_evidence.get("company_hint"),
            "location": state.extension_evidence.get("location_hint"),
        },
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

Never invent factual values. For collection fields (responsibilities, requirements,
preferred_qualifications, skills, suggested_skills, and benefits), always return a JSON
array and use [] when evidence is genuinely absent. Use null only for absent scalar fields.
Never fill an absent field with a placeholder word or phrase such as "Unavailable",
"Not Available", "N/A", "Unknown", "Not Specified", or "TBD" -- use null (for scalars) or
[] (for arrays) instead. A field must contain only real values found in the evidence.

COMPANY IDENTITY:
- company_name is the recognizable public employer brand supported by domain, metadata,
  page content, and structured hiringOrganization evidence.
- A job marketplace or hosting platform is not the employer merely because its brand appears
  in the URL, document title, metadata, or page chrome. Prefer the employer named in the
  selected job top card, hiring organization, or browser_session_hints.company_name.
- When a posting names a legal hiring subsidiary/entity but clearly belongs to a known
  parent/public employer brand on the same page, return the public brand.
- Do not blindly copy legal suffixes or requisition/entity codes into company_name.
- Do not infer a parent brand without supporting page/domain evidence.
- A structured hiringOrganization.name is normally trustworthy, but some ATS platforms leave
  it unconfigured and it literally names the CAREER-SITE PRODUCT itself, not the employer
  (e.g. "Candidate Experience page", "Career Site", "Talent Community") -- confirmed real-world
  case on an Oracle Cloud HCM posting. Never use a phrase like that as company_name; fall back
  to other page/domain evidence (e.g. the URL subdomain, page title's employer segment) instead.
- company_domain is the official employer hostname only when supported by the source URL,
  canonical URL, structured metadata, or explicit company website evidence. Return null
  for third-party job boards or uncertainty. Never append ".com" to company_name.

EXPLICIT SKILL COVERAGE:
- Scan the entire description, responsibilities, mandatory qualifications, and preferred
  qualifications for explicit skills.
- skills includes every explicitly named language, query/scripting language, framework,
  library, platform, cloud/service, software/tool, statistical or mathematical method,
  scientific/analytical technique, visualization technology, data/infrastructure capability,
  domain skill, and explicitly required professional competency.
- Convert examples into separate concise canonical labels when they are explicitly written.
- Do not omit a skill because it appears inside parentheses, an “e.g.” list, a responsibility,
  or a preferred qualification. Worked example: the qualification bullet "Experience
  developing in a high-level programming language (Python, JavaScript, Java, Swift, etc.)"
  must yield ALL FOUR of Python, JavaScript, Java, and Swift in skills -- not just the
  first one or two named, and not the sentence as a whole.
- Generic degrees and years of experience are requirements, not skills.

PAGE CHROME IS NOT JOB CONTENT:
- The evidence may still contain site navigation, cookie/consent banners, "similar jobs" or
  "you might also like" rails, social-share widgets, and subscription/membership upsells
  (e.g. "Try Premium", "Job search faster with Premium", "X and millions of other members
  use Premium", free-trial pitches, "Unlock company insights") that earlier cleanup missed.
  None of this is ever real job content -- never place it in any field, and never let it
  cut a real bullet list short.
- UI affordances like "... more" / "Show more" are truncation controls, not content -- never
  emit them as a requirement, responsibility, qualification, or benefit.

SALARY & COMPENSATION:
- Scan the entire evidence (not just a dedicated "Compensation" section -- many postings state
  it inline within the description or a benefits paragraph) for a stated pay figure or range.
- currency must be a real ISO-4217-style code (e.g. USD, EUR, GBP, INR) inferred from the
  symbol/code actually present, never invented or assumed to be USD by default.
- Preserve both minimum and maximum for a range; if only a single figure is stated, set both
  minimum and maximum to that same value. Convert "k" shorthand (e.g. "140k") to its full
  numeric value (140000).
- period is one of hourly/daily/weekly/monthly/yearly when the evidence states or clearly
  implies a pay cadence (e.g. "/yr", "per annum", "/hr"); leave it null when genuinely absent
  rather than guessing.
- raw should be the exact compensation phrase as it appears in the evidence.
- Do not confuse a signing bonus, equity grant, or benefits valuation with base salary; only
  base/total cash compensation figures belong in salary.

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


def _clean_evidence_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False, default=str)
    text = BeautifulSoup(str(value), "lxml").get_text(" ", strip=True)
    return re.sub(r"\s+", " ", text).strip()


def _clean_evidence_items(value: Any) -> list[str]:
    """Normalize JSON-LD list fields without leaking publisher HTML to clients."""
    values: list[Any] = []

    def collect(item: Any) -> None:
        if item is None:
            return
        if isinstance(item, dict):
            for nested in item.values():
                collect(nested)
            return
        if isinstance(item, (list, tuple, set)):
            for nested in item:
                collect(nested)
            return
        values.append(item)

    collect(value)
    cleaned: list[str] = []
    seen: set[str] = set()
    for value_item in values:
        raw = str(value_item or "").strip()
        if not raw:
            continue
        soup = BeautifulSoup(raw, "lxml")
        list_items = soup.find_all("li")
        candidates = (
            [item.get_text(" ", strip=True) for item in list_items]
            if list_items
            else [soup.get_text(" ", strip=True)]
        )
        for candidate in candidates:
            text = re.sub(r"\s+", " ", candidate).strip(" \t\r\n-•*")
            key = text.casefold()
            if text and key not in seen:
                seen.add(key)
                cleaned.append(text)
    return cleaned


def _suggested_skills_for(title: str, explicit: list[str]) -> list[str]:
    role = str(title or "").casefold()
    role_sets = [
        (("data", "analytics", "machine learning", "ai"), ["Data Analysis", "Problem Solving", "Data Quality", "Stakeholder Communication"]),
        (("software", "developer", "engineer", "backend", "frontend"), ["Software Design", "Debugging", "Testing", "Code Review"]),
        (("product", "program", "project"), ["Roadmapping", "Stakeholder Management", "Requirements Analysis", "Risk Management"]),
        (("sales", "account", "business development"), ["Pipeline Management", "Negotiation", "Customer Discovery", "Forecasting"]),
    ]
    candidates = next(
        (skills for markers, skills in role_sets if any(marker in role for marker in markers)),
        ["Problem Solving", "Communication", "Collaboration", "Prioritization"],
    )
    explicit_keys = {item.casefold() for item in explicit}
    fallback_candidates = [
        *candidates,
        "Problem Solving", "Communication", "Collaboration", "Prioritization",
        "Stakeholder Management", "Quality Assurance",
    ]
    suggested: list[str] = []
    for item in fallback_candidates:
        key = item.casefold()
        if key not in explicit_keys and key not in {value.casefold() for value in suggested}:
            suggested.append(item)
        if len(suggested) == 4:
            break
    return suggested


# Deterministic, evidence-only recovery for the occasional structured LLM
# response that contains a complete JD but leaves `skills` empty. These labels
# are emitted only when their exact term/alias occurs in the captured page.
_EXPLICIT_SKILL_ALIASES: dict[str, tuple[str, ...]] = {
    "Python": ("python",), "Java": ("java",), "JavaScript": ("javascript",),
    "TypeScript": ("typescript",), "C++": ("c++",), "C#": ("c#",),
    "SQL": ("sql",), "R": ("r programming", " r "),
    "JAX": ("jax",), "TensorFlow": ("tensorflow",), "PyTorch": ("pytorch",),
    "Keras": ("keras",), "NumPy": ("numpy",), "Pandas": ("pandas",),
    "Scikit-learn": ("scikit-learn", "sklearn"),
    "Machine Learning": ("machine learning",),
    "Deep Learning": ("deep learning",),
    "Reinforcement Learning": ("reinforcement learning",),
    "Natural Language Processing": ("natural language processing", "nlp"),
    "Computer Vision": ("computer vision",),
    "Generative AI": ("generative ai", "generative artificial intelligence"),
    "Large Language Models": ("large language model", "large language models", "llm", "llms"),
    "Transformers": ("transformer models", "transformers"),
    "Distributed Training": ("distributed training",),
    "Data Science": ("data science",), "Data Analysis": ("data analysis",),
    "Statistics": ("statistics", "statistical modeling", "statistical learning"),
    "Optimization": ("optimization",), "Algorithms": ("algorithms",),
    "Research": ("research",), "Experiment Design": ("experiment design", "experimentation"),
    "React": ("react",), "Angular": ("angular",), "Vue.js": ("vue.js", "vuejs"),
    "Node.js": ("node.js", "nodejs"), "Django": ("django",), "FastAPI": ("fastapi",),
    "REST APIs": ("rest api", "restful api", "rest apis"),
    "AWS": ("aws", "amazon web services"), "Azure": ("azure",),
    "Google Cloud": ("google cloud", "gcp"), "Docker": ("docker",),
    "Kubernetes": ("kubernetes", "k8s"), "Git": ("git",), "Linux": ("linux",),
    "Kafka": ("kafka",), "Apache Spark": ("apache spark", "pyspark", "spark"),
    "Databricks": ("databricks",), "Hadoop": ("hadoop",),
    "Tableau": ("tableau",), "Power BI": ("power bi",),
    "Agile": ("agile",), "Scrum": ("scrum",),
    # Confirmed gap: a real posting listed "Python, JavaScript, Java, Swift,
    # etc." inside a qualifications bullet (not a dedicated skills list) and
    # Swift -- absent from the dictionary above -- silently dropped out of
    # the extracted skills whenever this deterministic path ran instead of
    # the LLM. Rounding out mainstream languages/platforms/infra tooling
    # closes that class of gap without waiting on every individual miss to
    # be reported.
    "Swift": ("swift",), "Kotlin": ("kotlin",), "Go": ("golang", "go lang"),
    "Rust": ("rust",), "Ruby": ("ruby",), "PHP": ("php",),
    "Scala": ("scala",), "Objective-C": ("objective-c", "objective c"),
    "C": (" c programming", "c language"), "MATLAB": ("matlab",),
    "Perl": ("perl",), "Dart": ("dart",), "Elixir": ("elixir",),
    "Haskell": ("haskell",), "Shell Scripting": ("shell script", "bash scripting"),
    "PowerShell": ("powershell",),
    "HTML": ("html",), "CSS": ("css",), "Sass": ("sass", "scss"),
    "Next.js": ("next.js", "nextjs"), "Nuxt.js": ("nuxt.js", "nuxtjs"),
    "Svelte": ("svelte",), "Express.js": ("express.js", "expressjs"),
    "Spring": ("spring framework",), "Spring Boot": ("spring boot",),
    ".NET": (".net", "dotnet", "asp.net"), "Flask": ("flask",),
    "Ruby on Rails": ("ruby on rails", "rails"),
    "GraphQL": ("graphql",), "gRPC": ("grpc",), "WebSockets": ("websocket",),
    "Microservices": ("microservices", "microservice architecture"),
    "MongoDB": ("mongodb", "mongo db"), "PostgreSQL": ("postgresql", "postgres"),
    "MySQL": ("mysql",), "Redis": ("redis",), "Elasticsearch": ("elasticsearch",),
    "DynamoDB": ("dynamodb",), "Cassandra": ("cassandra",),
    "RabbitMQ": ("rabbitmq",), "Terraform": ("terraform",),
    "Ansible": ("ansible",), "Jenkins": ("jenkins",),
    "CI/CD": ("ci/cd", "continuous integration", "continuous deployment"),
    "GitHub Actions": ("github actions",), "GitLab CI": ("gitlab ci",),
    "Android": ("android",), "iOS": ("ios",), "SwiftUI": ("swiftui",),
    "Flutter": ("flutter",), "React Native": ("react native",),
    "Unity": ("unity3d", "unity engine"), "Unreal Engine": ("unreal engine",),
    "Selenium": ("selenium",), "Cypress": ("cypress",), "Jest": ("jest",),
    "GraphDB": ("graph database",), "Blockchain": ("blockchain",),
    "Solidity": ("solidity",), "Figma": ("figma",),
    "Excel": ("excel", "microsoft excel"), "Salesforce": ("salesforce",),
    "Cybersecurity": ("cybersecurity", "cyber security"),
    "Product Security": ("product security",),
    "Application Security": ("application security", "appsec"),
    "Security Engineering": ("security engineering",),
    "Security Research": ("security research",),
    "Security Analysis": ("security analysis",),
    "Threat Modeling": ("threat modeling", "threat modelling"),
    "Vulnerability Management": ("vulnerability management",),
    "Vulnerability Research": ("vulnerability research",),
    "Penetration Testing": ("penetration testing", "pen testing"),
    "Incident Response": ("incident response",),
    "Secure SDLC": ("secure sdlc", "security development lifecycle", "secure software development lifecycle"),
    "Code Review": ("code review", "code reviews"),
    "Cloud Security": ("cloud security",),
    "Web Security": ("web security",),
    "Network Security": ("network security",),
    "Cryptography": ("cryptography", "cryptographic"),
    "Authentication": ("authentication",),
    "Authorization": ("authorization", "authorisation"),
    "OWASP": ("owasp",),
    "SAST": ("sast", "static application security testing"),
    "DAST": ("dast", "dynamic application security testing"),
}


def _deterministic_explicit_skills(*values: Any) -> list[str]:
    text = " ".join(_clean_evidence_text(value) for value in values if value)
    padded = f" {text.casefold()} "
    found: list[str] = []
    for canonical, aliases in _EXPLICIT_SKILL_ALIASES.items():
        if any(
            re.search(rf"(?<![a-z0-9]){re.escape(alias.strip().casefold())}(?![a-z0-9])", padded)
            for alias in aliases
            if alias.strip()
        ):
            found.append(canonical)
    return found


_JD_SECTION_HEADINGS = {
    "responsibilities": (
        "responsibilities", "key responsibilities", "what you'll do",
        "what you will do", "what you'll be doing", "what you will be doing",
        "your role", "the role", "job duties", "duties",
    ),
    "requirements": (
        "requirements", "required qualifications", "minimum qualifications",
        "basic qualifications", "what we need to see", "what you bring",
        "what we're looking for", "what we are looking for", "qualifications",
    ),
    "preferred": (
        "preferred qualifications", "ways to stand out", "nice to have",
        "preferred skills", "desired qualifications",
    ),
    "benefits": (
        "benefits", "what we offer", "perks", "compensation and benefits",
        "compensation & benefits", "compensation and perks",
        "compensation & perks", "compensation", "benefits and perks",
        "perks and benefits",
    ),
}


def _normalize_section_heading(value: str) -> str:
    normalized = value.casefold().replace("’", "'").replace("‘", "'")
    return re.sub(r"[^a-z0-9']+", " ", normalized).strip()


def _deterministic_section_items(text: str, section: str) -> list[str]:
    """Extract list-like JD sections from extension-rendered plain text.

    This is deliberately conservative: content is copied from the page, never
    generated, and section boundaries are recognized by common heading names.

    Handles two markup shapes:
    1. Heading alone on its own line, followed by separate item lines --
       the original, common case for cleanly bulleted JDs.
    2. Heading and its first content on the SAME line, e.g.
       "Responsibilities: Design and build features, collaborate with
       teams, ship code." -- confirmed missing in production (JPMC/Oracle
       Cloud HCM postings render this way; markdownify collapses an
       "<p><strong>Responsibilities:</strong> ...</p>"-shaped source into
       one line with no line break). Previously this whole section came
       back empty even though the classifier's own looser substring check
       had already confirmed the heading text was present in the page --
       the strict whole-line-only heading match just never fired.
    """
    target_headings = set(_JD_SECTION_HEADINGS[section])
    # Keys must be normalized, matching how heading_group_for/
    # combined_heading_groups below normalize their query -- keying by the
    # raw tuple strings instead only ever matched by coincidence, for
    # headings that happened to contain no punctuation ("perks",
    # "requirements"). Any heading using "&" (e.g. "compensation & perks")
    # could never match: _normalize_section_heading strips "&" from the
    # query but the raw dict key still had it, so the two could never be
    # equal.
    all_headings = {
        _normalize_section_heading(heading): group
        for group, headings in _JD_SECTION_HEADINGS.items()
        for heading in headings
    }

    def heading_group_for(segment: str) -> str | None:
        return all_headings.get(_normalize_section_heading(segment.rstrip(":")))

    def combined_heading_groups(line: str) -> set[str] | None:
        """Recognizes a short combined heading like "Responsibilities &
        Requirements" or "Role and Requirements" -- every "&"/"/"/","/"and"
        -separated segment must EXACTLY match a known heading (short-line
        length cap plus all-segments-must-match keeps this from ever
        matching incidental prose, e.g. "This role has diverse
        responsibilities and clear requirements" -- that sentence has far
        more than 2 segments once split this way and most of them aren't
        heading phrases, so it correctly falls through to being body text).
        """
        if len(line) > 60:
            return None
        parts = [p for p in re.split(r"\s*(?:&|/|,|\band\b)\s*", line, flags=re.I) if p.strip()]
        if len(parts) < 2:
            return None
        groups: set[str] = set()
        for part in parts:
            group = heading_group_for(part)
            if not group:
                return None
            groups.add(group)
        return groups if len(groups) >= 2 else None

    def _looks_like_heading(raw_line: str) -> bool:
        """Any markdown heading marker, or a short line that's ENTIRELY
        bold (markdownify's rendering of a <strong>-only paragraph, a
        common shape for a visual section heading in a JD authored without
        real <h2-6> tags), counts as a section boundary even when it isn't
        one of our recognized responsibilities/requirements/preferred/
        benefits headings. Without this, an unrecognized heading -- e.g. a
        real posting's "Compensation Range", "GitHub values", "Who We Are",
        "EEO Statement" -- was invisible to the loop below and got silently
        swept into whichever section was still active all the way to the
        end of the document (or the 30-item safety cap), confirmed directly
        against a real posting where "Preferred Qualifications" absorbed
        the entire rest of the page this way.
        """
        stripped = raw_line.strip()
        if re.match(r"^#{1,6}\s+\S", stripped):
            return True
        return bool(len(stripped) <= 60 and re.fullmatch(r"\*\*[^*]+\*\*[:.]?", stripped))

    active = False
    completed_once = False
    items: list[str] = []
    seen: set[str] = set()

    def add_item(candidate: str) -> None:
        candidate = candidate.strip(" \t\r\n#•*-–—:;")
        # Strip a leading list-numbering prefix ("1.", "2)", "a)", "iii.")
        # left over from JDs authored as numbered/lettered lists -- content
        # was already captured correctly before this, just with the raw
        # numbering baked into the visible text (e.g. "1. Design and build
        # features" shown verbatim to the end user instead of "Design and
        # build features").
        candidate = re.sub(r"^(?:\d{1,2}|[a-zA-Z]|[ivxIVX]{1,4})[.)]\s+", "", candidate).strip()
        if len(candidate) < 3 or len(candidate) > 700:
            return
        # LinkedIn/Indeed-style "show more" truncation affordances ("...
        # more", "…more", "Show more") are UI chrome, not JD content, but
        # pass every other filter here (real length, no known heading match).
        if re.fullmatch(r"(?:\.{2,}|…)?\s*(?:more|show more)\.?", candidate, flags=re.I):
            return
        key = candidate.casefold()
        if key not in seen:
            seen.add(key)
            items.append(candidate)

    for raw_line in str(text or "").splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip(" \t\r\n#•*-–—")
        if not line or len(items) >= 30:
            if len(items) >= 30:
                break
            continue

        # Trailing-boilerplate boundary: the extension-panel path already
        # has this (_focused_extension_panel), but the backend
        # Playwright/full-page markdown path (what this function actually
        # operates on) had no equivalent -- an unheaded "Similar Jobs"/
        # "Recommended Jobs" rail with no CSS class dom_cleaner_agent's
        # noise stripping recognizes would otherwise get silently swept
        # into whichever section was still active, polluting it with a
        # different job's content.
        if RECOMMENDATION_SECTION.search(line) or PLATFORM_UPSELL_BOILERPLATE.search(line):
            break

        normalized_whole = _normalize_section_heading(line.rstrip(":"))
        heading_group = all_headings.get(normalized_whole)
        if not heading_group:
            combined_groups = combined_heading_groups(line)
            if combined_groups and section in combined_groups:
                heading_group = section
        if heading_group:
            if heading_group == section:
                # Break, don't restart, if we're either already mid-section
                # (this same heading appearing again with NO other heading
                # in between -- e.g. a "You might also like" card repeating
                # "Responsibilities" right after the real section, with no
                # intervening Requirements/Benefits/etc. heading to have
                # already flipped `active` off) or we'd already completed
                # this section once earlier in the document.
                if active or completed_once:
                    break
                active = True
            else:
                if active:
                    completed_once = True
                active = False
            continue

        colon_index = line.find(":")
        if colon_index > 0:
            inline_heading_group = heading_group_for(line[:colon_index])
            if inline_heading_group:
                if inline_heading_group == section:
                    if active or completed_once:
                        break
                    active = True
                    remainder = line[colon_index + 1:].strip()
                    for piece in re.split(r"(?<=[.;])\s+", remainder):
                        add_item(piece)
                else:
                    if active:
                        completed_once = True
                    active = False
                continue

        if not active:
            continue
        if _looks_like_heading(raw_line):
            completed_once = True
            active = False
            continue
        add_item(line)
    return items


_SALARY_UNIT_TO_PERIOD = {
    "hour": "hourly", "day": "daily", "week": "weekly",
    "month": "monthly", "year": "yearly",
}


def _salary_from_structured(base_salary: Any) -> SalaryInfo | None:
    """Parses schema.org JobPosting.baseSalary (a MonetaryAmount, usually
    nesting a QuantitativeValue) when present -- a structured field is more
    trustworthy than regex-scanning free text, so this is tried first (see
    caller) and parse_salary_from_text only runs when this finds nothing."""
    if not isinstance(base_salary, dict):
        return None
    currency = str(base_salary.get("currency") or "").strip().upper() or None
    value = base_salary.get("value")
    if not isinstance(value, dict):
        if isinstance(value, (int, float)):
            return SalaryInfo(minimum=float(value), maximum=float(value), currency=currency)
        return None
    minimum = value.get("minValue")
    maximum = value.get("maxValue")
    single = value.get("value")
    if minimum is None and maximum is None and single is None:
        return None
    minimum = float(minimum) if isinstance(minimum, (int, float)) else (float(single) if isinstance(single, (int, float)) else None)
    maximum = float(maximum) if isinstance(maximum, (int, float)) else (float(single) if isinstance(single, (int, float)) else None)
    if minimum is None and maximum is None:
        return None
    if minimum is None:
        minimum = maximum
    if maximum is None:
        maximum = minimum
    unit = str(value.get("unitText") or "").strip().lower()
    return SalaryInfo(
        minimum=minimum, maximum=maximum, currency=currency,
        period=_SALARY_UNIT_TO_PERIOD.get(unit),
    )


def _deterministic_job_from_evidence(state: JDState) -> ExtractedJob:
    """Produce a useful bounded-latency result from already-cleaned page evidence."""
    structured = next(
        (item for item in state.jobposting_jsonld if isinstance(item, dict) and item.get("title")),
        {},
    )
    hiring_org = structured.get("hiringOrganization") or {}
    if not isinstance(hiring_org, dict):
        hiring_org = {"name": hiring_org}
    location_value = structured.get("jobLocation")
    if isinstance(location_value, list):
        location_value = location_value[0] if location_value else None
    if isinstance(location_value, dict):
        address = location_value.get("address") or location_value
        if isinstance(address, dict):
            def location_part(key: str) -> str:
                part = address.get(key)
                if isinstance(part, dict):
                    part = part.get("name") or part.get("value") or ""
                return str(part or "").strip()

            location_value = ", ".join(
                location_part(key)
                for key in ("addressLocality", "addressRegion", "addressCountry")
                if location_part(key)
                and location_part(key).casefold() not in {
                    "unavailable", "not available", "not specified",
                    "unknown", "n/a", "none",
                }
            )

    source_text = _clean_evidence_text(
        structured.get("description")
        or (state.evidence or {}).get("source_text")
        or state.markdown
    )[:12000]
    title = _strip_title_branding_suffix(str(
        structured.get("title")
        or _infer_rendered_job_title(state.extension_evidence or {})
        or state.metadata.get("title")
        or state.page_title
        or ""
    ).strip())
    hiring_org_name = str(hiring_org.get("name") or "").strip()
    company = str(
        (hiring_org_name if not _is_generic_ats_org_name(hiring_org_name) else "")
        or (state.extension_evidence or {}).get("company_hint")
        or _fallback_company_name(state, None)
        or "Not Specified"
    ).strip()

    # `occupationalCategory` classifies the role; it is not a skills field.
    # GitHub Careers commonly publishes the literal value "UNAVAILABLE"
    # here. Using it as a fallback made the skills list look non-empty and
    # prevented deterministic recovery from the actual description.
    raw_skills = structured.get("skills") or []
    if isinstance(raw_skills, str):
        raw_skills = re.split(r"\s*[,;|]\s*", raw_skills)
    explicit = _atomize_skill_labels(list(raw_skills or []))
    if not explicit:
        explicit = _deterministic_explicit_skills(source_text, state.markdown)

    responsibilities = _clean_evidence_items(structured.get("responsibilities"))
    if not responsibilities:
        responsibilities = _deterministic_section_items(state.markdown, "responsibilities")
    requirements = _clean_evidence_items([
        structured.get("qualifications"),
        structured.get("educationRequirements"),
        structured.get("experienceRequirements"),
    ])
    if not requirements:
        requirements = _deterministic_section_items(state.markdown, "requirements")
    preferred = _clean_evidence_items(structured.get("preferredQualifications"))
    if not preferred:
        preferred = _deterministic_section_items(state.markdown, "preferred")
    benefits = _clean_evidence_items(structured.get("jobBenefits"))
    if not benefits:
        benefits = _deterministic_section_items(state.markdown, "benefits")
    salary = _salary_from_structured(structured.get("baseSalary")) or parse_salary_from_text(
        f"{source_text} {state.markdown}"[:20000]
    )
    return ExtractedJob(
        job_title=title or None,
        company_name=company,
        company_domain=(urlparse(str(hiring_org.get("sameAs") or "")).hostname or None),
        location=(lambda value: None if not value or value.casefold() in {
            "unavailable", "not available", "not specified", "unknown", "n/a", "none"
        } else value)(_clean_evidence_text(location_value)),
        workplace_type=structured.get("jobLocationType") or "unknown",
        employment_type=structured.get("employmentType") or "unknown",
        description=source_text or None,
        responsibilities=responsibilities,
        requirements=requirements,
        preferred_qualifications=preferred,
        skills=explicit,
        suggested_skills=_suggested_skills_for(title, explicit),
        benefits=benefits,
        salary=salary,
        application_url=structured.get("url") or state.final_url or state.original_url,
        date_posted=structured.get("datePosted"),
        valid_through=structured.get("validThrough"),
        source_url=state.final_url or state.original_url,
    )

def extraction_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    evidence_payload_size = len(json.dumps(state.evidence, ensure_ascii=False, separators=(",", ":")))
    logger.info(
        "%s Extraction started request_id=%s evidence_bytes=%s "
        "evidence_source_text_length=%s jsonld_count=%s",
        LOG_PREFIX, state.request_id, evidence_payload_size,
        len((state.evidence or {}).get("source_text") or ""),
        len(state.jobposting_jsonld),
    )

    # The LLM is the primary organizer for every job page, including ones
    # with JobPosting JSON-LD -- JSON-LD's own `description` field is very
    # often a shortened/SEO-only summary that omits content the page renders
    # separately (a standalone "Required Skills" widget, a bulleted
    # requirements block assembled from multiple DOM nodes, etc.). This used
    # to skip the LLM entirely whenever JSON-LD merely had a title+description
    # (a very low bar most modern ATS platforms clear), silently downgrading
    # those postings to a ~50-word hardcoded skill dictionary
    # (_deterministic_explicit_skills) instead of real understanding of the
    # page. _deterministic_job_from_evidence is now reserved for its
    # original purpose: a bounded-latency fallback for when the LLM call
    # itself actually fails or times out, not a shortcut applied just because
    # structured data happens to exist.
    # Explicit product decision: a real, complete extraction is worth more
    # than a fast one, and no fixed budget was the right number -- 25s cut
    # off completions that were genuinely on their way; even 90s was still a
    # ceiling. Removed entirely: timeout_seconds=None below is passed through
    # deepseek_provider.py to the underlying HTTP client as an explicit "wait
    # indefinitely," not a big-but-finite number. deepseek_provider.py
    # already avoids the OTHER latency trap on its own (never re-pays this
    # same wait escalating to pro on a genuine timeout).
    def _call_llm():
        structured = get_llm(temperature=0).with_structured_output(
            ExtractedJob,
            timeout_seconds=None,
            # Confirmed still too tight at 4000 against real, very
            # content-rich postings (2026-08-08: a Disney VFX Sr Effects
            # Technical Director posting and a JPMC Oracle HCM posting, both
            # with long qualifications/responsibilities lists) -- production
            # logs showed "DeepSeek returned empty content" on BOTH the
            # json_object attempt and the prompt-enforced retry for the same
            # request, which is the signature of the model running out of
            # output budget before ever emitting a closing token, not a
            # transport glitch. Raised again with real headroom; DeepSeek's
            # context window comfortably supports this.
            max_tokens=8000,
            queue_timeout_seconds=max(
                0.5,
                float(os.getenv("JD_EXTRACTION_AI_QUEUE_TIMEOUT_SECONDS", "3")),
            ),
            # Correct extraction is preferable to silently returning a
            # dictionary/regex approximation. The provider first performs a
            # cheap same-model JSON retry, then escalates only if needed.
            escalate_on_error=True,
        )
        return structured.invoke([
            SystemMessage(content=EXTRACTION_PROMPT),
            HumanMessage(content=json.dumps(
                state.evidence,
                ensure_ascii=False,
                separators=(",", ":"),
            )),
        ])

    used_deterministic_extraction = False
    try:
        job = llm_cache.execute_with_cache(
            task="jd_agent_extraction",
            payload_to_fingerprint=state.evidence,
            llm_callable=_call_llm,
            expected_schema=ExtractedJob,
            prompt_version="jd-agent-v4-llm-primary"
        )
    except Exception as exc:
        # A prior version of this handler raised straight out of
        # extraction_agent on ANY LLM failure -- meaning a single transient
        # DeepSeek hiccup (confirmed real-world: "empty content" on both the
        # json_object attempt and the prompt-enforced retry for the exact
        # same request, 2026-08-08) turned into a hard failure for the whole
        # /jobs/extract-url request instead of a degraded-but-usable result.
        # The LLM is still tried first, with real retries and pro escalation
        # (see _call_llm above) -- this is a last-resort circuit breaker for
        # when it's genuinely unreachable, not a shortcut around it. Marking
        # used_deterministic_extraction lets reviewer_agent force one more
        # real LLM attempt via repair_agent before this is accepted as final
        # (see reviewer_agent below), so this path is rarely the end state.
        logger.warning(
            "%s LLM extraction failed; using deterministic evidence fallback "
            "request_id=%s error=%s",
            LOG_PREFIX, state.request_id, type(exc).__name__,
        )
        job = _deterministic_job_from_evidence(state)
        used_deterministic_extraction = True
    job_dict = ExtractedJob.model_validate(job).model_dump(mode="json")
    # _clean_evidence_items/_clean_evidence_text (BeautifulSoup-based) were
    # previously only wired into the deterministic JSON-LD path
    # (_deterministic_job_from_evidence) -- the LLM-extraction branch above
    # took its structured output verbatim, with no HTML-stripping safety net
    # at all. A source page whose JobPosting JSON-LD/evidence carries raw
    # WYSIWYG markup (Google-Docs-authored postings routinely do) could get
    # copied straight into responsibilities/requirements/preferred_qualifications
    # as literal "<p><strong>Required Qualifications:&nbsp;</strong></p>..."
    # text. This is a safe no-op on already-clean text (BeautifulSoup.get_text()
    # on plain text returns it unchanged), so it's applied unconditionally
    # regardless of which branch produced `job`.
    job_dict["responsibilities"] = _clean_evidence_items(job_dict.get("responsibilities"))
    job_dict["requirements"] = _clean_evidence_items(job_dict.get("requirements"))
    job_dict["preferred_qualifications"] = _clean_evidence_items(job_dict.get("preferred_qualifications"))
    # benefits was missed in the pass above -- the deterministic JSON-LD
    # path already cleaned it (_deterministic_job_from_evidence), but the
    # LLM-extraction branch never did, same gap as responsibilities/
    # requirements/preferred_qualifications had. job_title/company_name/
    # location were never cleaned in EITHER branch -- a WYSIWYG-authored
    # posting whose title/company/location carries inline markup (rare but
    # real, e.g. a company name with a trademark-symbol <sup> tag) would
    # display literal tag text. Not currently exploitable as stored XSS
    # (confirmed no dangerouslySetInnerHTML anywhere in the frontend --
    # React text nodes auto-escape), but still a real data-quality gap and
    # defense-in-depth for any future non-JSX consumer of these fields
    # (PDF templates, emails, anything that string-concatenates HTML).
    job_dict["benefits"] = _clean_evidence_items(job_dict.get("benefits"))
    for short_field in ("job_title", "company_name", "location"):
        if job_dict.get(short_field):
            job_dict[short_field] = _clean_evidence_text(job_dict[short_field])
    if job_dict.get("description"):
        job_dict["description"] = _clean_evidence_text(job_dict["description"])
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
        "page_type": "job_detail",
        "classification_confidence": 0.99 if not used_deterministic_extraction else 0.6,
        "classification_reasons": (
            ["LLM produced a schema-valid complete job record."]
            if not used_deterministic_extraction
            else ["LLM extraction failed; used deterministic evidence fallback."]
        ),
        "used_deterministic_extraction": used_deterministic_extraction,
        "execution_log": _event(
            state,
            "extraction",
            completed=True,
            via="deterministic" if used_deterministic_extraction else "llm",
            skills_count=len(job_dict.get("skills", [])),
            responsibilities_count=len(job_dict.get("responsibilities", [])),
            requirements_count=len(job_dict.get("requirements", [])),
        ),
    }


def _atomize_skill_labels(skills: list[str]) -> list[str]:
    """Split LLM-returned example phrases into atomic ATS labels."""
    atomic: list[str] = []
    seen: set[str] = set()
    placeholders = {
        "unavailable", "not available", "not specified", "unknown",
        "n/a", "na", "none", "null", "undefined", "-", "--",
    }
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
            if key in placeholders:
                continue
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
    fingerprint_payload = {
        "current_extraction": current_job.model_dump(mode="json"),
        "evidence": state.evidence,
    }

    def _call_llm():
        skill_model = get_llm(temperature=0).with_structured_output(SkillDecision)
        return skill_model.invoke([
            SystemMessage(content=SKILL_INTELLIGENCE_PROMPT),
            HumanMessage(content=json.dumps(
                fingerprint_payload,
                ensure_ascii=False,
                separators=(",", ":"),
            )),
        ])

    decision = llm_cache.execute_with_cache(
        task="jd_agent_skill_intelligence",
        payload_to_fingerprint=fingerprint_payload,
        llm_callable=_call_llm,
        expected_schema=SkillDecision,
        prompt_version="jd-agent-skill-v1",
    )
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


_GENERIC_ATS_ORG_NAME = re.compile(
    r"candidate experience|career\s*site|careers?\s*page|job\s*board|"
    r"talent\s*(?:community|network|acquisition)|recruiting\s*(?:site|portal)",
    re.I,
)
# Confirmed real-world case: an Oracle Cloud HCM posting's own JSON-LD
# hiringOrganization.name was literally "JPMC Candidate Experience page" --
# Oracle's own unconfigured template branding for the career-site product
# itself, not the employer, leaking into structured data we're otherwise
# meant to trust as authoritative. Rejecting it here lets company
# resolution fall through to _fallback_company_name instead of taking this
# generic phrase at face value.
def _is_generic_ats_org_name(name: str) -> bool:
    return bool(name) and bool(_GENERIC_ATS_ORG_NAME.search(name))


_TITLE_BRANDING_SUFFIX = re.compile(
    r"\s*[|\-–—]\s*(?:[A-Za-z0-9&.,' ]{1,40}\s+)?careers\s*$",
    re.I,
)
# Confirmed real-world case: a Google DeepMind posting's fallback title
# (used when no JSON-LD/structured title exists, so we resolve from the
# raw <title> tag) came back as "Research Scientist, Gemini Data, DeepMind
# — Google Careers" -- the site's own SEO branding suffix, verbatim.
def _strip_title_branding_suffix(title: str) -> str:
    return _TITLE_BRANDING_SUFFIX.sub("", title).strip()


def _fallback_company_name(state: JDState, current_company: str | None) -> str | None:
    if current_company and str(current_company).strip():
        return str(current_company).strip()
    hint = str(state.extension_evidence.get("company_hint") or "").strip()
    if hint:
        return hint
    page_title = str(state.extension_evidence.get("title") or state.metadata.get("title") or state.backend_page_title or "").strip()
    if page_title:
        parts = [p.strip() for p in re.split(r"\s+[|\-–—]\s+|\s+at\s+", page_title, flags=re.I) if p.strip()]
        candidates = [
            p for p in parts[1:]
            # Exact-segment match only caught "Careers" as a whole segment --
            # a segment merely CONTAINING an ATS/job-board word ("Careers at
            # Acme", "Acme Careers Portal") passed through unfiltered and was
            # returned verbatim as a fabricated company name. Now rejects any
            # candidate containing one of these words anywhere, not just an
            # exact match.
            if not any(word in p.casefold() for word in _ATS_HOST_LABELS)
        ]
        if candidates:
            return candidates[0]
    url = state.url or state.original_url
    if url:
        host = urlparse(url).hostname or ""
        host_parts = [p for p in host.lower().split(".") if p]
        # Company/tenant identity for an ATS-hosted URL is normally the
        # LEFTMOST (most specific) subdomain label -- "the second-to-last
        # label" only holds for a bare two-label domain. Confirmed
        # real-world case: jpmc.fa.oraclecloud.com has "jpmc" as the
        # actual tenant, but the old host_parts[-2] logic landed on
        # "oraclecloud" (the ATS's own domain, correctly filtered out as
        # a known label) and returned nothing -- silently losing the one
        # genuinely useful hint this URL carried. Walking left-to-right
        # and skipping known ATS labels plus common infra/connector
        # subdomains finds the tenant regardless of how many extra
        # subdomain levels a given platform inserts (unchanged for a
        # plain two-label host like "example.com": the leftmost label
        # was always "example" either way).
        generic_subdomains = {"www", "app", "fa", "my", "hire"}
        for part in host_parts[:-1]:
            if part not in _ATS_HOST_LABELS and part not in generic_subdomains:
                return part.capitalize()
    return None


def reviewer_agent(value: JDState | dict[str, Any]) -> dict[str, Any]:
    state = _state(value)
    job = ExtractedJob.model_validate(state.extracted_job or {})
    evidence_text = json.dumps(state.evidence, ensure_ascii=False).casefold()
    field_issues: dict[str, list[str]] = {}

    # extraction_agent never got a real LLM read on this page at all (see its
    # except branch) -- the deterministic evidence fallback can look
    # deceptively "complete" (it always fills company_name, skills,
    # suggested_skills from JSON-LD/keyword heuristics even for a role those
    # heuristics know nothing about, e.g. a VFX "Effects Technical Director"
    # falling into a generic 4-skill bucket) and would otherwise sail through
    # every check below untouched. Force exactly one real repair pass -- now
    # LLM-first, see repair_agent -- before this is ever accepted as final.
    if state.used_deterministic_extraction and state.repair_attempts < 1:
        field_issues["_extraction_source"] = [
            "Primary extraction never reached the LLM successfully; retry "
            "the full extraction via LLM before accepting this result."
        ]

    if not job.job_title:
        field_issues["job_title"] = ["Missing job title."]
    if not job.company_name:
        fallback = _fallback_company_name(state, job.company_name)
        if fallback:
            job.company_name = fallback
            if isinstance(state.extracted_job, dict):
                state.extracted_job["company_name"] = fallback
        elif state.repair_attempts >= 1 and job.job_title and (job.description or job.responsibilities):
            job.company_name = "Not Specified"
            if isinstance(state.extracted_job, dict):
                state.extracted_job["company_name"] = "Not Specified"
        else:
            field_issues["company_name"] = ["Missing company name."]
    if not job.description and not job.responsibilities:
        field_issues["description"] = ["Missing both description and responsibilities."]
    # A substantial description with zero responsibilities/requirements is the
    # "skills only" bug pattern: the LLM extraction branch (unlike the
    # deterministic JSON-LD path) had no check forcing it to actually populate
    # these lists, so a page that clearly has a "What You Will Be Doing" /
    # "Requirements" section could still come back with both empty and pass
    # review untouched. Trigger repair (a real LLM re-read of the same
    # evidence, see repair_agent) whenever there's real description text to
    # work with but nothing was extracted from it -- but only on the
    # FIRST pass (mirrors the repair_attempts-aware exception right above
    # for company_name). Confirmed real-world case (an Oracle Cloud HCM
    # posting): some JDs are written as one continuous paragraph with no
    # "Responsibilities"/"Requirements" headings at all -- a repair retry
    # against the SAME evidence can never find a structure that genuinely
    # isn't there, so re-flagging it after repair already tried and failed
    # once just escalates a real page straight to needs_manual_review
    # (success=False) instead of reaching final_response_agent's own
    # "partial" graceful-degradation path, which exists for exactly this
    # case but was unreachable because this check always fired first.
    if (
        len(job.description or "") > 200
        and not job.responsibilities
        and not job.requirements
        and state.repair_attempts < 1
    ):
        field_issues.setdefault("responsibilities", []).append(
            "Description has substantial content but responsibilities and requirements are both empty."
        )
        field_issues.setdefault("requirements", []).append(
            "Description has substantial content but responsibilities and requirements are both empty."
        )

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
            "The source contains skill signals but the LLM returned no explicit skills."
        )
    if len(job.suggested_skills) < 4:
        field_issues.setdefault("suggested_skills", []).append(
            "Provide 4-10 atomic, high-confidence skill recommendations inferred from "
            "the role, responsibilities, outcomes, seniority, and domain. Keep them "
            "separate from explicitly stated skills."
        )

    # The LLM path has no dedicated salary-completeness check today, so a
    # posting whose evidence clearly states a figure but whose LLM
    # extraction left salary null passed review untouched -- same class of
    # gap the skills-recovery block above exists to close, mirrored here.
    # Missing salary is valid when the source does not state one. Extraction
    # and repair remain LLM-owned; the reviewer never invents/re-parses it.

    repair_fields = list(field_issues)
    needs_repair = bool(repair_fields)
    review_issues = [
        issue
        for issues in field_issues.values()
        for issue in issues
    ]
    logger.info(
        "%s Schema/evidence reviewer completed request_id=%s valid=%s "
        "needs_repair=%s repair_fields=%s extracted_skills_count=%s issues=%s "
        "llm_calls_so_far=1",
        LOG_PREFIX,
        state.request_id,
        not needs_repair,
        needs_repair,
        repair_fields,
        len(job.skills),
        review_issues,
    )
    return {
        "extracted_job": job.model_dump(mode="json"),
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
    current = ExtractedJob.model_validate(state.extracted_job or {}).model_dump(mode="json")
    repair_prompt = (
        EXTRACTION_PROMPT
        + "\n\nThis is a schema repair pass. Re-read the complete evidence and return the "
          "entire corrected ExtractedJob JSON object. Correct only unsupported, missing, or "
          "misclassified fields; preserve already supported facts.\nREPAIR_FIELDS:\n"
        + json.dumps(state.repair_fields, ensure_ascii=False)
        + "\nVALIDATION_ISSUES:\n"
        + json.dumps(state.field_issues, ensure_ascii=False)
    )

    def _call_repair_llm():
        structured = get_llm(temperature=0).with_structured_output(
            ExtractedJob,
            timeout_seconds=None,
            max_tokens=8000,
            queue_timeout_seconds=max(
                0.5, float(os.getenv("JD_EXTRACTION_AI_QUEUE_TIMEOUT_SECONDS", "3"))
            ),
            # deepseek_provider.py itself never escalates to pro on a
            # genuine timeout regardless of this flag (see there) -- this
            # only still matters for non-timeout failures. When
            # extraction_agent already fell back to the deterministic path
            # (used_deterministic_extraction), skip even that: its own
            # _call_llm already tried this exact evidence once, so a second
            # blind attempt here is lower-value than just taking the
            # deterministic result and moving on.
            escalate_on_error=not state.used_deterministic_extraction,
        )
        return structured.invoke([
            SystemMessage(content=repair_prompt),
            HumanMessage(content=json.dumps({
                "current_extraction": current,
                "complete_evidence": state.evidence,
            }, ensure_ascii=False, separators=(",", ":"))),
        ])

    try:
        job = llm_cache.execute_with_cache(
            task="jd_agent_repair",
            payload_to_fingerprint={
                "evidence": state.evidence,
                "current": current,
                "repair_fields": state.repair_fields,
            },
            llm_callable=_call_repair_llm,
            expected_schema=ExtractedJob,
            prompt_version="jd-agent-repair-v2-llm-first",
        )
        job = ExtractedJob.model_validate(job).model_dump(mode="json")
        repair_via = "llm"
    except Exception as exc:
        # This call previously had no fallback at all -- a repair-stage LLM
        # failure (both flash attempts AND the pro escalation exhausted, or a
        # hard timeout) propagated straight out of repair_agent as an
        # unhandled exception, turning what used to be a graceful
        # deterministic degradation into a full 500 for the whole
        # /jobs/extract-url request. The LLM is still the primary repair
        # path (see _call_repair_llm above); this is strictly a last-resort
        # safety net for when it's genuinely unreachable, not a shortcut.
        logger.warning(
            "%s LLM repair failed; using deterministic evidence fallback "
            "request_id=%s attempt=%s error=%s",
            LOG_PREFIX, state.request_id, attempt, type(exc).__name__,
        )
        evidence_fallback = _deterministic_job_from_evidence(state).model_dump(mode="json")
        job = dict(current)
        for field in state.repair_fields:
            if field == "suggested_skills" or not job.get(field):
                job[field] = evidence_fallback.get(field)
        job = ExtractedJob.model_validate(job).model_dump(mode="json")
        repair_via = "deterministic"

    if not job.get("company_name"):
        fallback_company = _fallback_company_name(state, job.get("company_name"))
        if fallback_company:
            job["company_name"] = fallback_company
    job["skills"] = _atomize_skill_labels(job.get("skills", []))
    explicit_keys = {skill.casefold() for skill in job["skills"]}
    job["suggested_skills"] = [
        skill for skill in _atomize_skill_labels(job.get("suggested_skills", []))
        if skill.casefold() not in explicit_keys
    ]
    logger.info(
        "%s Repair completed request_id=%s attempt=%s fields=%s via=%s "
        "skills_before=%s skills_after=%s suggested_skills_after=%s "
        "repaired_skills=%s repaired_suggested_skills=%s",
        LOG_PREFIX,
        state.request_id,
        attempt,
        state.repair_fields,
        repair_via,
        len((state.extracted_job or {}).get("skills", [])),
        len(job.get("skills", [])),
        len(job.get("suggested_skills", [])),
        job.get("skills", [])[:50],
        job.get("suggested_skills", [])[:50],
    )
    return {
        "extracted_job": job, "repair_attempts": attempt, "needs_repair": False,
        "execution_log": _event(state, "repair", attempt=attempt, fields=state.repair_fields, via=repair_via),
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
    extracted = state.extracted_job if state.page_type == "job_detail" else None
    missing_fields = []
    if extracted:
        missing_fields = [
            field for field in ("job_title", "company_name", "description")
            if not extracted.get(field)
        ]
        # A "skills only" extraction (real description text, but both
        # responsibilities and requirements empty) previously passed as
        # status="extracted" -- indistinguishable from a genuinely complete
        # result -- which meant /jobs/extract-url's success-gated Redis cache
        # (see api/v1/jobs.py) could cache and serve this sparse result to
        # every subsequent user for 24h. Downgrading to "partial" here lets
        # that cache write be skipped for exactly this case.
        if (
            len(extracted.get("description") or "") > 200
            and not extracted.get("responsibilities")
            and not extracted.get("requirements")
        ):
            missing_fields.append("responsibilities")
    if extracted and not state.needs_manual_review:
        status_name = "partial" if state.extraction_readiness == "PARTIAL" or missing_fields else "extracted"
        success = True
        error = None
        public_page_type = state.page_type
    elif state.needs_manual_review or state.extraction_readiness == "MANUAL_REVIEW":
        status_name = "manual_review"
        success = False
        public_page_type = state.page_type or "unknown"
        error = {
            "code": "MANUAL_REVIEW_REQUIRED",
            "message": "The available evidence is conflicting or incomplete and requires review.",
        }
    elif (
        state.page_access_status == "fully_blocked"
        or state.extraction_readiness == "BLOCKED"
        or state.blocked_reason
    ):
        status_name = "blocked"
        success = False
        public_page_type = "unknown"
        restricted_details = [
            details for details in state.source_restrictions.values()
            if details.get("restriction_type")
        ]
        strongest_restriction = max(
            restricted_details,
            key=lambda details: float(details.get("confidence") or 0),
            default={},
        )
        effective = (
            strongest_restriction.get("restriction_type")
            or state.blocked_reason
            or "unknown_restriction"
        )
        error = {
            "code": "PAGE_BLOCKED",
            "message": "The page could not be inspected using the available evidence sources.",
        }
    elif state.page_type == "job_list":
        status_name = "selection_required"
        success = False
        public_page_type = "job_list"
        effective = None
        error = {
            "code": "JOB_SELECTION_REQUIRED",
            "message": "Open or select a specific job before extracting.",
        }
    elif state.page_type == "non_job":
        status_name = "non_job"
        success = False
        public_page_type = "non_job"
        effective = None
        error = {
            "code": "NON_JOB_PAGE",
            "message": "The current page does not contain an extractable job description.",
        }
    else:
        status_name = "insufficient_evidence"
        success = False
        public_page_type = state.page_type or "unknown"
        effective = None
        error = state.error or {
            "code": "INSUFFICIENT_EVIDENCE",
            "message": "The available evidence is insufficient for job extraction.",
        }
    if status_name not in {"blocked"}:
        effective = None
    response = {
        "success": success, "status": status_name, "request_id": state.request_id,
        "page_type": public_page_type,
        "page_access_status": state.page_access_status or "unknown",
        "readiness": state.extraction_readiness,
        "classification_confidence": state.classification_confidence,
        "classification_reasons": state.classification_reasons,
        "extracted_job": extracted, "review_issues": state.review_issues,
        "needs_manual_review": state.needs_manual_review,
        "selected_source": state.primary_source or state.selected_evidence_source,
        "source_selection_reason": state.source_selection_reason,
        "supplementary_sources": state.supplementary_sources,
        "excluded_sources": state.excluded_sources,
        "warnings": state.planner_warnings,
        "missing_fields": missing_fields,
        "restriction": effective,
        "execution_summary": {
            "portal": state.detected_portal, "browser_attempts": state.browser_attempts,
            "repair_attempts": state.repair_attempts, "duration_ms": duration,
            "surface_type": state.surface_type,
            "extraction_readiness": state.extraction_readiness,
            "restriction_type": state.restriction_type,
            "evidence_sources_discovered": state.evidence_sources_discovered,
            "selected_evidence_source": state.selected_evidence_source,
            "source_scores": state.source_scores,
            "page_access_status": state.page_access_status,
            "primary_source": state.primary_source,
            "source_selection_reason": state.source_selection_reason,
            "supplementary_sources": state.supplementary_sources,
            "excluded_sources": state.excluded_sources,
            "source_restrictions": state.source_restrictions,
            "selected_job_detected": state.selected_job_detected,
            "conflicts": state.evidence_conflicts,
            "planner_warnings": state.planner_warnings,
            "final_status": status_name,
        },
    }
    if error:
        response["error"] = error
    # Temporary shape aliases consumed by the existing review/tailoring UI.
    response.update({
        "pageType": response["page_type"], "confidence": response["classification_confidence"],
        "hasValidJobDescription": bool(success and extracted and state.is_valid and not state.needs_manual_review),
        "job": _compat_job(extracted) if extracted else None,
        "reason": "; ".join(state.classification_reasons),
    })
    logger.info(
        "%s Final response request_id=%s success=%s status=%s page_type=%s "
        "page_access=%s readiness=%s primary=%s excluded=%s skills_count=%s "
        "ui_required_skills_count=%s duration_ms=%s",
        LOG_PREFIX,
        state.request_id,
        success,
        status_name,
        response["page_type"],
        response["page_access_status"],
        response["readiness"],
        response["selected_source"],
        response["excluded_sources"],
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
    if hasattr(salary, "model_dump"):
        salary = salary.model_dump()
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
    elif salary is None:
        salary_display = ""
    else:
        salary_display = str(salary)

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
