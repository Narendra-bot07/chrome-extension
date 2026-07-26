CREATE TABLE IF NOT EXISTS public.cover_letter_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cover_letter_id UUID REFERENCES public.generated_cover_letter(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cover_letter_review (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.cover_letter_chat_sessions(id) ON DELETE CASCADE,
    review_summary TEXT NOT NULL,
    issues_found JSONB NOT NULL DEFAULT '[]'::jsonb,
    issues_fixed JSONB NOT NULL DEFAULT '[]'::jsonb,
    final_content TEXT NOT NULL,
    review_score INTEGER NOT NULL CHECK (review_score BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cover_letter_edit_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.cover_letter_chat_sessions(id) ON DELETE CASCADE,
    user_prompt TEXT NOT NULL,
    before_content TEXT NOT NULL,
    after_content TEXT NOT NULL,
    review_summary TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cover_letter_edit_history_session
    ON public.cover_letter_edit_history(session_id, created_at);

ALTER TABLE public.cover_letter_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cover_letter_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cover_letter_edit_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cover_letter_chat_sessions_owner_access
    ON public.cover_letter_chat_sessions;
CREATE POLICY cover_letter_chat_sessions_owner_access
    ON public.cover_letter_chat_sessions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS cover_letter_review_owner_access
    ON public.cover_letter_review;
CREATE POLICY cover_letter_review_owner_access
    ON public.cover_letter_review FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.cover_letter_chat_sessions chat
        WHERE chat.id = session_id AND chat.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.cover_letter_chat_sessions chat
        WHERE chat.id = session_id AND chat.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS cover_letter_edit_history_owner_access
    ON public.cover_letter_edit_history;
CREATE POLICY cover_letter_edit_history_owner_access
    ON public.cover_letter_edit_history FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.cover_letter_chat_sessions chat
        WHERE chat.id = session_id AND chat.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.cover_letter_chat_sessions chat
        WHERE chat.id = session_id AND chat.user_id = auth.uid()
    ));
