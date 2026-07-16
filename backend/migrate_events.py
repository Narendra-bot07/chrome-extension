import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

def run_migration():
    print("Running event tracking migration...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    # Create user_events table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.user_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
            event_type VARCHAR(100) NOT NULL,
            resource_type VARCHAR(100),
            resource_id VARCHAR(255),
            metadata JSONB DEFAULT '{}'::jsonb,
            session_id VARCHAR(255),
            device_id VARCHAR(255),
            ip_address VARCHAR(45),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON public.user_events(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_events_event_type ON public.user_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_user_events_created_at ON public.user_events(created_at);
        CREATE INDEX IF NOT EXISTS idx_user_events_resource ON public.user_events(resource_type, resource_id);
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("Event tracking migration completed successfully.")

if __name__ == "__main__":
    run_migration()
