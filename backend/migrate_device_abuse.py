import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DDL = """
CREATE TABLE IF NOT EXISTS public.device_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_hash TEXT NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    signup_ip_hash TEXT NOT NULL,
    user_agent_hash TEXT NOT NULL,
    trial_claimed_at TIMESTAMPTZ,
    risk_score INT NOT NULL DEFAULT 0,
    blocked_at TIMESTAMPTZ,
    block_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_registrations_device_hash
    ON public.device_registrations(device_hash);
CREATE INDEX IF NOT EXISTS idx_device_registrations_signup_ip_hash
    ON public.device_registrations(signup_ip_hash);
CREATE INDEX IF NOT EXISTS idx_device_registrations_user_id
    ON public.device_registrations(user_id);
"""

def main():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(DDL)
        conn.commit()
    print("Device abuse migration complete.")

if __name__ == "__main__":
    main()
