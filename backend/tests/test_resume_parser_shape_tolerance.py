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
