import pytest
from services.resume.composition import (
    clean_and_repair_project_links,
    is_valid_project_url,
    is_valid_url,
    _rendered_urls,
)


def test_is_valid_project_url():
    # Valid project repository URLs
    assert is_valid_project_url("https://github.com/username/repository-name")
    assert is_valid_project_url("https://www.github.com/alice/project")
    assert is_valid_project_url("github.com/username/project")
    assert is_valid_project_url("https://gitlab.com/group/project")

    # Invalid project repository URLs
    assert not is_valid_project_url("https://github/")
    assert not is_valid_project_url("https://github.com/")
    assert not is_valid_project_url("https://github.com")
    assert not is_valid_project_url("https://github.com/username")  # Candidate profile, NOT a project repo!
    assert not is_valid_project_url("github")
    assert not is_valid_project_url("github.com")
    assert not is_valid_project_url("#")
    assert not is_valid_project_url("")
    assert not is_valid_project_url(None)


def test_clean_and_repair_project_links():
    resume = {
        "personal_info": {
            "name": "Bandi Narendra",
            "github": "https://github.com/bandi-narendra-138a5b256"
        },
        "projects": [
            {
                "name": "Valid Repo Project",
                "links": [
                    {"url": "https://github.com/bandi-narendra-138a5b256/valid-repo", "platform": "github", "display_label": "GitHub repository"}
                ]
            },
            {
                "name": "Malformed Link Project",
                "links": [
                    {"url": "https://github/", "platform": "github", "display_label": "GitHub"}
                ],
                "repository_url": "https://github/"
            },
            {
                "name": "Candidate Profile attached to Project",
                "links": [
                    {"url": "https://github.com/bandi-narendra-138a5b256", "platform": "github"}
                ]
            },
            {
                "name": "Duplicate Link Project",
                "links": [
                    {"url": "https://github.com/user/repo", "display_label": "GitHub"},
                    {"url": "https://github.com/user/repo", "display_label": "GitHub repository"}
                ]
            }
        ]
    }

    cleaned, audit_logs = clean_and_repair_project_links(resume)

    # Project 0: Valid link preserved, display label updated to clean "GitHub"
    assert len(cleaned["projects"][0]["links"]) == 1
    assert cleaned["projects"][0]["links"][0]["display_label"] == "GitHub"

    # Project 1: Malformed link https://github/ removed cleanly!
    assert len(cleaned["projects"][1]["links"]) == 0
    assert "repository_url" not in cleaned["projects"][1]

    # Project 2: Candidate profile link on project removed!
    assert len(cleaned["projects"][2]["links"]) == 0

    # Project 3: Duplicate link removed, only 1 link kept
    assert len(cleaned["projects"][3]["links"]) == 1

    # Verify audit logs captured removals
    assert len(audit_logs) >= 3


def test_rendered_urls_does_not_promise_invalid_project_urls():
    resume = {
        "personal_info": {
            "name": "Bandi Narendra",
            "github": "https://github.com/bandi-narendra-138a5b256"
        },
        "projects": [
            {
                "name": "Invalid Project",
                "github_url": "https://github/",
                "links": [{"url": "https://github/"}]
            },
            {
                "name": "Valid Project",
                "links": [{"url": "https://github.com/user/project-repo"}]
            }
        ]
    }

    rendered = _rendered_urls(resume)

    assert "https://github" not in rendered
    assert "https://github/" not in rendered
    assert "https://github.com/user/project-repo" in rendered
