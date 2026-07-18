import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

PLANS = [
    {
        "code": "free",
        "name": "Free",
        "description": "For users getting started.",
        "monthly_jd_limit": 10,
        "resume_limit": 1,
        "price_amount": 0.00,
        "currency": "USD",
        "price_display": "$0",
        "sort_order": 1,
        "is_default": True,
        "features": {
            "jd_extraction": (True, 10),
            "resume_upload": (True, 1),
            "basic_tailoring": (True, None),
            "advanced_tailoring": (False, None),
            "application_history": (False, None),
            "priority_processing": (False, None),
            "advanced_analytics": (False, None),
        },
    },
    {
        "code": "pro",
        "name": "Pro",
        "description": "For active job seekers.",
        "monthly_jd_limit": 100,
        "resume_limit": 5,
        "price_amount": 9.99,
        "currency": "USD",
        "price_display": "$9.99",
        "sort_order": 2,
        "is_default": False,
        "features": {
            "jd_extraction": (True, 100),
            "resume_upload": (True, 5),
            "basic_tailoring": (True, None),
            "advanced_tailoring": (True, None),
            "application_history": (True, None),
            "priority_processing": (False, None),
            "advanced_analytics": (False, None),
        },
    },
    {
        "code": "plus",
        "name": "Plus",
        "description": "For frequent applicants.",
        "monthly_jd_limit": 300,
        "resume_limit": 15,
        "price_amount": 19.99,
        "currency": "USD",
        "price_display": "$19.99",
        "sort_order": 3,
        "is_default": False,
        "features": {
            "jd_extraction": (True, 300),
            "resume_upload": (True, 15),
            "basic_tailoring": (True, None),
            "advanced_tailoring": (True, None),
            "application_history": (True, None),
            "priority_processing": (True, None),
            "advanced_analytics": (False, None),
        },
    },
    {
        "code": "premium",
        "name": "Premium",
        "description": "For users who need maximum limits.",
        "monthly_jd_limit": 1000,
        "resume_limit": None,
        "price_amount": 29.99,
        "currency": "USD",
        "price_display": "$29.99",
        "sort_order": 4,
        "is_default": False,
        "features": {
            "jd_extraction": (True, 1000),
            "resume_upload": (True, None),
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
