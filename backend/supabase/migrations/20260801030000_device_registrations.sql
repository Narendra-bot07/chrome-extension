-- Account-Abuse Prevention: Device Registrations Schema
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
