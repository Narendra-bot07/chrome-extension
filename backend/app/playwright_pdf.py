import os
from typing import Optional
from playwright.sync_api import sync_playwright

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

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
            
            url = f"{FRONTEND_URL}/#/print?template={template_name}&format=a4"
            
            # Handle Vite dev server 504 by reloading if necessary
            response = page.goto(url, wait_until="domcontentloaded")
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
                const configuredSectionOrder = Array.isArray(data.section_order) && data.section_order.length > 0
                    ? data.section_order
                    : defaultSectionOrder;
                const shouldRender = (section) => configuredSectionOrder.includes(section);
                const printContainer = document.querySelector("#resume-print-container");
                const compressionClass = Array.from(printContainer?.classList || [])
                    .find(className => className.startsWith("print-compression-level-"));
                const compressionLevel = compressionClass
                    ? Number(compressionClass.replace("print-compression-level-", ""))
                    : 0;
                const prunedByAutoFit = (section) => {
                    if (compressionLevel >= 5 && ["certifications", "achievements", "awards", "publications"].includes(section)) return true;
                    if (compressionLevel >= 4 && ["volunteer", "languages"].includes(section)) return true;
                    return false;
                };

                const expectedSections = [];
                if (shouldRender("summary") && !prunedByAutoFit("summary") && data.summary && data.summary.trim() !== '') expectedSections.push("summary");
                if (shouldRender("experience") && !prunedByAutoFit("experience") && data.experience && data.experience.length > 0) expectedSections.push("experience");
                if (shouldRender("projects") && !prunedByAutoFit("projects") && data.projects && data.projects.length > 0) expectedSections.push("projects");
                if (shouldRender("education") && !prunedByAutoFit("education") && data.education && data.education.length > 0) expectedSections.push("education");
                if (shouldRender("skills") && !prunedByAutoFit("skills") && data.skills && data.skills.length > 0) expectedSections.push("skills");
                if (shouldRender("certifications") && !prunedByAutoFit("certifications") && data.certifications && data.certifications.length > 0) expectedSections.push("certifications");
                if (shouldRender("achievements") && !prunedByAutoFit("achievements") && data.achievements && data.achievements.length > 0) expectedSections.push("achievements");
                if (shouldRender("languages") && !prunedByAutoFit("languages") && data.languages && data.languages.length > 0) expectedSections.push("languages");
                if (shouldRender("awards") && !prunedByAutoFit("awards") && data.awards && data.awards.length > 0) expectedSections.push("awards");
                if (shouldRender("volunteer") && !prunedByAutoFit("volunteer") && data.volunteer_experience && data.volunteer_experience.length > 0) expectedSections.push("volunteer");
                if (shouldRender("publications") && !prunedByAutoFit("publications") && data.publications && data.publications.length > 0) expectedSections.push("publications");
                
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
                
                if (missingSections.length > 0) {
                    return { valid: false, error: `Missing sections in rendered HTML DOM: ${missingSections.join(', ')}. The template skipped rendering them or they were cut off.` };
                }
                return { valid: true };
            }
            """
            
            val_result = page.evaluate(validation_script)
            if not val_result.get("valid"):
                raise ValueError(f"Rendering Validation Failed: {val_result.get('error')}")
            
            # Get the exact height of the resume container in pixels to enforce exact A4 scaling
            resume_height = page.evaluate("document.querySelector('#resume-print-container') ? document.querySelector('#resume-print-container').offsetHeight : 0")
            print(f"Playwright measured resume height: {resume_height}px")
            
            pdf_args = {
                "format": "A4",
                "print_background": True,
                "margin": {"top": "0", "right": "0", "bottom": "0", "left": "0"}
            }
            
            # If the content fits within one A4 page, generate EXACTLY page 1 to prevent extra blank pages
            # At 96 DPI, A4 is 1122px tall.
            if resume_height > 0 and resume_height <= 1130:
                pdf_args["page_ranges"] = "1"
                
            pdf_bytes = page.pdf(**pdf_args)
            
            browser.close()
            return pdf_bytes
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
            
            url = f"{FRONTEND_URL}/#/print-cover-letter"
            page.goto(url, wait_until="networkidle")
            
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
