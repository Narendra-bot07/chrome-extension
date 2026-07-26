CREATE TABLE IF NOT EXISTS public.resume_link_intelligence (
    link_id TEXT PRIMARY KEY,
    resume_version_id UUID NOT NULL REFERENCES public.resume_versions(id) ON DELETE CASCADE,
    owner_type TEXT NOT NULL CHECK (owner_type IN (
        'candidate', 'project', 'certification', 'publication',
        'achievement', 'experience', 'education', 'unknown'
    )),
    owner_id TEXT,
    link_type TEXT NOT NULL,
    platform TEXT NOT NULL,
    original_url TEXT NOT NULL,
    normalized_url TEXT,
    source_section TEXT,
    source_provenance TEXT,
    confidence NUMERIC(4, 3) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
    validation_status TEXT NOT NULL CHECK (validation_status IN (
        'VALID', 'INVALID', 'DUPLICATE', 'OWNER_MISMATCH', 'UNRESOLVED'
    )),
    repair_action TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_link_intelligence_version
    ON public.resume_link_intelligence(resume_version_id, owner_type, owner_id);

ALTER TABLE public.resume_link_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resume_link_intelligence_owner_access
    ON public.resume_link_intelligence;
CREATE POLICY resume_link_intelligence_owner_access
    ON public.resume_link_intelligence
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM public.resume_versions rv
            JOIN public.resumes r ON r.id = rv.resume_id
            WHERE rv.id = resume_version_id AND r.user_id = auth.uid()
        )
        OR public.is_admin()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.resume_versions rv
            JOIN public.resumes r ON r.id = rv.resume_id
            WHERE rv.id = resume_version_id AND r.user_id = auth.uid()
        )
        OR public.is_admin()
    );
