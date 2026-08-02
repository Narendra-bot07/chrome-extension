import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { UserAvatar } from '../components/ApplicationLogo';
import { calculateProfileCompleteness } from '../services/profilePolicy';
import { validateProfile, validateProfileField } from '../services/profileValidation';
import { Button } from '../components/ui/Button';
import { cardVariants, staggerContainer, fadeUp } from '../utils/motion';
import {
  ChevronLeft,
  User,
  Shield,
  CreditCard,
  Check,
  Zap,
  Edit3,
  Camera,
  Globe,
  MapPin,
  Briefcase,
  ExternalLink,
  Lock,
  Mail,
  Phone,
  Calendar,
  Target,
  CheckCircle2,
  AtSign,
  UserCheck,
  Map,
  Building2,
  Clock,
  Languages,
  Award,
  Linkedin,
  Github,
  FolderGit2,
  Link as LinkIcon
} from 'lucide-react';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, session, darkMode, apiUrl, logout, subscription } = useApp();
  const [profile, setProfile] = useState(() => {
    try {
      const saved = localStorage.getItem('tailr4u_user_profile');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      full_name: user?.full_name || '',
      email: user?.email || '',
      resume_count: 0
    };
  });
  const [profileForm, setProfileForm] = useState(() => {
    try {
      const saved = localStorage.getItem('tailr4u_user_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          timezone: parsed.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || ''
        };
      }
    } catch (e) {}
    return {};
  });
  const [editingName, setEditingName] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touchedFields, setTouchedFields] = useState({});
  const [geoData, setGeoData] = useState(null);

  useEffect(() => {
    let active = true;
    import('country-state-city').then(module => {
      if (active) setGeoData(module);
    });
    return () => { active = false; };
  }, []);

  const countries = useMemo(() => geoData?.Country.getAllCountries() || [], [geoData]);
  const selectedCountry = useMemo(
    () => countries.find(item => item.name === profileForm.country) || null,
    [countries, profileForm.country]
  );
  const states = useMemo(
    () => selectedCountry && geoData ? geoData.State.getStatesOfCountry(selectedCountry.isoCode) : [],
    [selectedCountry, geoData]
  );
  const selectedState = useMemo(
    () => states.find(item => item.name === profileForm.state) || null,
    [states, profileForm.state]
  );
  const cities = useMemo(
    () => selectedCountry && selectedState
      ? geoData?.City.getCitiesOfState(selectedCountry.isoCode, selectedState.isoCode) || []
      : [],
    [selectedCountry, selectedState]
  );

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = session?.access_token || localStorage.getItem('access_token');
        if (!token) return;

        const profileRes = await fetch(`${apiUrl}/api/v1/profile/`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (profileRes.ok) {
          const data = await profileRes.json();
          setProfile(data);
          setProfileForm({
            ...data,
            timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || ''
          });
          try {
            localStorage.setItem('tailr4u_user_profile', JSON.stringify(data));
          } catch (e) {}
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      }
    };
    fetchProfile();
  }, [session, apiUrl]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    const validationErrors = validateProfile(profileForm);
    if (Object.keys(validationErrors).length) {
      setFieldErrors(validationErrors);
      setTouchedFields(Object.fromEntries(Object.keys(validationErrors).map(field => [field, true])));
      setMsg({ type: 'error', text: 'Please correct the highlighted fields.' });
      return;
    }
    setUpdating(true);
    setMsg(null);
    try {
      const editableFields = [
        'first_name', 'last_name', 'preferred_name', 'username', 'date_of_birth',
        'gender', 'phone_country_code', 'phone_number', 'country', 'state', 'city',
        'timezone', 'preferred_language', 'uploaded_profile_image_url',
        'profile_image_source', 'current_title', 'years_experience', 'linkedin_url',
        'github_url', 'portfolio_url', 'website_url'
      ];
      const payload = Object.fromEntries(
        editableFields.map(field => [field, profileForm[field] ?? null])
      );
      payload.full_name = [profileForm.first_name, profileForm.last_name].filter(Boolean).join(' ')
        || profileForm.full_name
        || '';
      const token = session?.access_token || localStorage.getItem('access_token');
      const res = await fetch(`${apiUrl}/api/v1/profile/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        const detail = error.detail;
        if (detail?.field) {
          setFieldErrors(current => ({ ...current, [detail.field]: detail.message }));
          setTouchedFields(current => ({ ...current, [detail.field]: true }));
          throw new Error(detail.message);
        }
        if (Array.isArray(detail)) {
          const backendErrors = Object.fromEntries(detail.map(item => [item.loc?.at(-1), item.msg?.replace(/^Value error, /, '')]));
          setFieldErrors(current => ({ ...current, ...backendErrors }));
          throw new Error('Please correct the highlighted fields.');
        }
        throw new Error(typeof detail === 'string' ? detail : 'Update failed.');
      }
      const data = await res.json();
      setProfile(data);
      setProfileForm(data);
      setEditingName(false);
      setMsg({ type: 'success', text: 'Profile updated successfully!' });
      setFieldErrors({});
      setTouchedFields({});
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setUpdating(false);
    }
  };

  const updateProfileField = (field, value) => {
    setProfileForm(prev => {
      const next = { ...prev, [field]: value };
      if (touchedFields[field]) {
        setFieldErrors(errors => ({ ...errors, [field]: validateProfileField(field, value, next) }));
      }
      return next;
    });
  };

  const selectCountry = (isoCode) => {
    const country = countries.find(item => item.isoCode === isoCode);
    const timezone = country?.timezones?.[0]?.zoneName || '';
    const callingCode = country?.phonecode
      ? `+${country.phonecode.replace(/^\+/, '').split(/\s+and\s+/i)[0].replace(/\D/g, '')}`
      : '';
    setProfileForm(prev => ({
      ...prev,
      country: country?.name || '',
      phone_country_code: callingCode,
      state: '',
      city: '',
      timezone
    }));
    setFieldErrors(errors => ({ ...errors, country: '', phone_country_code: '', state: '', city: '', timezone: '' }));
  };

  const selectState = (isoCode) => {
    const state = states.find(item => item.isoCode === isoCode);
    setProfileForm(prev => ({ ...prev, state: state?.name || '', city: '' }));
    setFieldErrors(errors => ({ ...errors, state: '', city: '' }));
  };

  const handleProfilePhoto = (file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMsg({ type: 'error', text: 'Please choose a JPEG, PNG, or WebP image.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMsg({ type: 'error', text: 'Profile photos must be 5 MB or smaller.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateProfileField('uploaded_profile_image_url', reader.result);
    reader.readAsDataURL(file);
  };

  const completion = calculateProfileCompleteness(profileForm);

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 space-y-8 select-none text-tf-text"
    >
      {/* 1. Dedicated Header */}
      <motion.div variants={fadeUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <button 
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-xl border border-tf-border bg-tf-surface hover:bg-tf-surface-2 text-tf-text-secondary hover:text-tf-text transition shadow-2xs cursor-pointer"
            title="Back to Dashboard"
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-tf-text flex items-center gap-2.5">
              <User className="w-6 h-6 text-tf-accent" />
              Personal Profile
            </h1>
            <p className="text-xs sm:text-sm text-tf-text-secondary mt-0.5">
              Manage your personal account details, contact info, and professional identity.
            </p>
          </div>
        </div>

        {/* Quick Navigation Shortcuts */}
        <div className="flex items-center gap-2">
          <Link
            to="/settings/security"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-tf-border bg-tf-surface hover:bg-tf-surface-2 text-xs font-semibold text-tf-text-secondary hover:text-tf-text transition shadow-2xs"
          >
            <Shield size={14} className="text-tf-accent" />
            <span>Security & Sessions</span>
          </Link>
          <Link
            to="/subscription"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-tf-border bg-tf-surface hover:bg-tf-surface-2 text-xs font-semibold text-tf-text-secondary hover:text-tf-text transition shadow-2xs"
          >
            <CreditCard size={14} className="text-tf-accent" />
            <span>Subscription</span>
          </Link>
        </div>
      </motion.div>

      {/* Global Status Message Toast */}
      <AnimatePresence mode="wait">
        {msg && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-3 border shadow-2xs ${
              msg.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
            }`}
          >
            {msg.type === 'success' ? <CheckCircle2 size={16} /> : <Zap size={16} />}
            <span>{msg.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Profile Completeness Progress Card (Only shown if user profile details are incomplete) */}
      {completion < 100 && (
        <motion.div variants={cardVariants} className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-6 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Target className="w-5 h-5 text-tf-accent" />
              <div>
                <h2 className="text-base font-bold text-tf-text">Profile Completion</h2>
                <p className="text-xs text-tf-text-secondary">Complete your profile to tailor resumes and cover letters faster.</p>
              </div>
            </div>
            <span className="text-base font-extrabold text-tf-accent">{completion}%</span>
          </div>
          <div className="h-2 w-full bg-tf-surface-2 border border-tf-border/60 rounded-full overflow-hidden">
            <div className="h-full bg-tf-accent rounded-full transition-all duration-500" style={{ width: `${completion}%` }} />
          </div>
        </motion.div>
      )}

      {/* 3. User Avatar & Main Hero Card */}
      <motion.div variants={cardVariants} className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="relative group">
            <UserAvatar user={user} profile={{ ...profile, ...profileForm }} size={80} />
            {editingName && (
              <label className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center text-white cursor-pointer opacity-0 group-hover:opacity-100 transition">
                <Camera size={20} />
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => handleProfilePhoto(e.target.files?.[0])} />
              </label>
            )}
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-tf-text">
              {profileForm.preferred_name || profileForm.full_name || user?.full_name || 'User'}
            </h3>
            <p className="text-xs text-tf-text-secondary">{profile.email || user?.email || 'No email available'}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="inline-flex text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {profile.email_verified ? 'Verified Email' : 'Unverified Email'}
              </span>
              <span className="inline-flex text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-tf-accent/10 text-tf-accent border border-tf-accent/20">
                {profile.auth_provider || 'Password'}
              </span>
            </div>
          </div>
        </div>

        <Button
          variant={editingName ? "secondary" : "primary"}
          size="md"
          onClick={() => setEditingName(!editingName)}
          className="shrink-0"
        >
          <Edit3 size={15} />
          <span>{editingName ? 'Cancel Editing' : 'Edit Profile'}</span>
        </Button>
      </motion.div>

      {/* 4. Main Profile Form & Details Display */}
      <motion.div variants={cardVariants} className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-tf-border">
          <div>
            <h3 className="text-base font-bold text-tf-text">Personal Details & Career Info</h3>
            <p className="text-xs text-tf-text-secondary mt-0.5">Keep your details accurate for automated resume generation</p>
          </div>
          {editingName && (
            <Button variant="primary" size="sm" isLoading={updating} onClick={handleUpdateProfile}>
              <Check size={14} />
              <span>Save Changes</span>
            </Button>
          )}
        </div>

        {!editingName ? (
          <div className="space-y-6">
            {[
              {
                title: 'Identity',
                icon: User,
                fields: [
                  ['Full name', [profileForm.first_name, profileForm.last_name].filter(Boolean).join(' ') || profileForm.full_name, User],
                  ['Preferred name', profileForm.preferred_name, Target],
                  ['Username', profileForm.username ? `@${profileForm.username}` : '', AtSign],
                  ['Date of birth', profileForm.date_of_birth
                    ? new Date(`${profileForm.date_of_birth}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
                    : '', Calendar],
                  ['Gender', profileForm.gender?.replaceAll('_', ' '), UserCheck]
                ]
              },
              {
                title: 'Contact & Location',
                icon: MapPin,
                fields: [
                  ['Mobile', profileForm.phone_number
                    ? `${profileForm.phone_country_code || ''} ${profileForm.phone_number}`.trim()
                    : '', Phone],
                  ['Country', profileForm.country, Globe],
                  ['State / Region', profileForm.state, Map],
                  ['City', profileForm.city, Building2],
                  ['Timezone', profileForm.timezone, Clock]
                ]
              },
              {
                title: 'Career & Online Profiles',
                icon: Briefcase,
                fields: [
                  ['Preferred language', profileForm.preferred_language, Languages],
                  ['Current title', profileForm.current_title, Briefcase],
                  ['Experience', profileForm.years_experience !== null && profileForm.years_experience !== undefined && profileForm.years_experience !== ''
                    ? `${profileForm.years_experience} years`
                    : '', Award],
                  ['LinkedIn', profileForm.linkedin_url, Linkedin],
                  ['GitHub', profileForm.github_url, Github],
                  ['Portfolio', profileForm.portfolio_url, FolderGit2],
                  ['Website', profileForm.website_url, LinkIcon]
                ]
              }
            ].map(section => {
              const SectionIcon = section.icon;
              return (
                <section key={section.title} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <SectionIcon size={14} className="text-tf-accent shrink-0" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-tf-text-tertiary">{section.title}</h4>
                  </div>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 rounded-xl border border-tf-border bg-tf-surface divide-y sm:divide-y-0 sm:divide-x divide-tf-border overflow-hidden">
                    {section.fields.map(([label, value, FieldIcon]) => {
                      const isLink = typeof value === 'string' && /^https?:\/\//i.test(value);
                      return (
                        <div key={label} className="p-4 flex flex-col justify-center min-h-[64px]">
                          <dt className="text-xs font-medium text-tf-text-tertiary flex items-center gap-1.5">
                            {FieldIcon && <FieldIcon size={13} className="text-tf-accent/80 shrink-0" />}
                            <span>{label}</span>
                          </dt>
                          <dd className="mt-1 text-xs font-semibold text-tf-text break-words capitalize">
                            {isLink ? (
                              <a href={value} target="_blank" rel="noreferrer" className="normal-case text-tf-accent hover:underline inline-flex items-center gap-1">
                                <span>{value.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</span>
                                <ExternalLink size={12} />
                              </a>
                            ) : value || <span className="text-tf-text-tertiary font-normal">Not provided</span>}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </section>
              );
            })}
          </div>
        ) : (
          <form onSubmit={handleUpdateProfile} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ['first_name', 'First Name *', 'text'],
                ['last_name', 'Last Name *', 'text'],
                ['preferred_name', 'Preferred Name', 'text'],
                ['username', 'Username *', 'text'],
                ['date_of_birth', 'Date of Birth', 'date'],
                ['gender', 'Gender', 'text'],
                ['phone_country_code', 'Country Code', 'text'],
                ['phone_number', 'Mobile Number *', 'tel'],
                ['country', 'Country *', 'select-country'],
                ['state', 'State', 'select-state'],
                ['city', 'City', 'text'],
                ['timezone', 'Timezone *', 'text'],
                ['preferred_language', 'Preferred Language', 'text'],
                ['current_title', 'Current Title', 'text'],
                ['years_experience', 'Years of Experience', 'number'],
                ['linkedin_url', 'LinkedIn URL', 'url'],
                ['github_url', 'GitHub URL', 'url'],
                ['portfolio_url', 'Portfolio URL', 'url'],
                ['website_url', 'Personal Website', 'url']
              ].map(([field, label, type]) => (
                <div key={field} className="space-y-1.5">
                  <label className="block text-xs font-semibold text-tf-text">{label}</label>
                  {type === 'select-country' ? (
                    <select
                      value={selectedCountry?.isoCode || ''}
                      onChange={e => selectCountry(e.target.value)}
                      required
                      className="h-10 w-full rounded-xl border border-tf-border bg-tf-surface px-3 text-xs text-tf-text outline-none focus:ring-3 focus:ring-tf-accent/15 focus:border-tf-accent transition"
                    >
                      <option value="">Select country</option>
                      {countries.map(item => <option key={item.isoCode} value={item.isoCode}>{item.name}</option>)}
                    </select>
                  ) : type === 'select-state' ? (
                    <select
                      value={selectedState?.isoCode || ''}
                      onChange={e => selectState(e.target.value)}
                      className="h-10 w-full rounded-xl border border-tf-border bg-tf-surface px-3 text-xs text-tf-text outline-none focus:ring-3 focus:ring-tf-accent/15 focus:border-tf-accent transition"
                    >
                      <option value="">Select state</option>
                      {states.map(item => <option key={item.isoCode} value={item.isoCode}>{item.name}</option>)}
                    </select>
                  ) : (
                    <input
                      type={type}
                      value={profileForm[field] || ''}
                      onChange={e => updateProfileField(field, e.target.value)}
                      className="h-10 w-full rounded-xl border border-tf-border bg-tf-surface px-3 text-xs text-tf-text outline-none focus:ring-3 focus:ring-tf-accent/15 focus:border-tf-accent transition"
                    />
                  )}
                  {fieldErrors[field] && (
                    <p className="text-[11px] text-tf-danger font-medium">{fieldErrors[field]}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-tf-border">
              <Button variant="primary" size="md" isLoading={updating} type="submit">
                <Check size={14} />
                <span>Save Profile Changes</span>
              </Button>
              <Button variant="ghost" size="md" type="button" onClick={() => setEditingName(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}
