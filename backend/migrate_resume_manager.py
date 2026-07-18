import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")


def run_migration():
    if not DB_URL:
        raise RuntimeError("DATABASE_URL is not set")

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("""
        ALTER TABLE public.resumes
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;
    """)
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_resumes_one_active_per_user
        ON public.resumes(user_id)
        WHERE is_active = TRUE AND deleted_at IS NULL;
    """)
    cur.execute("""
        WITH latest AS (
            SELECT DISTINCT ON (user_id) id
            FROM public.resumes
            WHERE deleted_at IS NULL
            ORDER BY user_id, created_at DESC
        )
        UPDATE public.resumes r
        SET is_active = TRUE
        FROM latest
        WHERE r.id = latest.id
          AND NOT EXISTS (
              SELECT 1
              FROM public.resumes existing
              WHERE existing.user_id = r.user_id
                AND existing.is_active = TRUE
                AND existing.deleted_at IS NULL
          );
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("Resume manager migration completed.")


if __name__ == "__main__":
    run_migration()
