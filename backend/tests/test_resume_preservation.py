from copy import deepcopy

from services.resume.preservation import PreservationState, inventory_resume, preserve_resume


def resume():
    return {
        "personal_info": {
            "name": "Shravya",
            "linkedin": "https://linkedin.com/in/shravya",
            "github": "https://github.com/shravya",
        },
        "summary": "Software engineer building reliable systems.",
        "experience": [{
            "company": "Amazon",
            "role": "Software Engineer Intern",
            "description": [
                "Reduced processing time by 40%.",
                "Supported 100 candidates over 4 months.",
            ],
        }],
        "projects": [{
            "name": "AI Resume Tailoring Platform",
            "link": "https://github.com/shravya/resume",
            "description": ["Processed 10TB of candidate evidence.", "Deployed the platform."],
        }],
        "skills": ["Python", "SQL"],
        "achievements": [{
            "title": "Competitive Programming",
            "description": "Solved 500+ problems and reached Top 18%.",
        }],
        "certifications": [{
            "name": "Zero Trust Architecture",
            "credential_url": "https://example.com/certificate",
            "description": "Completed advanced security training.",
        }],
        "education": [{"institution": "University", "degree": "B.Tech"}],
        "custom_sections": [{"title": "Community", "description": ["Mentored students."]}],
    }


def issue_codes(result):
    return {issue.code for issue in result.issues}


def test_inventory_ids_are_stable_across_reordering():
    first = resume()
    second = deepcopy(first)
    second["skills"].reverse()
    one = {
        item.text: item.element_id for item in inventory_resume(first)
        if item.section == "skills" and item.kind == "entry"
    }
    two = {
        item.text: item.element_id for item in inventory_resume(second)
        if item.section == "skills" and item.kind == "entry"
    }
    assert one == two


def test_missing_major_elements_and_summary_are_detected():
    for section, expected in (
        ("projects", "missing_entry"),
        ("achievements", "missing_entry"),
        ("certifications", "missing_entry"),
        ("education", "missing_entry"),
    ):
        current = resume()
        current[section] = []
        assert expected in issue_codes(preserve_resume(resume(), current, auto_repair=False))
    current = resume()
    current["summary"] = ""
    assert "missing_description" in issue_codes(preserve_resume(resume(), current, auto_repair=False))


def test_missing_bullet_metric_and_links_are_detected():
    current = resume()
    current["experience"][0]["description"].pop()
    result = preserve_resume(resume(), current, auto_repair=False)
    assert "missing_bullet" in issue_codes(result)

    current = resume()
    current["experience"][0]["description"][0] = "Reduced processing time."
    assert "missing_metric" in issue_codes(preserve_resume(resume(), current, auto_repair=False))

    current = resume()
    current["personal_info"]["github"] = ""
    current["personal_info"]["linkedin"] = ""
    codes = issue_codes(preserve_resume(resume(), current, auto_repair=False))
    assert "missing_link" in codes


def test_semantic_project_rename_is_modified_not_deleted_and_added():
    current = resume()
    current["projects"][0]["name"] = "AI Resume Optimization Platform"
    result = preserve_resume(resume(), current, auto_repair=False)
    assert result.valid
    project_entries = [
        state for element_id, state in result.states.items()
        if element_id.startswith("entry_")
    ]
    assert PreservationState.MODIFIED in project_entries


def test_duplicates_are_reported():
    current = resume()
    current["projects"].append(deepcopy(current["projects"][0]))
    current["certifications"].append(deepcopy(current["certifications"][0]))
    codes = issue_codes(preserve_resume(resume(), current, auto_repair=False))
    assert "duplicate_entry" in codes


def test_unsupported_project_and_skill_are_blocking():
    current = resume()
    current["projects"].append({
        "name": "Invented Quantum Platform",
        "description": ["Built a quantum computer for 1 million users."],
    })
    current["skills"].append("Quantum Computing")
    result = preserve_resume(resume(), current, auto_repair=False)
    assert not result.valid
    assert "unsupported_entry" in issue_codes(result)


def test_targeted_repair_restores_description_bullet_link_and_hidden_section():
    current = resume()
    current["projects"][0]["description"].pop(0)
    current["certifications"][0]["description"] = ""
    current["personal_info"]["github"] = ""
    current["custom_sections"] = []
    result = preserve_resume(resume(), current, auto_repair=True)
    assert result.valid
    assert result.lossless_resume["projects"][0]["description"] == resume()["projects"][0]["description"]
    assert result.lossless_resume["certifications"][0]["description"]
    assert result.lossless_resume["personal_info"]["github"] == resume()["personal_info"]["github"]
    assert result.lossless_resume["custom_sections"] == resume()["custom_sections"]
    assert result.counts["recovered"] >= 3


def test_original_is_immutable_and_score_does_not_override_validation():
    original = resume()
    snapshot = deepcopy(original)
    current = resume()
    current["projects"][0]["description"][0] = "Processed candidate evidence."
    result = preserve_resume(original, current, auto_repair=False)
    assert original == snapshot
    assert not result.valid
    assert result.score < 100


def test_approved_hidden_element_is_explained_and_not_silent_loss():
    current = resume()
    current["summary"] = ""
    result = preserve_resume(
        resume(), current, approved_removals=["summary"], auto_repair=False,
    )
    summary = next(item for item in inventory_resume(resume()) if item.kind == "description" and item.section == "summary")
    assert result.states[summary.element_id] == PreservationState.HIDDEN
    assert result.valid


def test_internal_metadata_leakage_blocks_pipeline():
    current = resume()
    current["file_name"] = "internal.pdf"
    result = preserve_resume(resume(), current, auto_repair=False)
    assert not result.valid
    assert "metadata_leakage" in issue_codes(result)
