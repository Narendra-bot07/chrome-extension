from services.job_extraction.schemas import ExtractedJob


def test_optional_job_modes_accept_provider_null_and_normalize_to_unknown():
    schema = ExtractedJob.model_json_schema()

    workplace_types = schema["properties"]["workplace_type"]["anyOf"]
    employment_types = schema["properties"]["employment_type"]["anyOf"]
    assert {"type": "null"} in workplace_types
    assert {"type": "null"} in employment_types

    job = ExtractedJob.model_validate({
        "job_title": "Senior Consultant",
        "workplace_type": None,
        "employment_type": None,
    })

    assert job.workplace_type == "unknown"
    assert job.employment_type == "unknown"


def test_job_modes_still_normalize_provider_labels():
    job = ExtractedJob.model_validate({
        "workplace_type": "On-site",
        "employment_type": "Full-Time",
    })

    assert job.workplace_type == "onsite"
    assert job.employment_type == "full_time"
