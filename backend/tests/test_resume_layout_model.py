from schemas.resume import RenderableResume


def test_legacy_layout_model_is_migrated_before_renderable_validation():
    resume = RenderableResume.model_validate(
        {
            "personal_info": {
                "name": "Candidate",
                "email": "candidate@example.com",
            },
            "layout_model": {
                "template_id": "MarissaATS",
                "layout_version": 1,
                "header": {
                    "alignment": "left",
                    "show_avatar": False,
                    "show_divider": True,
                },
                "main_column": ["summary", "experience", "projects"],
                "sidebar": ["skills", "education"],
            },
        }
    )

    assert "name" in resume.layout_model.layout_tree["header"]["components"]
    assert resume.layout_model.layout_tree["body"]["rows"][0]["columns"][0]["sections"] == [
        "summary",
        "experience",
        "projects",
    ]

