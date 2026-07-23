"""Apply Selected Resume Intelligence identity columns to Docker Postgres."""

from __future__ import annotations

import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
MIGRATION_FILE = (
    PROJECT_DIR
    / "supabase"
    / "migrations"
    / "20260724050000_add_resume_intelligence_identity.sql"
)
EXPECTED_COLUMNS = {
    "resume_version",
    "source_fingerprint",
    "fingerprint_algorithm",
    "fingerprinted_at",
}
LOCK_ID = 20260724050000


def run_migration() -> None:
    load_dotenv(BACKEND_DIR / ".env")
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in backend/.env")
    sql = MIGRATION_FILE.read_text(encoding="utf-8")
    connection = psycopg2.connect(database_url)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_database(), current_user")
            database_name, database_user = cursor.fetchone()
            print(
                f"Applying resume intelligence identity migration to "
                f"database={database_name} user={database_user}..."
            )
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_ID,))
            cursor.execute("SELECT to_regclass('public.resumes')")
            if cursor.fetchone()[0] is None:
                raise RuntimeError("public.resumes does not exist")
            cursor.execute(sql)
            cursor.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'resumes'
                  AND column_name = ANY(%s)
                """,
                (list(EXPECTED_COLUMNS),),
            )
            present = {row[0] for row in cursor.fetchall()}
            missing = EXPECTED_COLUMNS - present
            if missing:
                raise RuntimeError(f"Missing resume identity columns: {sorted(missing)}")
        connection.commit()
        print("Resume intelligence identity migration completed and verified.")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    run_migration()
