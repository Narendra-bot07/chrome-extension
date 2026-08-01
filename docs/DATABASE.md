# Tailr4U - Database Schema & Blob Storage Specification

This document provides the full database schema, relational constraints, performance indexes, Row-Level Security (RLS) policies, and Blob Storage link references for **Tailr4U**.

---

## 1. Storage Buckets & Unstructured File Link Mapping

Unstructured binary files (candidate resume uploads, AI-generated tailored PDFs, template thumbnails, and profile avatars) are stored in **Supabase Storage** (or S3-compatible Blob Storage). Database tables maintain deterministic URI object paths referencing these assets.

### 1.1 Storage Buckets Architecture

| Bucket Name | Access Level | Stored Artifacts | Object Link Path Pattern |
| :--- | :--- | :--- | :--- |
| `original-resumes` | **Private (Auth Only)** | Candidate upload files (`PDF`, `DOCX`) | `original-resumes/{user_id}/{filename}` |
| `generated-resumes` | **Private (Auth Only)** | Rendered tailored PDFs (`PDF`) | `generated-resumes/{user_id}/{version_id}.pdf` |
| `template-previews` | **Public** | Template thumbnail images (`PNG`, `SVG`) | `template-previews/{template_name}.png` |
| `avatars` | **Public** | Candidate profile avatar images (`JPG`, `PNG`) | `avatars/{user_id}/avatar.{ext}` |

### 1.2 Object Link Reference Columns

- `resumes.file_path` → Link to original upload in `original-resumes`
- `resume_versions.rendered_pdf_path` → Link to compiled vector PDF in `generated-resumes`
- `resume_composition_plans.generated_pdf_storage_path` → Link to Playwright PDF output
- `profiles.avatar_url` → Link to user avatar in `avatars`

---

## 2. Core Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    PROFILES ||--o{ RESUMES : "owns"
    PROFILES ||--o{ APPLICATIONS : "tracks"
    PROFILES ||--o{ SUBSCRIPTIONS : "has"
    PROFILES ||--o{ USER_PREFERENCES : "configures"
    RESUMES ||--o{ RESUME_VERSIONS : "has versions"
    JOB_DESCRIPTIONS ||--o{ RESUME_VERSIONS : "tailored against"
    RESUME_VERSIONS ||--o{ APPLICATIONS : "used in"
    SUBSCRIPTIONS ||--o{ PAYMENTS : "generates"

    PROFILES {
        uuid id PK
        string email
        string full_name
        string tier
        timestamp created_at
    }

    RESUMES {
        uuid id PK
        uuid user_id FK
        string title
        string file_path
        jsonb parsed_content
        timestamp created_at
    }

    JOB_DESCRIPTIONS {
        uuid id PK
        uuid user_id FK
        string job_title
        string company_name
        text raw_description
        jsonb extracted_keywords
    }

    RESUME_VERSIONS {
        uuid id PK
        uuid resume_id FK
        uuid job_description_id FK
        jsonb tailored_content
        integer ats_score
        string rendered_pdf_path
    }

    APPLICATIONS {
        uuid id PK
        uuid user_id FK
        uuid resume_version_id FK
        string company_name
        string job_title
        string status
        timestamp applied_at
    }
```

---

## 3. Comprehensive Database Table Specifications

### 3.1 `public.profiles`
Stores core candidate account information, authentication links, and subscription tiers.

```sql
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    target_job_title TEXT,
    avatar_url TEXT,
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
    monthly_tailor_limit INTEGER DEFAULT 10,
    tailor_count_this_month INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
```

---

### 3.2 `public.resumes`
Stores candidate master resumes (both raw uploaded file paths and parsed structured JSON representations).

```sql
CREATE TABLE IF NOT EXISTS public.resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Master Resume',
    file_path TEXT NOT NULL,
    file_format TEXT NOT NULL CHECK (file_format IN ('pdf', 'docx', 'txt')),
    parsed_content JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_master BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON public.resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_is_master ON public.resumes(user_id, is_master);
```

---

### 3.3 `public.job_descriptions`
Stores extracted job descriptions captured via Chrome Extension or user input.

```sql
CREATE TABLE IF NOT EXISTS public.job_descriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    job_url TEXT,
    raw_description TEXT NOT NULL,
    extracted_keywords JSONB DEFAULT '[]'::jsonb,
    experience_level TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.job_descriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_company_title ON public.job_descriptions(company_name, job_title);
```

---

### 3.4 `public.resume_versions` (Tailored Resumes)
Stores AI-tailored resume variations produced for specific job descriptions.

```sql
CREATE TABLE IF NOT EXISTS public.resume_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    job_description_id UUID REFERENCES public.job_descriptions(id) ON DELETE SET NULL,
    version_name TEXT NOT NULL,
    tailored_content JSONB NOT NULL,
    ats_score INTEGER CHECK (ats_score BETWEEN 0 AND 100),
    tailoring_report JSONB DEFAULT '{}'::jsonb,
    rendered_pdf_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_versions_resume_id ON public.resume_versions(resume_id);
CREATE INDEX IF NOT EXISTS idx_versions_job_id ON public.resume_versions(job_description_id);
```

---

### 3.5 `public.applications`
Tracks job applications across status stages (Saved, Applied, Interviewing, Offer, Rejected).

```sql
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    resume_version_id UUID REFERENCES public.resume_versions(id) ON DELETE SET NULL,
    company_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    job_url TEXT,
    location TEXT,
    salary_range TEXT,
    status TEXT NOT NULL DEFAULT 'SAVED' CHECK (status IN ('SAVED', 'APPLIED', 'INTERVIEWING', 'OFFER', 'REJECTED')),
    applied_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applications_user_status ON public.applications(user_id, status);
```

---

### 3.6 `public.device_abuse_tracking`
Anti-abuse and rate limiting tracking for free-tier endpoints.

```sql
CREATE TABLE IF NOT EXISTS public.device_abuse_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_fingerprint TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    request_count INTEGER DEFAULT 1,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    is_blocked BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_device_abuse_fingerprint ON public.device_abuse_tracking(device_fingerprint);
```

---

## 4. Row-Level Security (RLS) Policies

Tailr4U enforces strict multi-tenant isolation via PostgreSQL Row-Level Security.

```sql
-- Enable RLS on all sensitive tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_descriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Standard User Isolation Policies
CREATE POLICY "Users can only view their own profile" 
ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can only access their own resumes" 
ON public.resumes FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their own applications" 
ON public.applications FOR ALL USING (auth.uid() = user_id);
```
