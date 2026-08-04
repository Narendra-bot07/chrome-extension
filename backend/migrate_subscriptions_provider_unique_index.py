"""
Fixes: psycopg2.errors.InvalidColumnReference: there is no unique or exclusion
constraint matching the ON CONFLICT specification, raised by
SubscriptionService.activate_subscription() (app/billing/services/subscription_service.py)
whose INSERT ... ON CONFLICT (provider_subscription_id) DO UPDATE requires a
unique constraint/index on that exact column.

Root cause: migrate_billing.py's CREATE TABLE public.subscriptions (...
provider_subscription_id VARCHAR(100) UNIQUE NOT NULL ...) never actually
took effect against the live database -- migrate_phase6_subscriptions.py's
own bare `CREATE TABLE IF NOT EXISTS public.subscriptions (id VARCHAR(100)
PRIMARY KEY ...)` created the table first, making migrate_billing.py's later
CREATE TABLE IF NOT EXISTS a complete no-op, including the UNIQUE constraint
that was part of its column definition. provider_subscription_id was later
added as a plain nullable column with no uniqueness enforcement at all.
Confirmed directly against the live database: the column exists, but no
constraint or index referenced it.

Uses a plain (non-partial) unique index, not a partial one filtered by
`WHERE provider_subscription_id IS NOT NULL`: Postgres only considers a
partial index as an ON CONFLICT arbiter when the INSERT statement's own
ON CONFLICT clause repeats that exact WHERE predicate, which
activate_subscription()'s plain `ON CONFLICT (provider_subscription_id)`
does not do -- a partial index was tried first and confirmed NOT to satisfy
that query. A plain unique index still tolerates unlimited NULL rows without
conflict (standard Postgres/SQL semantics: NULL is never equal to another
NULL for uniqueness purposes), so internal/free subscriptions with no
provider_subscription_id are unaffected.

Verified end-to-end against the live database after applying: a real
activate_subscription() call (insert, then a second call to exercise the
ON CONFLICT DO UPDATE upsert path) both succeeded, run inside a transaction
that was rolled back afterward so nothing persisted from the test itself.
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def run():
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    conn.autocommit = False
    try:
        cur = conn.cursor()
        cur.execute("DROP INDEX IF EXISTS public.uq_subscriptions_provider_subscription_id;")
        cur.execute("""
            CREATE UNIQUE INDEX uq_subscriptions_provider_subscription_id
            ON public.subscriptions(provider_subscription_id);
        """)
        conn.commit()
        print("[OK] uq_subscriptions_provider_subscription_id created.")

        cur.execute("""
            SELECT indexname, indexdef FROM pg_indexes
            WHERE schemaname='public' AND tablename='subscriptions'
            AND indexname='uq_subscriptions_provider_subscription_id'
        """)
        row = cur.fetchone()
        print("[VERIFY]", row)
        cur.close()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run()
