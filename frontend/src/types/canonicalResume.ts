/**
 * Canonical, template-independent source of truth schema for resumes.
 */

export interface CanonicalLink {
  platform: string;
  url: string;
  label: string;
  owner_type?: string;
}

export interface CanonicalHeader {
  full_name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: CanonicalLink[];
}

export interface CanonicalItem {
  id: string;
  title: string;
  subtitle?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  date_display?: string;
  description?: string;
  bullets?: string[];
  skills?: string[];
  links?: CanonicalLink[];
  metrics?: string[];
  metadata?: Record<string, any>;
}

export interface CanonicalSection {
  id: string;
  type: 'text' | 'structured_list' | 'categorized_skills' | 'simple_list';
  display_heading: string;
  order: number;
  visible: boolean;
  items: CanonicalItem[];
  custom_content?: any;
}

export interface CanonicalJobContext {
  job_id?: string;
  jd_fingerprint?: string;
  company?: string;
  role?: string;
}

export interface CanonicalResumeSnapshot {
  schema_version: string; // '2.0_canonical'
  resume_id: string;
  source_resume_id?: string;
  source_version_id?: string;
  tailored_version_id?: string;
  content_version_id: string;
  content_hash: string;
  job_context?: CanonicalJobContext;
  header: CanonicalHeader;
  summary?: string;
  sections: CanonicalSection[];
  section_order: string[];
  custom_sections?: any[];
  user_preferences?: Record<string, any>;
  provenance?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface ResumeLayoutConfig {
  layout_config_id: string;
  content_version_id: string;
  template_id: string;
  page_mode: 'auto' | 'one' | 'two';
  typography?: string;
  spacing?: Record<string, any>;
  margins?: Record<string, any>;
  paper_size?: string;
  layout_tree?: Record<string, any>;
}

export interface ResumeTemplateProps {
  resume: CanonicalResumeSnapshot;
  layout: ResumeLayoutConfig;
}
