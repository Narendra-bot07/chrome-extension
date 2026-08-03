import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import AuthCard from '../components/AuthCard';
import { getApiUrl } from '../config/apiConfig';

const scorePassword = (value) => [value.length >= 10, value.length >= 14, /[a-z]/i.test(value) && /\d/.test(value), /[^a-z0-9]/i.test(value)].filter(Boolean).length;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [valid, setValid] = useState(null);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const score = scorePassword(password);

  useEffect(() => {
    if (!token) return setValid(false);
    fetch(`${getApiUrl()}/api/v1/auth/reset-password/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
    }).then((r) => r.json()).then((data) => setValid(Boolean(data.valid))).catch(() => setValid(false));
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirm) return setMessage('Passwords do not match.');
    setLoading(true); setMessage('');
    try {
      const response = await fetch(`${getApiUrl()}/api/v1/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password, confirm_password: confirm })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail);
      setDone(true); setMessage(data.message);
    } catch (error) {
      setMessage(error.message || 'This password reset link is invalid or has expired.');
    } finally { setLoading(false); }
  };

  if (valid === null) return <AuthCard title="Checking your link" subtitle="Please wait while we securely validate it."><div className="h-2 animate-pulse rounded bg-zinc-200" /></AuthCard>;
  if (!valid) return <AuthCard title="Link expired" subtitle="This password reset link is invalid or has expired."><Link to="/forgot-password" className="font-bold text-teal-600">Request a new link</Link></AuthCard>;
  if (done) return <AuthCard title="Password updated" subtitle={message}><Link to="/login" className="block rounded-xl bg-teal-600 px-4 py-3 text-center font-bold text-white">Sign In</Link></AuthCard>;

  return <AuthCard title="Choose a new password" subtitle="Use at least 10 characters. Passphrases work well.">
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold mb-1.5">New password</label>
        <div className="relative">
          <input
            required
            type={showPassword ? 'text' : 'password'}
            minLength={10}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 pr-11 outline-none focus:border-teal-500 dark:border-white/10 dark:bg-black/20"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white border-none bg-transparent cursor-pointer"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1" aria-label={`Password strength ${score} of 4`}>
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`h-1.5 rounded ${score >= n ? (score < 3 ? 'bg-amber-500' : 'bg-teal-500') : 'bg-zinc-200 dark:bg-zinc-700'}`} />
        ))}
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1.5">Confirm password</label>
        <div className="relative">
          <input
            required
            type={showConfirm ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••••••"
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 pr-11 outline-none focus:border-teal-500 dark:border-white/10 dark:bg-black/20"
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white border-none bg-transparent cursor-pointer"
            aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
          >
            {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {message && <p role="alert" className="text-sm font-semibold text-rose-600">{message}</p>}
      <button disabled={loading || score < 2} className="w-full rounded-xl bg-teal-600 px-4 py-3 font-bold text-white transition hover:bg-teal-700 disabled:opacity-50 cursor-pointer">
        {loading ? 'Updating…' : 'Update password'}
      </button>
    </form>
  </AuthCard>;
}
