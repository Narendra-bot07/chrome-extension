"""Phase 2 selected-resume isolation and intelligence regression tests."""

from __future__ import annotations

from copy import deepcopy
from hashlib import sha256

import pytest

from services.resume_intelligence.analyzer import (
    build_resume_intelligence,
    extract_metrics,
    normalize_skill,
)
from services.resume_intelligence.dates import calculate_experience, parse_date
from services.resume_intelligence.models import (
    ConfidenceLabel,
    ExperienceEntry,
    SourceReference,
    confidence,
)
from services.resume_intelligence.normalization import normalize_resume_text
from services.resume_intelligence.semantic import (
    SemanticCapability,
    SemanticDomain,
    SemanticInsights,
)
from services.resume_intelligence.service import SelectedResumeIntelligenceService
from services.workflow.checkpoints import InMemoryCheckpointStore


RAW = """Narendra Example
narendra@example.com | +91 99999 99999
https://linkedin.com/in/example

PROFESSIONAL SUMMARY
Data engineer building reliable data platforms.

TECHNICAL SKILLS
Python, PostgreSQL, Airflow, AWS

PROFESSIONAL EXPERIENCE
Data Engineer | Example Corp | Jan 2021 - Present
- Built Python pipelines processing 2 TB daily.
- Collaborated with cross-functional teams.
- Led 3 engineers and reduced runtime by 40%.

ACADEMIC PROJECTS
Campus Analytics
- Built a dashboard using Python and PostgreSQL.

EDUCATION
Example University | Bachelor of Technology | 2017 - 2021

CERTIFICATIONS
AWS Certified Cloud Practitioner
Python Course Completion
"""


PARSED = {
    "parse_status": "parsed",
    "raw_text": RAW,
    "personal_info": {
        "name": "Narendra Example",
        "email": "narendra@example.com",
        "phone": "+91 99999 99999",
        "location": "Hyderabad, Telangana, India",
        "linkedin": "https://linkedin.com/in/example",
    },
    "summary": "Data engineer building reliable data platforms.",
    "skills": ["Python", "Postgres", "Airflow", "AWS"],
    "experience": [
        {
            "company": "Example Corp",
            "role": "Data Engineer",
            "start_date": "Jan 2021",
            "end_date": "Present",
            "description": [
                "Built Python pipelines processing 2 TB daily.",
                "Collaborated with cross-functional teams.",
                "Led 3 engineers and reduced runtime by 40%.",
            ],
        }
    ],
    "projects": [
        {
            "name": "Campus Analytics",
            "technology_stack": ["Python", "PostgreSQL"],
            "description": ["Built a dashboard using Python and PostgreSQL."],
        }
    ],
    "education": [
        {
            "institution": "Example University",
            "degree": "Bachelor of Technology",
            "start_date": "2017",
            "end_date": "2021",
        }
    ],
    "certifications": [
        {"name": "AWS Certified Cloud Practitioner"},
        {"name": "Python Course Completion"},
    ],
}


class FakeRepository:
    def __init__(self, records):
        self.records = records
        self.requested_ids = []
        self.list_called = False

    def get_selected_snapshot(self, resume_id, user_id):
        self.requested_ids.append(resume_id)
        record = self.records.get(resume_id)
        if not record or record["user_id"] != user_id or record.get("deleted_at"):
            return None
        return deepcopy(record)

    def set_source_fingerprint_if_missing(self, resume_id, user_id, fingerprint):
        record = self.records[resume_id]
        if record["user_id"] != user_id:
            return None
        record["source_fingerprint"] = record["source_fingerprint"] or fingerprint
        return deepcopy(record)

    def list_by_user(self, user_id):
        self.list_called = True
        raise AssertionError("Phase 2 must never enumerate resumes")


class FakeStorage:
    def __init__(self, files):
        self.files = files
        self.downloaded = []

    def download_file(self, bucket, path):
        self.downloaded.append(path)
        return self.files[path]


def record(
    resume_id="selected",
    user_id="user-1",
    parsed=None,
    content=None,
    version=1,
    fingerprint=True,
    deleted=False,
):
    content = content if content is not None else RAW.encode()
    return {
        "id": resume_id,
        "user_id": user_id,
        "file_path": f"{user_id}/{resume_id}.txt",
        "file_name": f"{resume_id}.pdf",
        "file_size": len(content),
        "file_type": "PDF",
        "parsed_content": deepcopy(parsed if parsed is not None else PARSED),
        "metadata": {},
        "deleted_at": "deleted" if deleted else None,
        "is_active": True,
        "resume_version": version,
        "source_fingerprint": sha256(content).hexdigest() if fingerprint else None,
        "fingerprint_algorithm": "sha256",
    }


def service(records, files, *, semantic=None, parser=None):
    repository = FakeRepository(records)
    storage = FakeStorage(files)
    checkpoints = InMemoryCheckpointStore()
    runtime = SelectedResumeIntelligenceService(
        repository=repository,
        storage=storage,
        checkpoint_store=checkpoints,
        structured_parser=parser,
        semantic_analyzer=semantic,
    )
    return runtime, repository, storage, checkpoints


def run(runtime, **overrides):
    values = {
        "request_id": "req-1",
        "user_id": "user-1",
        "selected_resume_id": "selected",
        "user_confirmed": True,
    }
    values.update(overrides)
    return runtime.run(**values)


def test_valid_selected_resume_produces_stable_output():
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    output = run(runtime)
    assert output.status == "completed"
    assert output.selected_resume.resume_id == "selected"
    assert output.resume_intelligence.resume_id == "selected"
    assert output.version == "resume-intelligence-v1"


def test_unconfirmed_resume_waits_for_user():
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    assert run(runtime, user_confirmed=False).status == "waiting_for_user"


def test_waiting_workflow_can_resume_after_confirmation():
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    waiting = run(runtime, user_confirmed=False)
    completed = runtime.confirm(
        workflow_id=waiting.workflow_id,
        selected_resume_id="selected",
        confirmed=True,
    )
    assert completed.status == "completed"


def test_other_users_resume_is_blocked_without_enumeration():
    selected = record(user_id="other-user")
    runtime, repo, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    output = run(runtime)
    assert output.status == "blocked"
    assert repo.requested_ids == ["selected"]
    assert not repo.list_called


def test_deleted_resume_is_blocked():
    selected = record(deleted=True)
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    assert run(runtime).status == "blocked"


def test_expected_version_change_is_blocked():
    selected = record(version=2)
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    assert run(runtime, selected_resume_version=1).status == "blocked"


def test_expected_fingerprint_change_is_blocked():
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    assert run(runtime, selected_resume_fingerprint="0" * 64).status == "blocked"


def test_source_file_fingerprint_drift_is_blocked():
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: b"changed content"}
    )
    assert run(runtime).status == "blocked"


def test_missing_fingerprint_is_initialized_from_selected_file_only():
    selected = record(fingerprint=False)
    other = record("other", content=b"UNSELECTED SECRET")
    runtime, repo, storage, _ = service(
        {"selected": selected, "other": other},
        {
            selected["file_path"]: RAW.encode(),
            other["file_path"]: b"UNSELECTED SECRET",
        },
    )
    output = run(runtime)
    assert output.status == "completed"
    assert storage.downloaded and set(storage.downloaded) == {selected["file_path"]}
    assert repo.records["selected"]["source_fingerprint"] == sha256(RAW.encode()).hexdigest()


def test_unselected_resume_content_never_enters_state_or_output():
    selected = record()
    other = record("other", content=b"UNSELECTED-PRIVATE-CONTENT")
    runtime, _, _, checkpoints = service(
        {"selected": selected, "other": other},
        {
            selected["file_path"]: RAW.encode(),
            other["file_path"]: b"UNSELECTED-PRIVATE-CONTENT",
        },
    )
    output = run(runtime)
    latest = checkpoints.latest(output.workflow_id)
    assert "UNSELECTED-PRIVATE-CONTENT" not in latest.state.model_dump_json()
    assert "UNSELECTED-PRIVATE-CONTENT" not in output.model_dump_json()


def test_nonstandard_headings_are_canonicalized_and_unknown_preserved():
    text = "Work History\nBuilt systems\nMYSTERY AREA:\nUnclassified detail"
    _, sections = normalize_resume_text(text)
    assert any(s.canonical_type == "experience" for s in sections)
    assert any(s.canonical_type == "custom" for s in sections)


def test_original_and_normalized_segments_preserve_source_text():
    text = "SKILLS\n•  Python   and SQL"
    normalized, sections = normalize_resume_text(text)
    segment = next(s for section in sections for s in section.segments)
    assert segment.original_text == "•  Python   and SQL"
    assert "- Python and SQL" in normalized


@pytest.mark.parametrize(
    ("value", "normalized"),
    [
        ("Postgres", "PostgreSQL"),
        ("Airflow", "Apache Airflow"),
        ("python3", "Python"),
        ("k8s", "Kubernetes"),
    ],
)
def test_technology_alias_normalization(value, normalized):
    assert normalize_skill(value) == normalized


def test_explicit_skills_have_provenance_and_context():
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    intelligence = run(runtime).resume_intelligence
    python = next(skill for skill in intelligence.skills if skill.normalized_name == "Python")
    assert python.status == "explicit"
    assert python.source.provenance_ids
    assert "experience-1" in python.source_sections


def test_current_employment_is_detected():
    assert parse_date("Present").is_present is True


def test_invalid_date_range_is_preserved_as_inconsistency():
    parsed = deepcopy(PARSED)
    parsed["experience"][0]["start_date"] = "2025"
    parsed["experience"][0]["end_date"] = "2020"
    selected = record(parsed=parsed)
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    output = run(runtime)
    assert output.status == "manual_review"
    assert any(
        item.issue_type == "reversed_date_range"
        for item in output.resume_intelligence.inconsistencies
    )


def test_overlapping_roles_are_not_double_counted():
    entries = [
        ExperienceEntry(
            id="a",
            start_date=parse_date("Jan 2020"),
            end_date=parse_date("Dec 2020"),
            source=SourceReference(),
            confidence=confidence(1),
        ),
        ExperienceEntry(
            id="b",
            start_date=parse_date("Jul 2020"),
            end_date=parse_date("Jun 2021"),
            source=SourceReference(),
            confidence=confidence(1),
        ),
    ]
    result = calculate_experience(entries)
    assert result.non_overlapping_professional_months == 18


def test_internship_duration_is_separate():
    entries = [
        ExperienceEntry(
            id="intern",
            role_title="Software Intern",
            employment_type="internship",
            start_date=parse_date("Jan 2020"),
            end_date=parse_date("Jun 2020"),
            source=SourceReference(),
            confidence=confidence(1),
        )
    ]
    result = calculate_experience(entries)
    assert result.internship_months == 6
    assert result.non_overlapping_professional_months == 0


def test_metrics_are_preserved_exactly_without_invention():
    source = SourceReference(provenance_ids=["p"])
    metrics = extract_metrics("Reduced runtime by 40% across 2 TB daily.", source)
    values = [metric.metric_value for metric in metrics]
    assert "40%" in values
    assert "2 TB" in values
    assert all("estimated" not in metric.context for metric in metrics)


def test_course_is_not_presented_as_certification():
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    credentials = run(runtime).resume_intelligence.certifications
    course = next(item for item in credentials if "Course" in item.name)
    assert course.credential_type == "course"


def test_leadership_and_collaboration_are_distinct():
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    experience = run(runtime).resume_intelligence.experience[0]
    assert experience.leadership_evidence
    assert experience.collaboration_evidence
    assert all("Collaborated" not in item.text for item in experience.leadership_evidence)


def test_missing_summary_is_quality_signal_not_ats_score():
    parsed = deepcopy(PARSED)
    parsed["summary"] = ""
    selected = record(parsed=parsed)
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    intelligence = run(runtime).resume_intelligence
    assert any(signal.code == "missing_summary" for signal in intelligence.quality_signals)
    assert "ats" not in intelligence.model_dump()


def test_duplicate_bullets_are_detected():
    parsed = deepcopy(PARSED)
    parsed["experience"][0]["description"].append(
        parsed["experience"][0]["description"][0]
    )
    selected = record(parsed=parsed)
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    assert any(
        signal.code == "duplicate_bullets"
        for signal in run(runtime).resume_intelligence.quality_signals
    )


def test_duplicate_projects_are_detected():
    parsed = deepcopy(PARSED)
    parsed["projects"].append(deepcopy(parsed["projects"][0]))
    selected = record(parsed=parsed)
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    assert any(
        item.issue_type == "duplicate_project"
        for item in run(runtime).resume_intelligence.inconsistencies
    )


def test_checkpoint_restore_does_not_reprocess_completed_workflow():
    selected = record()
    runtime, _, _, checkpoints = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    output = run(runtime)
    restored = runtime.engine.resume(output.workflow_id)
    assert restored.workflow_status.value == "COMPLETED"
    assert len(restored.completed_nodes) == 7  # semantic node was intentionally skipped


def test_raw_only_resume_uses_selected_structured_parser():
    parsed = {"raw_text": RAW, "parse_status": "pending"}
    selected = record(parsed=parsed)
    calls = []

    def parser(text):
        calls.append(text)
        return deepcopy(PARSED)

    runtime, _, _, _ = service(
        {"selected": selected},
        {selected["file_path"]: RAW.encode()},
        parser=parser,
    )
    output = run(runtime)
    assert output.status == "completed"
    assert calls == [RAW]


def test_major_facts_have_valid_provenance():
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    intelligence = run(runtime).resume_intelligence
    known = set(intelligence.provenance)
    references = [
        *(item.source for item in intelligence.experience),
        *(item.source for item in intelligence.projects),
        *(item.source for item in intelligence.skills),
        *(item.source for item in intelligence.education),
        *(item.source for item in intelligence.certifications),
    ]
    assert all(ref.provenance_ids and set(ref.provenance_ids) <= known for ref in references)


def test_no_selected_resume_id_is_blocked():
    runtime, _, _, _ = service({}, {})
    assert run(runtime, selected_resume_id="").status == "blocked"


class DriftingRepository(FakeRepository):
    def __init__(self, records, *, drift_call, field, value):
        super().__init__(records)
        self.drift_call = drift_call
        self.field = field
        self.value = value
        self.calls = 0

    def get_selected_snapshot(self, resume_id, user_id):
        self.calls += 1
        if self.calls == self.drift_call:
            self.records[resume_id][self.field] = self.value
        return super().get_selected_snapshot(resume_id, user_id)


def test_version_change_during_execution_stops_pipeline():
    selected = record()
    repository = DriftingRepository(
        {"selected": selected},
        drift_call=4,
        field="resume_version",
        value=2,
    )
    storage = FakeStorage({selected["file_path"]: RAW.encode()})
    runtime = SelectedResumeIntelligenceService(
        repository=repository,
        storage=storage,
        checkpoint_store=InMemoryCheckpointStore(),
    )
    output = run(runtime)
    assert output.status == "blocked"
    latest = runtime.engine.checkpoint_store.latest(output.workflow_id)
    phase = latest.state.future_payloads.extensions["selected_resume_phase2"]
    assert phase["invalidated"] is True
    assert "intelligence" not in phase


def test_fingerprint_change_during_execution_stops_pipeline():
    selected = record()
    repository = DriftingRepository(
        {"selected": selected},
        drift_call=4,
        field="source_fingerprint",
        value="f" * 64,
    )
    storage = FakeStorage({selected["file_path"]: RAW.encode()})
    runtime = SelectedResumeIntelligenceService(
        repository=repository,
        storage=storage,
        checkpoint_store=InMemoryCheckpointStore(),
    )
    assert run(runtime).status == "blocked"


def test_multiple_experience_entries_are_preserved():
    parsed = deepcopy(PARSED)
    parsed["experience"].append(
        {
            "company": "Earlier Corp",
            "role": "Data Intern",
            "start_date": "Jan 2020",
            "end_date": "Jun 2020",
            "description": ["Built SQL reports."],
        }
    )
    selected = record(parsed=parsed)
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    assert len(run(runtime).resume_intelligence.experience) == 2


def test_overlapping_experience_is_structured_ambiguity():
    parsed = deepcopy(PARSED)
    parsed["experience"][0]["end_date"] = "Dec 2022"
    parsed["experience"].append(
        {
            "company": "Concurrent Corp",
            "role": "Consultant",
            "start_date": "Jun 2022",
            "end_date": "Dec 2023",
            "description": ["Built Python services."],
        }
    )
    selected = record(parsed=parsed)
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    assert any(
        item.issue_type == "overlapping_experience"
        for item in run(runtime).resume_intelligence.ambiguities
    )


def test_academic_project_type_is_evidence_based():
    parsed = deepcopy(PARSED)
    parsed["projects"][0]["description"].append("Academic capstone at university.")
    selected = record(parsed=parsed)
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    assert run(runtime).resume_intelligence.projects[0].project_type == "academic"


def test_project_employment_context_is_preserved_when_explicit():
    parsed = deepcopy(PARSED)
    parsed["projects"][0]["role"] = "Example Corp"
    selected = record(parsed=parsed)
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    assert run(runtime).resume_intelligence.projects[0].associated_context == "Example Corp"


def test_deployment_is_not_inferred_from_build_wording():
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    assert not run(runtime).resume_intelligence.projects[0].deployment_evidence


def test_summary_year_claim_conflict_is_reported():
    parsed = deepcopy(PARSED)
    parsed["summary"] = "Data engineer with 15 years of experience."
    selected = record(parsed=parsed)
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    assert any(
        item.issue_type == "experience_claim_conflict"
        for item in run(runtime).resume_intelligence.inconsistencies
    )


def test_reversed_education_dates_require_manual_review():
    parsed = deepcopy(PARSED)
    parsed["education"][0]["start_date"] = "2022"
    parsed["education"][0]["end_date"] = "2020"
    selected = record(parsed=parsed)
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    output = run(runtime)
    assert output.status == "manual_review"
    assert any(
        item.issue_type == "reversed_education_date_range"
        for item in output.resume_intelligence.inconsistencies
    )


def test_targeted_repair_removes_unsupported_structured_skill():
    parsed = deepcopy(PARSED)
    parsed["skills"].append("COBOL")
    selected = record(parsed=parsed)
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    output = run(runtime)
    assert output.status == "completed"
    assert "COBOL" not in [skill.normalized_name for skill in output.resume_intelligence.skills]
    assert any("Removed unsupported" in warning for warning in output.warnings)


class CapturingSemanticAnalyzer:
    def __init__(self, insights, failures=0):
        self.insights = insights
        self.failures = failures
        self.calls = []

    def analyze(self, text):
        self.calls.append(text)
        if len(self.calls) <= self.failures:
            raise TimeoutError("semantic timeout")
        return self.insights


def test_grounded_semantic_inference_remains_inferred():
    analyzer = CapturingSemanticAnalyzer(
        SemanticInsights(
            inferred_capabilities=[
                SemanticCapability(
                    name="Data pipeline engineering",
                    supporting_quote="Built Python pipelines processing 2 TB daily.",
                    inference_reason="The resume demonstrates pipeline implementation.",
                    limitations=["Does not establish organization-wide ownership."],
                    confidence=0.82,
                )
            ]
        )
    )
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected},
        {selected["file_path"]: RAW.encode()},
        semantic=analyzer,
    )
    capability = run(runtime).resume_intelligence.inferred_capabilities[0]
    assert capability.status == "inferred"
    assert capability.confirmation_status == "unconfirmed"


def test_unsupported_semantic_quote_is_discarded():
    analyzer = CapturingSemanticAnalyzer(
        SemanticInsights(
            inferred_capabilities=[
                SemanticCapability(
                    name="Invented Capability",
                    supporting_quote="This quote does not exist.",
                    inference_reason="Unsupported",
                    confidence=0.99,
                )
            ]
        )
    )
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected},
        {selected["file_path"]: RAW.encode()},
        semantic=analyzer,
    )
    assert not run(runtime).resume_intelligence.inferred_capabilities


def test_semantic_domain_requires_selected_resume_quote():
    analyzer = CapturingSemanticAnalyzer(
        SemanticInsights(
            domains=[
                SemanticDomain(
                    domain="data engineering",
                    supporting_quote="Data engineer building reliable data platforms.",
                    explicit=True,
                    confidence=0.91,
                )
            ]
        )
    )
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected},
        {selected["file_path"]: RAW.encode()},
        semantic=analyzer,
    )
    assert run(runtime).resume_intelligence.domain_experience[0].domain == "data engineering"


def test_semantic_timeout_retries_once_then_succeeds():
    analyzer = CapturingSemanticAnalyzer(SemanticInsights(), failures=1)
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected},
        {selected["file_path"]: RAW.encode()},
        semantic=analyzer,
    )
    assert run(runtime).status == "completed"
    assert len(analyzer.calls) == 2


def test_semantic_retry_is_bounded():
    analyzer = CapturingSemanticAnalyzer(SemanticInsights(), failures=99)
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected},
        {selected["file_path"]: RAW.encode()},
        semantic=analyzer,
    )
    assert run(runtime).status == "failed"
    assert len(analyzer.calls) == 2


def test_unselected_content_never_reaches_semantic_prompt():
    analyzer = CapturingSemanticAnalyzer(SemanticInsights())
    selected = record()
    other = record("other", content=b"OTHER-RESUME-SECRET")
    runtime, _, _, _ = service(
        {"selected": selected, "other": other},
        {
            selected["file_path"]: RAW.encode(),
            other["file_path"]: b"OTHER-RESUME-SECRET",
        },
        semantic=analyzer,
    )
    run(runtime)
    assert analyzer.calls and "OTHER-RESUME-SECRET" not in analyzer.calls[0]


def test_logs_do_not_contain_contact_details_or_resume_text(caplog):
    selected = record()
    runtime, _, _, _ = service(
        {"selected": selected}, {selected["file_path"]: RAW.encode()}
    )
    run(runtime)
    logs = caplog.text
    assert "narendra@example.com" not in logs
    assert "+91 99999 99999" not in logs
    assert "Built Python pipelines" not in logs


@pytest.mark.parametrize(
    ("score", "label"),
    [(0.9, ConfidenceLabel.HIGH), (0.7, ConfidenceLabel.MEDIUM),
     (0.3, ConfidenceLabel.LOW), (0, ConfidenceLabel.UNKNOWN)],
)
def test_confidence_labels_are_calibrated(score, label):
    assert confidence(score).label == label


@pytest.mark.parametrize(
    ("value", "year", "month"),
    [("Jan 2024", 2024, 1), ("12/2023", 2023, 12), ("2022", 2022, None)],
)
def test_date_formats_are_normalized(value, year, month):
    parsed = parse_date(value)
    assert (parsed.year, parsed.month) == (year, month)
