CREATE TABLE IF NOT EXISTS public.cover_letter_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
    jd_id TEXT,
    scope_fingerprint TEXT NOT NULL,
    context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    strategy_json JSONB,
    strategy_version TEXT,
    strategy_status TEXT CHECK (strategy_status IN (
        'strategy_building', 'strategy_ready', 'needs_clarification', 'strategy_failed'
    )),
    user_answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    missing_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL CHECK (status IN (
        'collecting_context', 'awaiting_user_input', 'ready_for_generation',
        'generated', 'failed'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cover_letter_sessions_scope
    ON public.cover_letter_sessions(user_id, resume_id, jd_id, updated_at DESC);

ALTER TABLE public.cover_letter_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cover_letter_sessions_owner_access ON public.cover_letter_sessions;
CREATE POLICY cover_letter_sessions_owner_access
    ON public.cover_letter_sessions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.generated_cover_letter (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.cover_letter_sessions(id) ON DELETE CASCADE,
    generated_content TEXT NOT NULL,
    word_count INTEGER NOT NULL CHECK (word_count > 0),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id)
);

ALTER TABLE public.generated_cover_letter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS generated_cover_letter_owner_access
    ON public.generated_cover_letter;
CREATE POLICY generated_cover_letter_owner_access
    ON public.generated_cover_letter FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.cover_letter_sessions session
            WHERE session.id = session_id AND session.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.cover_letter_sessions session
            WHERE session.id = session_id AND session.user_id = auth.uid()
        )
    );
