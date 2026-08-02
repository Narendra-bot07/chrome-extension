import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

PLANS = [
    {
        "code": "free",
        "name": "Free Demo",
        "description": "Unlimited free demo access.",
        "monthly_jd_limit": None,
        "resume_limit": None,
        "price_amount": 0.00,
        "currency": "USD",
        "price_display": "$0",
        "sort_order": 1,
        "is_default": True,
        "features": {
            "jd_extraction": (True, None),
            "resume_upload": (True, None),
            "resume_generation": (True, None),
            "cover_letter_generation": (True, None),
            "basic_tailoring": (True, None),
            "advanced_tailoring": (True, None),
            "application_history": (True, None),
            "priority_processing": (True, None),
            "advanced_analytics": (True, None),
        },
    },
    {
        "code": "pro",
        "name": "Pro",
        "description": "For active job hunting.",
        "monthly_jd_limit": 100,
        "resume_limit": 3,
        "price_amount": 9.99,
        "currency": "USD",
        "price_display": "$9.99",
        "sort_order": 2,
        "is_default": False,
        "features": {
            "jd_extraction": (True, 100),
            "resume_upload": (True, 3),
            "resume_generation": (True, 50),
            "cover_letter_generation": (True, 30),
            "basic_tailoring": (True, None),
            "advanced_tailoring": (True, None),
            "application_history": (True, None),
            "priority_processing": (False, None),
            "advanced_analytics": (False, None),
        },
    },
    {
        "code": "elite",
        "name": "Elite",
        "description": "For serious job hunters.",
        "monthly_jd_limit": 500,
        "resume_limit": None,
        "price_amount": 19.99,
        "currency": "USD",
        "price_display": "$19.99",
        "sort_order": 3,
        "is_default": False,
        "features": {
            "jd_extraction": (True, 500),
            "resume_upload": (True, None),
            "resume_generation": (True, 150),
            "cover_letter_generation": (True, 100),
            "basic_tailoring": (True, None),
            "advanced_tailoring": (True, None),
            "application_history": (True, None),
            "priority_processing": (True, None),
            "advanced_analytics": (False, None),
        },
    },
    {
        "code": "advanced",
        "name": "Advanced",
        "description": "For power users and teams.",
        "monthly_jd_limit": 1200,
        "resume_limit": None,
        "price_amount": 39.99,
        "currency": "USD",
        "price_display": "$39.99",
        "sort_order": 4,
        "is_default": False,
        "features": {
            "jd_extraction": (True, 1200),
            "resume_upload": (True, None),
            "resume_generation": (True, 1000),
            "cover_letter_generation": (True, 700),
            "basic_tailoring": (True, None),
            "advanced_tailoring": (True, None),
            "application_history": (True, None),
            "priority_processing": (True, None),
            "advanced_analytics": (True, None),
        },
    },
]


def seed():
    if not DB_URL:
        raise RuntimeError("DATABASE_URL is not set")

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    active_codes = [plan["code"] for plan in PLANS]
    cur.execute(
        "UPDATE public.plans SET is_active = FALSE, is_default = FALSE, updated_at = NOW() WHERE NOT (code = ANY(%s));",
        (active_codes,),
    )

    for plan in PLANS:
        cur.execute("""
            INSERT INTO public.plans (
                id, code, name, description, monthly_jd_limit, resume_limit,
                price_amount, currency, price_display, billing_interval, is_active, is_default, sort_order, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'month', TRUE, %s, %s, NOW())
            ON CONFLICT (id) DO UPDATE SET
                code = EXCLUDED.code,
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                monthly_jd_limit = EXCLUDED.monthly_jd_limit,
                resume_limit = EXCLUDED.resume_limit,
                price_amount = EXCLUDED.price_amount,
                currency = EXCLUDED.currency,
                price_display = EXCLUDED.price_display,
                billing_interval = EXCLUDED.billing_interval,
                is_active = EXCLUDED.is_active,
                is_default = EXCLUDED.is_default,
                sort_order = EXCLUDED.sort_order,
                updated_at = NOW()
            RETURNING id;
        """, (
            plan["code"], plan["code"], plan["name"], plan["description"],
            plan["monthly_jd_limit"], plan["resume_limit"],
            plan["price_amount"], plan["currency"], plan["price_display"], plan["is_default"], plan["sort_order"]
        ))
        plan_id = cur.fetchone()[0]

        for feature_key, (enabled, limit_value) in plan["features"].items():
            cur.execute("""
                INSERT INTO public.plan_features (plan_id, feature_key, enabled, limit_value, updated_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (plan_id, feature_key) DO UPDATE SET
                    enabled = EXCLUDED.enabled,
                    limit_value = EXCLUDED.limit_value,
                    updated_at = NOW();
            """, (plan_id, feature_key, enabled, limit_value))

    # Move subscriptions from superseded names to the equivalent price tier in
    # one statement so renamed IDs do not cascade through multiple updates.
    cur.execute("""
        UPDATE public.subscriptions
        SET plan_id = CASE plan_id
            WHEN 'basic' THEN 'pro'
            WHEN 'plus' THEN 'elite'
            WHEN 'premium' THEN 'advanced'
            ELSE plan_id
        END,
        updated_at = NOW()
        WHERE plan_id IN ('basic', 'plus', 'premium');
    """)
    cur.execute("""
        UPDATE public.users
        SET current_plan = CASE
            WHEN current_plan = 'basic' THEN 'pro'
            WHEN current_plan = 'plus' THEN 'elite'
            WHEN current_plan = 'premium' THEN 'advanced'
            ELSE current_plan
        END
        WHERE current_plan IN ('basic', 'plus', 'premium');
    """)

    cur.execute("SELECT id FROM public.plans WHERE code = 'free';")
    free_plan_id = cur.fetchone()[0]
    cur.execute("""
        INSERT INTO public.subscriptions (
            user_id, plan_id, status, started_at, current_period_start, current_period_end
        )
        SELECT u.id, %s, 'active', NOW(), NOW(), NOW() + INTERVAL '1 month'
        FROM public.users u
        WHERE NOT EXISTS (
            SELECT 1 FROM public.subscriptions s
            WHERE s.user_id = u.id AND s.ended_at IS NULL
        );
    """, (free_plan_id,))

    conn.commit()
    cur.close()
    conn.close()
    print("Phase 6 plans/features seeded and Free subscriptions backfilled.")


if __name__ == "__main__":
    seed()
