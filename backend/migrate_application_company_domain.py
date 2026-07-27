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
                ALTER TABLE public.applications
                ADD COLUMN IF NOT EXISTS company_domain TEXT
                """
            )
        conn.commit()
        print("applications.company_domain migration complete.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
