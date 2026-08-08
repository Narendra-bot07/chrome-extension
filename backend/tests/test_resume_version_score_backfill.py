"""Regression tests for ResumeRepository._backfill_version_score.

Production bug (2026-08-08): Resume Manager's version-compare view showed
"No score diff" / "N/A -> N/A" for real, named tailored versions
("Accenture Tailored" vs "v39 - NVIDIA Tailored") because compare_versions
only ever read the ats_score/resume_match_score columns as stored -- for any
version created before those columns started being written back (or where
the best-effort background scorer call silently failed/timed out), the
comparison was permanently stuck showing nothing, with no way to recover.
"""

from unittest.mock import MagicMock

from repositories.resume_repository import ResumeRepository

RESUME_CONTENT = {
    "personal_info": {"name": "Jane Doe"},
    "summary": "Senior data engineer with 6 years building Python ETL pipelines.",
    "skills": ["Python", "SQL", "AWS", "Kubernetes"],
    "experience": [
        {
            "company": "Acme", "role": "Senior Data Engineer",
            "description": ["Built Python and AWS data pipelines at scale."],
        },
    ],
}

# Shaped like the frontend's job object (job_title/skills), NOT like
# JobAnalysis's own field names (title/required_skills) -- organized_jd is
# populated straight from AppContext's jobAnalysis state.
ORGANIZED_JD = {
    "job_title": "Senior Data Engineer",
    "company_name": "NVIDIA",
    "skills": ["Python", "SQL", "AWS", "Kubernetes"],
    "responsibilities": ["Build and own data pipelines."],
}


def test_backfill_skips_when_scores_already_present():
    repo = ResumeRepository(MagicMock())
    cur = MagicMock()
    version = {"id": "v1", "ats_score": 80, "resume_match_score": 70, "job_id": "app-1"}

    result = repo._backfill_version_score(cur, version)

    assert result == version
    cur.execute.assert_not_called()


def test_backfill_skips_when_no_job_id():
    repo = ResumeRepository(MagicMock())
    cur = MagicMock()
    version = {"id": "v1", "ats_score": None, "resume_match_score": None, "job_id": None}

    result = repo._backfill_version_score(cur, version)

    assert result == version
    cur.execute.assert_not_called()


def test_backfill_skips_when_linked_application_has_no_structured_job_data():
    repo = ResumeRepository(MagicMock())
    cur = MagicMock()
    cur.fetchone.return_value = {"organized_jd": {}}
    version = {"id": "v1", "ats_score": None, "resume_match_score": None, "job_id": "app-1", "content": RESUME_CONTENT}

    result = repo._backfill_version_score(cur, version)

    assert result == version
    # Only the SELECT should have run -- no UPDATE without real job data.
    assert cur.execute.call_count == 1


def test_backfill_recomputes_and_persists_score_from_linked_application():
    repo = ResumeRepository(MagicMock())
    cur = MagicMock()
    updated_row = {
        "id": "v1", "ats_score": 55.0, "resume_match_score": 60.0,
        "job_id": "app-1", "content": RESUME_CONTENT,
    }
    cur.fetchone.side_effect = [
        {"organized_jd": ORGANIZED_JD},  # SELECT organized_jd
        updated_row,                      # UPDATE ... RETURNING *
    ]
    version = {"id": "v1", "ats_score": None, "resume_match_score": None, "job_id": "app-1", "content": RESUME_CONTENT}

    result = repo._backfill_version_score(cur, version)

    assert result == updated_row
    assert cur.execute.call_count == 2
    update_sql = cur.execute.call_args_list[1].args[0]
    assert "UPDATE public.resume_versions" in update_sql
    assert "COALESCE(ats_score" in update_sql


def test_list_versions_backfills_scores_for_every_returned_version():
    """Resume Manager's version LIST (not just Compare Mode) reads ats_score/
    resume_match_score directly too -- a real production screenshot
    (2026-08-08) showed "No ATS Score" / "No Match Score" on named tailored
    versions ("Accenture Tailored", "Anthropic Tailored") in this exact
    list. list_versions must run the same backfill compare_versions does."""
    repo = ResumeRepository(MagicMock())
    cur = MagicMock()
    repo.conn.cursor.return_value.__enter__.return_value = cur
    resume_row = {"id": "resume-1", "user_id": "user-1", "parsed_content": {}, "created_at": "2026-08-01"}
    version_no_score = {
        "id": "v52", "version_number": 52, "resume_id": "resume-1",
        "ats_score": None, "resume_match_score": None,
        "job_id": "app-1", "content": RESUME_CONTENT,
    }
    updated_row = {**version_no_score, "ats_score": 72.0, "resume_match_score": 68.0}
    cur.fetchone.side_effect = [
        resume_row,                       # resume ownership check
        {"organized_jd": ORGANIZED_JD},   # _backfill_version_score's SELECT organized_jd
        updated_row,                      # _backfill_version_score's UPDATE ... RETURNING *
    ]
    cur.fetchall.return_value = [version_no_score]

    rows = repo.list_versions("resume-1", "user-1")

    assert rows == [updated_row]
    repo.conn.commit.assert_called()
