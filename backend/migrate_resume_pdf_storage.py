import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")


def run_migration():
    """
    Adds applications.resume_file_path, mirroring the existing
    cover_letter_file_path column added by migrate_cover_letters_storage.py.
    The 'generated-resumes' bucket and its user-scoped RLS policies already
    exist (confirmed directly against the live database) -- this migration
    only needs the new column.

    This backs a fix for DocumentsTab.jsx's "Download"/"Preview" actions,
    which previously re-ran the full Playwright resume render (45-75s
    observed in production) on every single click, even for an unchanged
    resume, because nothing ever recorded where a previously-rendered PDF
    had already been persisted. See api/v1/applications.py's new
    GET/POST /applications/{id}/resume-pdf endpoints.
    """
    if not DB_URL:
        raise RuntimeError("DATABASE_URL is not set")

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    cur.execute("""
        ALTER TABLE public.applications
        ADD COLUMN IF NOT EXISTS resume_file_path TEXT;
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("applications.resume_file_path column is in place.")


if __name__ == "__main__":
    run_migration()
