import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

def run_migration():
    print("Running billing migration...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    # 1. Create billing tables
    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.plans (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            price DECIMAL(10, 2) NOT NULL,
            currency VARCHAR(10) NOT NULL,
            credits INT NOT NULL,
            billing_cycle VARCHAR(20) NOT NULL,
            stripe_price_id VARCHAR(100),
            razorpay_plan_id VARCHAR(100),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.subscriptions (
            id VARCHAR(100) PRIMARY KEY,
            user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
            plan_id VARCHAR(50) REFERENCES public.plans(id),
            provider VARCHAR(20) NOT NULL,
            provider_subscription_id VARCHAR(100) UNIQUE NOT NULL,
            status VARCHAR(20) NOT NULL,
            started_at TIMESTAMP WITH TIME ZONE,
            expires_at TIMESTAMP WITH TIME ZONE,
            cancel_at_period_end BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_subs_user_id ON public.subscriptions(user_id);
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.payments (
            id VARCHAR(100) PRIMARY KEY,
            user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
            provider VARCHAR(20) NOT NULL,
            provider_payment_id VARCHAR(100) UNIQUE NOT NULL,
            provider_order_id VARCHAR(100),
            amount DECIMAL(10, 2) NOT NULL,
            currency VARCHAR(10) NOT NULL,
            status VARCHAR(20) NOT NULL,
            invoice_url TEXT,
            receipt_url TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.credit_transactions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
            payment_id VARCHAR(100) REFERENCES public.payments(id),
            credits INT NOT NULL,
            type VARCHAR(20) NOT NULL, -- 'addition', 'deduction'
            reason VARCHAR(255),
            balance_after INT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_credit_trans_user_id ON public.credit_transactions(user_id);
    """)

    # 2. Add columns to users table safely
    cur.execute("""
        ALTER TABLE public.users 
        ADD COLUMN IF NOT EXISTS current_plan VARCHAR(50) DEFAULT 'free',
        ADD COLUMN IF NOT EXISTS credits_remaining INT DEFAULT 5,
        ADD COLUMN IF NOT EXISTS credits_used INT DEFAULT 0,
        ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'none';
    """)

    # 3. Seed plans
    cur.execute("""
        INSERT INTO public.plans (id, name, price, currency, credits, billing_cycle)
        VALUES 
            ('free', 'Free', 0, 'USD', 5, 'monthly'),
            ('pro', 'Pro', 9.99, 'USD', 150, 'monthly'),
            ('premium', 'Premium', 24.99, 'USD', -1, 'monthly')
        ON CONFLICT (id) DO UPDATE SET 
            price = EXCLUDED.price, 
            credits = EXCLUDED.credits;
    """)

    # 4. Migrate credits from profiles to users if applicable
    cur.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'credits_remaining'
        );
    """)
    has_profiles_credits = cur.fetchone()[0]

    if has_profiles_credits:
        print("Migrating credits from profiles to users...")
        cur.execute("""
            UPDATE public.users u
            SET credits_remaining = p.credits_remaining
            FROM public.profiles p
            WHERE u.id = p.id;
        """)

    conn.commit()
    cur.close()
    conn.close()
    print("Billing migration completed successfully.")

if __name__ == "__main__":
    run_migration()
