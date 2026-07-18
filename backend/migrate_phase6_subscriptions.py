import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")


def run_migration():
    if not DB_URL:
        raise RuntimeError("DATABASE_URL is not set")

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.plans (
            id VARCHAR(50) PRIMARY KEY
        );
    """)
    cur.execute("""
        ALTER TABLE public.plans
            ADD COLUMN IF NOT EXISTS code VARCHAR(50),
            ADD COLUMN IF NOT EXISTS name VARCHAR(100),
            ADD COLUMN IF NOT EXISTS description TEXT,
            ADD COLUMN IF NOT EXISTS monthly_jd_limit INTEGER,
            ADD COLUMN IF NOT EXISTS resume_limit INTEGER,
            ADD COLUMN IF NOT EXISTS price_amount NUMERIC(10, 2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD',
            ADD COLUMN IF NOT EXISTS price_display VARCHAR(50),
            ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(30) DEFAULT 'month',
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    """)
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_plans_code ON public.plans(code) WHERE code IS NOT NULL;")
    cur.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='price') THEN
                ALTER TABLE public.plans ALTER COLUMN price DROP NOT NULL;
                ALTER TABLE public.plans ALTER COLUMN price SET DEFAULT 0;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='currency') THEN
                ALTER TABLE public.plans ALTER COLUMN currency DROP NOT NULL;
                ALTER TABLE public.plans ALTER COLUMN currency SET DEFAULT 'USD';
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='credits') THEN
                ALTER TABLE public.plans ALTER COLUMN credits DROP NOT NULL;
                ALTER TABLE public.plans ALTER COLUMN credits SET DEFAULT 0;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' AND column_name='billing_cycle') THEN
                ALTER TABLE public.plans ALTER COLUMN billing_cycle DROP NOT NULL;
                ALTER TABLE public.plans ALTER COLUMN billing_cycle SET DEFAULT 'monthly';
            END IF;
        END $$;
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.plan_features (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid()
        );
    """)
    cur.execute("""
        ALTER TABLE public.plan_features
            ADD COLUMN IF NOT EXISTS plan_id VARCHAR(50) REFERENCES public.plans(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS feature_key VARCHAR(100),
            ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE,
            ADD COLUMN IF NOT EXISTS limit_value INTEGER,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    """)
    cur.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plan_features' AND column_name='feature_name') THEN
                ALTER TABLE public.plan_features ALTER COLUMN feature_name DROP NOT NULL;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='plan_features' AND column_name='feature_value') THEN
                ALTER TABLE public.plan_features ALTER COLUMN feature_value DROP NOT NULL;
            END IF;
        END $$;
    """)
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_features_plan_feature ON public.plan_features(plan_id, feature_key);")
    cur.execute("DELETE FROM public.plan_features WHERE feature_key IS NULL AND plan_id IS NOT NULL;")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.subscriptions (
            id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text
        );
    """)
    cur.execute("""
        ALTER TABLE public.subscriptions
            ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
            ADD COLUMN IF NOT EXISTS plan_id VARCHAR(50) REFERENCES public.plans(id),
            ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'active',
            ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
            ADD COLUMN IF NOT EXISTS trial_start TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS grace_period_end TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS pending_plan_id VARCHAR(50) REFERENCES public.plans(id),
            ADD COLUMN IF NOT EXISTS pending_change_effective_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    """)
    cur.execute("ALTER TABLE public.subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);")
    cur.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='provider') THEN
                ALTER TABLE public.subscriptions ALTER COLUMN provider DROP NOT NULL;
                ALTER TABLE public.subscriptions ALTER COLUMN provider SET DEFAULT 'internal';
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='provider_subscription_id') THEN
                ALTER TABLE public.subscriptions ALTER COLUMN provider_subscription_id DROP NOT NULL;
            END IF;
        END $$;
    """)
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_current_subscription_per_user
        ON public.subscriptions(user_id)
        WHERE ended_at IS NULL;
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.usage_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
            subscription_id VARCHAR(100) REFERENCES public.subscriptions(id) ON DELETE SET NULL,
            feature_key VARCHAR(100) NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            request_id VARCHAR(150),
            metadata_json JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_usage_events_user_feature_time ON public.usage_events(user_id, feature_key, created_at);")
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_usage_events_request_id ON public.usage_events(request_id) WHERE request_id IS NOT NULL;")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.subscription_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
            old_plan_id VARCHAR(50) REFERENCES public.plans(id),
            new_plan_id VARCHAR(50) REFERENCES public.plans(id),
            old_status VARCHAR(30),
            new_status VARCHAR(30),
            reason VARCHAR(100),
            changed_by UUID,
            metadata_json JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.admin_audit_log (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            admin_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
            target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
            action VARCHAR(100) NOT NULL,
            metadata_json JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    """)

    cur.execute("""
        ALTER TABLE public.users
            ADD COLUMN IF NOT EXISTS role VARCHAR(30) DEFAULT 'user';
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("Phase 6 subscription migration completed.")


if __name__ == "__main__":
    run_migration()
