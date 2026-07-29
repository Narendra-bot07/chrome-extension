from schemas.jobs import JobAnalysis
from schemas.resume import EducationItem, ExperienceItem, ProjectItem, ResumeStructure
from schemas.tailoring import ResumePatch
from services.resume.tailoring_engine import StrictTailoringEngine


def source_resume() -> ResumeStructure:
    return ResumeStructure(
        personal_info={"name": "Ada", "email": "ada@example.com"},
        summary="Software engineer building reliable Python APIs.",
        skills=["Python"],
        experience=[
            ExperienceItem(
                company="Source Co",
                role="Engineer",
                start_date="2024",
                end_date="2026",
                description=["Built Python APIs serving 500+ users."],
            )
        ],
        projects=[
            ProjectItem(
                name="Source Project",
                link="https://example.com/project",
                description=["Created a Python service for 40% faster processing."],
            )
        ],
        education=[EducationItem(institution="Source University", degree="B.Tech")],
        achievements=["Hackathon finalist"],
        certifications=[{"name": "Source Certificate"}],
    )


def test_pipeline_applies_only_minimal_source_slotted_edits():
    resume = source_resume()
    patch = ResumePatch(
        experience={"0": {"0": "Engineered Python APIs serving 500+ users."}},
        projects={"0": {"0": "Optimized a Python service for 40% faster processing."}},
    )
    engine = StrictTailoringEngine()
    result = engine.validate_patch(resume, JobAnalysis(title="Python Engineer"), patch)
    tailored = engine.apply_patch(resume, result.patch)

    assert tailored.experience[0].company == "Source Co"
    assert tailored.experience[0].description[0] == patch.experience["0"]["0"]
    assert tailored.projects[0].name == "Source Project"
    assert tailored.projects[0].link == "https://example.com/project"
    assert tailored.education == resume.education
    assert tailored.achievements == resume.achievements
    assert tailored.certifications == resume.certifications


def test_pipeline_rejects_changed_metrics_and_low_confidence_redrafts():
    resume = source_resume()
    patch = ResumePatch(
        experience={"0": {"0": "Led Kubernetes infrastructure serving 900 users globally."}},
        projects={"0": {"0": "Completely unrelated generated project narrative."}},
    )
    result = StrictTailoringEngine().validate_patch(resume, JobAnalysis(), patch)

    assert result.patch.experience == {}
    assert result.patch.projects == {}
    assert len(result.rejected_edits) == 2


def test_summary_growth_is_rejected_but_valid_suggested_skill_is_kept():
    resume = source_resume()
    patch = ResumePatch(
        summary=resume.summary * 3,
        skills_append=["Kubernetes"],
    )
    result = StrictTailoringEngine().validate_patch(resume, JobAnalysis(), patch)

    assert result.patch.summary is None
    assert result.patch.skills_append == ["Kubernetes"]


def test_selected_summary_accepts_truthful_polishing():
    resume = source_resume()
    polished = (
        "Results-focused software engineer building reliable, production-ready "
        "Python APIs."
    )

    result = StrictTailoringEngine().validate_patch(
        resume,
        JobAnalysis(title="Python Engineer"),
        ResumePatch(summary=polished),
        requested_sections={"summary"},
    )

    assert result.patch.summary == polished
    assert len(result.edits) == 1


def test_static_sections_are_never_editable_by_default():
    resume = source_resume()
    result = StrictTailoringEngine().validate_patch(resume, JobAnalysis(), ResumePatch())

    assert result.classifications["education"] == "STATIC"
    assert result.classifications["achievements"] == "STATIC"
    assert result.classifications["certifications"] == "STATIC"
    assert result.classifications["personal_info"] == "STATIC"
