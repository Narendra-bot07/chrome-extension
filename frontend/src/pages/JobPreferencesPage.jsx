import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Briefcase, Building2, Check, Edit3, MapPin, Settings2, Sparkles, Target, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

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
    <div className="space-y-4">
      <label className="text-xs font-black uppercase tracking-widest text-zinc-500">{label}</label>
      <div className="min-h-28 rounded-3xl border border-zinc-200 bg-white p-4 focus-within:border-[#00bda5] transition">
        <div className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onChange(value.filter((item) => item !== tag))}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-3 py-1.5 text-[11px] font-bold text-white"
            >
              {tag}
              <X size={12} />
            </button>
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
            className="min-w-44 flex-1 border-none bg-transparent py-1.5 text-sm font-semibold text-zinc-900 outline-none placeholder:text-zinc-400"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {filtered.slice(0, 8).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => addTag(item)}
            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-bold text-zinc-700 hover:border-[#00bda5] hover:text-[#008f7d] transition"
          >
            {item}
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
          className={`rounded-2xl border px-4 py-4 text-left text-sm font-black transition ${
            value === option
              ? 'border-[#00bda5] bg-[#00bda5]/10 text-zinc-950'
              : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
          }`}
        >
          <span className="flex items-center justify-between">
            {option}
            {value === option && <Check size={16} className="text-[#00bda5]" />}
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
        navigate('/', { replace: true });
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
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-5xl rounded-[2rem] border border-zinc-200 bg-white/95 shadow-2xl shadow-zinc-200/50 overflow-hidden">
          <div className="grid md:grid-cols-[300px,1fr]">
            <aside className="border-r border-zinc-100 bg-zinc-50 p-8">
              <div className="w-12 h-12 rounded-2xl bg-zinc-950 text-white flex items-center justify-center mb-6">
                <Target size={22} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#00bda5]">Job Preferences</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-zinc-950">Your career targets</h1>
              <p className="mt-3 text-sm font-medium leading-7 text-zinc-500">
                These preferences personalize reminders, match scores, recommendations, and future AI workflows.
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(true);
                  setStep(1);
                }}
                className="mt-8 inline-flex items-center gap-2 rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-black text-white"
              >
                <Edit3 size={16} /> Edit Preferences
              </button>
            </aside>

            <main className="p-8 md:p-10">
              <div className="grid gap-4">
                {rows.map(({ label, values, stepIndex }) => {
                  const visibleValues = (values || []).filter(Boolean);
                  return (
                  <div key={label} className="rounded-3xl border border-zinc-200 bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-400">{label}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsEditing(true);
                          setStep(stepIndex);
                        }}
                        className="text-[11px] font-black uppercase tracking-widest text-[#00bda5]"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {visibleValues.length ? visibleValues.map((item) => (
                        <span key={item} className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-700">
                          {item}
                        </span>
                      )) : (
                        <span className="text-xs font-bold text-zinc-400">No preference</span>
                      )}
                    </div>
                  </div>
                );
                })}
              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-4xl rounded-[2rem] border border-zinc-200 bg-white/90 shadow-2xl shadow-zinc-200/50 overflow-hidden">
        <div className="h-1.5 bg-zinc-100">
          <div className="h-full bg-[#00bda5] transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        <div className="grid md:grid-cols-[280px,1fr]">
          <aside className="border-r border-zinc-100 bg-zinc-50 p-7">
            <div className="w-12 h-12 rounded-2xl bg-zinc-950 text-white flex items-center justify-center mb-6">
              <Icon size={22} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#00bda5]">Step {step + 1} of {steps.length}</p>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-zinc-950">{current.title}</h1>
            <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-500">{current.subtitle}</p>
          </aside>

          <main className="p-7 md:p-10">
            {step === 0 && (
              <div className="space-y-8">
                {!isSettings && (
                  <div className="rounded-3xl border border-[#00bda5]/30 bg-[#00bda5]/10 px-5 py-4">
                    <p className="text-sm font-black text-zinc-950">Complete your ApplyFlow setup to start tailoring resumes.</p>
                  </div>
                )}
                <p className="text-base font-semibold leading-8 text-zinc-600">
                  ApplyFlow will use these preferences to personalize job reminders, match scores, and future AI recommendations.
                </p>
                <button onClick={next} className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-black text-white inline-flex items-center gap-2">
                  Get Started <ArrowRight size={16} />
                </button>
              </div>
            )}

            {step === 1 && <TagInput label="Target roles" value={form.target_roles} onChange={(v) => update('target_roles', v)} options={suggestions.target_roles} />}
            {step === 2 && <TagInput label="Target companies" value={form.target_companies} onChange={(v) => update('target_companies', v)} options={suggestions.target_companies} />}
            {step === 3 && <TagInput label="Preferred locations" value={form.preferred_locations} onChange={(v) => update('preferred_locations', v)} options={suggestions.preferred_locations} />}
            {step === 4 && <OptionGrid value={form.work_preference} onChange={(v) => update('work_preference', v)} options={workOptions} />}
            {step === 5 && <OptionGrid value={form.experience_level} onChange={(v) => update('experience_level', v)} options={experienceOptions} />}
            {step === 6 && <TagInput label="Priority skills" value={form.priority_skills} onChange={(v) => update('priority_skills', v)} options={suggestions.priority_skills} />}
            {step === 7 && (
              <div className="grid gap-4">
                {[
                  ['Target Roles', form.target_roles],
                  ['Target Companies', form.target_companies],
                  ['Preferred Locations', form.preferred_locations],
                  ['Work Preference', [form.work_preference]],
                  ['Experience Level', [form.experience_level]],
                  ['Priority Skills', form.priority_skills]
                ].map(([label, values], idx) => (
                  <button key={label} onClick={() => setStep(idx + 1)} className="rounded-2xl border border-zinc-200 p-4 text-left hover:border-[#00bda5] transition">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-zinc-400">{label}</span>
                    <span className="mt-2 flex flex-wrap gap-2">
                      {values.length ? values.map((item) => <span key={item} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700">{item}</span>) : <span className="text-xs font-bold text-zinc-400">None selected</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {error && <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>}

            {step > 0 && (
              <div className="mt-8 flex items-center justify-between gap-3">
                <button type="button" onClick={() => setStep((prev) => Math.max(0, prev - 1))} className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-black text-zinc-700 inline-flex items-center gap-2">
                  <ArrowLeft size={16} /> Previous
                </button>
                {step < steps.length - 1 ? (
                  <button type="button" onClick={next} className="rounded-2xl bg-zinc-950 px-5 py-3 text-sm font-black text-white inline-flex items-center gap-2">
                    Next <ArrowRight size={16} />
                  </button>
                ) : (
                  <button type="button" disabled={saving} onClick={complete} className="rounded-2xl bg-[#00bda5] px-5 py-3 text-sm font-black text-white disabled:opacity-70">
                    {saving ? 'Saving...' : hasCompletedPreferences && isSettings ? 'Save Preferences' : 'Complete Setup'}
                  </button>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
