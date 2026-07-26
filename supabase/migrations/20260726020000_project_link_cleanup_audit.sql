-- Audit trail for application-level project-link repairs. Projects are never
-- deleted; only invalid or duplicate link values are removed from render data.
CREATE TABLE IF NOT EXISTS public.project_link_cleanup_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id UUID REFERENCES public.resumes(id) ON DELETE CASCADE,
    project_id TEXT,
    project_name TEXT,
    original_url TEXT,
    normalized_url TEXT,
    reason TEXT NOT NULL,
    cleaned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_link_cleanup_resume
    ON public.project_link_cleanup_audit(resume_id, cleaned_at DESC);

ALTER TABLE public.project_link_cleanup_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own project link cleanup audit"
    ON public.project_link_cleanup_audit;
CREATE POLICY "Users can view own project link cleanup audit"
    ON public.project_link_cleanup_audit FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.resumes r
            WHERE r.id = resume_id AND r.user_id = auth.uid()
        )
        OR public.is_admin()
    );
