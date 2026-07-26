"""Apply the root-resume intelligence/versioning migration to DATABASE_URL."""

from pathlib import Path

import psycopg2

from core.config import settings


def main() -> None:
    if not settings.DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required")
    migration = (
        Path(__file__).resolve().parent.parent
        / "supabase"
        / "migrations"
        / "20260726000000_resume_intelligence_versioning.sql"
    )
    sql = migration.read_text(encoding="utf-8")
    connection = psycopg2.connect(settings.DATABASE_URL)
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql)
        connection.commit()
        print("Resume intelligence/versioning migration complete.")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    main()
