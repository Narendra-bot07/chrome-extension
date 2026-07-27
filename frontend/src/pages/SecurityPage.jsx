import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  Shield, 
  Smartphone, 
  Monitor, 
  Tablet, 
  LogOut, 
  MapPin, 
  Clock, 
  AlertTriangle,
  ChevronLeft,
  Globe
} from 'lucide-react';

export default function SecurityPage() {
  const { session, darkMode, handleLogout } = useApp();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [passwordStatus, setPasswordStatus] = useState({ loading: false, error: '', message: '' });
  const navigate = useNavigate();

  useEffect(() => {
    fetchSessions();
    fetchAccount();
  }, [session]);

  const fetchAccount = async () => {
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token) return;
      const res = await fetch('http://localhost:8000/api/v1/profile/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setAccount(await res.json());
    } catch (err) {
      console.error('Failed to load account security metadata:', err);
    }
  };

  const fetchSessions = async () => {
    try {
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`http://localhost:8000/api/v1/sessions/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  const revokeSession = async (sessionId, isCurrent) => {
    if (isCurrent) {
      // Log out locally via AppContext
      handleLogout();
      return;
    }
    
    try {
      const token = session?.access_token;
      const res = await fetch(`http://localhost:8000/api/v1/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.session_id !== sessionId));
      }
    } catch (err) {
      console.error("Failed to revoke session:", err);
    }
  };

  const revokeAllOthers = async () => {
    try {
      const token = session?.access_token;
      const res = await fetch(`http://localhost:8000/api/v1/sessions/all/others`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.is_current));
      }
    } catch (err) {
      console.error("Failed to revoke other sessions:", err);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordStatus({ loading: false, error: 'Passwords do not match.', message: '' });
      return;
    }
    setPasswordStatus({ loading: true, error: '', message: '' });
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      const res = await fetch('http://localhost:8000/api/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(passwordForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Password could not be changed.');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      setPasswordStatus({ loading: false, error: '', message: data.message });
      fetchSessions();
    } catch (error) {
      setPasswordStatus({ loading: false, error: error.message, message: '' });
    }
  };

  const getDeviceIcon = (deviceType) => {
    if (deviceType === 'Mobile') return <Smartphone className="w-5 h-5 text-indigo-500" />;
    if (deviceType === 'Tablet') return <Tablet className="w-5 h-5 text-indigo-500" />;
    return <Monitor className="w-5 h-5 text-indigo-500" />;
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  return (
    <div className={`min-h-screen font-sans ${darkMode ? 'bg-[#000000] text-white' : 'bg-[#FAFAFB] text-[#111827]'}`}>
      <div className="max-w-4xl mx-auto p-6 md:p-12">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => navigate(-1)}
            className={`p-2 rounded-xl border ${darkMode ? 'border-zinc-800 hover:bg-zinc-800' : 'border-zinc-200 hover:bg-zinc-100'} transition`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Security & Sessions</h1>
            <p className={`text-sm mt-1 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Manage your password and active login sessions
            </p>
          </div>
        </div>

        {/* Sessions Section */}
        <div className="space-y-6">
          {account && (
            <div className={`rounded-2xl border p-5 ${darkMode ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-200 bg-white'}`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-bold">Password</div>
                  <div className={`mt-1 text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {account.has_password_credential ? 'TailorFlow password credential' : 'Managed by Google'}
                  </div>
                </div>
                {!account.has_password_credential && (
                  <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="rounded-xl border border-indigo-200 px-4 py-2 text-xs font-semibold text-indigo-600">
                    Manage Google Account
                  </a>
                )}
              </div>
              {account.has_password_credential && (
                <form onSubmit={changePassword} className="mt-5 grid gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800 md:grid-cols-3">
                  <label className="text-xs font-semibold">Current password
                    <input required type="password" value={passwordForm.current_password} onChange={(e) => setPasswordForm((p) => ({ ...p, current_password: e.target.value }))} className="mt-2 w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2.5 outline-none focus:border-teal-500 dark:border-zinc-700" />
                  </label>
                  <label className="text-xs font-semibold">New password
                    <input required minLength={10} maxLength={128} type="password" value={passwordForm.new_password} onChange={(e) => setPasswordForm((p) => ({ ...p, new_password: e.target.value }))} className="mt-2 w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2.5 outline-none focus:border-teal-500 dark:border-zinc-700" />
                  </label>
                  <label className="text-xs font-semibold">Confirm password
                    <input required type="password" value={passwordForm.confirm_password} onChange={(e) => setPasswordForm((p) => ({ ...p, confirm_password: e.target.value }))} className="mt-2 w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-2.5 outline-none focus:border-teal-500 dark:border-zinc-700" />
                  </label>
                  <div className="md:col-span-3 flex flex-wrap items-center gap-3">
                    <button disabled={passwordStatus.loading} className="rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-60">{passwordStatus.loading ? 'Updating…' : 'Change password'}</button>
                    <button type="button" onClick={() => navigate('/forgot-password', { state: { email: account.email } })} className="text-xs font-bold text-teal-600">Forgot Password?</button>
                    {passwordStatus.error && <span role="alert" className="text-xs font-semibold text-rose-600">{passwordStatus.error}</span>}
                    {passwordStatus.message && <span className="text-xs font-semibold text-emerald-600">{passwordStatus.message}</span>}
                  </div>
                </form>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-500" />
              Active Sessions
            </h2>
            {sessions.length > 1 && (
              <button
                onClick={revokeAllOthers}
                className="text-sm font-semibold text-rose-500 hover:text-rose-600 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 transition"
              >
                Log out all other devices
              </button>
            )}
          </div>

          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className={`h-24 rounded-2xl ${darkMode ? 'bg-zinc-900' : 'bg-white border border-zinc-200'}`}></div>
              <div className={`h-24 rounded-2xl ${darkMode ? 'bg-zinc-900' : 'bg-white border border-zinc-200'}`}></div>
            </div>
          ) : (
            <div className="grid gap-4">
              {sessions.map((s) => (
                <div key={s.session_id} className={`p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:shadow-sm ${darkMode ? 'bg-[#0f0f11] border-zinc-800' : 'bg-white border-zinc-200'}`}>
                  
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl ${darkMode ? 'bg-zinc-900' : 'bg-zinc-50'} shrink-0`}>
                      {getDeviceIcon(s.device_type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-bold text-[15px]">
                          {s.operating_system} {s.operating_system_version}
                        </h3>
                        {s.is_current && (
                          <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200">
                            Current Device
                          </span>
                        )}
                      </div>
                      
                      <div className={`text-[13px] flex flex-wrap items-center gap-x-4 gap-y-1 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        <span className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5" /> 
                          {s.browser} {s.browser_version}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" /> 
                          {s.city}, {s.state}, {s.country}
                        </span>
                        <span className="flex items-center gap-1.5 font-mono text-[11px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                          IP: {s.ip_address.replace(/\.\d+$/, '.*')}
                        </span>
                      </div>

                      <div className={`text-[12px] flex items-center gap-4 mt-3 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          Logged in: {formatDate(s.login_time)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Activity className="w-3 h-3" />
                          Last active: {formatDate(s.last_active)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => revokeSession(s.session_id, s.is_current)}
                    className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold border transition flex items-center gap-2
                      ${s.is_current 
                        ? (darkMode ? 'text-zinc-300 border-zinc-700 hover:bg-zinc-800' : 'text-zinc-700 border-zinc-200 hover:bg-zinc-50')
                        : 'text-rose-600 border-rose-200 hover:bg-rose-50 bg-white'
                      }`}
                  >
                    <LogOut className="w-4 h-4" />
                    {s.is_current ? 'Log out' : 'Revoke'}
                  </button>

                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="mt-12 pt-8 border-t border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-bold text-rose-500 flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5" />
            Danger Zone
          </h2>
          <div className={`p-5 rounded-2xl border border-rose-200 bg-rose-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
            <div>
              <h3 className="font-bold text-rose-700">Delete Account</h3>
              <p className="text-sm text-rose-600 mt-1">
                Permanently delete your account, resumes, and active sessions. This action cannot be undone.
              </p>
            </div>
            <button className="px-4 py-2 rounded-xl text-sm font-bold bg-rose-500 hover:bg-rose-600 text-white transition shrink-0">
              Delete Account
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// Ensure Activity icon is accessible (using a custom SVG since Activity wasn't in lucide imports directly at top)
const Activity = ({ className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
  </svg>
);

