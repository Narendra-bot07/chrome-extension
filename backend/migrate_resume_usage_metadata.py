import os
import psycopg2


def main():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                ALTER TABLE public.resumes
                ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS times_used INTEGER DEFAULT 0,
                ADD COLUMN IF NOT EXISTS tailor_count INTEGER DEFAULT 0,
                ADD COLUMN IF NOT EXISTS upload_source TEXT DEFAULT 'user_upload',
                ADD COLUMN IF NOT EXISTS parsing_status TEXT DEFAULT 'unknown',
                ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
            """)
            cur.execute("""
                UPDATE public.resumes
                SET times_used = COALESCE(times_used, 0),
                    tailor_count = COALESCE(tailor_count, times_used, 0),
                    parsing_status = COALESCE(parsing_status, parsed_content->>'parse_status', 'unknown'),
                    updated_at = COALESCE(updated_at, created_at, NOW())
                WHERE deleted_at IS NULL;
            """)
        conn.commit()
        print("Resume usage metadata migration complete.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
