"""Apply the generic workflow-orchestration schema to the configured Postgres DB.

Usage from the backend directory:

    py -3 migrate_workflow_orchestration.py

The script reads DATABASE_URL from backend/.env, executes the canonical SQL
migration in one transaction, and verifies the resulting tables and indexes.
It is safe to run repeatedly.
"""

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
    / "20260724040000_create_workflow_orchestration.sql"
)
EXPECTED_TABLES = {"workflow_runs", "workflow_checkpoints"}
EXPECTED_INDEXES = {
    "workflow_runs_request_id_idx",
    "workflow_runs_owner_id_idx",
    "workflow_runs_status_idx",
    "workflow_checkpoints_workflow_revision_idx",
}
MIGRATION_LOCK_ID = 20260724040000


def _load_database_url() -> str:
    load_dotenv(BACKEND_DIR / ".env")
    load_dotenv(PROJECT_DIR / ".env")
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. Add it to backend/.env before migrating."
        )
    return database_url


def _load_sql() -> str:
    if not MIGRATION_FILE.is_file():
        raise RuntimeError(f"Migration SQL not found: {MIGRATION_FILE}")
    sql = MIGRATION_FILE.read_text(encoding="utf-8").strip()
    if not sql:
        raise RuntimeError(f"Migration SQL is empty: {MIGRATION_FILE}")
    return sql


def _verify_schema(cursor) -> None:
    cursor.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY(%s)
        """,
        (list(EXPECTED_TABLES),),
    )
    tables = {row[0] for row in cursor.fetchall()}
    missing_tables = EXPECTED_TABLES - tables
    if missing_tables:
        raise RuntimeError(
            f"Workflow migration verification failed; missing tables: "
            f"{sorted(missing_tables)}"
        )

    cursor.execute(
        """
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY(%s)
        """,
        (list(EXPECTED_INDEXES),),
    )
    indexes = {row[0] for row in cursor.fetchall()}
    missing_indexes = EXPECTED_INDEXES - indexes
    if missing_indexes:
        raise RuntimeError(
            f"Workflow migration verification failed; missing indexes: "
            f"{sorted(missing_indexes)}"
        )

    cursor.execute(
        """
        SELECT ccu.table_schema, ccu.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.constraint_schema = tc.constraint_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'workflow_runs'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.column_name = 'id'
        """
    )
    owner_target = cursor.fetchone()
    if owner_target != ("public", "users"):
        raise RuntimeError(
            "workflow_runs.owner_id is not linked to public.users(id)"
        )


def run_migration() -> None:
    database_url = _load_database_url()
    migration_sql = _load_sql()
    connection = psycopg2.connect(database_url)
    try:
        connection.autocommit = False
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_database(), current_user")
            database_name, database_user = cursor.fetchone()
            print(
                f"Applying workflow orchestration migration to "
                f"database={database_name} user={database_user}..."
            )

            cursor.execute(
                "SELECT pg_advisory_xact_lock(%s)",
                (MIGRATION_LOCK_ID,),
            )
            cursor.execute(
                "SELECT to_regclass('public.users')"
            )
            if cursor.fetchone()[0] is None:
                raise RuntimeError(
                    "public.users does not exist. Run the authentication/base "
                    "database migration first."
                )

            cursor.execute(migration_sql)
            _verify_schema(cursor)

        connection.commit()
        print(
            "Workflow orchestration migration completed and verified: "
            "public.workflow_runs, public.workflow_checkpoints."
        )
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    run_migration()
