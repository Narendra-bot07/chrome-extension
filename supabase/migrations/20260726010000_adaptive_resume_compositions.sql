CREATE TABLE IF NOT EXISTS public.resume_composition_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    resume_version_id UUID NOT NULL REFERENCES public.resume_versions(id) ON DELETE CASCADE,
    resume_content_hash TEXT NOT NULL,
    layout_strategy TEXT NOT NULL,
    page_preference TEXT NOT NULL CHECK (page_preference IN ('auto', 'one', 'two')),
    final_page_count INTEGER NOT NULL CHECK (final_page_count BETWEEN 1 AND 2),
    density_level TEXT NOT NULL CHECK (density_level IN ('comfortable', 'compact', 'dense')),
    composition_plan_json JSONB NOT NULL,
    composition_plan_hash TEXT NOT NULL,
    measurement_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    optimization_actions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    validation_report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    engine_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (
        resume_version_id,
        resume_content_hash,
        layout_strategy,
        page_preference,
        engine_version
    )
);

CREATE INDEX IF NOT EXISTS idx_resume_composition_plans_cache
    ON public.resume_composition_plans (
        resume_version_id,
        resume_content_hash,
        layout_strategy,
        page_preference,
        engine_version
    );

ALTER TABLE public.resume_composition_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS resume_composition_plans_owner_access
    ON public.resume_composition_plans;
CREATE POLICY resume_composition_plans_owner_access
    ON public.resume_composition_plans
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
