from app.schemas import ExperienceItem, ProjectItem, ResumeStructure
from app.services.agents import enforce_lossless_tailoring


def test_full_schema_ai_output_cannot_redraft_source_structure():
    original = ResumeStructure(
        summary="Software engineering student.",
        skills=["Python", "SQL"],
        experience=[
            ExperienceItem(
                company="Original Company",
                role="Intern",
                start_date="2025",
                end_date="2026",
                description=["Improved processing by 40%."],
            )
        ],
        projects=[
            ProjectItem(
                name="Source Project",
                description=["Built the source project with Python."],
            )
        ],
        achievements=[
            "Crayon'd hackathon finalist — Selected as one of 25 participants.",
            "Competitive Programming — Solved 500+ problems.",
        ],
        links={"github": "https://github.com/source"},
    )
    hallucinated = original.model_copy(deep=True)
    hallucinated.skills.append("Kubernetes")
    hallucinated.achievements.extend(["Taking Initiative", "Selected as one of 25 participants"])
    hallucinated.links["github"] = "https://github.com/invented"
    hallucinated.experience[0].company = "Invented Company"
    hallucinated.experience[0].description[0] = "Improved processing by 90%."
    hallucinated.projects.append(ProjectItem(name="Invented Project", description=["Invented."]))

    result = enforce_lossless_tailoring(original, hallucinated)

    assert result.skills == original.skills
    assert result.achievements == original.achievements
    assert result.links == original.links
    assert result.experience[0].company == "Original Company"
    assert result.experience[0].description == ["Improved processing by 40%."]
    assert len(result.projects) == 1


def test_lossless_tailoring_accepts_one_to_one_wording_improvements():
    original = ResumeStructure(
        summary="Developer.",
        experience=[
            ExperienceItem(
                company="Company",
                description=["Built APIs serving 500+ users."],
            )
        ],
    )
    candidate = original.model_copy(deep=True)
    candidate.summary = "Software developer focused on reliable systems."
    candidate.experience[0].description[0] = "Engineered APIs serving 500+ users."

    result = enforce_lossless_tailoring(original, candidate)

    assert result.summary == candidate.summary
    assert result.experience[0].description == candidate.experience[0].description
