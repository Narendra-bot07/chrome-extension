from services.resume.composition_engine import plan_resume_composition


def test_short_resume_is_composed_as_one_readable_page():
    content = {
        "personal_info": {"name": "Ada", "email": "ada@example.com"},
        "summary": "Software engineer.",
        "experience": [{"company": "Acme", "description": ["Built APIs."]}],
        "skills": ["Python", "Postgres"],
    }
    decision = plan_resume_composition(
        content, ["summary", "experience", "skills"]
    )

    assert decision.estimated_page_count == 1
    assert decision.maximum_compression_level <= 3
    assert decision.constraints["preserve_all_content"] is True


def test_long_resume_uses_two_pages_instead_of_unsafe_compression():
    long_bullet = "Designed and delivered a distributed platform. " * 14
    content = {
        "personal_info": {"name": "Ada"},
        "experience": [
            {
                "company": f"Company {index}",
                "description": [long_bullet, long_bullet, long_bullet],
            }
            for index in range(5)
        ],
        "projects": [
            {"name": f"Project {index}", "description": [long_bullet]}
            for index in range(3)
        ],
        "skills": [f"Skill {index}" for index in range(20)],
    }
    decision = plan_resume_composition(
        content, ["experience", "projects", "skills"]
    )

    assert decision.estimated_page_count == 2
    assert decision.maximum_compression_level == 2
    assert "find_safe_section_break" in decision.optimization_passes
    assert decision.constraints["minimum_font_size_px"] == 13.5
