from services.job_extraction.schemas import ExtractedJob, SalaryInfo
from schemas.jobs import JobAnalysis


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


def test_provider_null_collections_are_accepted_and_normalized_to_lists():
    collection_fields = (
        "responsibilities",
        "requirements",
        "preferred_qualifications",
        "skills",
        "suggested_skills",
        "benefits",
    )
    schema = ExtractedJob.model_json_schema()

    for field in collection_fields:
        assert {"type": "null"} in schema["properties"][field]["anyOf"]

    job = ExtractedJob.model_validate({field: None for field in collection_fields})
    for field in collection_fields:
        assert getattr(job, field) == []


def test_extracted_job_salary_edge_cases():
    # String salary input (e.g. from DeepSeek LLM structured output)
    job_str = ExtractedJob.model_validate({
        "job_title": "Software Engineer",
        "salary": "₹20,000 - ₹30,000 per month"
    })
    assert isinstance(job_str.salary, SalaryInfo)
    assert job_str.salary.raw == "₹20,000 - ₹30,000 per month"

    # Dict salary input with raw
    job_dict_raw = ExtractedJob.model_validate({
        "salary": {"raw": "$100,000 - $120,000 / year", "currency": "USD"}
    })
    assert isinstance(job_dict_raw.salary, SalaryInfo)
    assert job_dict_raw.salary.raw == "$100,000 - $120,000 / year"
    assert job_dict_raw.salary.currency == "USD"

    # Dict salary input with numbers
    job_dict_nums = ExtractedJob.model_validate({
        "salary": {"minimum": "₹20,000", "maximum": "30000", "currency": "INR"}
    })
    assert job_dict_nums.salary.minimum == 20000.0
    assert job_dict_nums.salary.maximum == 30000.0

    # None or empty string salary input
    job_none = ExtractedJob.model_validate({"salary": None})
    assert job_none.salary is None

    job_empty = ExtractedJob.model_validate({"salary": ""})
    assert job_empty.salary is None


def test_job_analysis_salary_edge_cases():
    # Dict salary passed to JobAnalysis
    job1 = JobAnalysis.model_validate({
        "title": "Developer",
        "salary": {"raw": "₹20,000 - ₹30,000 per month"}
    })
    assert job1.salary == "₹20,000 - ₹30,000 per month"

    # SalaryInfo object passed to JobAnalysis
    info = SalaryInfo(raw="₹20,000 - ₹30,000 per month")
    job2 = JobAnalysis.model_validate({
        "title": "Developer",
        "salary": info
    })
    assert job2.salary == "₹20,000 - ₹30,000 per month"

    # None passed to JobAnalysis
    job3 = JobAnalysis.model_validate({"salary": None})
    assert job3.salary == ""
