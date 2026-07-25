"""Apply ATS Intelligence schema migration to Docker Postgres."""

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
    / "20260725120000_create_ats_intelligence.sql"
)
LOCK_ID = 20260725120000


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
                f"Applying ATS intelligence migration to "
                f"database={database_name} user={database_user}..."
            )
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_ID,))
            
            # Execute the migration sql
            cursor.execute(sql)
            
            # Verify tables exist
            cursor.execute("SELECT to_regclass('public.ats_analyses')")
            if cursor.fetchone()[0] is None:
                raise RuntimeError("public.ats_analyses was not created successfully")
                
            cursor.execute("SELECT to_regclass('public.ats_suggestion_impacts')")
            if cursor.fetchone()[0] is None:
                raise RuntimeError("public.ats_suggestion_impacts was not created successfully")
                
        connection.commit()
        print("ATS intelligence migration completed and verified successfully.")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    run_migration()
