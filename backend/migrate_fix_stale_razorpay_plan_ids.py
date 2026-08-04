"""
Fixes: "Razorpay subscription creation failed: The ID provided is invalid or
could not be found." -- razorpay_provider.py's create_checkout() prioritizes
plan.get("razorpay_plan_id") (a column on public.plans) over the
RAZORPAY_PLAN_*_MONTHLY env vars, and it falls back to the env vars only when
that column is empty.

Confirmed directly against Razorpay's live API: public.plans.razorpay_plan_id
held stale plan IDs (plan_TKvunw9whaLPRn / plan_TKvwof7YNDV9kh /
plan_TKvxcj8KQ8D3m4) that all return 400 BAD_REQUEST_ERROR "The ID provided
is invalid or could not be found" -- while the RAZORPAY_PLAN_*_MONTHLY env
vars hold currently-valid plan IDs (confirmed 200 on GET /v1/plans/{id}).
This updates the DB column to match the known-good env var values so the
higher-priority lookup path resolves to a real plan instead of a dead one.
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

PLAN_ID_UPDATES = {
    "basic": os.getenv("RAZORPAY_PLAN_BASIC_MONTHLY"),
    "pro": os.getenv("RAZORPAY_PLAN_PRO_MONTHLY"),
    "elite": os.getenv("RAZORPAY_PLAN_ELITE_MONTHLY"),
}


def run():
    for code, plan_id in PLAN_ID_UPDATES.items():
        if not plan_id:
            raise RuntimeError(f"Env var for plan '{code}' is not set -- aborting, nothing changed.")

    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    conn.autocommit = False
    try:
        cur = conn.cursor()
        for code, plan_id in PLAN_ID_UPDATES.items():
            cur.execute(
                "UPDATE public.plans SET razorpay_plan_id = %s WHERE id = %s RETURNING id, razorpay_plan_id",
                (plan_id, code)
            )
            print("[OK]", cur.fetchone())
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run()
