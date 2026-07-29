"""Apply and verify the tailr4u notifications/reminders schema.

Usage from the backend directory:

    python migrate_notifications.py

The migration is transactional, guarded by a Postgres advisory lock, and safe
to run repeatedly.
"""
from __future__ import annotations

import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
MIGRATION_FILE = PROJECT_DIR / "supabase" / "migrations" / "20260727020000_notifications_and_reminders.sql"
EXPECTED_TABLES = {
    "notification_events",
    "notifications",
    "reminders",
    "notification_deliveries",
    "notification_preferences",
}
EXPECTED_INDEXES = {
    "notifications_active_dedup_idx",
    "notifications_feed_idx",
    "notifications_state_idx",
    "reminders_due_idx",
    "reminders_user_idx",
    "notification_deliveries_pending_idx",
}
MIGRATION_LOCK_ID = 20260727020000


def database_url() -> str:
    load_dotenv(BACKEND_DIR / ".env")
    load_dotenv(PROJECT_DIR / ".env")
    value = os.getenv("DATABASE_URL", "").strip()
    if not value:
        raise RuntimeError("DATABASE_URL is not set in backend/.env.")
    return value


def verify(cursor) -> None:
    cursor.execute(
        """select table_name from information_schema.tables
           where table_schema='public' and table_name = any(%s)""",
        (list(EXPECTED_TABLES),),
    )
    missing_tables = EXPECTED_TABLES - {row[0] for row in cursor.fetchall()}
    cursor.execute(
        """select indexname from pg_indexes
           where schemaname='public' and indexname = any(%s)""",
        (list(EXPECTED_INDEXES),),
    )
    missing_indexes = EXPECTED_INDEXES - {row[0] for row in cursor.fetchall()}
    if missing_tables or missing_indexes:
        raise RuntimeError(
            f"Migration verification failed; missing tables={sorted(missing_tables)}, "
            f"missing indexes={sorted(missing_indexes)}"
        )


def run_migration() -> None:
    if not MIGRATION_FILE.is_file():
        raise RuntimeError(f"Migration file not found: {MIGRATION_FILE}")
    sql = MIGRATION_FILE.read_text(encoding="utf-8")
    connection = psycopg2.connect(database_url())
    try:
        connection.autocommit = False
        with connection.cursor() as cursor:
            cursor.execute("select current_database(), current_user")
            name, user = cursor.fetchone()
            print(f"Applying notification migration to database={name} user={user}...")
            cursor.execute("select pg_advisory_xact_lock(%s)", (MIGRATION_LOCK_ID,))
            cursor.execute("select to_regclass('public.users'), to_regclass('public.applications')")
            users, applications = cursor.fetchone()
            if users is None or applications is None:
                raise RuntimeError(
                    "Base tables public.users and public.applications are required first."
                )
            cursor.execute(sql)
            verify(cursor)
        connection.commit()
        print("Notification migration completed and verified.")
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    run_migration()
