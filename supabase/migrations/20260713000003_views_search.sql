-- 1. SQL Views

-- User Dashboard View
CREATE OR REPLACE VIEW public.user_dashboard_view AS
SELECT 
    p.id AS user_id,
    p.email,
    p.full_name,
    p.avatar_url,
    p.subscription_plan,
    p.credits_remaining,
    p.resume_count,
    p.last_login,
    (SELECT COUNT(*) FROM public.tailored_resumes tr WHERE tr.user_id = p.id AND tr.deleted_at IS NULL) AS tailored_count,
    (SELECT COUNT(*) FROM public.downloads d WHERE d.user_id = p.id AND d.deleted_at IS NULL) AS download_count
FROM public.profiles p
WHERE p.deleted_at IS NULL;

-- Resume Statistics View
CREATE OR REPLACE VIEW public.resume_stats_view AS
SELECT 
    r.user_id,
    COUNT(r.id) AS total_resumes,
    COALESCE(SUM((SELECT COUNT(*) FROM public.tailored_resumes tr WHERE tr.original_resume_id = r.id AND tr.deleted_at IS NULL)), 0) AS total_tailored_versions
FROM public.resumes r
WHERE r.deleted_at IS NULL
GROUP BY r.user_id;

-- Download Statistics View
CREATE OR REPLACE VIEW public.download_stats_view AS
SELECT 
    d.user_id,
    COUNT(d.id) OVER (PARTITION BY d.user_id) AS total_downloads,
    d.file_type,
    d.template_id,
    t.name AS template_name,
    COUNT(d.id) OVER (PARTITION BY d.user_id, d.template_id) AS template_download_count
FROM public.downloads d
LEFT JOIN public.templates t ON d.template_id = t.id
WHERE d.deleted_at IS NULL;

-- Usage Statistics View (Popular templates, daily active users count, avg tailoring time)
CREATE OR REPLACE VIEW public.usage_stats_view AS
SELECT 
    (SELECT COUNT(DISTINCT user_id) FROM public.usage_logs WHERE action = 'login' AND created_at >= CURRENT_DATE) AS daily_active_users,
    (SELECT AVG(processing_time_ms) FROM public.ai_generations WHERE status = 'completed') AS avg_tailoring_time_ms,
    (SELECT AVG(ats_score) FROM public.tailored_resumes WHERE deleted_at IS NULL) AS avg_ats_score
;

-- Subscription Overview View
CREATE OR REPLACE VIEW public.subscription_overview_view AS
SELECT 
    s.user_id,
    s.plan_type,
    s.status AS subscription_status,
    s.current_period_end,
    p.email,
    p.full_name
FROM public.subscriptions s
JOIN public.profiles p ON s.user_id = p.id
WHERE s.deleted_at IS NULL;

-- Recent Activity View
CREATE OR REPLACE VIEW public.recent_activity_view AS
SELECT 
    ul.id AS log_id,
    ul.user_id,
    ul.action,
    ul.metadata,
    ul.created_at
FROM public.usage_logs ul
WHERE ul.deleted_at IS NULL
ORDER BY ul.created_at DESC;


-- 2. Full-Text Search Configuration

-- Add search fields or generate them dynamically using functions
-- To search within parsed_content JSONB or raw_text

-- Resume search helper function
CREATE OR REPLACE FUNCTION public.search_resumes(query_text TEXT)
RETURNS TABLE (
    resume_id UUID,
    user_id UUID,
    file_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT r.id, r.user_id, r.file_name, r.created_at
    FROM public.resumes r
    WHERE r.deleted_at IS NULL
      AND (
        to_tsvector('english', COALESCE(r.file_name, '') || ' ' || COALESCE(r.parsed_content::text, '')) 
        @@ plainto_tsquery('english', query_text)
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Job description search helper function
CREATE OR REPLACE FUNCTION public.search_job_descriptions(query_text TEXT)
RETURNS TABLE (
    jd_id UUID,
    user_id UUID,
    company_name TEXT,
    job_title TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT jd.id, jd.user_id, jd.company_name, jd.job_title, jd.created_at
    FROM public.job_descriptions jd
    WHERE jd.deleted_at IS NULL
      AND (
        to_tsvector('english', COALESCE(jd.company_name, '') || ' ' || COALESCE(jd.job_title, '') || ' ' || COALESCE(jd.raw_text, '')) 
        @@ plainto_tsquery('english', query_text)
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
