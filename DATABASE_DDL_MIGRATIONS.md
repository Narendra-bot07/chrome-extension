# Database DDL Migrations & Blob Storage Architecture

This document consolidates all database DDL statements, schemas, types, views, triggers, functions, Row-Level Security (RLS) policies, and **Blob Storage object link references** across the application.

---

## 1. Blob Storage & Object Link Architecture

Unstructured files (uploaded candidate resumes, AI-generated tailored PDFs, template preview renders, profile avatars, and feedback screenshots) are stored in **Supabase Storage** (or S3-compatible Blob Storage).

The database tables store **Object Storage Links / File Paths** referencing these blob artifacts.

### 1.1 Storage Buckets Summary

| Bucket Name | Access Level | Stored Artifacts & File Formats | Object Link Pattern |
| :--- | :--- | :--- | :--- |
| `original-resumes` | **Private (Auth Only)** | Uploaded candidate resumes (`PDF`, `DOCX`) | `original-resumes/{user_id}/{file_name}` |
| `generated-resumes` | **Private (Auth Only)** | AI-generated / tailored rendered PDFs (`PDF`) | `generated-resumes/{user_id}/{version_id}.pdf` |
| `template-previews` | **Public** | Static template preview images/PDFs (`PNG`, `SVG`, `PDF`) | `template-previews/{template_name}.png` |
| `avatars` | **Public** | User profile avatar pictures (`JPG`, `PNG`, `WEBP`) | `avatars/{user_id}/avatar.{ext}` |

---

### 1.2 Unstructured Data & Storage Object Link Mapping

Every unstructured asset in the database is linked via dedicated storage link columns:

| Database Table | Column Name | Object Link / URI Type | Storage Bucket & Reference Details |
| :--- | :--- | :--- | :--- |
| `public.resumes` | `file_path` | Storage Object Path | Points to raw candidate resume file in `original-resumes` bucket (`{user_id}/{filename}`) |
| `public.resume_versions` | `file_url` | Storage Object URL / Path | Points to compiled PDF version artifact in `generated-resumes` bucket |
| `public.resume_versions` | `rendered_pdf_path` | Storage Object Path | Exact path of rendered PDF in `generated-resumes` bucket |
| `public.resume_composition_plans` | `generated_pdf_storage_path` | Storage Object Path | Storage URI of rendered PDF output from Chromium Playwright renderer |
| `public.tailored_resumes` | `file_path` | Storage Object Path | Legacy storage link for compiled tailored PDFs |
| `public.templates` | `preview_path` | Public Storage URL | URL to template thumbnail preview in `template-previews` bucket |
| `public.profiles` | `avatar_url` | Public Storage URL | User avatar URL in `avatars` bucket |
| `public.profiles` | `uploaded_profile_image_url` | Public Storage URL | Uploaded profile image URL in `avatars` bucket |
| `public.feedback` | `screenshot_url` | Storage Object URL | Optional screenshot URL attached to feedback submissions |
| `public.payments` | `invoice_url` | External / Storage URL | Storage / provider link to downloadable payment invoice PDF |
| `public.payments` | `receipt_url` | External / Storage URL | Storage / provider link to payment receipt document |

---

### 1.3 Blob Storage DDL & RLS Policies

```sql
-- Storage Schema Setup
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

-- Helper function to split folder paths
CREATE OR REPLACE FUNCTION storage.foldername(name TEXT)
RETURNS TEXT[] AS $$
BEGIN
    RETURN string_to_array(name, '/');
END;
$$ LANGUAGE plpgsql;

-- Seed Storage Buckets
INSERT INTO storage.buckets (id, name, public) VALUES 
    ('original-resumes', 'original-resumes', false),
    ('generated-resumes', 'generated-resumes', false),
    ('template-previews', 'template-previews', true),
    ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Security Policies for Original Uploaded Resumes (PDF/DOCX)
CREATE POLICY "Users can upload their own original resumes" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'original-resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own original resumes" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'original-resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own original resumes" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'original-resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- RLS Security Policies for Generated Resumes (PDFs)
CREATE POLICY "Users can upload their own generated resumes" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'generated-resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own generated resumes" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'generated-resumes' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage Policies for Public Buckets
CREATE POLICY "Anyone can view template previews" 
ON storage.objects FOR SELECT USING (bucket_id = 'template-previews');

CREATE POLICY "Users can upload their own avatar" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view avatars" 
ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
```

---

## 2. Custom Types & Enums

```sql
CREATE TYPE notification_category AS ENUM (
    'profile','resume','cover_letter','application','interview','recruiter',
    'reminder','ai_insight','security','subscription','product','achievement','system'
);

CREATE TYPE notification_priority AS ENUM ('critical','high','normal','low');

CREATE TYPE notification_status AS ENUM ('unread','read','archived','dismissed','actioned');

CREATE TYPE reminder_status AS ENUM ('scheduled','due','snoozed','completed','cancelled','overdue');
```

---

## 3. Core Database Tables (Complete DDLs)

### 3.1 Authentication & Profiles

```sql
-- 1. Users Table (Core Auth Credentials)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub VARCHAR UNIQUE,
    provider_user_id VARCHAR UNIQUE,
    email VARCHAR UNIQUE NOT NULL,
    full_name VARCHAR,
    avatar_url TEXT, -- Blob Link to avatars bucket
    provider VARCHAR DEFAULT 'email',
    auth_provider TEXT DEFAULT 'password',
    password_hash VARCHAR,
    has_password_credential BOOLEAN DEFAULT FALSE,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ,
    role VARCHAR(30) DEFAULT 'user',
    locale TEXT,
    current_plan VARCHAR(50) DEFAULT 'free',
    credits_remaining INT DEFAULT 5,
    credits_used INT DEFAULT 0,
    subscription_status VARCHAR(20) DEFAULT 'none',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE
);

-- 2. Extended Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    first_name TEXT,
    last_name TEXT,
    preferred_name TEXT,
    username TEXT,
    avatar_url TEXT, -- Object link in 'avatars' bucket
    subscription_plan TEXT NOT NULL DEFAULT 'free',
    credits_remaining INTEGER NOT NULL DEFAULT 5,
    resume_count INTEGER NOT NULL DEFAULT 0,
    date_of_birth DATE,
    gender TEXT,
    phone_country_code TEXT CHECK (phone_country_code IS NULL OR phone_country_code ~ '^\+[1-9][0-9]{0,5}$'),
    phone_number TEXT CHECK (phone_number IS NULL OR phone_number ~ '^[0-9]{6,14}$'),
    phone_verified_at TIMESTAMPTZ,
    country TEXT,
    state TEXT,
    city TEXT,
    timezone TEXT,
    preferred_language TEXT,
    uploaded_profile_image_url TEXT, -- Object link in 'avatars' bucket
    google_profile_image_url TEXT,
    profile_image_source TEXT,
    current_title TEXT,
    years_experience NUMERIC,
    linkedin_url TEXT,
    github_url TEXT,
    portfolio_url TEXT,
    website_url TEXT,
    profile_confirmed_at TIMESTAMPTZ,
    profile_completed_at TIMESTAMPTZ,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_login TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique_idx ON public.profiles(lower(username)) WHERE username IS NOT NULL AND btrim(username) <> '' AND deleted_at IS NULL;
```

---

### 3.2 Resumes, Versioning & PDF Rendering Metadata

```sql
-- 3. Resumes Root Table (Points to uploaded PDF file paths in storage)
CREATE TABLE IF NOT EXISTS public.resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL, -- Object Link in 'original-resumes' bucket
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('PDF', 'DOCX')),
    parsed_content JSONB,
    embeddings TEXT,
    is_active BOOLEAN DEFAULT FALSE,
    active_version_id UUID,
    last_used_job_id UUID,
    last_used_jd_id UUID,
    archived_at TIMESTAMPTZ,
    times_used INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    resume_version INTEGER NOT NULL DEFAULT 1 CHECK (resume_version >= 1),
    source_fingerprint VARCHAR(64),
    fingerprint_algorithm VARCHAR(20) NOT NULL DEFAULT 'sha256',
    fingerprinted_at TIMESTAMPTZ,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 4. Immutable Resume Versions Table
CREATE TABLE IF NOT EXISTS public.resume_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id UUID REFERENCES public.resumes(id) ON DELETE CASCADE,
    parent_version_id UUID REFERENCES public.resume_versions(id) ON DELETE SET NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    version_name TEXT,
    version_type TEXT NOT NULL DEFAULT 'tailored' CHECK (version_type IN ('original', 'tailored', 'manual_edit', 'layout_update', 'restored', 'final')),
    source_resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
    jd_id UUID,
    job_id UUID,
    ats_score NUMERIC(5,2),
    resume_match_score NUMERIC(5,2),
    change_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    changes_summary TEXT,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    file_url TEXT, -- Object Link to rendered PDF artifact in 'generated-resumes' bucket
    rendered_pdf_path TEXT, -- Object path in 'generated-resumes' bucket
    rendered_pdf_hash TEXT, -- SHA-256 of compiled PDF
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    is_final BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID,
    ats_engine_version TEXT,
    match_engine_version TEXT,
    resume_content_hash TEXT,
    jd_content_hash TEXT,
    analysis_timestamp TIMESTAMPTZ,
    final_page_count INTEGER,
    density_level TEXT,
    composition_plan_json JSONB DEFAULT '{}'::jsonb,
    composition_plan_hash TEXT,
    preview_source TEXT,
    renderer_version TEXT,
    composition_engine_version TEXT,
    validation_report JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- 5. Resume Composition Plans (PDF Page Layout Optimization)
CREATE TABLE IF NOT EXISTS public.resume_composition_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    resume_version_id UUID NOT NULL REFERENCES public.resume_versions(id) ON DELETE CASCADE,
    resume_content_hash TEXT NOT NULL,
    layout_strategy TEXT NOT NULL,
    page_preference TEXT NOT NULL CHECK (page_preference IN ('auto', 'one', 'two')),
    final_page_count INTEGER NOT NULL CHECK (final_page_count BETWEEN 1 AND 2),
    density_level TEXT NOT NULL CHECK (density_level IN ('comfortable', 'compact', 'dense')),
    composition_plan_json JSONB NOT NULL,
    composition_plan_hash TEXT NOT NULL,
    measurement_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    optimization_actions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    validation_report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_pdf_hash TEXT, -- SHA-256 hash of printable PDF artifact
    page_utilization JSONB NOT NULL DEFAULT '[]'::jsonb,
    renderer_version TEXT NOT NULL DEFAULT 'chromium-playwright-v1',
    generated_pdf_storage_path TEXT, -- Object Link in 'generated-resumes' bucket
    layout_hash TEXT,
    page_mode TEXT NOT NULL,
    actual_page_count INTEGER NOT NULL,
    density_profile TEXT NOT NULL,
    engine_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Resume Usage Events Audit Log
CREATE TABLE IF NOT EXISTS public.resume_usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    version_id UUID REFERENCES public.resume_versions(id) ON DELETE SET NULL,
    workflow_id UUID,
    event_type TEXT NOT NULL,
    jd_id UUID,
    job_id UUID,
    idempotency_key TEXT UNIQUE,
    ats_score NUMERIC(5,2),
    resume_match_score NUMERIC(5,2),
    ats_engine_version TEXT,
    match_engine_version TEXT,
    resume_content_hash TEXT,
    jd_content_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Resume Link Intelligence
CREATE TABLE IF NOT EXISTS public.resume_link_intelligence (
    link_id TEXT PRIMARY KEY,
    resume_version_id UUID NOT NULL REFERENCES public.resume_versions(id) ON DELETE CASCADE,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('candidate', 'project', 'certification', 'publication', 'achievement', 'experience', 'education', 'unknown')),
    owner_id TEXT,
    link_type TEXT NOT NULL,
    platform TEXT NOT NULL,
    original_url TEXT NOT NULL,
    normalized_url TEXT,
    source_section TEXT,
    source_provenance TEXT,
    confidence NUMERIC(4, 3) NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
    validation_status TEXT NOT NULL CHECK (validation_status IN ('VALID', 'INVALID', 'DUPLICATE', 'OWNER_MISMATCH', 'UNRESOLVED')),
    repair_action TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Templates Table
CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    preview_path TEXT, -- Object Link to preview image/PDF in 'template-previews' bucket
    schema_config JSONB,
    is_premium BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);
```

---

### 3.3 Job Intelligence & ATS Analyses

```sql
-- 9. Job Descriptions Table
CREATE TABLE IF NOT EXISTS public.job_descriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    raw_text TEXT NOT NULL,
    company_name TEXT,
    job_title TEXT,
    normalized_content JSONB,
    ats_keywords JSONB,
    skills_categories JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 10. ATS Analyses Table
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

-- 11. ATS Suggestion Impact Scores
CREATE TABLE IF NOT EXISTS public.ats_suggestion_impacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suggestion_id TEXT NOT NULL,
    ats_analysis_id UUID NOT NULL REFERENCES public.ats_analyses(id) ON DELETE CASCADE,
    score_delta NUMERIC(5,2) NOT NULL,
    category TEXT NOT NULL,
    explanation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. Job Preferences Table
CREATE TABLE IF NOT EXISTS public.job_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
    target_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    target_companies JSONB NOT NULL DEFAULT '[]'::jsonb,
    preferred_locations JSONB NOT NULL DEFAULT '[]'::jsonb,
    work_preference TEXT NOT NULL DEFAULT 'No Preference',
    experience_level TEXT NOT NULL DEFAULT 'No Preference',
    priority_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 3.4 Applications, Cover Letters & Workflow Persistence

```sql
-- 13. Job Tracker Applications
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    company_name TEXT,
    job_title TEXT,
    location TEXT,
    job_url TEXT,
    resume_version TEXT,
    cover_letter_version TEXT,
    ats_score NUMERIC(5,2),
    resume_match_score NUMERIC(5,2),
    current_stage TEXT NOT NULL DEFAULT 'Ready To Apply',
    timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    recruiter_notes TEXT,
    interview_notes TEXT,
    reminder JSONB,
    next_action TEXT,
    next_action_due_at TIMESTAMPTZ,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 14. Cover Letter Context Sessions
CREATE TABLE IF NOT EXISTS public.cover_letter_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
    jd_id TEXT,
    scope_fingerprint TEXT NOT NULL,
    context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    strategy_json JSONB,
    strategy_version TEXT,
    strategy_status TEXT CHECK (strategy_status IN ('strategy_building', 'strategy_ready', 'needs_clarification', 'strategy_failed')),
    user_answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    missing_fields_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL CHECK (status IN ('collecting_context', 'awaiting_user_input', 'ready_for_generation', 'generated', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Generated Cover Letters Table
CREATE TABLE IF NOT EXISTS public.generated_cover_letter (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.cover_letter_sessions(id) ON DELETE CASCADE,
    generated_content TEXT NOT NULL,
    word_count INTEGER NOT NULL CHECK (word_count > 0),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id)
);

-- 16. Cover Letter Presentation / PDF Styling
CREATE TABLE IF NOT EXISTS public.cover_letter_presentation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cover_letter_id UUID NOT NULL REFERENCES public.generated_cover_letter(id) ON DELETE CASCADE,
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

-- 17. Agentic Workflow Runs
CREATE TABLE IF NOT EXISTS public.workflow_runs (
    workflow_id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    status TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. Agentic Workflow Checkpoints
CREATE TABLE IF NOT EXISTS public.workflow_checkpoints (
    checkpoint_id UUID PRIMARY KEY,
    workflow_id UUID NOT NULL REFERENCES public.workflow_runs(workflow_id) ON DELETE CASCADE,
    node_name TEXT,
    revision INTEGER NOT NULL CHECK (revision > 0),
    state JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invalidated_at TIMESTAMPTZ,
    UNIQUE (workflow_id, revision)
);
```

---

### 3.5 Subscriptions, Billing & Monetization

```sql
-- 19. Plans Table
CREATE TABLE IF NOT EXISTS public.plans (
    id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(50),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_amount NUMERIC(10, 2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'USD',
    price_display VARCHAR(50),
    credits INT DEFAULT 0,
    monthly_jd_limit INTEGER,
    resume_limit INTEGER,
    billing_interval VARCHAR(30) DEFAULT 'month',
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. Subscriptions Table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) REFERENCES public.plans(id),
    provider VARCHAR(20) DEFAULT 'internal',
    provider_subscription_id VARCHAR(100),
    status VARCHAR(30) DEFAULT 'active',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    current_period_start TIMESTAMPTZ DEFAULT NOW(),
    current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    grace_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    cancelled_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    pending_plan_id VARCHAR(50) REFERENCES public.plans(id),
    pending_change_effective_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_current_subscription_per_user ON public.subscriptions(user_id) WHERE ended_at IS NULL;

-- 21. Payments Table (Invoice / Receipt PDF Object Links)
CREATE TABLE IF NOT EXISTS public.payments (
    id VARCHAR(100) PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    provider_payment_id VARCHAR(100) UNIQUE NOT NULL,
    provider_order_id VARCHAR(100),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL,
    invoice_url TEXT, -- External or Storage Object Link to PDF invoice
    receipt_url TEXT, -- External or Storage Object Link to PDF receipt
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 22. Credit Transactions Table
CREATE TABLE IF NOT EXISTS public.credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    payment_id VARCHAR(100) REFERENCES public.payments(id),
    credits INT NOT NULL,
    type VARCHAR(20) NOT NULL,
    reason VARCHAR(255),
    balance_after INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

### 3.6 Notifications, Reminders & Support Systems

```sql
-- 23. Notifications Feed Table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    event_id UUID,
    category notification_category NOT NULL,
    notification_type TEXT NOT NULL,
    priority notification_priority NOT NULL DEFAULT 'normal',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    status notification_status NOT NULL DEFAULT 'unread',
    action_label TEXT,
    action_url TEXT,
    action_payload_json JSONB,
    related_entity_type TEXT,
    related_entity_id UUID,
    deduplication_key TEXT,
    expires_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    actioned_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 24. Scheduled Follow-up Reminders
CREATE TABLE IF NOT EXISTS public.reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    application_id UUID REFERENCES public.applications(id) ON DELETE CASCADE,
    recruiter_contact_id UUID,
    interview_id UUID,
    reminder_type TEXT NOT NULL CHECK (reminder_type IN ('application_followup','recruiter_followup','interview_preparation','interview_event','thank_you_email','document_completion','application_deadline','custom')),
    title TEXT NOT NULL,
    description TEXT,
    due_at TIMESTAMPTZ NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    priority notification_priority NOT NULL DEFAULT 'normal',
    status reminder_status NOT NULL DEFAULT 'scheduled',
    recurrence_rule TEXT,
    snoozed_until TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by TEXT NOT NULL DEFAULT 'user',
    last_fired_at TIMESTAMPTZ,
    overdue_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 25. User Feedback (Stores Screenshot Blob Link)
CREATE TABLE IF NOT EXISTS public.feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    category VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    screenshot_url TEXT, -- Storage Object link to attached screenshot image
    status VARCHAR(50) DEFAULT 'OPEN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 4. Database Views

```sql
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
    (SELECT COUNT(*) FROM public.resumes r WHERE r.user_id = p.id AND r.deleted_at IS NULL) AS total_resumes_count,
    (SELECT COUNT(*) FROM public.applications a WHERE a.user_id = p.id) AS total_applications_count
FROM public.profiles p
WHERE p.deleted_at IS NULL;
```

---

## 5. Row-Level Security (RLS) Policies Table Summary

All public schema tables enforce Row Level Security:

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_composition_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Owner Access Policy Examples
CREATE POLICY "Users view own profiles" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users view own resumes" ON public.resumes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users view own resume versions" ON public.resume_versions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.resumes r WHERE r.id = resume_id AND r.user_id = auth.uid())
);
CREATE POLICY "Users manage own applications" ON public.applications FOR ALL USING (auth.uid() = user_id);
```
