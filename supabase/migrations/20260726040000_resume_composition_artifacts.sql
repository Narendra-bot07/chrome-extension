ALTER TABLE public.resume_composition_plans
    ADD COLUMN IF NOT EXISTS generated_pdf_hash TEXT,
    ADD COLUMN IF NOT EXISTS page_utilization JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS renderer_version TEXT NOT NULL DEFAULT 'chromium-playwright-v1',
    ADD COLUMN IF NOT EXISTS generated_pdf_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS layout_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_resume_composition_artifact_cache
    ON public.resume_composition_plans (
        resume_content_hash,
        layout_hash,
        engine_version,
        renderer_version
    )
    WHERE generated_pdf_hash IS NOT NULL;

COMMENT ON COLUMN public.resume_composition_plans.generated_pdf_hash IS
    'SHA-256 of the immutable PDF artifact displayed in preview and downloaded.';
COMMENT ON COLUMN public.resume_composition_plans.page_utilization IS
    'Measured printable-height utilization for each generated PDF page.';
