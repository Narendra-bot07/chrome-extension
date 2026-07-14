-- Trigger function to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION public.handle_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach updated_at trigger to all tables
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('profiles', 'resumes', 'job_descriptions', 'tailored_resumes', 'templates', 'resume_versions', 'resume_reviews', 'ai_generations', 'downloads', 'usage_logs', 'subscriptions', 'credits', 'api_usage', 'audit_logs', 'notifications', 'future_ready_settings')
    LOOP
        EXECUTE format('
            CREATE TRIGGER tr_update_timestamp_%I
            BEFORE UPDATE ON public.%I
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_update_timestamp();
        ', t, t);
    END LOOP;
END;
$$;

-- Trigger function to automatically create user profile after Auth Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, subscription_plan, credits_remaining, resume_count)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
        'free',
        5,
        0
    );
    
    -- Initialize credits balance
    INSERT INTO public.credits (user_id, balance, allocated, consumed)
    VALUES (NEW.id, 5, 5, 0);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger function to update last login timestamp when a session/activity is logged
CREATE OR REPLACE FUNCTION public.update_last_login_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.action = 'login' THEN
        UPDATE public.profiles
        SET last_login = NEW.created_at
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_user_login_activity
  AFTER INSERT ON public.usage_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_last_login_trigger();

-- Trigger to increment tailored resume version numbers
CREATE OR REPLACE FUNCTION public.increment_resume_version()
RETURNS TRIGGER AS $$
DECLARE
    next_ver INTEGER;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO next_ver
    FROM public.resume_versions
    WHERE tailored_resume_id = NEW.tailored_resume_id;

    NEW.version_number = next_ver;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_increment_resume_version
  BEFORE INSERT ON public.resume_versions
  FOR EACH ROW EXECUTE FUNCTION public.increment_resume_version();

-- Trigger function to create Audit Logs for key changes in resumes, profiles, tailored_resumes
CREATE OR REPLACE FUNCTION public.process_audit_logging()
RETURNS TRIGGER AS $$
DECLARE
    user_val UUID;
BEGIN
    -- Determine user associated with the event
    IF TG_TABLE_NAME = 'profiles' THEN
        user_val = COALESCE(NEW.id, OLD.id);
    ELSE
        user_val = COALESCE(NEW.user_id, OLD.user_id);
    END IF;

    INSERT INTO public.audit_logs (user_id, event_type, table_name, record_id, old_values, new_values)
    VALUES (
        user_val,
        TG_OP,
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit log triggers to key tables
CREATE TRIGGER audit_profiles_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_logging();

CREATE TRIGGER audit_resumes_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_logging();

CREATE TRIGGER audit_tailored_resumes_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.tailored_resumes
  FOR EACH ROW EXECUTE FUNCTION public.process_audit_logging();


-- Helper Database Functions
-- 1. Increment Resume Count
CREATE OR REPLACE FUNCTION public.increment_resume_count(user_uuid UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.profiles
    SET resume_count = resume_count + 1
    WHERE id = user_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Soft Delete Resume
CREATE OR REPLACE FUNCTION public.soft_delete_resume(resume_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE public.resumes
    SET deleted_at = timezone('utc'::text, now())
    WHERE id = resume_uuid AND user_id = user_uuid AND deleted_at IS NULL;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Log User Activity
CREATE OR REPLACE FUNCTION public.log_user_activity(user_uuid UUID, user_action TEXT, log_metadata JSONB)
RETURNS UUID AS $$
DECLARE
    new_log_id UUID;
BEGIN
    INSERT INTO public.usage_logs (user_id, action, metadata)
    VALUES (user_uuid, user_action, log_metadata)
    RETURNING id INTO new_log_id;
    
    RETURN new_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Calculate Usage statistics for a user
CREATE OR REPLACE FUNCTION public.calculate_usage(user_uuid UUID)
RETURNS TABLE (
    total_resumes BIGINT,
    total_tailored BIGINT,
    total_downloads BIGINT,
    credits_remaining INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM public.resumes WHERE user_id = user_uuid AND deleted_at IS NULL),
        (SELECT COUNT(*) FROM public.tailored_resumes WHERE user_id = user_uuid AND deleted_at IS NULL),
        (SELECT COUNT(*) FROM public.downloads WHERE user_id = user_uuid AND deleted_at IS NULL),
        (SELECT p.credits_remaining FROM public.profiles p WHERE p.id = user_uuid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
