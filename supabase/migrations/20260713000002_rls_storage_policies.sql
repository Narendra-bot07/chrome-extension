-- Define mock auth.uid() and storage functions for standard PostgreSQL local support
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID AS $$
BEGIN
    RETURN '00000000-0000-0000-0000-000000000000'::UUID;
END;
$$ LANGUAGE plpgsql;

CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    public BOOLEAN DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS storage.objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bucket_id TEXT REFERENCES storage.buckets(id),
    name TEXT,
    owner UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE OR REPLACE FUNCTION storage.foldername(name TEXT)
RETURNS TEXT[] AS $$
BEGIN
    RETURN string_to_array(name, '/');
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tailored_resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.future_ready_settings ENABLE ROW LEVEL SECURITY;

-- Create admin validation function (placeholder for future admin roles/claims)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    -- Standard Supabase check: returns true if service_role or admin claim exists
    RETURN (
        current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
        OR COALESCE(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'is_admin', 'false')::boolean = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS POLICIES FOR TABLES

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.is_admin());

-- Resumes
CREATE POLICY "Users can view own resumes" ON public.resumes FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can insert own resumes" ON public.resumes FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can update own resumes" ON public.resumes FOR UPDATE USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can delete own resumes" ON public.resumes FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- Job Descriptions
CREATE POLICY "Users can view own job descriptions" ON public.job_descriptions FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can insert own job descriptions" ON public.job_descriptions FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can update own job descriptions" ON public.job_descriptions FOR UPDATE USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can delete own job descriptions" ON public.job_descriptions FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- Tailored Resumes
CREATE POLICY "Users can view own tailored resumes" ON public.tailored_resumes FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can insert own tailored resumes" ON public.tailored_resumes FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can update own tailored resumes" ON public.tailored_resumes FOR UPDATE USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can delete own tailored resumes" ON public.tailored_resumes FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- Templates (Publicly readable, but only admins can modify)
CREATE POLICY "Anyone can view templates" ON public.templates FOR SELECT USING (true);
CREATE POLICY "Admins can modify templates" ON public.templates FOR ALL USING (public.is_admin());

-- Resume Versions
CREATE POLICY "Users can view own resume versions" ON public.resume_versions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.tailored_resumes tr WHERE tr.id = tailored_resume_id AND tr.user_id = auth.uid()) OR public.is_admin()
);
CREATE POLICY "Users can insert own resume versions" ON public.resume_versions FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.tailored_resumes tr WHERE tr.id = tailored_resume_id AND tr.user_id = auth.uid()) OR public.is_admin()
);

-- Resume Reviews
CREATE POLICY "Users can view own resume reviews" ON public.resume_reviews FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_id AND r.user_id = auth.uid()) OR public.is_admin()
);
CREATE POLICY "Users can insert own resume reviews" ON public.resume_reviews FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_id AND r.user_id = auth.uid()) OR public.is_admin()
);

-- AI Generations
CREATE POLICY "Users can view own AI generations" ON public.ai_generations FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can insert own AI generations" ON public.ai_generations FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- Downloads
CREATE POLICY "Users can view own downloads" ON public.downloads FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can insert own downloads" ON public.downloads FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- Usage Logs
CREATE POLICY "Users can view own usage logs" ON public.usage_logs FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can insert own usage logs" ON public.usage_logs FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- Subscriptions
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Credits
CREATE POLICY "Users can view own credits" ON public.credits FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- API Usage
CREATE POLICY "Users can view own API usage" ON public.api_usage FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Audit Logs
CREATE POLICY "Users can view own audit logs" ON public.audit_logs FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Notifications
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id OR public.is_admin());

-- Future Ready Settings
CREATE POLICY "Users can manage own settings" ON public.future_ready_settings FOR ALL USING (auth.uid() = user_id OR public.is_admin());


-- STORAGE BUCKETS SETUP & POLICIES

-- Populate storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('original-resumes', 'original-resumes', false),
    ('generated-resumes', 'generated-resumes', false),
    ('template-previews', 'template-previews', true),
    ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for 'original-resumes' (Private Access)
CREATE POLICY "Users can upload their own original resumes" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'original-resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own original resumes" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'original-resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own original resumes" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'original-resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage Policies for 'generated-resumes' (Private Access)
CREATE POLICY "Users can upload their own generated resumes" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'generated-resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own generated resumes" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'generated-resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage Policies for 'template-previews' (Public Access)
CREATE POLICY "Anyone can view template previews" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'template-previews');

-- Storage Policies for 'avatars' (Public Access, restricted upload)
CREATE POLICY "Users can upload their own avatar" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view avatars" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'avatars');
