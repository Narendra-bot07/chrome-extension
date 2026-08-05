from typing import Dict, Any, Optional
from psycopg2.extras import RealDictCursor, Json


class JobPreferencesRepository:
    def __init__(self, conn):
        self.conn = conn

    # Columns beyond the original 6 (added via migrate_job_preferences_extended_fields.py
    # for existing deployments) -- listed here too so a fresh database gets them via
    # ensure_table() alone, and so upsert() has one place to read the full column set from.
    EXTENDED_COLUMNS = [
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
            for column, definition in self.EXTENDED_COLUMNS:
                cur.execute(f"ALTER TABLE public.job_preferences ADD COLUMN IF NOT EXISTS {column} {definition}")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_job_preferences_user_id ON public.job_preferences(user_id)")
        self.conn.commit()

    def table_exists(self) -> bool:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT to_regclass('public.job_preferences') AS table_name")
            row = cur.fetchone()
            return bool(row and row.get("table_name"))

    def get_by_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        from services.cache.redis_cache import redis_cache
        import json

        cache_key = f"job_prefs:{user_id}"
        cached = redis_cache.get(cache_key)
        if cached:
            try:
                return json.loads(cached) if isinstance(cached, str) else cached
            except Exception:
                pass

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
                row = cur.fetchone()
                if row:
                    redis_cache.set(cache_key, row, ttl_seconds=300)
                return row
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

    _JSON_FIELDS = {
        "target_roles", "target_companies", "preferred_locations", "priority_skills",
        "preferred_industries", "work_modes", "secondary_skills", "employment_types",
        "company_size_preferences", "seniority_preferences",
    }
    _BOOL_FIELDS = {"is_salary_negotiable"}
    _TEXT_DEFAULTS = {
        "work_preference": "No Preference",
        "experience_level": "No Preference",
        "compensation_currency": "USD",
        "salary_period": "Annual",
        "job_alert_frequency": "Weekly",
    }

    def upsert(self, user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        self.ensure_table()

        columns = (
            ["target_roles", "target_companies", "preferred_locations", "work_preference",
             "experience_level", "priority_skills"]
            + [name for name, _ in self.EXTENDED_COLUMNS]
        )
        values = []
        for column in columns:
            raw = payload.get(column)
            if column in self._JSON_FIELDS:
                values.append(Json(raw or []))
            elif column in self._BOOL_FIELDS:
                values.append(bool(raw) if raw is not None else True)
            else:
                values.append(raw if raw not in (None, "") else self._TEXT_DEFAULTS.get(column, ""))

        placeholders = ", ".join(["%s"] * len(columns))
        column_list = ", ".join(columns)
        update_clause = ", ".join(f"{column} = EXCLUDED.{column}" for column in columns)
        query = f"""
            INSERT INTO public.job_preferences (user_id, {column_list})
            VALUES (%s, {placeholders})
            ON CONFLICT (user_id)
            DO UPDATE SET
                {update_clause},
                updated_at = NOW()
            RETURNING *
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (user_id, *values))
            row = cur.fetchone() or {}
            self.conn.commit()
            try:
                from services.cache.redis_cache import redis_cache
                redis_cache.delete(f"job_prefs:{user_id}")
            except Exception:
                pass
            return row
