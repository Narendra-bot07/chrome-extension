import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

def run_migration():
    print("Running migration for user_sessions table...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.user_sessions (
            session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
            device_type VARCHAR(50),
            device_name VARCHAR(100),
            browser VARCHAR(50),
            browser_version VARCHAR(50),
            operating_system VARCHAR(50),
            operating_system_version VARCHAR(50),
            user_agent TEXT,
            ip_address VARCHAR(45),
            city VARCHAR(100),
            state VARCHAR(100),
            country VARCHAR(100),
            timezone VARCHAR(100),
            login_method VARCHAR(50),
            login_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            expires_at TIMESTAMP WITH TIME ZONE,
            is_revoked BOOLEAN DEFAULT FALSE
        );
    """)
    
    cur.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);")
    conn.commit()
    cur.close()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    run_migration()
