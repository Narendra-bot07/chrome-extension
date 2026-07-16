import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

def run_migration():
    print("Running support migration...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    # Create feedback table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.feedback (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
            rating INTEGER CHECK (rating >= 1 AND rating <= 5),
            category VARCHAR(100) NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            screenshot_url TEXT,
            status VARCHAR(50) DEFAULT 'OPEN',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id);
        CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.feedback(status);
        CREATE INDEX IF NOT EXISTS idx_feedback_category ON public.feedback(category);
    """)

    # Create support_tickets table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.support_tickets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
            subject VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            status VARCHAR(50) DEFAULT 'OPEN',
            priority VARCHAR(50) DEFAULT 'NORMAL',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            resolved_at TIMESTAMP WITH TIME ZONE
        );
        CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
        CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("Support migration completed successfully.")

if __name__ == "__main__":
    run_migration()
