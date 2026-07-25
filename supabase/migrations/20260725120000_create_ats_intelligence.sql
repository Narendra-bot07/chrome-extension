CREATE TABLE IF NOT EXISTS public.ats_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    jd_id UUID NOT NULL REFERENCES public.job_descriptions(id) ON DELETE CASCADE,
    engine_version TEXT NOT NULL,
    overall_score INTEGER,
    resume_match_score INTEGER,
    ats_score INTEGER,
    breakdown_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure columns exist if table was already created
ALTER TABLE public.ats_analyses ADD COLUMN IF NOT EXISTS resume_match_score INTEGER;
ALTER TABLE public.ats_analyses ADD COLUMN IF NOT EXISTS ats_score INTEGER;

-- Create ATS Suggestion Impacts Table
CREATE TABLE IF NOT EXISTS public.ats_suggestion_impacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suggestion_id TEXT NOT NULL,
    ats_analysis_id UUID NOT NULL REFERENCES public.ats_analyses(id) ON DELETE CASCADE,
    score_delta NUMERIC(5,2) NOT NULL,
    category TEXT NOT NULL,
    explanation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ats_analyses_user_id ON public.ats_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_ats_analyses_resume_jd ON public.ats_analyses(resume_id, jd_id);
CREATE INDEX IF NOT EXISTS idx_ats_suggestion_impacts_analysis_id ON public.ats_suggestion_impacts(ats_analysis_id);
