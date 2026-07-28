from schemas.resume import ResumeStructure
from schemas.tailoring import ResumePatch
from services.resume.merge_engine import FinalResumeMergeEngine, PreservationGuardian
from services.resume.recovery_engine import ResumeRecoveryAgent


def test_merged_achievements_are_recovered_as_source_backed_items():
    raw = """ACHIEVEMENTS & CERTIFICATIONS
Crayon'd hackathon finalist Selected as one of the 25 participants. $300 Zscaler voucher For completing Zero Trust Architecture training. Competitive Programming Solved 500+ problems.
EDUCATION
B.Tech CSE
"""
    parsed = {
        "achievements": [
            "Crayon'd hackathon finalist",
            "$300 Zscaler voucher",
            "Competitive Programming",
        ],
        "certifications": [],
        "education": [{"degree": "B.Tech CSE"}],
        "raw_text": raw,
    }
    result = ResumeRecoveryAgent().recover(parsed, raw)
    combined = next(
        section for section in result.canonical_resume["sections"]
        if section["type"] == "achievements_certifications"
    )
    assert [item["title"] for item in combined["items"]] == [
        "Crayon'd hackathon finalist",
        "$300 Zscaler voucher",
        "Competitive Programming",
    ]
    assert len(result.recovered_resume["achievements"]) == 3
    assert all(
        title in result.recovered_resume["achievements"][index]
        for index, title in enumerate(parsed["achievements"])
    )


def test_seven_inline_achievements_split_losslessly_in_source_order():
    block = (
        "Crayon'd hackathon finalist Selected as one of the 25 participants to "
        "resources and deep-dive with company tasks. "
        "$300 Zscaler voucher For completing Zero Trust Architecture (ZTA) "
        "training and related learning resources. "
        "Competitive Programming Solved 500+ problems and attended contests in "
        "LeetCode (Top 18%) and Smart Interviews. "
        "Find Leader in You (FLYscholar) From Competitiveness Mindset Institute, "
        "USA. Taking Initiative, Innovativeness. "
        "CSI-Student Chapter (Brand Funding and Sponsorship Chief) 40 percent "
        "increase in CSI membership and participation. "
        "EPAM Scholarship From top 100 selected in India, organized by Nirmaan "
        "Organisation. "
        "TTPOC - STUDENT VOLUNTEER Volunteered at CAREERNEXUS SUMMIT-2024 and 2025."
    )
    raw = f"ACHIEVEMENTS & CERTIFICATIONS\n{block}\n"
    result = ResumeRecoveryAgent().recover(
        {"achievements": [block], "certifications": [], "raw_text": raw},
        raw,
    )
    section = next(
        value for value in result.canonical_resume["sections"]
        if value["type"] == "achievements_certifications"
    )
    assert len(section["items"]) == 7
    assert [item["title"] for item in section["items"]] == [
        "Crayon'd hackathon finalist",
        "$300 Zscaler voucher",
        "Competitive Programming",
        "Find Leader in You (FLYscholar)",
        "CSI-Student Chapter (Brand Funding and Sponsorship Chief)",
        "EPAM Scholarship",
        "TTPOC - STUDENT VOLUNTEER",
    ]
    audit = result.canonical_resume["achievement_segmentation"][0]
    assert audit["source_coverage"] == 1.0
    assert audit["unassigned_text"] == []
    assert audit["duplicated_text"] == []
    assert len(result.recovered_resume["achievements"]) == 7
    joined = " ".join(result.recovered_resume["achievements"])
    for evidence in ("$300", "500+", "Top 18%", "40 percent", "Nirmaan Organisation"):
        assert evidence in joined


def test_low_confidence_recovery_preserves_verbatim_source():
    raw = "ACHIEVEMENTS\nUnstructured source block without reliable boundaries."
    result = ResumeRecoveryAgent().recover({"achievements": []}, raw)
    section = result.canonical_resume["sections"][0]
    assert section["items"][0]["source_text"] == (
        "Unstructured source block without reliable boundaries."
    )
    assert result.recovery_warnings


def test_unknown_heading_is_preserved_as_custom_section():
    raw = "COMMUNITY IMPACT\nMentored 20 students."
    result = ResumeRecoveryAgent().recover({}, raw)
    section = result.canonical_resume["sections"][0]
    assert section["type"] == "custom"
    assert section["original_heading"] == "COMMUNITY IMPACT"


def test_selected_missing_summary_is_independent_of_patch():
    original = ResumeStructure(summary="", achievements=["Won a hackathon."])
    merged, report = FinalResumeMergeEngine().merge(
        original,
        selected_sections={"summary"},
        generated_summary="Software engineer focused on reliable systems.",
    )
    assert report.valid
    assert merged["summary"] == "Software engineer focused on reliable systems."
    assert merged["achievements"] == ["Won a hackathon."]


def test_automatic_patch_cannot_modify_locked_sections():
    original = ResumeStructure(
        education=[{"institution": "Source University", "degree": "B.Tech"}],
        achievements=["Solved 500+ problems."],
    )
    merged, report = FinalResumeMergeEngine().merge(
        original, validated_patch=ResumePatch()
    )
    assert report.valid
    assert merged["education"][0]["institution"] == "Source University"


def test_semantic_loss_detector_rejects_merged_achievements():
    original = {
        "achievements": ["First achievement.", "Second achievement."],
        "certifications": [],
    }
    final = {
        "achievements": [
            "First achievement. Second achievement.",
            "First achievement. Second achievement.",
        ],
        "certifications": [],
    }
    report = PreservationGuardian().validate(original, final)
    assert not report.valid
    assert report.changed_locked_fields
