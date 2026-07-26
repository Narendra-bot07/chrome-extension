-- Root-resume intelligence, immutable versions, and auditable usage.
ALTER TABLE public.resumes
    ADD COLUMN IF NOT EXISTS active_version_id UUID,
    ADD COLUMN IF NOT EXISTS last_used_job_id UUID,
    ADD COLUMN IF NOT EXISTS last_used_jd_id UUID,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.resume_versions
    ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS content JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS changes_summary TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resume_id UUID REFERENCES public.resumes(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS parent_version_id UUID REFERENCES public.resume_versions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS version_name TEXT,
    ADD COLUMN IF NOT EXISTS version_type TEXT NOT NULL DEFAULT 'tailored',
    ADD COLUMN IF NOT EXISTS source_resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS jd_id UUID,
    ADD COLUMN IF NOT EXISTS job_id UUID,
    ADD COLUMN IF NOT EXISTS ats_score NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS resume_match_score NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS change_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS file_url TEXT,
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS ats_engine_version TEXT,
    ADD COLUMN IF NOT EXISTS match_engine_version TEXT,
    ADD COLUMN IF NOT EXISTS resume_content_hash TEXT,
    ADD COLUMN IF NOT EXISTS jd_content_hash TEXT,
    ADD COLUMN IF NOT EXISTS analysis_timestamp TIMESTAMPTZ;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='resume_versions'
          AND column_name='tailored_resume_id'
    ) THEN
        ALTER TABLE public.resume_versions ALTER COLUMN tailored_resume_id DROP NOT NULL;
    END IF;
END $$;
ALTER TABLE public.resume_versions
    DROP CONSTRAINT IF EXISTS resume_versions_version_type_check;
ALTER TABLE public.resume_versions
    ADD CONSTRAINT resume_versions_version_type_check
    CHECK (version_type IN ('original', 'tailored', 'manual_edit', 'layout_update', 'restored', 'final'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_versions_number
    ON public.resume_versions(resume_id, version_number)
    WHERE resume_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_current_version
    ON public.resume_versions(resume_id)
    WHERE is_current AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resume_versions_root_created
    ON public.resume_versions(resume_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Preserve the legacy tailored-family counter while adding root-resume families.
CREATE OR REPLACE FUNCTION public.increment_resume_version()
RETURNS TRIGGER AS $$
DECLARE
    next_ver INTEGER;
BEGIN
    IF NEW.resume_id IS NOT NULL THEN
        SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_ver
        FROM public.resume_versions
        WHERE resume_id = NEW.resume_id AND deleted_at IS NULL;
    ELSE
        -- Intermediate installations may not have the legacy
        -- tailored_resume_id column. Root-resume versions are the canonical
        -- family model from this migration onward.
        next_ver := COALESCE(NEW.version_number, 1);
    END IF;
    NEW.version_number = next_ver;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TABLE IF NOT EXISTS public.resume_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    version_id UUID REFERENCES public.resume_versions(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'jd_comparison', 'resume_match', 'ats_analysis', 'tailoring',
        'resume_generation', 'job_application'
    )),
    jd_id UUID,
    job_id UUID,
    ats_score NUMERIC(5,2),
    resume_match_score NUMERIC(5,2),
    ats_engine_version TEXT,
    match_engine_version TEXT,
    resume_content_hash TEXT,
    jd_content_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_resume_usage_events_resume_created
    ON public.resume_usage_events(resume_id, created_at DESC);

ALTER TABLE public.resume_usage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own resume usage events" ON public.resume_usage_events;
CREATE POLICY "Users manage own resume usage events" ON public.resume_usage_events
    FOR ALL USING (auth.uid() = user_id OR public.is_admin())
    WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users can view own resume versions" ON public.resume_versions;
DROP POLICY IF EXISTS "Users can insert own resume versions" ON public.resume_versions;
CREATE POLICY "Users can view own resume versions" ON public.resume_versions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_id AND r.user_id = auth.uid())
    OR public.is_admin()
);
CREATE POLICY "Users can insert own resume versions" ON public.resume_versions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_id AND r.user_id = auth.uid())
    OR public.is_admin()
);
DROP POLICY IF EXISTS "Users can update own resume versions" ON public.resume_versions;
CREATE POLICY "Users can update own resume versions" ON public.resume_versions FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_id AND r.user_id = auth.uid())
    OR public.is_admin()
);

-- Backfill one protected original version per existing root resume.
INSERT INTO public.resume_versions (
    resume_id, version_number, version_name, version_type, source_resume_id,
    content, changes_summary, change_summary_json, is_current, created_by, created_at
)
SELECT r.id, 1, 'Original', 'original', r.id, r.parsed_content,
       'Original uploaded resume', '{"summary":"Original uploaded resume"}'::jsonb,
       TRUE, r.user_id, r.created_at
FROM public.resumes r
WHERE r.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.resume_versions rv
      WHERE rv.resume_id = r.id AND rv.deleted_at IS NULL
  );

UPDATE public.resumes r
SET active_version_id = (
    SELECT rv.id
    FROM public.resume_versions rv
    WHERE rv.resume_id = r.id AND rv.deleted_at IS NULL
    ORDER BY rv.is_current DESC, rv.version_number DESC
    LIMIT 1
)
WHERE r.active_version_id IS NULL;
