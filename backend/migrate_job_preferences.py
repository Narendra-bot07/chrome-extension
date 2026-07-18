import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def main():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
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
        conn.commit()
        print("job_preferences migration complete.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
