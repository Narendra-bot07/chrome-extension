from typing import Dict, Any, Optional
from psycopg2.extras import RealDictCursor, Json


class JobPreferencesRepository:
    def __init__(self, conn):
        self.conn = conn

    def ensure_table(self):
        with self.conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS public.job_preferences (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
                    target_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
                    target_companies JSONB NOT NULL DEFAULT '[]'::jsonb,
                    preferred_locations JSONB NOT NULL DEFAULT '[]'::jsonb,
                    work_preference TEXT NOT NULL DEFAULT 'No Preference',
                    experience_level TEXT NOT NULL DEFAULT 'No Preference',
                    priority_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            cur.execute("CREATE INDEX IF NOT EXISTS idx_job_preferences_user_id ON public.job_preferences(user_id)")
        self.conn.commit()

    def table_exists(self) -> bool:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT to_regclass('public.job_preferences') AS table_name")
            row = cur.fetchone()
            return bool(row and row.get("table_name"))

    def get_by_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            try:
                cur.execute(
                    """
                    SELECT *
                    FROM public.job_preferences
                    WHERE user_id = %s
                    LIMIT 1
                    """,
                    (user_id,)
                )
                return cur.fetchone()
            except Exception:
                self.conn.rollback()
                return None

    def has_completed(self, user_id: str) -> bool:
        prefs = self.get_by_user(user_id)
        if not prefs:
            return False
        return bool(
            prefs.get("target_roles")
            and prefs.get("target_companies")
            and prefs.get("preferred_locations")
        )

    def upsert(self, user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        self.ensure_table()

        query = """
            INSERT INTO public.job_preferences (
                user_id,
                target_roles,
                target_companies,
                preferred_locations,
                work_preference,
                experience_level,
                priority_skills
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (user_id)
            DO UPDATE SET
                target_roles = EXCLUDED.target_roles,
                target_companies = EXCLUDED.target_companies,
                preferred_locations = EXCLUDED.preferred_locations,
                work_preference = EXCLUDED.work_preference,
                experience_level = EXCLUDED.experience_level,
                priority_skills = EXCLUDED.priority_skills,
                updated_at = NOW()
            RETURNING *
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                query,
                (
                    user_id,
                    Json(payload.get("target_roles") or []),
                    Json(payload.get("target_companies") or []),
                    Json(payload.get("preferred_locations") or []),
                    payload.get("work_preference") or "No Preference",
                    payload.get("experience_level") or "No Preference",
                    Json(payload.get("priority_skills") or []),
                )
            )
            record = cur.fetchone()
            self.conn.commit()
            return record or {}
