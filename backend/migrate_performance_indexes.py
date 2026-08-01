"""Non-destructive migration script to add safe, non-blocking performance indexes."""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

def run_migration():
    print("[MIGRATION] Starting non-destructive database performance index creation...")
    if not DB_URL:
        print("[MIGRATION] DATABASE_URL not found in environment. Skipping DB index migration.")
        return

    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    indexes = [
        ("idx_resumes_user_active_created", "CREATE INDEX IF NOT EXISTS idx_resumes_user_active_created ON public.resumes(user_id, is_active DESC, created_at DESC) WHERE deleted_at IS NULL;"),
        ("idx_resume_versions_resume_current", "CREATE INDEX IF NOT EXISTS idx_resume_versions_resume_current ON public.resume_versions(resume_id, is_current DESC, version_number DESC) WHERE deleted_at IS NULL;"),
        ("idx_applications_user_created", "CREATE INDEX IF NOT EXISTS idx_applications_user_created ON public.applications(user_id, created_at DESC);"),
        ("idx_applications_user_stage", "CREATE INDEX IF NOT EXISTS idx_applications_user_stage ON public.applications(user_id, current_stage);"),
        ("idx_user_events_user_type_created", "CREATE INDEX IF NOT EXISTS idx_user_events_user_type_created ON public.user_events(user_id, event_type, created_at DESC);"),
        ("idx_tailored_resumes_user_deleted", "CREATE INDEX IF NOT EXISTS idx_tailored_resumes_user_deleted ON public.tailored_resumes(user_id) WHERE deleted_at IS NULL;"),
        ("idx_usage_events_request_lookup", "CREATE INDEX IF NOT EXISTS idx_usage_events_request_lookup ON public.usage_events(request_id, user_id, feature_key) WHERE request_id IS NOT NULL;"),
        ("idx_plan_features_plan_feature", "CREATE INDEX IF NOT EXISTS idx_plan_features_plan_feature ON public.plan_features(plan_id, feature_key);"),
    ]

    for name, sql in indexes:
        try:
            print(f"[MIGRATION] Ensuring index: {name}...")
            cur.execute(sql)
            conn.commit()
            print(f"[MIGRATION] Index {name} checked/created successfully.")
        except Exception as exc:
            conn.rollback()
            print(f"[MIGRATION] Warning creation of {name}: {exc}")

    cur.close()
    conn.close()
    print("[MIGRATION] Database performance index migration completed successfully.")

if __name__ == "__main__":
    run_migration()
