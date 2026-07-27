"""Apply and verify database constraints for validated profile identity fields."""
import os
from pathlib import Path
import psycopg2
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
MIGRATION = PROJECT_DIR / "supabase" / "migrations" / "20260727030000_profile_validation_constraints.sql"

def main():
    load_dotenv(BACKEND_DIR / ".env")
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is not configured.")
    with psycopg2.connect(url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select pg_advisory_xact_lock(%s)", (20260727030000,))
            cursor.execute(MIGRATION.read_text(encoding="utf-8"))
            cursor.execute("select to_regclass('public.profiles_username_unique_idx')")
            if cursor.fetchone()[0] is None:
                raise RuntimeError("Profile validation migration verification failed.")
    print("Profile validation constraints applied and verified.")

if __name__ == "__main__":
    main()
