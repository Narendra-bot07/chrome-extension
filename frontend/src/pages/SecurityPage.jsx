import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
  Globe,
  Eye,
  EyeOff,
  KeyRound,
  CheckCircle2,
  Lock,
  ExternalLink,
  ShieldCheck,
  Laptop
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { cardVariants, staggerContainer, fadeUp } from '../utils/motion';

export default function SecurityPage() {
  const { session, darkMode, handleLogout } = useApp();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState({ loading: false, error: '', message: '' });
  const [revokingId, setRevokingId] = useState(null);
  const [revokingAll, setRevokingAll] = useState(false);
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
      handleLogout();
      return;
    }
    setRevokingId(sessionId);
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
    } finally {
      setRevokingId(null);
    }
  };

  const revokeAllOthers = async () => {
    setRevokingAll(true);
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
    } finally {
      setRevokingAll(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setPasswordStatus({ loading: false, error: 'New password and confirmation do not match.', message: '' });
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
      setPasswordStatus({ loading: false, error: '', message: data.message || 'Password updated successfully!' });
      fetchSessions();
    } catch (error) {
      setPasswordStatus({ loading: false, error: error.message, message: '' });
    }
  };

  const getDeviceIcon = (deviceType) => {
    if (deviceType === 'Mobile') return <Smartphone className="w-5 h-5 text-tf-accent" />;
    if (deviceType === 'Tablet') return <Tablet className="w-5 h-5 text-tf-accent" />;
    return <Laptop className="w-5 h-5 text-tf-accent" />;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Just now';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  // Password strength score (0 to 4)
  const getPasswordStrength = (pw) => {
    if (!pw) return { score: 0, label: '', color: 'bg-zinc-200 dark:bg-zinc-800' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-rose-500', width: 'w-1/4' };
    if (score === 2) return { score: 2, label: 'Fair', color: 'bg-amber-500', width: 'w-2/4' };
    if (score === 3) return { score: 3, label: 'Good', color: 'bg-blue-500', width: 'w-3/4' };
    return { score: 4, label: 'Strong', color: 'bg-emerald-500', width: 'w-full' };
  };

  const pwStrength = getPasswordStrength(passwordForm.new_password);

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 space-y-8 select-none text-tf-text"
    >
      {/* 1. Header Section */}
      <motion.div variants={fadeUp} className="flex items-center justify-between">
        <div className="flex items-center gap-3 sm:gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border border-tf-border bg-tf-surface hover:bg-tf-surface-2 text-tf-text-secondary hover:text-tf-text transition shadow-2xs cursor-pointer"
            title="Go Back"
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-tf-text flex items-center gap-2.5">
              <Shield className="w-6 h-6 text-tf-accent" />
              Security & Active Sessions
            </h1>
            <p className="text-xs sm:text-sm text-tf-text-secondary mt-0.5">
              Manage your authentication credentials, active devices, and session security.
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
          <ShieldCheck size={16} />
          <span>Account Protected</span>
        </div>
      </motion.div>



      {/* 3. Active Sessions Card */}
      <motion.div variants={cardVariants} className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-6 sm:p-8 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs space-y-6">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-tf-border">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-tf-accent/10 text-tf-accent">
              <Monitor size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-tf-text">Active Devices & Sessions</h2>
              <p className="text-xs text-tf-text-secondary mt-0.5">Devices currently signed into your tailr4u account</p>
            </div>
          </div>

          {sessions.length > 1 && (
            <Button
              variant="danger"
              size="sm"
              isLoading={revokingAll}
              onClick={revokeAllOthers}
            >
              <LogOut size={13} />
              <span>Log Out All Other Devices</span>
            </Button>
          )}
        </div>

        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-20 rounded-xl bg-tf-surface-2 border border-tf-border" />
            <div className="h-20 rounded-xl bg-tf-surface-2 border border-tf-border" />
          </div>
        ) : (
          <div className="space-y-3.5">
            {sessions.map((s) => (
              <div 
                key={s.session_id} 
                className={`p-4 sm:p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-200 ${
                  s.is_current 
                    ? 'border-tf-accent/30 bg-tf-accent/5 dark:bg-tf-accent/10' 
                    : 'border-tf-border bg-tf-surface hover:bg-tf-surface-2/60'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="p-2.5 rounded-xl bg-tf-surface-2 border border-tf-border/60 shrink-0 mt-0.5">
                    {getDeviceIcon(s.device_type)}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-bold text-sm text-tf-text">
                        {s.operating_system} {s.operating_system_version}
                      </h3>
                      {s.is_current ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Current Device
                        </span>
                      ) : null}
                    </div>

                    <div className="text-xs text-tf-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="flex items-center gap-1.5">
                        <Globe size={13} className="text-tf-text-tertiary" /> 
                        {s.browser} {s.browser_version}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin size={13} className="text-tf-text-tertiary" /> 
                        {s.city || 'Local'}, {s.country || 'Host'}
                      </span>
                      <span className="font-mono text-[11px] bg-tf-surface-2 border border-tf-border px-1.5 py-0.5 rounded text-tf-text-tertiary">
                        IP: {s.ip_address ? s.ip_address.replace(/\.\d+$/, '.*') : '127.0.0.*'}
                      </span>
                    </div>

                    <div className="text-[11px] text-tf-text-tertiary flex items-center gap-4 pt-1">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        Logged in: {formatDate(s.login_time)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        Last active: {formatDate(s.last_active)}
                      </span>
                    </div>
                  </div>
                </div>

                <Button
                  variant={s.is_current ? "ghost" : "danger"}
                  size="sm"
                  isLoading={revokingId === s.session_id}
                  onClick={() => revokeSession(s.session_id, s.is_current)}
                  className="shrink-0 self-start sm:self-center"
                >
                  <LogOut size={13} />
                  <span>{s.is_current ? 'Log Out' : 'Revoke'}</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* 4. Danger Zone Card */}
      <motion.div variants={cardVariants} className="p-6 sm:p-8 rounded-2xl border border-rose-500/20 bg-rose-500/5 dark:bg-rose-500/10 space-y-4">
        <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 font-bold text-base">
          <AlertTriangle size={20} />
          <h2>Danger Zone</h2>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-sm text-tf-text">Delete Account & Permanent Cleanup</h3>
            <p className="text-xs text-tf-text-secondary mt-0.5 leading-relaxed max-w-xl">
              Permanently remove your account credentials, saved resumes, job tracker records, and active sessions. This action is irreversible.
            </p>
          </div>
          <Button variant="danger" size="md" onClick={() => alert("Account deletion requires contacting support or confirming email verification.")}>
            Delete Account
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
