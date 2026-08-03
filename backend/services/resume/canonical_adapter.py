"""Deterministic adapter between legacy parsed structures and CanonicalResumeSnapshot."""

from __future__ import annotations

import copy
import uuid
from typing import Any, Dict, List

from schemas.canonical_resume import (
    CanonicalHeader,
    CanonicalItem,
    CanonicalJobContext,
    CanonicalLink,
    CanonicalResumeSnapshot,
    CanonicalSection,
    calculate_content_hash,
)
from services.resume.renderable import project_renderable_resume


def build_canonical_snapshot(
    resume_data: Dict[str, Any],
    resume_id: str = "",
    job_context: Dict[str, Any] | None = None,
    content_version_id: str | None = None,
) -> CanonicalResumeSnapshot:
    """Convert any legacy dictionary or RenderableResume into a CanonicalResumeSnapshot."""
    data = copy.deepcopy(resume_data or {})
    renderable = project_renderable_resume(data)

    # 1. Header
    personal = renderable.get("personal_info") or {}
    links: List[CanonicalLink] = []
    
    if personal.get("linkedin"):
        links.append(CanonicalLink(platform="linkedin", url=personal["linkedin"], label="LinkedIn"))
    if personal.get("github"):
        links.append(CanonicalLink(platform="github", url=personal["github"], label="GitHub"))
    if personal.get("website"):
        links.append(CanonicalLink(platform="website", url=personal["website"], label="Portfolio"))
    
    for link_obj in renderable.get("candidate_links") or []:
        if isinstance(link_obj, dict) and link_obj.get("url"):
            links.append(CanonicalLink(
                platform=link_obj.get("platform") or "website",
                url=link_obj["url"],
                label=link_obj.get("label") or link_obj.get("platform") or "Link",
                owner_type="candidate"
            ))

    header = CanonicalHeader(
        full_name=personal.get("name") or data.get("name") or "",
        headline=personal.get("job_title") or personal.get("title") or "",
        email=personal.get("email") or "",
        phone=personal.get("phone") or "",
        location=personal.get("location") or "",
        links=links
    )

    # 2. Sections
    sections: List[CanonicalSection] = []
    raw_order = renderable.get("section_order") or data.get("section_order") or [
        "summary", "education", "experience", "skills", "projects",
        "certifications", "achievements", "volunteer_experience",
        "publications", "languages", "awards", "interests"
    ]
    section_order: List[str] = []

    # Summary
    summary_text = renderable.get("summary") or data.get("summary") or ""
    if summary_text and isinstance(summary_text, str) and summary_text.strip():
        sections.append(CanonicalSection(
            id="summary",
            type="text",
            display_heading="Summary",
            order=len(sections),
            items=[CanonicalItem(id="summary_item", description=summary_text.strip())],
            custom_content=summary_text.strip()
        ))
        section_order.append("summary")

    # Experience
    exp_list = renderable.get("experience") or data.get("experience") or []
    if exp_list:
        items = []
        for idx, item in enumerate(exp_list):
            if not isinstance(item, dict):
                continue
            desc = item.get("description") or []
            bullets = [desc] if isinstance(desc, str) else list(desc)
            items.append(CanonicalItem(
                id=f"exp_{idx}",
                title=item.get("role") or item.get("title") or "",
                subtitle=item.get("company") or item.get("organization") or "",
                location=item.get("location") or "",
                start_date=item.get("start_date") or "",
                end_date=item.get("end_date") or "",
                bullets=bullets,
                metadata=item
            ))
        if items:
            sections.append(CanonicalSection(
                id="experience",
                type="structured_list",
                display_heading="Experience",
                order=len(sections),
                items=items
            ))
            section_order.append("experience")

    # Projects
    proj_list = renderable.get("projects") or data.get("projects") or []
    if proj_list:
        items = []
        for idx, item in enumerate(proj_list):
            if not isinstance(item, dict):
                continue
            desc = item.get("description") or []
            bullets = [desc] if isinstance(desc, str) else list(desc)
            tech = item.get("technology_stack") or item.get("technologies") or []
            skills = [tech] if isinstance(tech, str) else list(tech)
            proj_links = []
            if item.get("link") or item.get("url"):
                url = item.get("link") or item.get("url")
                proj_links.append(CanonicalLink(platform="website", url=url, label="Project Link", owner_type="project"))
            items.append(CanonicalItem(
                id=f"proj_{idx}",
                title=item.get("name") or item.get("title") or "",
                subtitle=item.get("role") or "",
                bullets=bullets,
                skills=skills,
                links=proj_links,
                metadata=item
            ))
        if items:
            sections.append(CanonicalSection(
                id="projects",
                type="structured_list",
                display_heading="Projects",
                order=len(sections),
                items=items
            ))
            section_order.append("projects")

    # Education
    edu_list = renderable.get("education") or data.get("education") or []
    if edu_list:
        items = []
        for idx, item in enumerate(edu_list):
            if not isinstance(item, dict):
                continue
            degree_field = " in ".join(filter(None, [item.get("degree"), item.get("field_of_study")]))
            items.append(CanonicalItem(
                id=f"edu_{idx}",
                title=degree_field or item.get("degree") or "",
                subtitle=item.get("institution") or item.get("school") or "",
                location=item.get("location") or "",
                start_date=item.get("start_date") or "",
                end_date=item.get("end_date") or "",
                description=f"GPA: {item['gpa']}" if item.get("gpa") else "",
                metadata=item
            ))
        if items:
            sections.append(CanonicalSection(
                id="education",
                type="structured_list",
                display_heading="Education",
                order=len(sections),
                items=items
            ))
            section_order.append("education")

    # Skills
    skills_cat = renderable.get("skills_categories") or data.get("skills_categories") or {}
    skills_list = renderable.get("skills") or data.get("skills") or []
    if skills_cat or skills_list:
        sections.append(CanonicalSection(
            id="skills",
            type="categorized_skills",
            display_heading="Skills",
            order=len(sections),
            items=[CanonicalItem(id="skills_item", skills=skills_list)],
            custom_content=skills_cat if skills_cat else {"Skills": skills_list}
        ))
        section_order.append("skills")

    # Certifications
    cert_list = renderable.get("certifications") or data.get("certifications") or []
    if cert_list:
        items = []
        for idx, item in enumerate(cert_list):
            is_str = isinstance(item, str)
            title = item if is_str else (item.get("title") or item.get("name") or "")
            issuer = "" if is_str else (item.get("issuing_organization") or item.get("issuer") or item.get("authority") or "")
            date = "" if is_str else (item.get("issue_date") or item.get("date") or item.get("year") or "")
            items.append(CanonicalItem(
                id=f"cert_{idx}",
                title=title,
                subtitle=issuer,
                date_display=date,
                metadata={} if is_str else item
            ))
        if items:
            sections.append(CanonicalSection(
                id="certifications",
                type="structured_list",
                display_heading="Certifications",
                order=len(sections),
                items=items
            ))
            section_order.append("certifications")

    # Achievements
    ach_list = renderable.get("achievements") or data.get("achievements") or []
    if ach_list:
        items = []
        for idx, item in enumerate(ach_list):
            is_str = isinstance(item, str)
            title = item if is_str else (item.get("title") or item.get("name") or "")
            desc = "" if is_str else (item.get("description") or item.get("summary") or "")
            date = "" if is_str else (item.get("date") or item.get("year") or "")
            items.append(CanonicalItem(
                id=f"ach_{idx}",
                title=title,
                description=desc,
                date_display=date,
                metadata={} if is_str else item
            ))
        if items:
            sections.append(CanonicalSection(
                id="achievements",
                type="structured_list",
                display_heading="Achievements",
                order=len(sections),
                items=items
            ))
            section_order.append("achievements")

    # Reorder section_order according to raw_order where present
    ordered_ids = [sid for sid in raw_order if sid in section_order]
    for sid in section_order:
        if sid not in ordered_ids:
            ordered_ids.append(sid)

    c_version_id = content_version_id or f"cv_{uuid.uuid4().hex[:12]}"
    
    snapshot = CanonicalResumeSnapshot(
        resume_id=resume_id or data.get("id") or "",
        source_resume_id=data.get("source_resume_id") or resume_id or "",
        source_version_id=data.get("source_version_id"),
        tailored_version_id=data.get("tailored_version_id"),
        content_version_id=c_version_id,
        content_hash="",
        job_context=CanonicalJobContext.model_validate(job_context or data.get("job_context") or {}),
        header=header,
        summary=summary_text,
        sections=sections,
        section_order=ordered_ids,
        custom_sections=data.get("custom_sections") or [],
        user_preferences=data.get("user_preferences") or {},
        provenance=data.get("provenance") or {}
    )
    snapshot.content_hash = snapshot.generate_hash()
    return snapshot


def canonical_to_dict(snapshot: CanonicalResumeSnapshot) -> Dict[str, Any]:
    """Convert CanonicalResumeSnapshot back to legacy dict structure for backward compatibility."""
    data: Dict[str, Any] = {
        "id": snapshot.resume_id,
        "content_version_id": snapshot.content_version_id,
        "content_hash": snapshot.content_hash,
        "schema_version": snapshot.schema_version,
        "personal_info": {
            "name": snapshot.header.full_name,
            "job_title": snapshot.header.headline,
            "email": snapshot.header.email,
            "phone": snapshot.header.phone,
            "location": snapshot.header.location,
            "linkedin": next((l.url for l in snapshot.header.links if l.platform == "linkedin"), ""),
            "github": next((l.url for l in snapshot.header.links if l.platform == "github"), ""),
            "website": next((l.url for l in snapshot.header.links if l.platform in ("website", "portfolio")), ""),
        },
        "summary": snapshot.summary or "",
        "section_order": snapshot.section_order,
        "custom_sections": snapshot.custom_sections,
    }

    for section in snapshot.sections:
        if section.id == "experience":
            exp_items = []
            for item in section.items:
                exp_items.append({
                    "role": item.title,
                    "company": item.subtitle,
                    "location": item.location,
                    "start_date": item.start_date,
                    "end_date": item.end_date,
                    "description": item.bullets if item.bullets else [item.description] if item.description else []
                })
            data["experience"] = exp_items
        elif section.id == "projects":
            proj_items = []
            for item in section.items:
                proj_items.append({
                    "name": item.title,
                    "role": item.subtitle,
                    "technology_stack": item.skills,
                    "link": next((l.url for l in item.links if l.url), ""),
                    "description": item.bullets if item.bullets else [item.description] if item.description else []
                })
            data["projects"] = proj_items
        elif section.id == "education":
            edu_items = []
            for item in section.items:
                edu_items.append({
                    "degree": item.title,
                    "institution": item.subtitle,
                    "location": item.location,
                    "start_date": item.start_date,
                    "end_date": item.end_date,
                    "gpa": item.description.replace("GPA: ", "") if item.description.startswith("GPA: ") else ""
                })
            data["education"] = edu_items
        elif section.id == "skills":
            if isinstance(section.custom_content, dict):
                data["skills_categories"] = section.custom_content
                all_skills = []
                for sk_list in section.custom_content.values():
                    if isinstance(sk_list, list):
                        all_skills.extend(sk_list)
                data["skills"] = list(dict.fromkeys(all_skills))
            elif section.items and section.items[0].skills:
                data["skills"] = section.items[0].skills
        elif section.id == "certifications":
            cert_items = []
            for item in section.items:
                cert_items.append({
                    "title": item.title,
                    "name": item.title,
                    "issuing_organization": item.subtitle,
                    "issuer": item.subtitle,
                    "issue_date": item.date_display,
                    "date": item.date_display
                })
            data["certifications"] = cert_items
        elif section.id == "achievements":
            ach_items = []
            for item in section.items:
                ach_items.append({
                    "title": item.title,
                    "name": item.title,
                    "description": item.description,
                    "date": item.date_display
                })
            data["achievements"] = ach_items

    return data
