import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL")

def migrate():
    print("Connecting to database...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    try:
        print("Renaming column google_sub to provider_user_id...")
        cur.execute("""
            ALTER TABLE public.users 
            RENAME COLUMN google_sub TO provider_user_id;
        """)
        conn.commit()
        print("Migration successful.")
    except Exception as e:
        print(f"Migration error or already migrated: {e}")
        conn.rollback()

    cur.close()
    conn.close()

if __name__ == "__main__":
    migrate()
