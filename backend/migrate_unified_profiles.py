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
            cur.execute(
                """
                ALTER TABLE public.users
                    ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'password',
                    ADD COLUMN IF NOT EXISTS has_password_credential BOOLEAN DEFAULT FALSE,
                    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS locale TEXT;

                UPDATE public.users
                SET auth_provider = CASE WHEN provider = 'google' THEN 'google' ELSE 'password' END,
                    has_password_credential = (password_hash IS NOT NULL),
                    email_verified_at = CASE
                        WHEN email_verified = TRUE THEN COALESCE(email_verified_at, created_at)
                        ELSE email_verified_at
                    END;

                ALTER TABLE public.profiles
                    ADD COLUMN IF NOT EXISTS first_name TEXT,
                    ADD COLUMN IF NOT EXISTS last_name TEXT,
                    ADD COLUMN IF NOT EXISTS preferred_name TEXT,
                    ADD COLUMN IF NOT EXISTS username TEXT,
                    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
                    ADD COLUMN IF NOT EXISTS gender TEXT,
                    ADD COLUMN IF NOT EXISTS phone_country_code TEXT,
                    ADD COLUMN IF NOT EXISTS phone_number TEXT,
                    ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS country TEXT,
                    ADD COLUMN IF NOT EXISTS state TEXT,
                    ADD COLUMN IF NOT EXISTS city TEXT,
                    ADD COLUMN IF NOT EXISTS timezone TEXT,
                    ADD COLUMN IF NOT EXISTS preferred_language TEXT,
                    ADD COLUMN IF NOT EXISTS uploaded_profile_image_url TEXT,
                    ADD COLUMN IF NOT EXISTS google_profile_image_url TEXT,
                    ADD COLUMN IF NOT EXISTS profile_image_source TEXT,
                    ADD COLUMN IF NOT EXISTS current_title TEXT,
                    ADD COLUMN IF NOT EXISTS years_experience NUMERIC,
                    ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
                    ADD COLUMN IF NOT EXISTS github_url TEXT,
                    ADD COLUMN IF NOT EXISTS portfolio_url TEXT,
                    ADD COLUMN IF NOT EXISTS website_url TEXT,
                    ADD COLUMN IF NOT EXISTS profile_confirmed_at TIMESTAMPTZ,
                    ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ;
                """
            )
        conn.commit()
        print("Unified authentication/profile migration complete.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
