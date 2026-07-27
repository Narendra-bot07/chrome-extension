import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthCard from '../components/AuthCard';

const scorePassword = (value) => [value.length >= 10, value.length >= 14, /[a-z]/i.test(value) && /\d/.test(value), /[^a-z0-9]/i.test(value)].filter(Boolean).length;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [valid, setValid] = useState(null);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const score = scorePassword(password);

  useEffect(() => {
    if (!token) return setValid(false);
    fetch('http://localhost:8000/api/v1/auth/reset-password/validate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
    }).then((r) => r.json()).then((data) => setValid(Boolean(data.valid))).catch(() => setValid(false));
  }, [token]);

  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirm) return setMessage('Passwords do not match.');
    setLoading(true); setMessage('');
    try {
      const response = await fetch('http://localhost:8000/api/v1/auth/reset-password', {
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
      <label className="block text-sm font-semibold">New password<input required type="password" minLength={10} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-white/10 dark:bg-black/20" /></label>
      <div className="grid grid-cols-4 gap-1" aria-label={`Password strength ${score} of 4`}>{[1,2,3,4].map((n) => <span key={n} className={`h-1.5 rounded ${score >= n ? (score < 3 ? 'bg-amber-500' : 'bg-teal-500') : 'bg-zinc-200 dark:bg-zinc-700'}`} />)}</div>
      <label className="block text-sm font-semibold">Confirm password<input required type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-white/10 dark:bg-black/20" /></label>
      {message && <p role="alert" className="text-sm font-semibold text-rose-600">{message}</p>}
      <button disabled={loading || score < 2} className="w-full rounded-xl bg-teal-600 px-4 py-3 font-bold text-white disabled:opacity-50">{loading ? 'Updating…' : 'Update password'}</button>
    </form>
  </AuthCard>;
}
