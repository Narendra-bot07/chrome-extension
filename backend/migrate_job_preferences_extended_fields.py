"""
Standalone migration: adds the extended job-preferences columns that
JobPreferencesPage.jsx's form has always collected (primary_role,
work_modes, compensation fields, notice_period, etc.) but the backend
never had columns for -- JobPreferencesPayload only ever recognized 6
fields, so Pydantic silently dropped everything else on every save,
and the page fell back to its hardcoded DEFAULT_PREFERENCES object for
those fields on every load. That's why it looked identical for every
user: those ~20 fields were never actually being persisted or read
back for ANYONE.

Safe to run multiple times (IF NOT EXISTS everywhere).
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

NEW_COLUMNS = [
    ("primary_role", "TEXT NOT NULL DEFAULT ''"),
    ("primary_company", "TEXT NOT NULL DEFAULT ''"),
    ("preferred_industries", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
    ("work_modes", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
    ("relocation_preference", "TEXT NOT NULL DEFAULT ''"),
    ("sponsorship_preference", "TEXT NOT NULL DEFAULT ''"),
    ("current_title", "TEXT NOT NULL DEFAULT ''"),
    ("years_experience", "TEXT NOT NULL DEFAULT ''"),
    ("secondary_skills", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
    ("current_compensation", "TEXT NOT NULL DEFAULT ''"),
    ("expected_compensation", "TEXT NOT NULL DEFAULT ''"),
    ("compensation_currency", "TEXT NOT NULL DEFAULT 'USD'"),
    ("salary_period", "TEXT NOT NULL DEFAULT 'Annual'"),
    ("min_compensation", "TEXT NOT NULL DEFAULT ''"),
    ("is_salary_negotiable", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("employment_types", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
    ("notice_period", "TEXT NOT NULL DEFAULT ''"),
    ("company_size_preferences", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
    ("seniority_preferences", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
    ("job_alert_frequency", "TEXT NOT NULL DEFAULT 'Weekly'"),
]


def run():
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    conn.autocommit = True
    cur = conn.cursor()
    for column, definition in NEW_COLUMNS:
        cur.execute(
            f"ALTER TABLE public.job_preferences ADD COLUMN IF NOT EXISTS {column} {definition}"
        )
        print(f"ensured column: {column}")
    cur.close()
    conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    run()
