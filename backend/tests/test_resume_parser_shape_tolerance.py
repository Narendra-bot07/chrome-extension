from app.schemas import ResumeStructure as LegacyResumeStructure
from schemas.resume import ResumeStructure


BAD_TOOL_SHAPES = {
    "projects": [
        {"name": "Music Genre Classification", "description": "Developed a deep learning model."},
        {"name": "Sign Language Detection", "description": "Built a gesture recognition system."},
    ],
    "languages": ["English", "Telugu"],
}


def test_structured_parser_schema_accepts_common_model_shapes():
    schema = LegacyResumeStructure.model_json_schema()
    project_description = schema["$defs"]["ProjectItem"]["properties"]["description"]
    language_items = schema["properties"]["languages"]["items"]
    assert "anyOf" in project_description
    assert "anyOf" in language_items


def test_common_model_shapes_are_normalized_to_canonical_arrays():
    for model in (LegacyResumeStructure, ResumeStructure):
        resume = model.model_validate(BAD_TOOL_SHAPES)
        assert resume.projects[0].description == ["Developed a deep learning model."]
        assert resume.languages == [{"name": "English"}, {"name": "Telugu"}]


# Confirmed production incident (2026-08-08): DeepSeek's structured-output
# mode explicitly returns `null` (not an omitted key) for a plain-`str`
# field it has no value for -- a certification with no expiration date, a
# project with no link. Every parse touching a resume shaped like this
# failed flash validation ("Input should be a valid string"), forced an
# expensive escalation to the pro model (60-160s+ observed in production
# logs), and could fail the request outright if pro naturally returned the
# same `null` for the same reason.
NULL_OPTIONAL_STRING_SHAPE = {
    "personal_info": {"name": "Jane Doe", "email": None, "phone": None},
    "summary": None,
    "experience": [
        {"company": "Acme", "role": None, "location": None, "description": ["Did things."]},
    ],
    "projects": [
        {"name": "Project A", "role": None, "link": None, "description": ["Built it."]},
    ],
    "education": [
        {"institution": "State University", "degree": None, "field_of_study": None, "gpa": None},
    ],
    "certifications": [
        {
            "name": "AWS Certified",
            "issuing_organization": "AWS",
            "expiration_date": None,
            "credential_id": None,
            "credential_url": None,
            "url": None,
        },
    ],
}


def test_llm_returned_null_optional_strings_do_not_fail_validation():
    for model in (LegacyResumeStructure, ResumeStructure):
        resume = model.model_validate(NULL_OPTIONAL_STRING_SHAPE)
        assert resume.summary == ""
        assert resume.personal_info.email == ""
        assert resume.experience[0].role == ""
        assert resume.projects[0].role == ""
        assert resume.projects[0].link == ""
        assert resume.education[0].degree == ""
        assert resume.certifications[0].expiration_date == ""
        assert resume.certifications[0].credential_id == ""
        assert resume.certifications[0].url == ""


def test_genuinely_nullable_fields_are_not_coerced_by_the_null_string_fix():
    # personal_info.photo_position_y is Optional[float] = None, not a plain
    # str -- the coercion must only ever touch fields typed exactly `str`.
    resume = ResumeStructure.model_validate({
        "personal_info": {"name": "Jane Doe", "photo_position_y": None},
    })
    assert resume.personal_info.photo_position_y is None
