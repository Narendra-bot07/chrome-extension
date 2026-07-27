ALTER TABLE public.resume_composition_plans
    ADD COLUMN IF NOT EXISTS page_mode TEXT,
    ADD COLUMN IF NOT EXISTS actual_page_count INTEGER,
    ADD COLUMN IF NOT EXISTS density_profile TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.resume_composition_plans
SET page_mode = COALESCE(page_mode, page_preference),
    actual_page_count = COALESCE(actual_page_count, final_page_count),
    density_profile = COALESCE(density_profile, density_level)
WHERE page_mode IS NULL OR actual_page_count IS NULL OR density_profile IS NULL;

ALTER TABLE public.resume_composition_plans
    ALTER COLUMN page_mode SET NOT NULL,
    ALTER COLUMN actual_page_count SET NOT NULL,
    ALTER COLUMN density_profile SET NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_resume_composition_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resume_composition_updated_at ON public.resume_composition_plans;
CREATE TRIGGER trg_resume_composition_updated_at
BEFORE UPDATE ON public.resume_composition_plans
FOR EACH ROW EXECUTE FUNCTION public.touch_resume_composition_updated_at();
