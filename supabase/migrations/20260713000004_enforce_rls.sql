-- 1. Redefine auth.uid() to fetch sub from request configuration parameter
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID AS $$
DECLARE
  current_uid TEXT;
BEGIN
  current_uid := current_setting('request.jwt.claim.sub', true);
  IF current_uid IS NOT NULL AND current_uid <> '' THEN
    RETURN current_uid::UUID;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Force Row Level Security on all business tables to restrict database owner/superuser connections
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.resumes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.job_descriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tailored_resumes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.resume_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.resume_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.downloads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.credits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.future_ready_settings FORCE ROW LEVEL SECURITY;
