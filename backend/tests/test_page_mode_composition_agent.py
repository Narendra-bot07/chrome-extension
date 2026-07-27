import copy
import hashlib
import json

from services.resume.composition_agent import PageMode, compose_resume_layout


def _resume(entries=2, bullets=3):
    return {
        "personal_info": {"name": "Ada Lovelace", "email": "ada@example.com"},
        "summary": "Platform engineer focused on reliable distributed systems.",
        "experience": [
            {
                "company": f"Company {index}",
                "role": "Engineer",
                "description": [
                    "Designed and delivered measurable production improvements across distributed systems. " * 2
                    for _ in range(bullets)
                ],
            }
            for index in range(entries)
        ],
        "projects": [{"name": "Compiler", "description": ["Built a deterministic compiler pipeline."]}],
        "skills": ["Python", "PostgreSQL", "Kubernetes", "Terraform"],
        "education": [{"institution": "Example University", "degree": "BSc"}],
        "certifications": [{"title": "Cloud Architecture"}],
    }


def test_auto_selects_one_page_for_normal_content():
    plan = compose_resume_layout(_resume(entries=1, bullets=1), page_mode="auto")
    assert plan.requested_mode == PageMode.AUTO
    assert plan.page_count == 1


def test_auto_selects_two_pages_for_genuinely_long_content():
    plan = compose_resume_layout(_resume(entries=10, bullets=6), page_mode="auto")
    assert plan.page_count == 2


def test_one_page_compacts_without_mutating_content_and_obeys_limits():
    resume = _resume(entries=3, bullets=4)
    before = copy.deepcopy(resume)
    plan = compose_resume_layout(resume, page_mode="prefer_one_page")
    assert resume == before
    assert plan.applied_optimizations
    assert plan.spacing_profile["body_font_pt"] >= 8.5
    assert plan.spacing_profile["line_height"] >= 1.05
    assert plan.spacing_profile["margin_top_mm"] >= 8
    assert plan.spacing_profile["margin_left_mm"] >= 10


def test_one_page_reports_unsafe_instead_of_unreadable_output():
    plan = compose_resume_layout(_resume(entries=14, bullets=8), page_mode="one_page")
    assert plan.page_count == 2
    assert plan.status == "ONE_PAGE_UNSAFE"
    assert "readability" in plan.reason
    assert plan.safe_limits_reached


def test_two_pages_intentionally_redistributes_and_avoids_education_orphan():
    plan = compose_resume_layout(_resume(entries=4, bullets=3), page_mode="prefer_two_pages")
    assert plan.page_count == 2
    assert set(plan.page_assignment.values()) == {1, 2}
    page_two = [section for section, page in plan.page_assignment.items() if page == 2]
    assert page_two != ["education"]
    assert len(plan.page_utilization) == 2


def test_explicit_order_and_repeated_runs_are_deterministic():
    resume = _resume(entries=3, bullets=2)
    order = ["summary", "skills", "experience", "projects", "education", "certifications"]
    first = compose_resume_layout(resume, requested_section_order=order, page_mode="two_page")
    second = compose_resume_layout(resume, requested_section_order=order, page_mode="two_page")
    assert first.section_order == order
    digest = lambda plan: hashlib.sha256(json.dumps(plan.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()
    assert digest(first) == digest(second)
