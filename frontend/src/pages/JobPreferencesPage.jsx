import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, ArrowRight, Briefcase, Building2, Check, Edit3, 
  MapPin, Settings2, Target, X, SlidersHorizontal, Sparkles 
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';


const defaults = {
  target_roles: [],
  target_companies: [],
  preferred_locations: [],
  work_preference: 'No Preference',
  experience_level: 'No Preference',
  priority_skills: []
};

const suggestions = {
  target_roles: ['Data Engineer', 'Backend Engineer', 'Software Engineer', 'Machine Learning Engineer', 'Full Stack Engineer', 'Platform Engineer'],
  target_companies: ['Amazon', 'Microsoft', 'Google', 'Atlassian', 'Netflix', 'Meta'],
  preferred_locations: ['Hyderabad', 'Bengaluru', 'Pune', 'Remote', 'Chennai', 'Mumbai'],
  priority_skills: ['Python', 'FastAPI', 'AWS', 'React', 'Docker', 'PostgreSQL', 'Java', 'Kubernetes']
};

const workOptions = ['Remote', 'Hybrid', 'On-site', 'No Preference'];
const experienceOptions = ['Internship', 'Entry Level', '0-2 Years', '2-5 Years', 'Senior', 'No Preference'];

function TagInput({ label, value, onChange, options }) {
  const [draft, setDraft] = useState('');
  const filtered = options.filter((item) =>
    item.toLowerCase().includes(draft.toLowerCase()) && !value.some((tag) => tag.toLowerCase() === item.toLowerCase())
  );

  const addTag = (raw) => {
    const tag = raw.trim();
    if (!tag) return;
    if (value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...value, tag]);
    setDraft('');
  };

  return (
    <div className="space-y-3">
      <label className="text-xs font-medium text-tf-text">{label}</label>
      <div className="min-h-[96px] rounded-md border border-tf-border bg-tf-surface p-3 focus-within:border-tf-accent focus-within:ring-3 focus-within:ring-tf-accent/15 transition-all">
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-sm bg-tf-surface-2 border border-tf-border px-2 py-0.5 text-xs font-medium text-tf-text"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item !== tag))}
                className="text-tf-text-tertiary hover:text-tf-text"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(draft);
              }
            }}
            placeholder="Type and press Enter"
            className="min-w-[160px] flex-1 border-none bg-transparent py-1 text-sm font-normal text-tf-text outline-none placeholder:text-tf-text-tertiary"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {filtered.slice(0, 8).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => addTag(item)}
            className="rounded-md border border-tf-border bg-tf-surface-2 px-2.5 py-1 text-xs font-medium text-tf-text-secondary hover:border-tf-accent hover:text-tf-accent transition-colors cursor-pointer"
          >
            + {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function OptionGrid({ value, onChange, options }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-md border px-4 py-3 text-left text-sm font-medium transition-colors cursor-pointer ${
            value === option
              ? 'border-tf-accent bg-tf-accent/10 text-tf-accent'
              : 'border-tf-border bg-tf-surface text-tf-text-secondary hover:border-tf-border-strong'
          }`}
        >
          <span className="flex items-center justify-between">
            {option}
            {value === option && <Check size={16} className="text-tf-accent" />}
          </span>
        </button>
      ))}
    </div>
  );
}


export default function JobPreferencesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { jobPreferences, saveJobPreferences, hasCompletedPreferences } = useApp();
  const isSettings = location.pathname.includes('/settings/');
  const hasSavedPreferences = Boolean(jobPreferences?.has_completed_preferences || hasCompletedPreferences);
  const [isEditing, setIsEditing] = useState(!isSettings || !hasSavedPreferences);
  const [step, setStep] = useState(isSettings ? 7 : 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => ({ ...defaults, ...(jobPreferences || {}) }));

  useEffect(() => {
    if (!jobPreferences) return;

    setForm({ ...defaults, ...jobPreferences });

    if (isSettings && jobPreferences.has_completed_preferences) {
      setIsEditing(false);
      setStep(7);
    }
  }, [jobPreferences, isSettings]);

  const steps = useMemo(() => [
    { title: 'Welcome to ApplyFlow', subtitle: "Let's personalize your job search in under a minute.", icon: Sparkles },
    { title: 'Target Roles', subtitle: 'What roles are you actively looking for?', icon: Briefcase },
    { title: 'Target Companies', subtitle: 'Which companies are you targeting?', icon: Building2 },
    { title: 'Preferred Locations', subtitle: 'Where would you like to work?', icon: MapPin },
    { title: 'Work Preference', subtitle: 'Choose your preferred working style.', icon: Settings2 },
    { title: 'Experience Level', subtitle: 'What level are you targeting?', icon: Target },
    { title: 'Priority Skills', subtitle: 'Which skills are most important to your next role?', icon: Sparkles },
    { title: 'Review Preferences', subtitle: 'Confirm your job search profile.', icon: Check }
  ], []);

  const current = steps[step];
  const Icon = current.icon;
  const progress = Math.round(((step + 1) / steps.length) * 100);

  const validateStep = () => {
    if (step === 1 && form.target_roles.length === 0) return 'Add at least one target role.';
    if (step === 2 && form.target_companies.length === 0) return 'Add at least one target company.';
    if (step === 3 && form.preferred_locations.length === 0) return 'Add at least one preferred location.';
    return '';
  };

  const next = () => {
    const validation = validateStep();
    if (validation) {
      setError(validation);
      return;
    }
    setError('');
    setStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const complete = async () => {
    const requiredError =
      form.target_roles.length === 0 ? 'Add at least one target role.' :
      form.target_companies.length === 0 ? 'Add at least one target company.' :
      form.preferred_locations.length === 0 ? 'Add at least one preferred location.' : '';
    if (requiredError) {
      setError(requiredError);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveJobPreferences(form);
      if (isSettings) {
        setIsEditing(false);
        setStep(7);
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err.message || 'Failed to save job preferences.');
    } finally {
      setSaving(false);
    }
  };

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  if (isSettings && hasSavedPreferences && !isEditing) {
    const rows = [
      { label: 'Target Roles', values: form.target_roles, stepIndex: 1 },
      { label: 'Target Companies', values: form.target_companies, stepIndex: 2 },
      { label: 'Preferred Locations', values: form.preferred_locations, stepIndex: 3 },
      { label: 'Work Preference', values: [form.work_preference], stepIndex: 4 },
      { label: 'Experience Level', values: [form.experience_level], stepIndex: 5 },
      { label: 'Priority Skills', values: form.priority_skills, stepIndex: 6 }
    ];

    return (
      <div className="min-h-full px-4 py-8">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <section className="rounded-lg border border-tf-border bg-tf-surface p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-tf-accent/10 border border-tf-accent/20 text-tf-accent">
                  <SlidersHorizontal size={20} />
                </div>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight text-tf-text">Career targets</h1>
                  <p className="mt-1 text-xs text-tf-text-secondary font-normal max-w-2xl leading-relaxed">
                    TailorFlow uses this profile to tune match scores, dashboard insights, resume generation, and job recommendations.
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  setIsEditing(true);
                  setStep(1);
                }}
              >
                <Edit3 size={14} /> Edit profile
              </Button>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rows.map(({ label, values, stepIndex }) => {
              const visibleValues = (values || []).filter(Boolean);
              return (
                <article key={label} className="rounded-lg border border-tf-border bg-tf-surface p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-xs font-semibold text-tf-text">{label}</h2>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(true);
                        setStep(stepIndex);
                      }}
                      className="text-xs font-medium text-tf-accent hover:underline cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="flex min-h-[56px] flex-wrap content-start gap-1.5">
                    {visibleValues.length ? visibleValues.map((item) => (
                      <span key={item} className="rounded-sm bg-tf-surface-2 border border-tf-border px-2 py-0.5 text-xs font-medium text-tf-text">
                        {item}
                      </span>
                    )) : (
                      <span className="text-xs text-tf-text-tertiary">No preference added</span>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-3xl rounded-xl border border-tf-border bg-tf-surface shadow-modal overflow-hidden">
        <div className="h-1 bg-tf-surface-2">
          <div className="h-full bg-tf-accent transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="grid md:grid-cols-[240px,1fr]">
          <aside className="border-r border-tf-border bg-tf-surface-2 p-6">
            <div className="w-10 h-10 rounded-md bg-tf-accent/10 border border-tf-accent/20 text-tf-accent flex items-center justify-center mb-4">
              <Icon size={20} />
            </div>
            <p className="text-[11px] font-semibold text-tf-accent uppercase tracking-wider">Step {step + 1} of {steps.length}</p>
            <h1 className="mt-2 text-lg font-semibold tracking-tight text-tf-text">{current.title}</h1>
            <p className="mt-1.5 text-xs text-tf-text-secondary font-normal leading-relaxed">{current.subtitle}</p>
          </aside>

          <main className="p-6 md:p-8">
            {step === 0 && (
              <div className="space-y-6">
                {!isSettings && (
                  <div className="rounded-md border border-tf-accent/20 bg-tf-accent/10 p-4">
                    <p className="text-xs font-medium text-tf-text">Complete your TailorFlow setup to start tailoring resumes.</p>
                  </div>
                )}
                <p className="text-xs leading-relaxed text-tf-text-secondary">
                  TailorFlow will use these preferences to personalize job reminders, match scores, and future AI recommendations.
                </p>
                <Button variant="primary" size="md" onClick={next}>
                  Get Started <ArrowRight size={16} />
                </Button>
              </div>
            )}

            {step === 1 && <TagInput label="Target roles" value={form.target_roles} onChange={(v) => update('target_roles', v)} options={suggestions.target_roles} />}
            {step === 2 && <TagInput label="Target companies" value={form.target_companies} onChange={(v) => update('target_companies', v)} options={suggestions.target_companies} />}
            {step === 3 && <TagInput label="Preferred locations" value={form.preferred_locations} onChange={(v) => update('preferred_locations', v)} options={suggestions.preferred_locations} />}
            {step === 4 && <OptionGrid value={form.work_preference} onChange={(v) => update('work_preference', v)} options={workOptions} />}
            {step === 5 && <OptionGrid value={form.experience_level} onChange={(v) => update('experience_level', v)} options={experienceOptions} />}
            {step === 6 && <TagInput label="Priority skills" value={form.priority_skills} onChange={(v) => update('priority_skills', v)} options={suggestions.priority_skills} />}
            {step === 7 && (
              <div className="grid gap-3">
                {[
                  ['Target Roles', form.target_roles],
                  ['Target Companies', form.target_companies],
                  ['Preferred Locations', form.preferred_locations],
                  ['Work Preference', [form.work_preference]],
                  ['Experience Level', [form.experience_level]],
                  ['Priority Skills', form.priority_skills]
                ].map(([label, values], idx) => (
                  <button key={label} onClick={() => setStep(idx + 1)} className="rounded-md border border-tf-border p-3 text-left hover:border-tf-accent transition-colors bg-tf-surface">
                    <span className="block text-[11px] font-medium text-tf-text-tertiary uppercase tracking-wider">{label}</span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {values.length ? values.map((item) => <span key={item} className="rounded-sm bg-tf-surface-2 border border-tf-border px-2 py-0.5 text-xs font-medium text-tf-text">{item}</span>) : <span className="text-xs text-tf-text-tertiary">None selected</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {error && <div className="mt-4 rounded-md border border-tf-danger/20 bg-tf-danger/10 px-3.5 py-2.5 text-xs font-medium text-tf-danger">{error}</div>}

            {step > 0 && (
              <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t border-tf-border">
                <Button variant="secondary" size="md" onClick={() => setStep((prev) => Math.max(0, prev - 1))}>
                  <ArrowLeft size={16} /> Previous
                </Button>
                {step < steps.length - 1 ? (
                  <Button variant="primary" size="md" onClick={next}>
                    Next <ArrowRight size={16} />
                  </Button>
                ) : (
                  <Button variant="primary" size="md" isLoading={saving} onClick={complete}>
                    {hasCompletedPreferences && isSettings ? 'Save Preferences' : 'Complete Setup'}
                  </Button>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

