import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL")

def init_db():
    print("Connecting to database...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    print("Creating public.users table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            google_sub VARCHAR UNIQUE,
            email VARCHAR UNIQUE NOT NULL,
            full_name VARCHAR,
            avatar_url TEXT,
            provider VARCHAR DEFAULT 'email',
            password_hash VARCHAR,
            email_verified BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_login TIMESTAMP WITH TIME ZONE,
            is_active BOOLEAN DEFAULT TRUE
        );
    """)

    # Attempt to migrate users from auth.users if it exists and public.users is empty
    try:
        cur.execute("SELECT COUNT(*) FROM public.users;")
        count = cur.fetchone()[0]
        if count == 0:
            print("public.users is empty. Checking for existing auth.users to migrate...")
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'auth' AND table_name = 'users'
                );
            """)
            auth_exists = cur.fetchone()[0]
            if auth_exists:
                print("Migrating users from auth.users to public.users...")
                cur.execute("""
                    INSERT INTO public.users (id, email, password_hash, created_at, full_name, provider)
                    SELECT 
                        id, 
                        email, 
                        password_hash, 
                        COALESCE(created_at, NOW()),
                        raw_user_meta_data->>'full_name',
                        'email'
                    FROM auth.users
                    ON CONFLICT (email) DO NOTHING;
                """)
                print(f"Migrated {cur.rowcount} users.")
    except Exception as e:
        print(f"Migration error: {e}")
        conn.rollback()

    conn.commit()
    cur.close()
    conn.close()
    print("Database initialized successfully.")

if __name__ == "__main__":
    init_db()
