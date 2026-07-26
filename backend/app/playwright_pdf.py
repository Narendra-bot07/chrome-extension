import os
from io import BytesIO
from typing import Optional
from urllib.parse import urlencode
from pypdf import PdfReader
from playwright.sync_api import sync_playwright

PDF_RENDERER_URL = (
    os.environ.get("PDF_RENDERER_URL")
    or os.environ.get("FRONTEND_URL")
    or "http://127.0.0.1:8000/__pdf_renderer/index.html"
).rstrip("/")

def _open_renderer(page, route: str, query: Optional[dict] = None):
    fragment = f"#/{route.lstrip('/')}"
    if query:
        fragment += f"?{urlencode(query)}"
    separator = "" if PDF_RENDERER_URL.lower().endswith(".html") else "/"
    url = f"{PDF_RENDERER_URL}{separator}{fragment}"
    try:
        response = page.goto(url, wait_until="domcontentloaded", timeout=15000)
    except Exception as exc:
        raise RuntimeError(
            f"PDF renderer is unavailable at {PDF_RENDERER_URL}. "
            "Restart the backend after building frontend/dist, or set PDF_RENDERER_URL to a reachable frontend origin."
        ) from exc
    if response and response.status >= 400:
        raise RuntimeError(f"PDF renderer returned HTTP {response.status} at {url}")
    return response

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
            
            # Handle a configured Vite server 504 by reloading if necessary.
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
                    summary: ["summary", "professional summary"],
                    education: ["education"],
                    experience: ["experience", "work experience"],
                    skills: ["skills"],
                    projects: ["projects"],
                    certifications: ["certifications", "certs"],
                    achievements: ["achievements", "achievements / awards", "awards"],
                    volunteer: ["volunteer", "leadership / volunteering", "volunteering"],
                    publications: ["publications", "publications / research", "research"],
                    languages: ["languages"]
                };
                const renderedHeadings = Array.from(document.querySelectorAll(".section-title, .sidebar-title, .title-bold"))
                    .map(el => (el.textContent || "").trim().toLowerCase())
                    .filter(Boolean);
                for (const section of expectedSections) {
                    const el = document.querySelector(`[data-section="${section}"]`);
                    const aliases = sectionHeadingAliases[section] || [section];
                    const hasHeading = renderedHeadings.some(heading => aliases.includes(heading));
                    if (!el && !hasHeading) {
                        missingSections.push(section);
                    }
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
                const normalizedHref = value => String(value || '')
                    .replace(/^https?:\\/\\//i, '')
                    .replace(/^www\\./i, '')
                    .replace(/[?#].*$/, '')
                    .replace(/\\/+$/, '')
                    .toLowerCase();
                const renderedAnchors = Array.from(printContainer?.querySelectorAll('a[href]') || []);
                const missingEmbeddedLinks = sourceLinkValues.filter(value =>
                    !renderedAnchors.some(anchor =>
                        normalizedHref(anchor.getAttribute('href')) === normalizedHref(value)
                    )
                );
                if (missingEmbeddedLinks.length > 0) {
                    return {
                        valid: false,
                        error: `Professional hyperlinks were not embedded: ${missingEmbeddedLinks.join(', ')}`
                    };
                }
                const headerAnchors = Array.from(
                    printContainer?.querySelectorAll('[data-contact-links="true"] a[href]') || []
                );
                const linkWithoutIcon = headerAnchors.find(anchor => {
                    const href = anchor.getAttribute('href') || '';
                    return /linkedin|github|leetcode|portfolio|smartinterview|drive\\.google/i.test(href)
                        && !anchor.querySelector('svg');
                });
                if (linkWithoutIcon) {
                    return { valid: false, error: 'A professional header link is missing its monochrome icon.' };
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
            if pdf_page_count != planned_page_count:
                raise ValueError(
                    f"Preview and PDF pagination differed (PDF={pdf_page_count}, Plan={planned_page_count}); "
                    "the export was blocked so it can be recomposed safely."
                )

            import hashlib
            import json
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


def render_cover_letter_artifact(
    render_payload_json: str,
    paper_size: str = "A4",
) -> tuple[bytes, int]:
    """Render the single PDF artifact used by both preview and download."""
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
            )
            page = browser.new_page()
            _open_renderer(page, "print-cover-letter")
            page.evaluate(
                "data => { window.__INJECTED_COVER_LETTER_DATA__ = JSON.parse(data); }",
                render_payload_json,
            )
            page.evaluate("window.dispatchEvent(new Event('coverLetterDataReady'));")
            page.wait_for_function(
                "() => document.querySelector('#resume-print-container') !== null",
                timeout=10000,
            )
            page.evaluate("document.fonts.ready")
            pdf_bytes = page.pdf(
                format=paper_size,
                print_background=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                prefer_css_page_size=True,
            )
            page_count = len(PdfReader(BytesIO(pdf_bytes)).pages)
            browser.close()
            return pdf_bytes, page_count
    except Exception:
        import traceback
        traceback.print_exc()
        raise
