from app.schemas import DownloadPDFRequest


def test_download_request_accepts_editor_layout_model():
    request = DownloadPDFRequest.model_validate({
        "resume": {
            "personal_info": {
                "name": "Candidate",
                "email": "candidate@example.com",
            },
            "experience": [{"company": "Acme", "description": ["Built APIs."]}],
            "skills": ["Python"],
            "section_order": ["experience", "skills"],
            "layout_model": {
                "template_id": "ExecutiveATS",
                "layout_version": 1,
                "header": {
                    "show_avatar": False,
                    "alignment": "left",
                },
                "main_column": ["experience", "skills"],
                "sidebar": [],
                "layout_tree": {
                    "header": {"components": ["name", "email"]},
                    "body": {
                        "rows": [{
                            "columns": [{
                                "id": "main",
                                "width": 12,
                                "sections": ["experience", "skills"],
                            }],
                        }],
                    },
                    "footer": {"components": []},
                },
            },
        },
        "template_name": "ExecutiveATS",
    })

    assert request.resume.layout_model is not None
    assert request.resume.layout_model.template_id == "ExecutiveATS"


def test_download_request_accepts_owned_link_intelligence_fields():
    link = {
        "id": "link-github",
        "owner_type": "candidate",
        "owner_id": "candidate",
        "link_type": "profile",
        "platform": "github",
        "original_url": "https://github.com/candidate",
        "normalized_url": "https://github.com/candidate",
        "display_label": "GitHub",
        "source_section": "header",
        "source_provenance": "personal_info.github",
        "confidence": 1,
        "validation_status": "VALID",
        "url": "https://github.com/candidate",
    }
    payload = {
        "personal_info": {"name": "Candidate"},
        "candidate_links": [link],
        "profile_links": [link],
        "unresolved_links": [],
        "link_review": [],
        "links_intelligence_version": 1,
    }

    request = DownloadPDFRequest.model_validate({
        "resume": payload,
        "original_resume": payload,
        "template_name": "ExecutiveATS",
    })

    assert request.resume.candidate_links[0]["owner_type"] == "candidate"
    assert request.resume.links_intelligence_version == 1
    assert request.original_resume.links_intelligence_version == 1
