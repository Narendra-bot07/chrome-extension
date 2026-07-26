CREATE TABLE IF NOT EXISTS public.cover_letter_presentation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cover_letter_id UUID NOT NULL
        REFERENCES public.generated_cover_letter(id) ON DELETE CASCADE,
    selected_template TEXT NOT NULL DEFAULT 'classic_ats',
    font TEXT NOT NULL DEFAULT 'Arial',
    spacing_profile TEXT NOT NULL DEFAULT 'balanced',
    page_mode TEXT NOT NULL DEFAULT 'auto',
    margin_profile TEXT NOT NULL DEFAULT 'standard',
    theme_color TEXT NOT NULL DEFAULT '#1d4ed8',
    settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_modified TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cover_letter_id)
);

ALTER TABLE public.cover_letter_presentation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cover_letter_presentation_owner_access
    ON public.cover_letter_presentation;
CREATE POLICY cover_letter_presentation_owner_access
    ON public.cover_letter_presentation FOR ALL
    USING (EXISTS (
        SELECT 1
        FROM public.generated_cover_letter generated
        JOIN public.cover_letter_sessions session
          ON session.id = generated.session_id
        WHERE generated.id = cover_letter_id
          AND session.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1
        FROM public.generated_cover_letter generated
        JOIN public.cover_letter_sessions session
          ON session.id = generated.session_id
        WHERE generated.id = cover_letter_id
          AND session.user_id = auth.uid()
    ));
