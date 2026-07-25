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
