from io import BytesIO

from pypdf import PdfWriter

from services.resume.composition import (
    _rendered_urls,
    normalize_link_ownership,
    validate_generated_pdf,
)


def blank_pdf() -> bytes:
    output = BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    writer.write(output)
    return output.getvalue()


def test_link_review_and_legacy_repository_bucket_are_not_required_annotations():
    resume = {
        "personal_info": {},
        "links": {"github_com": "https://github.com/alice/unowned-repository"},
        "link_review": [{"url": "https://example.com/quarantined"}],
        "projects": [],
        "profile_links": [],
    }
    assert _rendered_urls(resume) == set()
    assert validate_generated_pdf(blank_pdf(), resume).valid


def test_owned_profile_and_project_links_are_required_annotations():
    resume = {
        "personal_info": {},
        "profile_links": [{"url": "https://github.com/alice"}],
        "projects": [{
            "links": [{"url": "https://github.com/alice/project"}],
        }],
    }
    report = validate_generated_pdf(blank_pdf(), resume)
    assert not report.valid
    assert len(report.issues) == 2


def test_owned_profile_link_replaces_conflicting_legacy_personal_link():
    resume = {
        "personal_info": {
            "linkedin": "https://linkedin.com/in/stale-candidate",
            "coding_profiles": {
                "linkedin": "https://linkedin.com/in/stale-candidate",
            },
        },
        "profile_links": [{
            "platform": "linkedin",
            "url": "https://linkedin.com/in/current-candidate",
        }],
        "projects": [],
    }
    assert _rendered_urls(resume) == {
        "https://linkedin.com/in/current-candidate",
    }
    normalized = normalize_link_ownership(resume)
    assert normalized["personal_info"]["linkedin"].endswith("/current-candidate")
    assert normalized["personal_info"]["coding_profiles"] == {}
