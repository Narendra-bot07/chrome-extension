import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthCard from '../components/AuthCard';
import { getApiUrl } from '../config/apiConfig';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ loading: true, ok: false, message: 'Verifying your email…' });
  useEffect(() => {
    const token = params.get('token');
    if (!token) return setState({ loading: false, ok: false, message: 'This verification link is invalid or has expired.' });
    fetch(`${getApiUrl()}/api/v1/auth/verify-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token })
    }).then(async (r) => {
      const data = await r.json();
      setState({ loading: false, ok: r.ok, message: r.ok ? data.message : data.detail });
    }).catch(() => setState({ loading: false, ok: false, message: 'We could not verify this email right now.' }));
  }, [params]);
  return <AuthCard title={state.loading ? 'Verifying email' : state.ok ? 'Email verified' : 'Verification failed'} subtitle={state.message}>
    {!state.loading && <Link to="/login" className="block rounded-xl bg-teal-600 px-4 py-3 text-center font-bold text-white">Continue to Sign In</Link>}
  </AuthCard>;
}
