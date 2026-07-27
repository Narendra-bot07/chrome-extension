import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { UserAvatar } from '../components/ApplicationLogo';
import { calculateProfileCompleteness } from '../services/profilePolicy';
import {
  Activity,
  AlertTriangle,
  Briefcase,
  Check,
  ChevronLeft,
  Clock,
  CreditCard,
  FileText,
  LogOut,
  MapPin,
  Monitor,
  Shield,
  Smartphone,
  Tablet,
  User,
  Zap
} from 'lucide-react';

const TABS = {
  PROFILE: {
    title: 'Profile',
    description: 'Manage your personal account details.'
  },
  SECURITY: {
    title: 'Security',
    description: 'Manage sign-in sessions and account protection.'
  },
  BILLING: {
    title: 'Billing & Usage',
    description: 'Review your plan, limits, and monthly usage.'
  }
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, session, darkMode, apiUrl, logout, subscription, usage } = useApp();
  const [activeSubTab, setActiveSubTab] = useState('PROFILE');
  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    resume_count: 0
  });
  const [metrics, setMetrics] = useState({
    resumes_tailored: 0,
    applications_tracked: 0
  });
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const [editingName, setEditingName] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState(null);

  const cardClass = `rounded-[18px] border p-6 ${darkMode ? 'bg-[#0f0f11] border-zinc-800' : 'bg-white border-[#E5E7EB]'}`;
  const muted = darkMode ? 'text-[#9CA3AF]' : 'text-[#6B7280]';
  const title = darkMode ? 'text-white' : 'text-[#111827]';

  const jdUsage = subscription?.usage?.jd_extraction || usage?.jd_extraction;
  const jdLimit = jdUsage?.limit;
  const jdUsed = jdUsage?.used || 0;
  const jdRemaining = jdLimit ? jdUsage?.remaining ?? Math.max(0, jdLimit - jdUsed) : '∞';
  const resumeLimit = subscription?.features?.resume_upload?.limit;
  const resumeUsed = profile.resume_count || 0;
  const planName = subscription?.plan?.name || 'Free';
  const planStatus = subscription?.status || 'active';

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('applyflow:title', {
      detail: { title: TABS[activeSubTab].title }
    }));
  }, [activeSubTab]);

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
        }

        const metricsRes = await fetch(`${apiUrl}/api/v1/analytics/dashboard`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (metricsRes.ok) {
          setMetrics(await metricsRes.json());
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      }
    };
    fetchProfile();
  }, [session, apiUrl]);

  useEffect(() => {
    if (activeSubTab !== 'SECURITY') return;
    const fetchSessions = async () => {
      setLoadingSessions(true);
      try {
        const token = session?.access_token || localStorage.getItem('access_token');
        if (!token) return;
        const res = await fetch(`${apiUrl}/api/v1/sessions/`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
        }
      } catch (err) {
        console.error('Failed to load sessions:', err);
      } finally {
        setLoadingSessions(false);
      }
    };
    fetchSessions();
  }, [activeSubTab, session, apiUrl]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
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
      if (!res.ok) throw new Error('Update failed.');
      const data = await res.json();
      setProfile(data);
      setProfileForm(data);
      setEditingName(false);
      setMsg({ type: 'success', text: 'Profile updated.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setUpdating(false);
    }
  };

  const updateProfileField = (field, value) => {
    setProfileForm(prev => ({ ...prev, [field]: value }));
  };

  const handleProfilePhoto = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMsg({ type: 'error', text: 'Please choose an image file.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateProfileField('uploaded_profile_image_url', reader.result);
    reader.readAsDataURL(file);
  };

  const getDeviceIcon = (deviceType) => {
    if (deviceType === 'Mobile') return <Smartphone className="w-5 h-5 text-[#4F46E5]" />;
    if (deviceType === 'Tablet') return <Tablet className="w-5 h-5 text-[#4F46E5]" />;
    return <Monitor className="w-5 h-5 text-[#4F46E5]" />;
  };

  const formatSessionDate = (value) => {
    if (!value) return 'Unknown';
    return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const revokeSession = async (sessionId, isCurrent) => {
    if (isCurrent) {
      logout?.();
      return;
    }
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      const res = await fetch(`${apiUrl}/api/v1/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.session_id !== sessionId));
        setMsg({ type: 'success', text: 'Session revoked.' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Failed to revoke session.' });
    }
  };

  const revokeAllOthers = async () => {
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      const res = await fetch(`${apiUrl}/api/v1/sessions/all/others`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.is_current));
        setMsg({ type: 'success', text: 'Other sessions revoked.' });
      }
    } catch {
      setMsg({ type: 'error', text: 'Failed to revoke sessions.' });
    }
  };

  return (
    <div className={`flex-1 flex flex-col min-h-screen ${darkMode ? 'bg-[#0f0f11]' : 'bg-[#FAFAFB]'}`}>
      <div className="flex flex-col md:flex-row h-full">
        <div className={`w-full md:w-[260px] flex-shrink-0 flex flex-col p-6 border-r ${darkMode ? 'bg-[#0a0a0a] border-zinc-800' : 'bg-[#FCFCFD] border-[#E5E7EB]'}`}>
          <div className="mb-8">
            <Link to="/dashboard" className={`inline-flex items-center gap-2 text-[12px] font-semibold ${darkMode ? 'text-[#9CA3AF] hover:text-white' : 'text-[#6B7280] hover:text-[#111827]'}`}>
              <ChevronLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </div>

          <div className="mb-8">
            <h1 className={`text-[28px] font-bold tracking-tight ${title}`}>{TABS[activeSubTab].title}</h1>
            <p className={`text-[14px] mt-1 ${muted}`}>{TABS[activeSubTab].description}</p>
          </div>

          <nav className="flex flex-col gap-2">
            {[
              { id: 'PROFILE', label: 'Profile', icon: User },
              { id: 'SECURITY', label: 'Security', icon: Shield },
              { id: 'BILLING', label: 'Billing & Usage', icon: CreditCard }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveSubTab(tab.id);
                  setMsg(null);
                }}
                className={`flex items-center gap-3 px-4 h-10 rounded-[12px] text-[14px] font-semibold transition ${
                  activeSubTab === tab.id
                    ? 'bg-[#4F46E5] text-white'
                    : darkMode ? 'text-[#9CA3AF] hover:bg-zinc-800 hover:text-white' : 'text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]'
                }`}
              >
                <tab.icon className="w-[18px] h-[18px]" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 p-8 md:p-12 overflow-y-auto">
          <div className="max-w-[920px] mx-auto flex flex-col gap-8">
            {msg && (
              <div className={`p-4 rounded-[12px] text-[14px] font-medium flex items-center gap-3 border ${
                msg.type === 'success'
                  ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20'
                  : 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20'
              }`}>
                {msg.type === 'success' ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                {msg.text}
              </div>
            )}

            {activeSubTab === 'PROFILE' && (
              <div className="flex flex-col gap-6 animate-fadeIn">
                {(() => {
                  const completion = calculateProfileCompleteness(profileForm);
                  return (
                    <div className={`${cardClass} flex flex-col gap-3`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className={`text-[18px] font-semibold ${title}`}>Profile Information</h2>
                          <p className={`mt-1 text-[13px] ${muted}`}>
                            Complete your profile to personalize resumes, cover letters, and job recommendations.
                          </p>
                        </div>
                        <span className="text-sm font-bold text-[#4F46E5]">{completion}%</span>
                      </div>
                      <div className={`h-2 overflow-hidden rounded-full ${darkMode ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
                        <div className="h-full rounded-full bg-[#4F46E5] transition-all" style={{ width: `${completion}%` }} />
                      </div>
                    </div>
                  );
                })()}
                <div className={`${cardClass} flex flex-col md:flex-row items-start md:items-center justify-between gap-6`}>
                  <div className="flex items-center gap-5">
                    <UserAvatar user={user} profile={{ ...profile, ...profileForm }} size={72} />
                    <div>
                      <h3 className={`text-[20px] font-bold ${title}`}>
                        {profileForm.preferred_name || profileForm.full_name || user?.full_name || 'User'}
                      </h3>
                      <p className={`text-[14px] ${muted}`}>{profile.email || user?.email || 'No email available'}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="inline-flex text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">
                          {profile.email_verified ? 'Email verified' : 'Email not verified'}
                        </span>
                        <span className="inline-flex text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[#4F46E5]/10 text-[#4F46E5] border border-[#4F46E5]/20 capitalize">
                          {profile.auth_provider || 'password'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setEditingName(!editingName)} className={`h-10 px-4 rounded-[12px] text-[14px] font-semibold border transition ${darkMode ? 'text-white border-zinc-700 hover:bg-zinc-800' : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-[#F3F4F6]'}`}>
                    {editingName ? 'Cancel' : 'Edit Profile'}
                  </button>
                </div>

                <form onSubmit={handleUpdateProfile} className={`${cardClass} flex flex-col gap-5 animate-fadeIn`}>
                    <div>
                      <h3 className={`text-[16px] font-semibold ${title}`}>Personal details</h3>
                      <p className={`mt-1 text-xs ${muted}`}>Only the six marked fields affect profile completeness.</p>
                    </div>

                    {editingName && <div className="flex flex-wrap items-center gap-3">
                      <label className="cursor-pointer rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-semibold text-white">
                        Upload photo
                        <input type="file" accept="image/*" className="hidden" onChange={e => handleProfilePhoto(e.target.files?.[0])} />
                      </label>
                      {profile.google_profile_image_url && (
                        <button type="button" onClick={() => updateProfileField('uploaded_profile_image_url', '')} className="rounded-xl border border-[#E5E7EB] px-4 py-2 text-xs font-semibold">
                          Use Google photo
                        </button>
                      )}
                      {(profileForm.uploaded_profile_image_url || profile.google_profile_image_url) && (
                        <button type="button" onClick={() => {
                          updateProfileField('uploaded_profile_image_url', '');
                          updateProfileField('google_profile_image_url', '');
                          updateProfileField('avatar_url', '');
                        }} className="px-3 py-2 text-xs font-semibold text-rose-600">
                          Remove photo
                        </button>
                      )}
                    </div>}

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {[
                        ['first_name', 'First name *', 'text'],
                        ['last_name', 'Last name *', 'text'],
                        ['preferred_name', 'Preferred name', 'text'],
                        ['username', 'Username *', 'text'],
                        ['date_of_birth', 'Date of birth', 'date'],
                        ['gender', 'Gender (optional)', 'text'],
                        ['phone_country_code', 'Country code', 'text'],
                        ['phone_number', 'Mobile number *', 'tel'],
                        ['country', 'Country *', 'text'],
                        ['state', 'State', 'text'],
                        ['city', 'City', 'text'],
                        ['timezone', 'Timezone *', 'text'],
                        ['preferred_language', 'Preferred language', 'text'],
                        ['current_title', 'Current title', 'text'],
                        ['years_experience', 'Years of experience', 'number'],
                        ['linkedin_url', 'LinkedIn', 'url'],
                        ['github_url', 'GitHub', 'url'],
                        ['portfolio_url', 'Portfolio', 'url'],
                        ['website_url', 'Personal website', 'url']
                      ].map(([field, label, type]) => (
                        <label key={field} className="space-y-1.5">
                          <span className={`text-[12px] font-medium ${muted}`}>{label}</span>
                          <input
                            type={type}
                            value={profileForm[field] || ''}
                            onChange={e => updateProfileField(field, e.target.value)}
                            disabled={!editingName}
                            placeholder={editingName ? `Add ${label.replace(' *', '').toLowerCase()}` : 'Not provided'}
                            className={`h-[44px] w-full rounded-[12px] border px-3 text-[14px] focus:border-[#4F46E5] focus:outline-none focus:ring-1 focus:ring-[#4F46E5] disabled:cursor-default disabled:opacity-80 ${darkMode ? 'bg-[#0a0a0a] border-zinc-800 text-white' : 'bg-white border-[#E5E7EB] text-[#111827]'}`}
                          />
                        </label>
                      ))}
                    </div>
                    {editingName && <div className="flex justify-end">
                      <button type="submit" disabled={updating} className="h-10 px-6 rounded-[12px] bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[14px] font-semibold disabled:opacity-50">
                        {updating ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>}
                  </form>
              </div>
            )}

            {activeSubTab === 'SECURITY' && (
              <div className="flex flex-col gap-6 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className={`text-[18px] font-semibold ${title}`}>Security</h2>
                    <p className={`text-[14px] mt-1 ${muted}`}>Manage active sessions and account access.</p>
                  </div>
                  {sessions.length > 1 && (
                    <button onClick={revokeAllOthers} className="h-10 px-4 rounded-[12px] text-[13px] font-semibold text-rose-600 border border-rose-200 bg-rose-50 hover:bg-rose-100">
                      Log out other devices
                    </button>
                  )}
                </div>

                <div className={cardClass}>
                  <div className="mb-5 flex flex-col gap-2 border-b border-[#E5E7EB] pb-5 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${title}`}>Authentication provider</span>
                      <span className="text-sm capitalize">{profile.auth_provider || 'password'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${title}`}>Password</span>
                      <span className={`text-sm ${muted}`}>
                        {profile.has_password_credential ? 'TailorFlow credential' : 'Managed by Google'}
                      </span>
                    </div>
                    {!profile.has_password_credential && (
                      <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="self-start text-sm font-semibold text-[#4F46E5]">
                        Manage Google Account
                      </a>
                    )}
                  </div>
                  <h3 className={`text-[16px] font-semibold flex items-center gap-2 ${title}`}>
                    <Shield className="w-5 h-5 text-[#4F46E5]" />
                    Active Sessions
                  </h3>

                  {loadingSessions ? (
                    <div className={`mt-5 text-[14px] ${muted}`}>Loading sessions...</div>
                  ) : sessions.length === 0 ? (
                    <div className={`mt-5 text-[14px] ${muted}`}>No active sessions found.</div>
                  ) : (
                    <div className="mt-5 divide-y divide-[#E5E7EB] dark:divide-zinc-800">
                      {sessions.map(s => (
                        <div key={s.session_id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className={`p-3 rounded-xl ${darkMode ? 'bg-zinc-900' : 'bg-[#F9FAFB]'}`}>{getDeviceIcon(s.device_type)}</div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className={`text-[14px] font-bold ${title}`}>{s.operating_system || 'Unknown device'} {s.operating_system_version || ''}</h4>
                                {s.is_current && <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200">Current</span>}
                              </div>
                              <div className={`text-[12px] mt-2 flex flex-wrap gap-x-4 gap-y-1 ${muted}`}>
                                <span>{s.browser || 'Browser'} {s.browser_version || ''}</span>
                                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{[s.city, s.state, s.country].filter(Boolean).join(', ') || 'Unknown location'}</span>
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Last active {formatSessionDate(s.last_active || s.login_time)}</span>
                              </div>
                            </div>
                          </div>
                          <button onClick={() => revokeSession(s.session_id, s.is_current)} className={`h-9 px-4 rounded-[12px] text-[13px] font-semibold border transition flex items-center gap-2 ${s.is_current ? (darkMode ? 'text-white border-zinc-700 hover:bg-zinc-800' : 'text-[#374151] border-[#E5E7EB] hover:bg-[#F9FAFB]') : 'text-rose-600 border-rose-200 hover:bg-rose-50'}`}>
                            <LogOut className="w-4 h-4" />
                            {s.is_current ? 'Log out' : 'Revoke'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-5 rounded-[18px] border border-rose-200 bg-rose-50/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-rose-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Danger Zone</h3>
                    <p className="text-sm text-rose-600 mt-1">Account deletion is permanent and cannot be undone.</p>
                  </div>
                  <button className="h-10 px-4 rounded-[12px] bg-rose-500 hover:bg-rose-600 text-white text-[13px] font-bold">Delete Account</button>
                </div>
              </div>
            )}

            {activeSubTab === 'BILLING' && (
              <div className="flex flex-col gap-6 animate-fadeIn">
                <div>
                  <h2 className={`text-[18px] font-semibold ${title}`}>Billing & Usage</h2>
                  <p className={`text-[14px] mt-1 ${muted}`}>Your current plan and monthly usage limits.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <MetricCard darkMode={darkMode} label="Current Plan" value={planName} detail={planStatus} icon={<Zap className="w-5 h-5 text-[#F59E0B]" />} />
                  <MetricCard darkMode={darkMode} label="Job Extractions" value={jdUsed} detail={`/ ${jdLimit || 'Unlimited'} used`} icon={<FileText className="w-5 h-5 text-[#3B82F6]" />} />
                  <MetricCard darkMode={darkMode} label="Remaining This Month" value={jdRemaining} detail="job extractions" icon={<Activity className="w-5 h-5 text-[#10B981]" />} />
                  <MetricCard darkMode={darkMode} label="Resume Uploads" value={resumeUsed} detail={`/ ${resumeLimit || 'Unlimited'} uploaded`} icon={<Briefcase className="w-5 h-5 text-[#4F46E5]" />} />
                </div>

                <div className={`${cardClass} flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6`}>
                  <div>
                    <h3 className={`text-[16px] font-semibold ${title}`}>Current Plan</h3>
                    <p className={`text-[24px] font-bold capitalize mt-1 ${title}`}>{planName}</p>
                    <p className={`text-[14px] mt-2 ${muted}`}>Manage your plan and pricing from the Subscription page.</p>
                  </div>
                  <button onClick={() => navigate('/subscription')} className="h-10 px-6 rounded-[12px] bg-[#111827] hover:bg-[#374151] dark:bg-white dark:hover:bg-zinc-200 dark:text-[#111827] text-white text-[14px] font-semibold">
                    Upgrade Plan
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ darkMode, label, value, detail, icon }) {
  return (
    <div className={`p-6 rounded-[18px] border flex flex-col justify-between min-h-[140px] ${darkMode ? 'bg-[#0f0f11] border-zinc-800' : 'bg-white border-[#E5E7EB]'}`}>
      <div className="flex justify-between items-start">
        <span className={`text-[12px] font-semibold uppercase tracking-wider ${darkMode ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>{label}</span>
        {icon}
      </div>
      <div className="flex items-end gap-2 mt-4">
        <span className={`text-[32px] font-bold leading-none capitalize ${darkMode ? 'text-white' : 'text-[#111827]'}`}>{value}</span>
        <span className={`text-[12px] font-medium mb-1 ${darkMode ? 'text-[#6B7280]' : 'text-[#9CA3AF]'}`}>{detail}</span>
      </div>
    </div>
  );
}
