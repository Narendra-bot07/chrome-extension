import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthCard from '../components/AuthCard';

const neutral = 'If an account exists for this email, a reset link has been sent.';

export default function ForgotPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState(location.state?.email || '');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await fetch('http://localhost:8000/api/v1/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
    } catch {
      // Keep the public response neutral and prevent browser-extension or
      // transient network failures from becoming unhandled promise errors.
    } finally {
      setLoading(false);
      navigate('/email-sent', { state: { email, message: neutral } });
    }
  };

  return <AuthCard title="Reset your password" subtitle="Enter the email used for your TailorFlow account.">
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-semibold">Email address
        <input autoFocus required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-teal-500 dark:border-white/10 dark:bg-black/20" />
      </label>
      <button disabled={loading} className="w-full rounded-xl bg-teal-600 px-4 py-3 font-bold text-white transition hover:bg-teal-700 disabled:opacity-60">
        {loading ? 'Sending…' : 'Send reset link'}
      </button>
      <Link to="/login" className="block text-center text-sm font-semibold text-teal-600">Back to Sign In</Link>
    </form>
  </AuthCard>;
}
