import psycopg2
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
DB_URL = os.getenv("DATABASE_URL")

INDEX_DEFINITIONS = [
    # 1. Resumes & Versions
    ("resumes", "idx_resumes_user_active_not_deleted", "CREATE INDEX IF NOT EXISTS idx_resumes_user_active_not_deleted ON public.resumes(user_id, is_active) WHERE deleted_at IS NULL;"),
    ("resumes", "idx_resumes_user_created_desc", "CREATE INDEX IF NOT EXISTS idx_resumes_user_created_desc ON public.resumes(user_id, created_at DESC) WHERE deleted_at IS NULL;"),
    ("resumes", "idx_resumes_parsed_content_gin", "CREATE INDEX IF NOT EXISTS idx_resumes_parsed_content_gin ON public.resumes USING GIN(parsed_content jsonb_path_ops);"),
    ("resume_versions", "idx_resume_versions_composite", "CREATE INDEX IF NOT EXISTS idx_resume_versions_composite ON public.resume_versions(resume_id, is_current, version_number DESC) WHERE deleted_at IS NULL;"),

    # 2. Applications & Job Tracker
    ("applications", "idx_applications_user_updated_desc", "CREATE INDEX IF NOT EXISTS idx_applications_user_updated_desc ON public.applications(user_id, updated_at DESC);"),
    ("applications", "idx_applications_user_stage", "CREATE INDEX IF NOT EXISTS idx_applications_user_stage ON public.applications(user_id, current_stage);"),

    # 3. Usage & Analytics
    ("usage_events", "idx_usage_events_analytics", "CREATE INDEX IF NOT EXISTS idx_usage_events_analytics ON public.usage_events(user_id, feature_key, created_at DESC);"),

    # 4. Subscriptions & Billing
    ("subscriptions", "idx_subscriptions_user_status", "CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON public.subscriptions(user_id, status, created_at DESC);"),

    # 5. User Sessions & Authentication
    ("user_sessions", "idx_user_sessions_active_lookup", "CREATE INDEX IF NOT EXISTS idx_user_sessions_active_lookup ON public.user_sessions(user_id, is_revoked, expires_at);"),
    ("user_sessions", "idx_user_sessions_refresh_hash", "CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_hash ON public.user_sessions(refresh_token_hash) WHERE is_revoked IS FALSE;"),

    # 6. Notifications & Reminders Workers
    ("reminders", "idx_reminders_worker", "CREATE INDEX IF NOT EXISTS idx_reminders_worker ON public.reminders(status, scheduled_at);"),
    ("notification_deliveries", "idx_deliveries_worker", "CREATE INDEX IF NOT EXISTS idx_deliveries_worker ON public.notification_deliveries(status) WHERE status = 'pending';"),

    # 7. Users & Profiles
    ("profiles", "idx_profiles_user_lookup", "CREATE INDEX IF NOT EXISTS idx_profiles_user_lookup ON public.profiles(id) WHERE deleted_at IS NULL;"),
    ("users", "idx_users_email_lower", "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON public.users(LOWER(email));"),

    # 8. Audit & User Events
    ("user_events", "idx_user_events_timeline", "CREATE INDEX IF NOT EXISTS idx_user_events_timeline ON public.user_events(user_id, event_type, created_at DESC);"),
]

def run_migration():
    if not DB_URL:
        print("[ERR] DATABASE_URL is not configured in .env file.")
        return

    print("=" * 70)
    print("Running Database Performance Index Migration...")
    print("=" * 70)

    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    cur = conn.cursor()

    applied_count = 0
    skipped_count = 0

    for table, index_name, sql_stmt in INDEX_DEFINITIONS:
        try:
            cur.execute(f"SELECT to_regclass('public.{table}')")
            table_exists = cur.fetchone()[0] is not None
            if not table_exists:
                print(f"  [SKIP] Table 'public.{table}' does not exist yet.")
                skipped_count += 1
                continue

            print(f"  [APPLY] Creating index '{index_name}' on 'public.{table}'...")
            cur.execute(sql_stmt)
            applied_count += 1
        except Exception as e:
            print(f"  [WARN] Could not create index '{index_name}': {e}")
            skipped_count += 1

    cur.close()
    conn.close()

    print("-" * 70)
    print(f"Migration Completed! Applied: {applied_count} indexes | Skipped/Existing: {skipped_count}")
    print("=" * 70)

if __name__ == "__main__":
    run_migration()
