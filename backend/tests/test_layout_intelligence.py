from schemas.layout_intelligence import LayoutIntelligenceRequest, LayoutPlan
from services.layout_intelligence import LayoutIntelligenceService


def _plan(resume, **context):
    return LayoutIntelligenceService().build_plan(
        resume, LayoutIntelligenceRequest(**context)
    )


def test_engineering_role_prioritizes_projects_and_returns_structured_plan():
    result = _plan(
        {
            "summary": "Backend engineer",
            "experience": [{"role": "Engineer"}],
            "projects": [{"name": "API"}, {"name": "Platform"}],
            "skills": ["Python", "Postgres"],
            "education": [{"degree": "BS"}],
        },
        target_role="Software Engineer",
        ats_score=82,
    )

    assert result.layout_strategy.recommended_strategy == "engineering"
    assert result.section_priority.section_order[:4] == [
        "summary", "experience", "projects", "skills"
    ]
    assert result.layout_plan.columns[0]["sections"] == result.layout_plan.section_order


def test_research_role_prioritizes_publications():
    result = _plan(
        {
            "experience": [{"role": "Research assistant"}],
            "publications": [{"title": "Paper"}],
            "projects": [{"name": "Study"}],
            "education": [{"degree": "PhD"}],
        },
        target_role="Research Scientist",
    )

    assert result.layout_strategy.recommended_strategy == "research"
    assert result.section_priority.section_order[:3] == [
        "publications", "projects", "education"
    ]


def test_user_override_changes_effective_plan_without_hiding_recommendation():
    result = _plan(
        {"experience": [{"role": "Engineer"}], "skills": ["Python"]},
        target_role="Software Engineer",
        user_strategy_override="modern_sidebar",
    )

    assert result.layout_strategy.recommended_strategy == "engineering"
    assert result.layout_strategy.effective_strategy == "modern_sidebar"
    assert result.layout_strategy.overridden_by_user is True
    assert result.layout_plan.strategy == "modern_sidebar"


def test_low_ats_score_disables_sidebar_recommendation():
    result = _plan(
        {
            "portfolio": "https://example.com",
            "projects": [{"name": str(index)} for index in range(3)],
            "skills": ["Python"],
        },
        ats_score=55,
    )

    assert result.layout_strategy.recommended_strategy == "portfolio"
    assert result.layout_strategy.constraints.allow_sidebar is False
    assert result.layout_strategy.constraints.maximum_columns == 1


def test_layout_plan_rejects_column_order_that_differs_from_section_order():
    try:
        LayoutPlan(
            strategy="compact_ats",
            header={},
            columns=[{"id": "main", "width": 12, "sections": ["skills", "experience"]}],
            section_order=["experience", "skills"],
            spacing={},
            page_rules={},
        )
        assert False, "Expected LayoutPlan validation to fail"
    except ValueError as exc:
        assert "preserve the declared section order" in str(exc)
