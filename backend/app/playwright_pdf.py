import os
import json
import re
import hashlib
import threading
import functools
from io import BytesIO
from typing import Optional
from urllib.parse import urlencode
from pypdf import PdfReader
from playwright.sync_api import sync_playwright

# main.py binds Uvicorn to Render's dynamically-injected $PORT (hardcoding
# 8000 there "only works by coincidence of platform configuration" per its
# own comment) -- this self-referential renderer URL must track the same
# port, or it silently tries to connect to a port nothing is listening on
# in production and every PDF render fails with net::ERR_CONNECTION_REFUSED.
_BACKEND_PORT = os.environ.get("PORT", "8000")
PDF_RENDERER_URL = (
    os.environ.get("PDF_RENDERER_URL")
    or f"http://127.0.0.1:{_BACKEND_PORT}/__pdf_renderer/index.html"
).rstrip("/")

# Each render launches a full, separate headless Chromium process. On a
# memory-constrained host, concurrent renders (e.g. a user's browser retrying
# a failed export) can stack up enough Chromium instances to exceed the
# container's memory limit and get the whole process OOM-killed -- which
# takes down every in-flight request, not just the PDF one. Serializing
# renders bounds worst-case memory to one browser at a time.
_PDF_RENDER_LOCK = threading.Lock()


def _serialize_pdf_render(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        with _PDF_RENDER_LOCK:
            return func(*args, **kwargs)
    return wrapper


class HyperlinkRenderingError(Exception):
    """Raised when hyperlink annotations fail during Playwright PDF rendering."""
    pass


def _renderer_candidates() -> list[str]:
    """PDF rendering is independent from the public/dev frontend origin."""
    configured = PDF_RENDERER_URL
    backend_static = f"http://127.0.0.1:{_BACKEND_PORT}/__pdf_renderer/index.html"
    candidates = [configured, backend_static]
    # Keep the public frontend as a last-resort compatibility path only. A
    # stopped Vite server must not block the backend-served production build.
    frontend_url = str(os.environ.get("FRONTEND_URL") or "").rstrip("/")
    if frontend_url:
        candidates.append(frontend_url)
    return list(dict.fromkeys(candidate for candidate in candidates if candidate))


def _open_renderer(page, route: str, query: Optional[dict] = None):
    fragment = f"#/{route.lstrip('/')}"
    if query:
        fragment += f"?{urlencode(query)}"
    failures = []
    for candidate in _renderer_candidates():
        separator = "" if candidate.lower().endswith(".html") else "/"
        url = f"{candidate}{separator}{fragment}"
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=8000)
            if response and response.status >= 400:
                failures.append(f"{url} returned HTTP {response.status}")
                continue
            return response
        except Exception as exc:
            failures.append(f"{url}: {exc}")
    raise RuntimeError(
        "PDF renderer is unavailable. Tried the backend production build and "
        f"configured frontend origins. {' | '.join(failures)}"
    )

@_serialize_pdf_render
def generate_pdf_via_playwright(resume_json_str: str, template_name: str) -> Optional[bytes]:
    """
    Spins up a headless Chromium browser using Playwright's sync API, 
    navigates to the React app's print route, injects data, and generates a PDF.
    This avoids asyncio loop conflicts with Uvicorn on Windows.
    """
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
            )
            page = browser.new_page()
            response = _open_renderer(page, "print", {"template": template_name, "format": "a4"})
            if response and response.status == 504:
                page.wait_for_timeout(1000)
                page.reload(wait_until="domcontentloaded")
            
            # Inject JSON safely
            page.evaluate("data => { window.__INJECTED_RESUME_DATA__ = JSON.parse(data); }", resume_json_str)
            page.evaluate("window.dispatchEvent(new Event('resumeDataReady'));")
            
            # Wait for React to mount, run the Auto-Fit engine, and finish compression
            try:
                page.wait_for_selector("#resume-print-ready", timeout=12000)
            except Exception:
                # If it times out, the validation script below will catch exactly what is missing
                pass
                
            page.wait_for_timeout(200)
            page.evaluate("document.fonts.ready")
            
            # Rendering Validation
            validation_script = """
            () => {
                const data = window.__INJECTED_RESUME_DATA__;
                if (!data) return { valid: true }; // Skip if no data
                
                const defaultSectionOrder = [
                    "summary",
                    "education",
                    "experience",
                    "skills",
                    "projects",
                    "certifications",
                    "achievements",
                    "volunteer",
                    "publications",
                    "languages",
                    "awards",
                    "interests"
                ];
                // section_order is presentation order, never a deletion list.
                const shouldRender = () => true;
                const printContainer = document.querySelector("#resume-print-container");
                const compressionClass = Array.from(printContainer?.classList || [])
                    .find(className => className.startsWith("print-compression-level-"));
                const compressionLevel = compressionClass
                    ? Number(compressionClass.replace("print-compression-level-", ""))
                    : 0;
                const expectedSections = [];
                if (shouldRender("summary") && data.summary && data.summary.trim() !== '') expectedSections.push("summary");
                if (shouldRender("experience") && data.experience && data.experience.length > 0) expectedSections.push("experience");
                if (shouldRender("projects") && data.projects && data.projects.length > 0) expectedSections.push("projects");
                if (shouldRender("education") && data.education && data.education.length > 0) expectedSections.push("education");
                if (shouldRender("skills") && data.skills && data.skills.length > 0) expectedSections.push("skills");
                if (shouldRender("certifications") && data.certifications && data.certifications.length > 0) expectedSections.push("certifications");
                if (shouldRender("achievements") && data.achievements && data.achievements.length > 0) expectedSections.push("achievements");
                if (shouldRender("languages") && data.languages && data.languages.length > 0) expectedSections.push("languages");
                if (shouldRender("awards") && data.awards && data.awards.length > 0) expectedSections.push("awards");
                if (shouldRender("volunteer") && data.volunteer_experience && data.volunteer_experience.length > 0) expectedSections.push("volunteer");
                if (shouldRender("publications") && data.publications && data.publications.length > 0) expectedSections.push("publications");
                
                const missingSections = [];
                const sectionHeadingAliases = {
                    summary: ["summary", "professional summary", "executive summary", "profile", "about me"],
                    education: ["education", "academic background"],
                    experience: ["experience", "work experience", "professional experience", "employment history"],
                    skills: ["skills", "technical skills", "core competencies", "skills & expertise"],
                    projects: ["projects", "technical projects", "portfolio of most relevant projects", "key projects"],
                    certifications: ["certifications", "certs", "certifications & licenses"],
                    achievements: ["achievements", "achievements / awards", "awards", "memberships & achievements"],
                    volunteer: ["volunteer", "leadership / volunteering", "volunteering", "extracurricular activities"],
                    publications: ["publications", "publications / research", "research"],
                    languages: ["languages", "language proficiencies"]
                };
                const renderedHeadings = Array.from(document.querySelectorAll(".section-title, .sidebar-title, .title-bold, h2, h3, [data-section] h2, [data-section] h3"))
                    .map(el => (el.textContent || "").trim().toLowerCase())
                    .filter(Boolean);
                for (const section of expectedSections) {
                    const el = document.querySelector(`[data-section="${section}"]`);
                    const aliases = sectionHeadingAliases[section] || [section];
                    const hasHeading = renderedHeadings.some(heading => aliases.some(alias => heading.includes(alias)));
                    if (!el && !hasHeading) {
                        missingSections.push(section);
                    }
                }
                if (missingSections.length > 0) {
                    console.warn(`[PLAYWRIGHT-PDF] Section markers warning: ${missingSections.join(', ')}`);
                }

                const visibleText = printContainer?.innerText || "";
                const visibleRawUrls = visibleText.match(/(?:https?:\\/\\/|www\\.)\\S+/gi) || [];
                if (visibleRawUrls.length > 0) {
                    return {
                        valid: false,
                        error: `Raw URLs are visible instead of embedded professional labels: ${visibleRawUrls.join(', ')}`
                    };
                }
                const sourceLinkValues = [
                    data.personal_info?.linkedin,
                    data.personal_info?.github,
                    data.personal_info?.website,
                    data.portfolio,
                    ...Object.values(data.links || {}),
                    ...Object.values(data.personal_info?.coding_profiles || {})
                ].filter(Boolean);
                const normalizedHref = (value, fieldHint) => {
                    let raw = String(value || '').trim().toLowerCase()
                        .replace(/^https?:\\/\\//i, '')
                        .replace(/^www\\./i, '')
                        .replace(/[?#].*$/, '')
                        .replace(/\\/+$/, '');
                    if (!raw) return '';
                    if (!raw.includes('.')) {
                        if (fieldHint === 'linkedin' || String(value).includes('linkedin')) {
                            return `linkedin.com/in/${raw}`;
                        }
                        if (fieldHint === 'github' || String(value).includes('github')) {
                            return `github.com/${raw}`;
                        }
                    }
                    if (raw.includes('linkedin.com') && !raw.includes('/in/') && !raw.includes('/pub/')) {
                        const parts = raw.split('linkedin.com/');
                        if (parts[1]) raw = `linkedin.com/in/${parts[1]}`;
                    }
                    return raw;
                };
                const rootEl = printContainer || document.body;
                const renderedAnchors = Array.from(rootEl.querySelectorAll('a[href]') || []);
                const renderedText = (rootEl.innerText || '').toLowerCase();
                const hiddenComponents = new Set(data.layout_model?.hidden_components || data.hidden_components || []);
                const missingEmbeddedLinks = sourceLinkValues.filter(value => {
                    const hint = (value === data.personal_info?.linkedin) ? 'linkedin' : (value === data.personal_info?.github ? 'github' : '');
                    if (hint && hiddenComponents.has(hint)) return false;
                    const norm = normalizedHref(value, hint);
                    if (!norm) return false;
                    const hasAnchor = renderedAnchors.some(anchor => {
                        const attrHref = normalizedHref(anchor.getAttribute('href'), '');
                        const propHref = normalizedHref(anchor.href, '');
                        return attrHref === norm || propHref === norm || (attrHref && (attrHref.includes(norm) || norm.includes(attrHref))) || (propHref && (propHref.includes(norm) || norm.includes(propHref)));
                    });
                    const slug = norm.split('/').filter(Boolean).pop() || '';
                    const hasText = renderedText.includes(norm) || (slug.length >= 3 && renderedText.includes(slug));
                    return !hasAnchor && !hasText;
                });
                if (missingEmbeddedLinks.length > 0) {
                    console.warn(`[PLAYWRIGHT-PDF] Hyperlinks omitted or formatted differently: ${missingEmbeddedLinks.join(', ')}`);
                }
                
                if (missingSections.length > 0) {
                    return { valid: false, error: `Missing sections in rendered HTML DOM: ${missingSections.join(', ')}. The template skipped rendering them or they were cut off.` };
                }
                return { valid: true };
            }
            """
            
            val_result = page.evaluate(validation_script)
            if not val_result.get("valid"):
                raise ValueError(f"Rendering Validation Failed: {val_result.get('error')}")
            
            final_composition_plan = page.evaluate(
                "() => window.__FINAL_COMPOSITION_PLAN__ || null"
            )
            if not final_composition_plan:
                raise ValueError("The renderer did not produce a final composition plan.")
            validation_report = final_composition_plan.get("validation_report") or {}
            if not validation_report.get("valid"):
                raise ValueError("The measured resume composition did not pass validation.")

            # Get the exact height of the resume container in pixels to enforce exact A4 scaling
            resume_height = page.evaluate("document.querySelector('#resume-print-container') ? document.querySelector('#resume-print-container').offsetHeight : 0")
            print(f"Playwright measured resume height: {resume_height}px")

            pdf_args = {
                "format": "A4",
                "print_background": True,
                "margin": {"top": "0", "right": "0", "bottom": "0", "left": "0"}
            }
            
            pdf_bytes = page.pdf(**pdf_args)
            pdf_page_count = len(PdfReader(BytesIO(pdf_bytes)).pages)
            planned_page_count = int(final_composition_plan.get("page_count") or 0)
            if (
                pdf_page_count > planned_page_count
                and resume_height > 1115
            ):
                # A forced section boundary can compound with Chromium's
                # natural pagination and add a blank/partial extra page.
                # Overflowing documents already have a physical boundary, so
                # remove only composition-owned breaks and render once more.
                removed_breaks = page.evaluate(
                    """
                    () => {
                      const nodes = Array.from(
                        document.querySelectorAll('[data-composition-break="final-plan"]')
                      );
                      nodes.forEach(node => {
                        node.style.breakBefore = '';
                        node.style.pageBreakBefore = '';
                        delete node.dataset.compositionBreak;
                      });
                      return nodes.length;
                    }
                    """
                )
                if removed_breaks:
                    pdf_bytes = page.pdf(**pdf_args)
                    pdf_page_count = len(PdfReader(BytesIO(pdf_bytes)).pages)
                if pdf_page_count > planned_page_count:
                    # Keep normal entries indivisible. Only when that rule has
                    # physically produced an unnecessary extra page, allow
                    # experience/project entries to split at their LI bullet
                    # boundaries; individual bullets remain indivisible.
                    page.evaluate(
                        """
                        () => {
                          const root = document.querySelector('#resume-print-container');
                          if (root) root.dataset.controlledEntrySplits = 'true';
                        }
                        """
                    )
                    pdf_bytes = page.pdf(**pdf_args)
                    pdf_page_count = len(PdfReader(BytesIO(pdf_bytes)).pages)
                    if pdf_page_count == planned_page_count:
                        final_composition_plan.setdefault(
                            "optimization_actions", []
                        ).append("controlled_split_at_bullet_boundaries")
                        final_composition_plan.setdefault(
                            "validation_report", {}
                        )["controlled_entry_splits"] = True
            if pdf_page_count != planned_page_count:
                raise ValueError(
                    f"Preview and PDF pagination differed (PDF={pdf_page_count}, Plan={planned_page_count}); "
                    "the export was blocked so it can be recomposed safely."
                )

            import hashlib
            render_hash = hashlib.sha256(pdf_bytes).hexdigest()
            plan_copy = dict(final_composition_plan)
            plan_copy["render_hash"] = render_hash
            measurement_bytes = json.dumps({
                "page_count": pdf_page_count,
                "density": plan_copy.get("density"),
                "section_positions": plan_copy.get("section_positions"),
                "page_breaks": plan_copy.get("page_breaks"),
                "resume_height": resume_height,
            }, sort_keys=True).encode("utf-8")
            measurement_hash = hashlib.sha256(measurement_bytes).hexdigest()
            plan_copy["measurement_hash"] = measurement_hash

            browser.close()
            return pdf_bytes, plan_copy, render_hash, measurement_hash
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise e

@_serialize_pdf_render
def generate_cover_letter_pdf_via_playwright(cover_letter_json_str: str) -> Optional[bytes]:
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"]
            )
            page = browser.new_page()
            
            _open_renderer(page, "print-cover-letter")
            
            page.evaluate("data => { window.__INJECTED_COVER_LETTER_DATA__ = JSON.parse(data); }", cover_letter_json_str)
            page.evaluate("window.dispatchEvent(new Event('coverLetterDataReady'));")
            
            page.wait_for_timeout(500)
            page.evaluate("document.fonts.ready")
            
            # If the cover letter fits in 1 page, enforce exactly page 1
            cl_height = page.evaluate("document.querySelector('#resume-print-container') ? document.querySelector('#resume-print-container').offsetHeight : 0")
            
            pdf_args = {
                "format": "A4",
                "print_background": True,
                "margin": {"top": "0", "right": "0", "bottom": "0", "left": "0"}
            }
            if cl_height > 0 and cl_height <= 1130:
                pdf_args["page_ranges"] = "1"
                
            pdf_bytes = page.pdf(**pdf_args)
            
            browser.close()
            return pdf_bytes
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise e


@_serialize_pdf_render
def render_cover_letter_artifact(
    render_payload_json: str,
    paper_size: str = "A4",
) -> tuple[bytes, int, dict]:
    """Render the single PDF artifact used by both preview and download."""
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
            )
            viewport = (
                {"width": 816, "height": 1056}
                if paper_size == "Letter"
                else {"width": 794, "height": 1123}
            )
            page = browser.new_page(viewport=viewport, device_scale_factor=1)
            page.emulate_media(media="print")
            _open_renderer(page, "print-cover-letter")
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
            page.evaluate(
                "data => { window.__INJECTED_COVER_LETTER_DATA__ = JSON.parse(data); }",
                render_payload_json,
            )
            page.evaluate("window.dispatchEvent(new Event('coverLetterDataReady'));")
            page.wait_for_function(
                "() => document.querySelector('#resume-print-container') !== null",
                timeout=10000,
            )
            page.evaluate("""async () => {
                if (document.fonts?.ready) await document.fonts.ready;
                await Promise.all(Array.from(document.images).map(image => {
                    if (image.complete) return Promise.resolve();
                    return new Promise(resolve => {
                        image.onload = resolve;
                        image.onerror = resolve;
                    });
                }));
                await new Promise(resolve =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))
                );
            }""")
            preflight = page.evaluate("""() => {
                const root = document.querySelector('#resume-print-container');
                const content = root?.querySelector('[data-cover-letter-content="true"]');
                const plan = window.__INJECTED_COVER_LETTER_DATA__?.composition_plan;
                const rootRect = root?.getBoundingClientRect();
                const contentRect = content?.getBoundingClientRect();
                const rootStyle = root ? getComputedStyle(root) : null;
                const contentStyle = content ? getComputedStyle(content) : null;
                const horizontalMarginsPx = (
                    Number(plan?.margins?.left_mm || 0)
                    + Number(plan?.margins?.right_mm || 0)
                ) * 96 / 25.4;
                const printableWidth = Math.max(
                    1, (rootRect?.width || innerWidth) - horizontalMarginsPx
                );
                return {
                    width_utilization: (contentRect?.width || 0) / printableWidth,
                    body_font_pt: parseFloat(rootStyle?.fontSize || '0') * 72 / 96,
                    transform: rootStyle?.transform || 'none',
                    zoom: parseFloat(rootStyle?.zoom || '1'),
                    content_max_width: contentStyle?.maxWidth || 'none',
                    horizontal_overflow: Boolean(root && (
                        root.scrollWidth > root.clientWidth + 1
                    ))
                };
            }""")
            preflight_errors = []
            if preflight["width_utilization"] < 0.92:
                preflight_errors.append("content width utilization is below 92%")
            if preflight["body_font_pt"] < 9.5:
                preflight_errors.append("body font is below 9.5pt")
            if preflight["transform"] != "none" or preflight["zoom"] != 1:
                preflight_errors.append("document scaling is not 1")
            if preflight["content_max_width"] != "none":
                preflight_errors.append("content root has a max-width constraint")
            if preflight["horizontal_overflow"]:
                preflight_errors.append("document overflows horizontally")
            if preflight_errors:
                raise ValueError(
                    "Cover letter DOM preflight failed: "
                    + "; ".join(preflight_errors)
                )
            pdf_bytes = page.pdf(
                format=paper_size,
                print_background=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                prefer_css_page_size=True,
                scale=1,
            )
            page_count = len(PdfReader(BytesIO(pdf_bytes)).pages)
            metrics = page.evaluate("""pages => {
                const root = document.querySelector('#resume-print-container');
                const header = root?.querySelector('[data-cover-letter-header="true"]');
                const content = root?.querySelector('[data-cover-letter-content="true"]');
                const rootRect = root?.getBoundingClientRect();
                const headerRect = header?.getBoundingClientRect();
                const contentRect = content?.getBoundingClientRect();
                const plan = window.__INJECTED_COVER_LETTER_DATA__?.composition_plan;
                const blocks = Array.from(content?.children || []);
                const overlap = blocks.some((block, index) => {
                    if (!index) return false;
                    const previous = blocks[index - 1].getBoundingClientRect();
                    const current = block.getBoundingClientRect();
                    return current.top < previous.bottom - 0.5;
                });
                const rootStyle = root ? getComputedStyle(root) : null;
                const contentStyle = content ? getComputedStyle(content) : null;
                const pageHeight = innerHeight;
                const topMarginMm = Number(plan?.margins?.top_mm || 0);
                const bottomMarginPx = Number(plan?.margins?.bottom_mm || 0) * 96 / 25.4;
                const printableHeight = Math.max(
                    1,
                    pageHeight - (
                        topMarginMm + Number(plan?.margins?.bottom_mm || 0)
                    ) * 96 / 25.4
                );
                const occupiedHeight = contentRect && headerRect
                    ? contentRect.bottom - headerRect.top
                    : contentRect?.height || 0;
                return {
                    viewport: {
                        width: innerWidth,
                        height: innerHeight,
                        device_scale_factor: devicePixelRatio,
                        dpi: 96 * devicePixelRatio
                    },
                    fonts_loaded: document.fonts?.status === 'loaded',
                    page_width_px: innerWidth,
                    page_height_px: pageHeight,
                    printable_width_px: Math.max(
                        1,
                        (rootRect?.width || innerWidth)
                        - (
                            Number(plan?.margins?.left_mm || 0)
                            + Number(plan?.margins?.right_mm || 0)
                        ) * 96 / 25.4
                    ),
                    content_width_px: contentRect?.width || 0,
                    width_utilization: (contentRect?.width || 0) / Math.max(
                        1,
                        (rootRect?.width || innerWidth)
                        - (
                            Number(plan?.margins?.left_mm || 0)
                            + Number(plan?.margins?.right_mm || 0)
                        ) * 96 / 25.4
                    ),
                    content_height_px: contentRect?.height || 0,
                    occupied_height_px: occupiedHeight,
                    printable_height_px: printableHeight,
                    vertical_utilization: occupiedHeight / printableHeight,
                    header_height_px: header?.getBoundingClientRect().height || 0,
                    top_whitespace_px:
                        Number(plan?.margins?.top_mm || 0) * 96 / 25.4,
                    bottom_whitespace_px: contentRect
                        ? Math.max(0, pageHeight - contentRect.bottom - bottomMarginPx)
                        : pageHeight,
                    body_font_pt: parseFloat(rootStyle?.fontSize || '0') * 72 / 96,
                    line_height_px: parseFloat(rootStyle?.lineHeight || '0'),
                    left_margin_mm: Number(plan?.margins?.left_mm || 0),
                    right_margin_mm: Number(plan?.margins?.right_mm || 0),
                    page_count: pages,
                    clipped: Boolean(root && (
                        root.scrollWidth > root.clientWidth + 1
                        || root.scrollHeight > pages * pageHeight + 1
                    )),
                    overlap,
                    scale_transform: Boolean(
                        rootStyle?.transform && rootStyle.transform !== 'none'
                    ),
                    zoom: parseFloat(rootStyle?.zoom || '1'),
                    document_scale: 1,
                    content_has_max_width: contentStyle?.maxWidth !== 'none',
                    horizontal_overflow: Boolean(root && (
                        root.scrollWidth > root.clientWidth + 1
                    )),
                    physical_page: {
                        width: rootRect?.width || 0,
                        height: rootRect?.height || 0,
                        paper_size: plan?.paper_size || ''
                    },
                    content_block_count: blocks.length
                };
            }""", page_count)
            browser.close()
            return pdf_bytes, page_count, metrics
    except Exception:
        import traceback
        traceback.print_exc()
        raise
