import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowRight, Award, Briefcase, Building2, Calendar, Check, 
  ChevronRight, Clock, DollarSign, Edit3, Globe, Info, 
  MapPin, RefreshCw, Save, ShieldCheck, SlidersHorizontal, 
  Star, Target, Trash2, User, X, Zap 
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';

// Standard Taxonomy Options for Suggestions
const TAXONOMY_SUGGESTIONS = {
  roles: [
    'Data Engineer', 'AI Engineer', 'Backend Engineer', 'Full Stack Engineer', 
    'DevOps Engineer', 'Senior Consultant', 'Frontend Engineer', 'Machine Learning Engineer',
    'Platform Engineer', 'Software Architect', 'Data Scientist', 'Cloud Architect'
  ],
  companies: [
    'Amazon', 'Microsoft', 'Google', 'Atlassian', 'Netflix', 'Meta', 
    'PwC', 'Tata Consultancy Services', 'Infosys', 'Accenture', 'Apple', 'Oracle'
  ],
  industries: [
    'Technology', 'Consulting', 'FinTech', 'Healthcare', 'SaaS', 
    'E-commerce', 'Cloud Infrastructure', 'Artificial Intelligence', 'Cybersecurity', 'Financial Services'
  ],
  locations: [
    'Hyderabad', 'Bengaluru', 'Pune', 'Remote', 'Mumbai', 'Chennai', 
    'Delhi NCR', 'India', 'United States', 'Singapore', 'London'
  ],
  skills: [
    'Python', 'AWS', 'Docker', 'SQL', 'FastAPI', 'React', 'Java', 
    'Kubernetes', 'PySpark', 'Databricks', 'Azure', 'PostgreSQL', 'TypeScript', 'Node.js'
  ]
};

const WORK_MODE_OPTIONS = ['Remote', 'Hybrid', 'On-site', 'Flexible'];
const RELOCATION_OPTIONS = ['Open to relocation', 'Only selected locations', 'Not currently'];
const SPONSORSHIP_OPTIONS = ['Required', 'Not required', 'Open to discuss', 'Prefer not to say'];
const EXPERIENCE_LEVEL_OPTIONS = ['Student / Fresher', '0–2 years', '2–5 years', '5–8 years', '8–12 years', '12+ years'];
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'];
const NOTICE_PERIOD_OPTIONS = ['Immediate', '15 days', '30 days', '60 days', '90 days', 'Custom'];
const COMPANY_SIZE_OPTIONS = ['Startup', 'Mid-size', 'Enterprise', 'No preference'];
const SENIORITY_OPTIONS = ['Internship', 'Entry Level', 'Associate', 'Mid Level', 'Senior', 'Lead', 'Manager'];
const ALERT_FREQUENCY_OPTIONS = ['Daily', 'Weekly', 'Off'];
const CURRENCY_OPTIONS = ['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD'];
const SALARY_PERIOD_OPTIONS = ['Annual', 'Monthly', 'Hourly'];

const DEFAULT_PREFERENCES = {
  primary_role: 'Data Engineer',
  target_roles: ['Data Engineer', 'AI Engineer', 'Backend Engineer'],
  target_companies: ['Microsoft', 'Amazon', 'Google'],
  primary_company: 'Microsoft',
  preferred_industries: ['Technology', 'SaaS', 'FinTech'],
  preferred_locations: ['Hyderabad', 'Remote'],
  work_modes: ['Hybrid', 'Remote'],
  work_preference: 'Hybrid',
  relocation_preference: 'Open to relocation',
  sponsorship_preference: 'Not required',
  experience_level: '0–2 years',
  current_title: 'Software Engineer',
  years_experience: '2',
  priority_skills: ['Python', 'AWS', 'Docker'],
  secondary_skills: ['SQL', 'FastAPI', 'React', 'PySpark'],
  current_compensation: '',
  expected_compensation: '',
  compensation_currency: 'USD',
  salary_period: 'Annual',
  min_compensation: '',
  is_salary_negotiable: true,
  employment_types: ['Full-time'],
  notice_period: '30 days',
  company_size_preferences: ['Enterprise', 'Mid-size'],
  seniority_preferences: ['Mid Level', 'Senior'],
  job_alert_frequency: 'Daily',
  has_completed_preferences: true
};

// Reusable Interactive Chip Component
function PreferenceChips({ 
  items = [], 
  primaryItem = '', 
  onAdd, 
  onRemove, 
  onSetPrimary, 
  suggestions = [], 
  placeholder = "Type and press Enter...",
  label = "",
  showPrimary = false
}) {
  const [draft, setDraft] = useState('');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = draft.trim();
      if (val && !items.some(i => i.toLowerCase() === val.toLowerCase())) {
        onAdd(val);
        setDraft('');
      }
    }
  };

  const unusedSuggestions = suggestions.filter(
    s => s.toLowerCase().includes(draft.toLowerCase()) && !items.some(i => i.toLowerCase() === s.toLowerCase())
  );

  return (
    <div className="space-y-3">
      {label && <label className="text-xs font-semibold text-tf-text flex items-center justify-between">{label}</label>}
      <div className="min-h-[84px] rounded-xl border border-tf-border bg-tf-surface p-3 focus-within:border-tf-accent focus-within:ring-2 focus-within:ring-tf-accent/15 transition-all">
        <div className="flex flex-wrap gap-2">
          {items.map((item) => {
            const isPrimary = showPrimary && item.toLowerCase() === (primaryItem || '').toLowerCase();
            return (
              <span
                key={item}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition-all ${
                  isPrimary
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold shadow-xs'
                    : 'bg-tf-surface-2 border-tf-border text-tf-text hover:border-tf-border-strong'
                }`}
              >
                {showPrimary && onSetPrimary && (
                  <button
                    type="button"
                    onClick={() => onSetPrimary(item)}
                    title={isPrimary ? "Primary item" : "Set as primary"}
                    className={`cursor-pointer transition-colors ${isPrimary ? 'text-amber-500' : 'text-tf-text-tertiary hover:text-amber-500'}`}
                  >
                    <Star size={13} fill={isPrimary ? "currentColor" : "none"} />
                  </button>
                )}
                <span>{item}</span>
                {isPrimary && <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">Primary</span>}
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  className="text-tf-text-tertiary hover:text-tf-text p-0.5 rounded transition-colors cursor-pointer"
                  title="Remove"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="min-w-[160px] flex-1 border-none bg-transparent py-1 text-xs text-tf-text outline-none placeholder:text-tf-text-tertiary"
          />
        </div>
      </div>

      {unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-[11px] font-semibold text-tf-text-tertiary self-center pr-1">Suggestions:</span>
          {unusedSuggestions.slice(0, 8).map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => onAdd(sug)}
              className="rounded-lg border border-tf-border bg-tf-surface-2/60 px-2.5 py-1 text-[11px] font-medium text-tf-text-secondary hover:border-tf-accent hover:text-tf-accent hover:bg-tf-surface transition-all cursor-pointer"
            >
              + {sug}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Reusable Segmented Pill Group Component
function PillSelect({ options, selected = [], onChange, isMulti = false, label = "" }) {
  const isSelected = (opt) => {
    if (isMulti) return Array.isArray(selected) && selected.includes(opt);
    return selected === opt;
  };

  const handleSelect = (opt) => {
    if (isMulti) {
      const current = Array.isArray(selected) ? selected : [];
      if (current.includes(opt)) {
        onChange(current.filter((item) => item !== opt));
      } else {
        onChange([...current, opt]);
      }
    } else {
      onChange(opt);
    }
  };

  return (
    <div className="space-y-2">
      {label && <label className="text-xs font-semibold text-tf-text block">{label}</label>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = isSelected(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => handleSelect(opt)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 ${
                active
                  ? 'bg-tf-accent/15 border-tf-accent text-tf-accent shadow-xs'
                  : 'bg-tf-surface border-tf-border text-tf-text-secondary hover:border-tf-border-strong hover:text-tf-text'
              }`}
            >
              {active && <Check size={13} className="text-tf-accent stroke-[3]" />}
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function JobPreferencesPage() {
  const navigate = useNavigate();
  const { jobPreferences, saveJobPreferences, parsedResume } = useApp();

  const [form, setForm] = useState(() => ({
    ...DEFAULT_PREFERENCES,
    ...(jobPreferences || {})
  }));

  const [initialForm, setInitialForm] = useState(() => ({
    ...DEFAULT_PREFERENCES,
    ...(jobPreferences || {})
  }));

  const [activeSection, setActiveSection] = useState('career-targets');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [dismissedSuggestions, setDismissedSuggestions] = useState([]);

  useEffect(() => {
    if (jobPreferences) {
      const merged = { ...DEFAULT_PREFERENCES, ...jobPreferences };
      setForm(merged);
      setInitialForm(merged);
    }
  }, [jobPreferences]);

  // Dirty Check for Unsaved Changes Bar
  const isDirty = useMemo(() => {
    return JSON.stringify(form) !== JSON.stringify(initialForm);
  }, [form, initialForm]);

  // Completeness Calculator strictly from real non-empty fields
  const completeness = useMemo(() => {
    const checks = [
      { key: 'target_roles', valid: Array.isArray(form.target_roles) && form.target_roles.length > 0, weight: 15, name: 'target roles' },
      { key: 'target_companies', valid: Array.isArray(form.target_companies) && form.target_companies.length > 0, weight: 10, name: 'target companies' },
      { key: 'preferred_industries', valid: Array.isArray(form.preferred_industries) && form.preferred_industries.length > 0, weight: 10, name: 'preferred industries' },
      { key: 'preferred_locations', valid: Array.isArray(form.preferred_locations) && form.preferred_locations.length > 0, weight: 15, name: 'preferred locations' },
      { key: 'work_modes', valid: (Array.isArray(form.work_modes) && form.work_modes.length > 0) || Boolean(form.work_preference), weight: 10, name: 'work style' },
      { key: 'experience_level', valid: Boolean(form.experience_level) && form.experience_level !== 'No Preference', weight: 10, name: 'experience level' },
      { key: 'priority_skills', valid: Array.isArray(form.priority_skills) && form.priority_skills.length > 0, weight: 15, name: 'priority skills' },
      { key: 'expected_compensation', valid: Boolean(form.expected_compensation), weight: 10, name: 'expected salary' },
      { key: 'notice_period', valid: Boolean(form.notice_period), weight: 5, name: 'notice period' }
    ];

    const score = checks.reduce((acc, curr) => acc + (curr.valid ? curr.weight : 0), 0);
    const missing = checks.filter(c => !c.valid).map(c => c.name);

    return { score, missing };
  }, [form]);

  // Dynamic AI Suggestions derived from active resume
  const resumeAiSuggestions = useMemo(() => {
    if (!parsedResume) return [];
    const skills = parsedResume.skills || [];
    const roles = parsedResume.target_roles || [];
    const candidates = [...skills, ...roles];

    const existingSkills = [...(form.priority_skills || []), ...(form.secondary_skills || [])];
    const existingRoles = form.target_roles || [];

    return candidates.filter(item => {
      if (!item || typeof item !== 'string') return false;
      const lower = item.toLowerCase();
      if (dismissedSuggestions.includes(lower)) return false;
      return !existingSkills.some(s => s.toLowerCase() === lower) && !existingRoles.some(r => r.toLowerCase() === lower);
    }).slice(0, 6);
  }, [parsedResume, form.priority_skills, form.secondary_skills, form.target_roles, dismissedSuggestions]);

  // Form field update handler
  const updateField = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
    setValidationError('');
  };

  // Validation before saving
  const validateForm = () => {
    if (!form.target_roles || form.target_roles.length === 0) {
      return 'Please add at least one target role.';
    }
    if (form.expected_compensation && form.min_compensation) {
      const exp = Number(form.expected_compensation);
      const min = Number(form.min_compensation);
      if (Number.isFinite(exp) && Number.isFinite(min) && exp < min) {
        return 'Expected compensation cannot be less than minimum acceptable compensation.';
      }
    }
    return '';
  };

  // Save changes handler
  const handleSave = async () => {
    const err = validateForm();
    if (err) {
      setValidationError(err);
      return;
    }

    setSaving(true);
    setValidationError('');
    setSaveSuccess(false);

    try {
      await saveJobPreferences(form);
      setInitialForm(form);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setValidationError(e.message || 'Failed to save career preferences.');
    } finally {
      setSaving(false);
    }
  };

  // Reset handler
  const handleReset = () => {
    setForm(initialForm);
    setValidationError('');
    setSaveSuccess(false);
  };

  const sectionNavItems = [
    { id: 'career-targets', label: 'Career Targets', icon: Target },
    { id: 'location-workstyle', label: 'Location & Work Style', icon: MapPin },
    { id: 'experience-skills', label: 'Experience & Skills', icon: Award },
    { id: 'compensation', label: 'Compensation', icon: DollarSign },
    { id: 'application-preferences', label: 'Application Preferences', icon: SlidersHorizontal }
  ];

  return (
    <div className="min-h-full pb-24 space-y-6">

      {/* TOP HEADER BANNER: LIVE TARGETING SUMMARY */}
      <div className="w-full bg-tf-surface border border-tf-border rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-tf-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-tf-accent/10 border border-tf-accent/20 text-tf-accent flex items-center justify-center">
              <Target size={18} />
            </div>
            <div>
              <h1 className="text-base font-bold text-tf-text">Live Targeting Summary</h1>
              <p className="text-xs text-tf-text-secondary">Criteria shaping your Tailr4U recommendations and application materials.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-tf-surface-2 border border-tf-border text-xs font-semibold">
              <span className="text-tf-text-secondary">Completeness:</span>
              <span className="text-tf-accent font-bold">{completeness.score}%</span>
            </div>

            <button
              onClick={() => navigate('/dashboard')}
              className="p-1.5 rounded-xl bg-tf-surface-2 hover:bg-tf-border text-tf-text-secondary hover:text-tf-text transition cursor-pointer border border-tf-border"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 5 HORIZONTAL SUMMARY TILES */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl bg-tf-surface-2/60 border border-tf-border/50 space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase text-tf-text-tertiary">Primary Role</span>
            <div className="text-xs font-bold text-tf-text flex items-center gap-1">
              <span className="truncate">{form.primary_role || form.target_roles?.[0] || 'Not set'}</span>
              <Star size={12} className="text-amber-500 fill-amber-500 shrink-0" />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-tf-surface-2/60 border border-tf-border/50 space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase text-tf-text-tertiary">Preferred Work Style</span>
            <div className="text-xs font-semibold text-tf-text truncate">
              {Array.isArray(form.work_modes) && form.work_modes.length > 0 ? form.work_modes.join(', ') : (form.work_preference || 'Flexible')}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-tf-surface-2/60 border border-tf-border/50 space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase text-tf-text-tertiary">Top Locations</span>
            <div className="text-xs font-semibold text-tf-text truncate">
              {form.preferred_locations?.length > 0 ? form.preferred_locations.slice(0, 3).join(', ') : 'Any location'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-tf-surface-2/60 border border-tf-border/50 space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase text-tf-text-tertiary">Top Priority Skills</span>
            <div className="text-xs font-semibold text-tf-text truncate">
              {form.priority_skills?.length > 0 ? form.priority_skills.slice(0, 3).join(', ') : 'None set'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-tf-surface-2/60 border border-tf-border/50 space-y-0.5">
            <span className="text-[10px] font-extrabold uppercase text-tf-text-tertiary">Experience Level</span>
            <div className="text-xs font-semibold text-tf-text truncate">{form.experience_level || 'Not set'}</div>
          </div>
        </div>
      </div>

      {/* TWO-COLUMN LAYOUT */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-5 xl:gap-6">

        {/* LEFT SIDEBAR (Sticky Quick Save & Navigation & Completeness) */}
        <aside className="lg:col-span-4 xl:col-span-3 space-y-6">

          {/* QUICK SAVE & NAVIGATION STICKY MENU */}
          <div className="bg-tf-surface border border-tf-border rounded-2xl p-4 shadow-xs space-y-4 sticky top-6 z-20">
            
            {/* Quick Action Header with Save & Reset */}
            <div className="space-y-3 pb-3 border-b border-tf-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-tf-accent/10 border border-tf-accent/20 text-tf-accent flex items-center justify-center">
                    <SlidersHorizontal size={15} />
                  </div>
                  <span className="text-xs font-bold text-tf-text">Preferences</span>
                </div>
              </div>

              {/* Quick Access Save & Reset Buttons */}
              <div className="flex items-center gap-2">
                <Button 
                  variant="primary" 
                  size="sm" 
                  onClick={handleSave} 
                  isLoading={saving} 
                  disabled={!isDirty && !saveSuccess}
                  className="flex-1 justify-center shadow-xs"
                >
                  {saveSuccess ? <Check size={14} /> : <Save size={14} />}
                  <span>{saveSuccess ? 'Saved!' : 'Save Changes'}</span>
                </Button>

                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={handleReset} 
                  disabled={!isDirty || saving}
                  title="Reset changes"
                >
                  <RefreshCw size={13} />
                </Button>
              </div>

              {isDirty && (
                <div className="text-[11px] font-bold text-amber-500 flex items-center gap-1.5 pt-0.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  <span>Unsaved changes</span>
                </div>
              )}
            </div>

            {/* Navigation Section Links */}
            <nav className="space-y-1">
              <div className="px-1 py-1 text-[10px] font-extrabold uppercase tracking-wider text-tf-text-tertiary">
                Sections
              </div>
              {sectionNavItems.map(({ id, label, icon: Icon }) => {
                const active = activeSection === id;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      setActiveSection(id);
                      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-tf-accent/15 text-tf-accent font-bold shadow-xs'
                        : 'text-tf-text-secondary hover:text-tf-text hover:bg-tf-surface-2'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={15} className={active ? 'text-tf-accent' : 'text-tf-text-tertiary'} />
                      <span>{label}</span>
                    </div>
                    <ChevronRight size={13} className={active ? 'opacity-100 text-tf-accent' : 'opacity-30'} />
                  </button>
                );
              })}
            </nav>
          </div>

        </aside>

        {/* RIGHT MAIN EDITOR AREA */}
        <main className="lg:col-span-8 xl:col-span-9 space-y-6">

          {validationError && (
            <div className="flex items-center gap-2 rounded-2xl border border-tf-danger/30 bg-tf-danger/10 p-4 text-xs font-semibold text-tf-danger xl:col-span-2">
              <Info size={16} />
              <span>{validationError}</span>
            </div>
          )}

          {/* SECTION 1 — CAREER TARGETS */}
          <section id="career-targets" className="scroll-mt-24 bg-tf-surface border border-tf-border rounded-2xl p-6 shadow-xs space-y-6 xl:col-span-2">
            <div className="flex items-center gap-2.5 pb-4 border-b border-tf-border">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center border border-purple-500/20">
                <Target size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-tf-text">1. Career Targets</h2>
                <p className="text-xs text-tf-text-secondary">Define target roles, dream companies, and industries.</p>
              </div>
            </div>

            {/* Target Roles */}
            <PreferenceChips
              label="Target Roles (Click star to set Primary Target Role)"
              items={form.target_roles}
              primaryItem={form.primary_role}
              showPrimary={true}
              onAdd={(role) => {
                const next = [...(form.target_roles || []), role];
                updateField('target_roles', next);
                if (!form.primary_role) updateField('primary_role', role);
              }}
              onRemove={(role) => {
                const next = form.target_roles.filter(r => r !== role);
                updateField('target_roles', next);
                if (form.primary_role === role) updateField('primary_role', next[0] || '');
              }}
              onSetPrimary={(role) => updateField('primary_role', role)}
              suggestions={TAXONOMY_SUGGESTIONS.roles}
              placeholder="Add role (e.g. Senior Data Engineer)..."
            />

            {/* Target Companies */}
            <PreferenceChips
              label="Target Companies"
              items={form.target_companies}
              primaryItem={form.primary_company}
              showPrimary={true}
              onAdd={(co) => {
                const next = [...(form.target_companies || []), co];
                updateField('target_companies', next);
                if (!form.primary_company) updateField('primary_company', co);
              }}
              onRemove={(co) => {
                const next = form.target_companies.filter(c => c !== co);
                updateField('target_companies', next);
                if (form.primary_company === co) updateField('primary_company', next[0] || '');
              }}
              onSetPrimary={(co) => updateField('primary_company', co)}
              suggestions={TAXONOMY_SUGGESTIONS.companies}
              placeholder="Add company (e.g. Microsoft)..."
            />

            {/* Preferred Industries */}
            <PreferenceChips
              label="Preferred Industries"
              items={form.preferred_industries}
              onAdd={(ind) => updateField('preferred_industries', [...(form.preferred_industries || []), ind])}
              onRemove={(ind) => updateField('preferred_industries', form.preferred_industries.filter(i => i !== ind))}
              suggestions={TAXONOMY_SUGGESTIONS.industries}
              placeholder="Add industry (e.g. FinTech)..."
            />
          </section>

          {/* SECTION 2 — LOCATION & WORK STYLE */}
          <section id="location-workstyle" className="scroll-mt-24 bg-tf-surface border border-tf-border rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-tf-border">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/20">
                <MapPin size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-tf-text">2. Location & Work Style</h2>
                <p className="text-xs text-tf-text-secondary">Set preferred geographic regions, work mode, relocation, and visa options.</p>
              </div>
            </div>

            {/* Preferred Locations */}
            <PreferenceChips
              label="Preferred Locations (City, Region, or Country)"
              items={form.preferred_locations}
              onAdd={(loc) => updateField('preferred_locations', [...(form.preferred_locations || []), loc])}
              onRemove={(loc) => updateField('preferred_locations', form.preferred_locations.filter(l => l !== loc))}
              suggestions={TAXONOMY_SUGGESTIONS.locations}
              placeholder="Add location (e.g. Hyderabad, Remote)..."
            />

            {/* Work Mode */}
            <PillSelect
              label="Work Mode Preferences (Select all that apply)"
              options={WORK_MODE_OPTIONS}
              selected={form.work_modes || [form.work_preference]}
              isMulti={true}
              onChange={(modes) => updateField('work_modes', modes)}
            />

            {/* Relocation & Visa Sponsorship Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <PillSelect
                label="Relocation Preference"
                options={RELOCATION_OPTIONS}
                selected={form.relocation_preference}
                onChange={(val) => updateField('relocation_preference', val)}
              />

              <PillSelect
                label="Visa Sponsorship Requirements"
                options={SPONSORSHIP_OPTIONS}
                selected={form.sponsorship_preference}
                onChange={(val) => updateField('sponsorship_preference', val)}
              />
            </div>
          </section>

          {/* SECTION 3 — EXPERIENCE & SKILLS */}
          <section id="experience-skills" className="scroll-mt-24 bg-tf-surface border border-tf-border rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-tf-border">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
                <Award size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-tf-text">3. Experience & Skills</h2>
                <p className="text-xs text-tf-text-secondary">Highlight your current seniority level and key tech stack.</p>
              </div>
            </div>

            {/* Experience Level */}
            <PillSelect
              label="Experience Level / Seniority"
              options={EXPERIENCE_LEVEL_OPTIONS}
              selected={form.experience_level}
              onChange={(val) => updateField('experience_level', val)}
            />

            {/* Title & Years Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-tf-text">Current / Most Recent Title</label>
                <input
                  type="text"
                  value={form.current_title || ''}
                  onChange={(e) => updateField('current_title', e.target.value)}
                  placeholder="e.g. Senior Software Engineer"
                  className="w-full px-3.5 py-2 rounded-xl border border-tf-border bg-tf-surface-2 text-xs font-medium text-tf-text focus:outline-none focus:border-tf-accent"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-tf-text">Total Years of Experience</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={form.years_experience || ''}
                  onChange={(e) => updateField('years_experience', e.target.value)}
                  placeholder="e.g. 3"
                  className="w-full px-3.5 py-2 rounded-xl border border-tf-border bg-tf-surface-2 text-xs font-medium text-tf-text focus:outline-none focus:border-tf-accent"
                />
              </div>
            </div>

            {/* Priority Skills (Top Skills) */}
            <PreferenceChips
              label="Top Priority Skills"
              items={form.priority_skills}
              onAdd={(sk) => updateField('priority_skills', [...(form.priority_skills || []), sk])}
              onRemove={(sk) => updateField('priority_skills', form.priority_skills.filter(s => s !== sk))}
              suggestions={TAXONOMY_SUGGESTIONS.skills}
              placeholder="Add top skill (e.g. Python)..."
            />

            {/* Secondary Skills */}
            <PreferenceChips
              label="Additional Secondary Skills"
              items={form.secondary_skills || []}
              onAdd={(sk) => updateField('secondary_skills', [...(form.secondary_skills || []), sk])}
              onRemove={(sk) => updateField('secondary_skills', (form.secondary_skills || []).filter(s => s !== sk))}
              suggestions={TAXONOMY_SUGGESTIONS.skills}
              placeholder="Add secondary skill (e.g. SQL)..."
            />

            {/* AI-ASSISTED RESUME SUGGESTIONS BOX */}
            {resumeAiSuggestions.length > 0 && (
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-400">
                    <Zap size={16} />
                    <span>Suggested from your active resume</span>
                  </div>
                  <span className="text-[10px] text-tf-text-tertiary font-medium">Requires your confirmation</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {resumeAiSuggestions.map((item) => (
                    <div
                      key={item}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-tf-surface border border-tf-border text-xs font-semibold text-tf-text shadow-xs"
                    >
                      <span>{item}</span>
                      <button
                        type="button"
                        onClick={() => {
                          updateField('priority_skills', [...(form.priority_skills || []), item]);
                        }}
                        className="text-purple-600 dark:text-purple-400 hover:underline text-[11px] font-bold cursor-pointer"
                      >
                        + Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedSuggestions(prev => [...prev, item.toLowerCase()])}
                        className="text-tf-text-tertiary hover:text-tf-text ml-1"
                        title="Dismiss suggestion"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* SECTION 4 — COMPENSATION */}
          <section id="compensation" className="scroll-mt-24 bg-tf-surface border border-tf-border rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-tf-border">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
                <DollarSign size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-tf-text">4. Compensation</h2>
                <p className="text-xs text-tf-text-secondary">Used only to improve job recommendations and filtering. Kept strictly private.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-tf-text">Currency</label>
                <select
                  value={form.compensation_currency || 'USD'}
                  onChange={(e) => updateField('compensation_currency', e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-tf-border bg-tf-surface-2 text-xs font-semibold text-tf-text focus:outline-none focus:border-tf-accent"
                >
                  {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-tf-text">Pay Period</label>
                <select
                  value={form.salary_period || 'Annual'}
                  onChange={(e) => updateField('salary_period', e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-tf-border bg-tf-surface-2 text-xs font-semibold text-tf-text focus:outline-none focus:border-tf-accent"
                >
                  {SALARY_PERIOD_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-tf-text">Current Compensation</label>
                <input
                  type="number"
                  value={form.current_compensation || ''}
                  onChange={(e) => updateField('current_compensation', e.target.value)}
                  placeholder="e.g. 90000"
                  className="w-full px-3.5 py-2 rounded-xl border border-tf-border bg-tf-surface-2 text-xs font-medium text-tf-text focus:outline-none focus:border-tf-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-tf-text">Expected Target Compensation</label>
                <input
                  type="number"
                  value={form.expected_compensation || ''}
                  onChange={(e) => updateField('expected_compensation', e.target.value)}
                  placeholder="e.g. 120000"
                  className="w-full px-3.5 py-2 rounded-xl border border-tf-border bg-tf-surface-2 text-xs font-medium text-tf-text focus:outline-none focus:border-tf-accent"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-tf-text">Minimum Acceptable Salary</label>
                <input
                  type="number"
                  value={form.min_compensation || ''}
                  onChange={(e) => updateField('min_compensation', e.target.value)}
                  placeholder="e.g. 100000"
                  className="w-full px-3.5 py-2 rounded-xl border border-tf-border bg-tf-surface-2 text-xs font-medium text-tf-text focus:outline-none focus:border-tf-accent"
                />
              </div>
            </div>

            {/* Flexible / Negotiable Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-tf-surface-2/60 border border-tf-border/50">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-tf-text block">Open to Salary Negotiation</span>
                <span className="text-[11px] text-tf-text-secondary block">Indicates flexibility depending on equity, bonus, or benefits.</span>
              </div>
              <button
                type="button"
                onClick={() => updateField('is_salary_negotiable', !form.is_salary_negotiable)}
                className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                  form.is_salary_negotiable ? 'bg-tf-accent' : 'bg-tf-border'
                }`}
              >
                <span className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform shadow-xs ${
                  form.is_salary_negotiable ? 'right-0.5' : 'left-0.5'
                }`} />
              </button>
            </div>
          </section>

          {/* SECTION 5 — APPLICATION PREFERENCES */}
          <section id="application-preferences" className="scroll-mt-24 bg-tf-surface border border-tf-border rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-tf-border">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20">
                <SlidersHorizontal size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-tf-text">5. Application Preferences</h2>
                <p className="text-xs text-tf-text-secondary">Configure employment type, notice period, company size, and alert frequency.</p>
              </div>
            </div>

            {/* Employment Type */}
            <PillSelect
              label="Employment Type"
              options={EMPLOYMENT_TYPES}
              selected={form.employment_types || ['Full-time']}
              isMulti={true}
              onChange={(val) => updateField('employment_types', val)}
            />

            {/* Notice Period */}
            <PillSelect
              label="Notice Period Availability"
              options={NOTICE_PERIOD_OPTIONS}
              selected={form.notice_period || '30 days'}
              onChange={(val) => updateField('notice_period', val)}
            />

            {/* Company Size */}
            <PillSelect
              label="Company Size Preference"
              options={COMPANY_SIZE_OPTIONS}
              selected={form.company_size_preferences || ['Enterprise']}
              isMulti={true}
              onChange={(val) => updateField('company_size_preferences', val)}
            />

            {/* Role Seniority */}
            <PillSelect
              label="Role Seniority Level"
              options={SENIORITY_OPTIONS}
              selected={form.seniority_preferences || ['Senior']}
              isMulti={true}
              onChange={(val) => updateField('seniority_preferences', val)}
            />

            {/* Job Alert Frequency */}
            <PillSelect
              label="Job Recommendation Alert Frequency"
              options={ALERT_FREQUENCY_OPTIONS}
              selected={form.job_alert_frequency || 'Daily'}
              onChange={(val) => updateField('job_alert_frequency', val)}
            />
          </section>

        </main>
      </div>

      {/* STICKY UNSAVED CHANGES FLOATING ACTION BAR */}
      {isDirty && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-zinc-900 dark:bg-zinc-900 text-white border border-zinc-700/80 rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-4 backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs font-bold text-zinc-200">You have unsaved changes</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleReset} className="text-zinc-300 hover:text-white">
                Discard
              </Button>
              <Button variant="primary" size="sm" onClick={handleSave} isLoading={saving}>
                <Save size={14} /> Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
