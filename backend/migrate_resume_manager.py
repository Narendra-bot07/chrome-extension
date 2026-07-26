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

    # 1. Update resumes table
    cur.execute("""
        ALTER TABLE public.resumes
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS active_version_id UUID,
        ADD COLUMN IF NOT EXISTS last_used_job_id UUID,
        ADD COLUMN IF NOT EXISTS last_used_jd_id UUID,
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS times_used INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
    """)

    # 2. Create resume_versions table if not exists
    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.resume_versions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            resume_id UUID REFERENCES public.resumes(id) ON DELETE CASCADE,
            parent_version_id UUID REFERENCES public.resume_versions(id) ON DELETE SET NULL,
            version_number INTEGER NOT NULL DEFAULT 1,
            version_name TEXT,
            version_type TEXT NOT NULL DEFAULT 'tailored',
            source_resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
            jd_id UUID,
            job_id UUID,
            ats_score NUMERIC(5,2),
            resume_match_score NUMERIC(5,2),
            change_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            changes_summary TEXT,
            content JSONB NOT NULL DEFAULT '{}'::jsonb,
            file_url TEXT,
            is_current BOOLEAN NOT NULL DEFAULT FALSE,
            is_final BOOLEAN NOT NULL DEFAULT FALSE,
            created_by UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at TIMESTAMPTZ,
            ats_engine_version TEXT,
            match_engine_version TEXT,
            resume_content_hash TEXT,
            jd_content_hash TEXT,
            analysis_timestamp TIMESTAMPTZ,
            final_page_count INTEGER,
            density_level TEXT,
            composition_plan_json JSONB DEFAULT '{}'::jsonb,
            composition_plan_hash TEXT,
            rendered_pdf_path TEXT,
            rendered_pdf_hash TEXT,
            preview_source TEXT,
            renderer_version TEXT,
            composition_engine_version TEXT,
            validation_report JSONB DEFAULT '{}'::jsonb
        );
    """)

    # 3. Create resume_usage_events table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS public.resume_usage_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
            version_id UUID REFERENCES public.resume_versions(id) ON DELETE SET NULL,
            workflow_id UUID,
            event_type TEXT NOT NULL,
            jd_id UUID,
            job_id UUID,
            idempotency_key TEXT,
            ats_score NUMERIC(5,2),
            resume_match_score NUMERIC(5,2),
            ats_engine_version TEXT,
            match_engine_version TEXT,
            resume_content_hash TEXT,
            jd_content_hash TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)

    # Drop restrictive check constraint if exists
    cur.execute("""
        ALTER TABLE public.resume_usage_events
        DROP CONSTRAINT IF EXISTS resume_usage_events_event_type_check,
        ADD COLUMN IF NOT EXISTS workflow_id UUID,
        ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
    """)

    # 4. Create indices
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_resumes_one_active_per_user
        ON public.resumes(user_id)
        WHERE is_active = TRUE AND deleted_at IS NULL;
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_resume_versions_root_created
        ON public.resume_versions(resume_id, created_at DESC)
        WHERE deleted_at IS NULL;
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_resume_usage_events_resume_created
        ON public.resume_usage_events(resume_id, created_at DESC);
    """)
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_usage_idempotency
        ON public.resume_usage_events(idempotency_key);
    """)

    # 5. Backfill active status for root resumes
    cur.execute("""
        WITH latest AS (
            SELECT DISTINCT ON (user_id) id
            FROM public.resumes
            WHERE deleted_at IS NULL
            ORDER BY user_id, created_at DESC
        )
        UPDATE public.resumes r
        SET is_active = TRUE
        FROM latest
        WHERE r.id = latest.id
          AND NOT EXISTS (
              SELECT 1
              FROM public.resumes existing
              WHERE existing.user_id = r.user_id
                AND existing.is_active = TRUE
                AND existing.deleted_at IS NULL
          );
    """)

    # 6. Backfill one original version per existing root resume
    cur.execute("""
        INSERT INTO public.resume_versions (
            resume_id, version_number, version_name, version_type, source_resume_id,
            content, changes_summary, change_summary_json, is_current, created_by, created_at
        )
        SELECT r.id, 1, 'v1 Original', 'original', r.id, COALESCE(r.parsed_content, '{}'::jsonb),
               'Original uploaded resume', '{"summary":"Original uploaded resume"}'::jsonb,
               TRUE, r.user_id, r.created_at
        FROM public.resumes r
        WHERE r.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.resume_versions rv
              WHERE rv.resume_id = r.id AND rv.deleted_at IS NULL
          );
    """)

    # 7. Update active_version_id on resumes
    cur.execute("""
        UPDATE public.resumes r
        SET active_version_id = (
            SELECT rv.id
            FROM public.resume_versions rv
            WHERE rv.resume_id = r.id AND rv.deleted_at IS NULL
            ORDER BY rv.is_current DESC, rv.version_number DESC
            LIMIT 1
        )
        WHERE r.active_version_id IS NULL;
    """)

    # 8. Idempotent Backfill Historical Usage Events
    # A. Backfill from applications if resume_id column exists
    cur.execute("""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='applications' AND column_name='resume_id';
    """)
    if cur.fetchone():
        cur.execute("""
            INSERT INTO public.resume_usage_events (
                user_id, resume_id, event_type, job_id, idempotency_key, created_at
            )
            SELECT 
                a.user_id,
                a.resume_id,
                'job_application',
                a.id,
                'backfill_app_' || a.id::text,
                COALESCE(a.applied_at, a.created_at, NOW())
            FROM public.applications a
            WHERE a.resume_id IS NOT NULL
            ON CONFLICT (idempotency_key) DO NOTHING;
        """)

    # B. Backfill from resume_versions (each non-original version represents a tailoring workflow)
    cur.execute("""
        INSERT INTO public.resume_usage_events (
            user_id, resume_id, version_id, event_type, jd_id, job_id, idempotency_key, created_at
        )
        SELECT 
            rv.created_by,
            rv.resume_id,
            rv.id,
            'tailoring_completed',
            rv.jd_id,
            rv.job_id,
            'backfill_ver_' || rv.id::text,
            rv.created_at
        FROM public.resume_versions rv
        WHERE rv.created_by IS NOT NULL AND rv.version_type != 'original'
        ON CONFLICT (idempotency_key) DO NOTHING;
    """)

    # C. Backfill initial upload usage event for root resumes
    cur.execute("""
        INSERT INTO public.resume_usage_events (
            user_id, resume_id, event_type, idempotency_key, created_at
        )
        SELECT 
            r.user_id,
            r.id,
            'resume_created',
            'backfill_init_' || r.id::text,
            r.created_at
        FROM public.resumes r
        WHERE r.deleted_at IS NULL
        ON CONFLICT (idempotency_key) DO NOTHING;
    """)

    # 9. Recalculate times_used and last_used_at for all root resumes
    cur.execute("""
        UPDATE public.resumes r
        SET 
            times_used = (
                SELECT COUNT(DISTINCT COALESCE(e.workflow_id::text, e.id::text))
                FROM public.resume_usage_events e
                WHERE e.resume_id = r.id
                  AND e.event_type != 'resume_created'
            ),
            last_used_at = (
                SELECT MAX(e.created_at)
                FROM public.resume_usage_events e
                WHERE e.resume_id = r.id
                  AND e.event_type != 'resume_created'
            );
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("Resume manager schema migration and idempotent usage backfill completed successfully.")


if __name__ == "__main__":
    run_migration()
