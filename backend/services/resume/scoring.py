import re
import json
from difflib import SequenceMatcher
from typing import Dict, Any, List, Set, Optional
from schemas.resume import ResumeStructure
from schemas.jobs import JobAnalysis

class ATSScoringEngine:
    # v1.2.2 invalidates filtered cache entries so every user-selected section
    # receives the AI-generated review suggestions again.
    ENGINE_VERSION = "v1.2.2"

    @classmethod
    def calculate_score(cls, resume: ResumeStructure, job: JobAnalysis) -> Dict[str, Any]:
        """
        Deterministically calculates the Resume Match Score (%) and the ATS Score (0-100).
        """
        # Prepare search texts and clean sets
        resume_skills = set(s.lower().strip() for s in (resume.skills or []))
        for cat, skills in (resume.skills_categories or {}).items():
            if isinstance(skills, list):
                resume_skills.update(s.lower().strip() for s in skills)

        resume_text = cls._get_resume_text_corpus(resume)
        resume_text_clean = cls._clean_text(resume_text)

        matched_skills = 0
        matched_keywords = 0

        # ----------------------------------------------------
        # PART 1: RESUME MATCH SCORE (%) COMPONENTS
        # ----------------------------------------------------

        # A. Skills Match (20% weight)
        jd_skills = set(s.lower().strip() for s in (job.required_skills or []))
        if not jd_skills and job.skills_categories:
            for cat, skills in job.skills_categories.items():
                if isinstance(skills, list):
                    jd_skills.update(s.lower().strip() for s in skills)

        if not jd_skills:
            skills_score = 100.0
        else:
            matched_skills = sum(1 for skill in jd_skills if skill in resume_skills or cls._clean_text(skill) in resume_text_clean)
            skills_score = (matched_skills / len(jd_skills)) * 100.0

        # B. Keyword Relevance (20% weight)
        jd_keywords = set(k.lower().strip() for k in (job.ats_keywords or []))
        jd_keywords.update(k.lower().strip() for k in (job.keywords or []))
        if not jd_keywords:
            jd_keywords = jd_skills

        if not jd_keywords:
            keyword_score = 100.0
        else:
            matched_keywords = sum(1 for kw in jd_keywords if cls._clean_text(kw) in resume_text_clean)
            keyword_score = (matched_keywords / len(jd_keywords)) * 100.0

        # C. Experience Alignment (20% weight)
        required_years = cls._parse_required_years(job)
        candidate_years = cls._calculate_candidate_years(resume)
        if required_years == 0:
            experience_score = 100.0 if len(resume.experience or []) > 0 else 50.0
        else:
            if not resume.experience:
                experience_score = 0.0
            else:
                experience_score = min(100.0, (candidate_years / required_years) * 100.0)

        # D. Role Similarity (15% weight)
        role_similarity_score = 0.0
        jd_title_words = set(
            w for w in re.findall(r"\b[a-zA-Z0-9+#.]+\b", (job.title or "").lower())
            if w not in ["and", "or", "of", "in", "the", "a", "an", "for", "with", "to", "at", "by"]
        )
        if not jd_title_words:
            role_similarity_score = 100.0
        else:
            prev_titles = [str(exp.role or "").lower() for exp in (resume.experience or [])]
            if prev_titles:
                max_match = 0
                for title in prev_titles:
                    matched = sum(1 for w in jd_title_words if w in title)
                    ratio = (matched / len(jd_title_words)) * 100.0
                    if ratio > max_match:
                        max_match = ratio
                role_similarity_score = max_match

        # E. Project Relevance (10% weight)
        projects = resume.projects or []
        if not projects:
            projects_score = 0.0
        else:
            relevant_projects = 0
            for p in projects:
                proj_text = " ".join(p.description or []).lower()
                if any(s in proj_text for s in jd_skills) or any(k in proj_text for k in jd_keywords):
                    relevant_projects += 1
            projects_score = (relevant_projects / len(projects)) * 100.0

        # F. Education Fit (10% weight)
        education = resume.education or []
        if not education:
            education_score = 0.0
        else:
            education_score = 80.0
            jd_qual_text = " ".join(job.qualifications or []).lower()
            candidate_degrees = " ".join(edu.degree or "" for edu in education).lower()
            degree_keywords = ["bachelor", "master", "phd", "bs", "ms", "ph.d", "btech", "mtech"]
            for dk in degree_keywords:
                if dk in candidate_degrees and dk in jd_qual_text:
                    education_score = 100.0
                    break

        # G. Certification Relevance (5% weight)
        certifications = resume.certifications or []
        if not certifications:
            cert_relevance_score = 0.0
        else:
            cert_relevance_score = 100.0

        resume_match_score = round(
            (skills_score * 0.20) +
            (keyword_score * 0.20) +
            (experience_score * 0.20) +
            (role_similarity_score * 0.15) +
            (projects_score * 0.10) +
            (education_score * 0.10) +
            (cert_relevance_score * 0.05)
        )
        resume_match_score = max(0, min(100, resume_match_score))

        # ----------------------------------------------------
        # PART 2: ATS SCORE (0-100) COMPONENTS
        # ----------------------------------------------------

        # A. ATS Parseability (15% weight)
        parseability_score = 100.0
        missing_sections = 0
        if not resume.personal_info: missing_sections += 1
        if not resume.experience: missing_sections += 1
        if not resume.education: missing_sections += 1
        if not resume.skills: missing_sections += 1
        parseability_score = max(0.0, 100.0 - (missing_sections * 25.0))

        # B. Keyword Optimization (15% weight)
        if not jd_keywords:
            kw_opt_score = 100.0
        else:
            matched_opt = sum(1 for kw in jd_keywords if kw in (resume.summary or "").lower() or kw in resume_skills)
            kw_opt_score = (matched_opt / len(jd_keywords)) * 100.0

        # C. Required Skills Coverage (15% weight)
        if not jd_skills:
            skills_cov_score = 100.0
        else:
            matched_cov = sum(1 for skill in jd_skills if skill in resume_skills)
            skills_cov_score = (matched_cov / len(jd_skills)) * 100.0

        # D. Formatting & Action Verbs (15% weight)
        action_verbs = {
            "developed", "built", "managed", "designed", "created", "led", "optimized",
            "implemented", "engineered", "collaborated", "reduced", "increased", "saved",
            "achieved", "delivered", "coordinated", "analyzed", "resolved", "spearheaded",
            "directed", "formulated", "established", "tailored", "pioneered", "refactored"
        }
        bullets = []
        for exp in (resume.experience or []):
            bullets.extend(exp.description or [])
        for proj in (resume.projects or []):
            bullets.extend(proj.description or [])

        if not bullets:
            action_verbs_score = 100.0
        else:
            starting_with_verb = 0
            for b in bullets:
                words = re.findall(r"\b[a-zA-Z]+\b", b.strip().lower())
                if words and words[0] in action_verbs:
                    starting_with_verb += 1
            action_verbs_score = (starting_with_verb / len(bullets)) * 100.0

        # E. Section Completeness (10% weight)
        completeness_score = 0.0
        info = resume.personal_info
        if info:
            if info.email: completeness_score += 30.0
            if info.phone: completeness_score += 30.0
            if info.linkedin or info.github or info.website: completeness_score += 40.0

        # F. Readability (10% weight)
        if not bullets:
            readability_score = 100.0
        else:
            good_bullets = sum(1 for b in bullets if 30 <= len(b.strip()) <= 180)
            readability_score = (good_bullets / len(bullets)) * 100.0

        # G. Measurable Impact (10% weight)
        if not bullets:
            impact_score = 100.0
        else:
            has_metrics = sum(1 for b in bullets if re.search(r"\b\d+\b|%|\$", b))
            impact_score = min(100.0, (has_metrics / max(1, len(bullets) // 2)) * 100.0)

        # H. Overall Optimization (10% weight)
        total_jd_metrics = len(jd_skills) + len(jd_keywords)
        if total_jd_metrics == 0:
            overall_opt_score = 100.0
        else:
            total_matched = matched_skills + matched_keywords
            overall_opt_score = (total_matched / total_jd_metrics) * 100.0

        ats_score = round(
            (parseability_score * 0.15) +
            (kw_opt_score * 0.15) +
            (skills_cov_score * 0.15) +
            (action_verbs_score * 0.15) +
            (completeness_score * 0.10) +
            (readability_score * 0.10) +
            (impact_score * 0.10) +
            (overall_opt_score * 0.10)
        )
        duplicate_issues = []
        duplicate_penalty = 0
        ats_score = max(0, min(100, ats_score))

        return {
            "resume_match_score": resume_match_score,
            "ats_score": ats_score,
            "breakdown": {
                "resume_match": {
                    "Skills Match": round(skills_score),
                    "Keyword Relevance": round(keyword_score),
                    "Experience Alignment": round(experience_score),
                    "Role Similarity": round(role_similarity_score),
                    "Project Relevance": round(projects_score),
                    "Education Fit": round(education_score),
                    "Certification Relevance": round(cert_relevance_score)
                },
                "ats_optimization": {
                    "ATS Parseability": round(parseability_score),
                    "Keyword Optimization": round(kw_opt_score),
                    "Required Skills Coverage": round(skills_cov_score),
                    "Formatting & Action Verbs": round(action_verbs_score),
                    "Section Completeness": round(completeness_score),
                    "Readability": round(readability_score),
                    "Measurable Impact": round(impact_score),
                    "Overall Optimization": round(overall_opt_score)
                    ,"Content Originality": max(0, 100 - duplicate_penalty * 2)
                }
            },
            "quality_issues": duplicate_issues,
            "quality_penalty": duplicate_penalty,
        }

    @classmethod
    def _duplicate_content_issues(cls, resume: ResumeStructure) -> List[Dict[str, Any]]:
        records: List[tuple[str, str]] = []
        if resume.summary:
            records.append(("summary", resume.summary))
        for section in ("experience", "projects"):
            for item_index, item in enumerate(getattr(resume, section, []) or []):
                for bullet_index, bullet in enumerate(item.description or []):
                    records.append((f"{section}.{item_index}.description.{bullet_index}", bullet))
        for section in ("achievements", "certifications"):
            for index, item in enumerate(getattr(resume, section, []) or []):
                text = item if isinstance(item, str) else " ".join(
                    str(value) for value in item.model_dump().values() if value
                )
                records.append((f"{section}.{index}", text))

        normalized = [
            (path, re.sub(r"[^a-z0-9]+", " ", str(text).lower()).strip(), str(text).strip())
            for path, text in records
            if len(str(text).strip()) >= 24
        ]
        issues: List[Dict[str, Any]] = []
        for left_index, (left_path, left, left_text) in enumerate(normalized):
            for right_path, right, right_text in normalized[left_index + 1:]:
                if not left or not right:
                    continue
                exact = left == right
                similarity = SequenceMatcher(None, left, right).ratio()
                containment = min(len(left), len(right)) >= 35 and (
                    left in right or right in left
                )
                if exact or containment or similarity >= 0.88:
                    issues.append({
                        "code": "REPEATED_CONTENT",
                        "kind": "exact" if exact or containment else "near",
                        "paths": [left_path, right_path],
                        "similarity": round(similarity, 2),
                        "message": (
                            f"Repeated content detected between {left_path} and {right_path}: "
                            f"“{left_text[:90]}”"
                        ),
                    })
        return issues[:8]

    @classmethod
    def apply_suggestions(cls, resume: ResumeStructure, suggestions: List[Dict[str, Any]], target_statuses: Set[str]) -> ResumeStructure:
        """
        Applies suggestions that match the target statuses to a copy of the resume structure.
        """
        copied = resume.model_copy(deep=True)
        for sug in suggestions:
            status = sug.get("status", "pending")
            if status not in target_statuses:
                continue

            sec = sug.get("sectionType")
            suggested_val = sug.get("suggested")
            if not suggested_val:
                continue

            if sec == "summary":
                copied.summary = suggested_val
            elif sec == "skills":
                skill_name = sug.get("skillName") or suggested_val.replace("Add skill: ", "").strip()
                skill_name = skill_name.strip()
                if skill_name and skill_name not in copied.skills:
                    copied.skills.append(skill_name)
            elif sec in ("experience", "projects"):
                item_idx = sug.get("itemIndex")
                bullet_idx = sug.get("bulletIndex")
                if item_idx is not None and bullet_idx is not None:
                    items = getattr(copied, sec, [])
                    if 0 <= item_idx < len(items):
                        bullets = items[item_idx].description
                        if 0 <= bullet_idx < len(bullets):
                            bullets[bullet_idx] = suggested_val
        return copied

    @classmethod
    def _clean_text(cls, text: str) -> str:
        return re.sub(r"[^a-z0-9+#.]+", " ", str(text or "").lower()).strip()

    @classmethod
    def _get_resume_text_corpus(cls, resume: ResumeStructure) -> str:
        parts = [
            resume.summary,
            resume.raw_text or "",
            json.dumps([item.model_dump() for item in resume.experience], default=str),
            json.dumps([item.model_dump() for item in resume.projects], default=str),
            json.dumps(resume.skills, default=str),
            json.dumps(resume.skills_categories or {}, default=str),
            json.dumps([item.model_dump() for item in resume.certifications], default=str),
            json.dumps(resume.achievements, default=str),
        ]
        return " ".join(parts)

    @classmethod
    def _parse_required_years(cls, job: JobAnalysis) -> float:
        search_text = " ".join([
            job.experience_required,
            " ".join(job.qualifications or []),
            " ".join(job.responsibilities or [])
        ]).lower()
        
        matches = re.findall(r"\b(\d{1,2})\+?\s+years?\b", search_text)
        if matches:
            return float(max(int(m) for m in matches))
        return 0.0

    @classmethod
    def _calculate_candidate_years(cls, resume: ResumeStructure) -> float:
        total_years = 0.0
        current_year = 2026 # Context reference timestamp is July 2026
        
        experience_items = (resume.experience or [])
        # We can also add internships if present
        if hasattr(resume, "internships") and resume.internships:
            experience_items = list(experience_items) + list(resume.internships)
            
        for item in experience_items:
            start_date = str(item.start_date or "").strip()
            end_date = str(item.end_date or "").strip()
            
            # Simple regex to extract 4 digit year
            start_years = re.findall(r"\b(19|20)\d{2}\b", start_date)
            start_yr = int(start_years[0]) if start_years else None
            
            if not start_yr:
                continue
                
            end_yr = current_year
            if end_date and not any(term in end_date.lower() for term in ["present", "current", "now"]):
                end_years = re.findall(r"\b(19|20)\d{2}\b", end_date)
                if end_years:
                    end_yr = int(end_years[0])
            
            duration = max(0.5, float(end_yr - start_yr))
            total_years += duration
            
        return total_years
