import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")


def run_migration():
    if not DB_URL:
        raise RuntimeError("DATABASE_URL is not set")

    # The SQL file (supabase/migrations/20260727040000_cover_letters_storage_bucket.sql)
    # is not actually applied to the live project by anything in this repo --
    # every other real schema/storage change here was done via one of these
    # standalone migrate_*.py scripts run directly against DATABASE_URL, so
    # that's the one that actually needs to run for the bucket to show up in
    # the Supabase dashboard.
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    cur.execute("""
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('cover-letters', 'cover-letters', false)
        ON CONFLICT (id) DO NOTHING;
    """)

    policies = [
        (
            "Users can upload their own cover letters",
            "FOR INSERT WITH CHECK (bucket_id = 'cover-letters' AND auth.uid()::text = (storage.foldername(name))[1])",
        ),
        (
            "Users can view their own cover letters",
            "FOR SELECT USING (bucket_id = 'cover-letters' AND auth.uid()::text = (storage.foldername(name))[1])",
        ),
        (
            "Users can update their own cover letters",
            "FOR UPDATE USING (bucket_id = 'cover-letters' AND auth.uid()::text = (storage.foldername(name))[1])",
        ),
        (
            "Users can delete their own cover letters",
            "FOR DELETE USING (bucket_id = 'cover-letters' AND auth.uid()::text = (storage.foldername(name))[1])",
        ),
    ]
    for name, definition in policies:
        cur.execute(f'DROP POLICY IF EXISTS "{name}" ON storage.objects;')
        cur.execute(f'CREATE POLICY "{name}" ON storage.objects {definition};')

    cur.execute("""
        ALTER TABLE public.applications
        ADD COLUMN IF NOT EXISTS cover_letter_file_path TEXT;
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("cover-letters bucket, storage RLS policies, and applications.cover_letter_file_path column are in place.")


if __name__ == "__main__":
    run_migration()
