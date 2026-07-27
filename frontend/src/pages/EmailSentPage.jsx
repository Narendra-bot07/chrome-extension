import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import AuthCard from '../components/AuthCard';

export default function EmailSentPage() {
  const { state } = useLocation();
  return <AuthCard title="Check your email" subtitle={state?.message || 'If an account exists for this email, a reset link has been sent.'}>
    <div className="text-center">
      <MailCheck className="mx-auto h-12 w-12 text-teal-600" />
      {state?.email && <p className="mt-4 text-sm text-zinc-500">We used <strong className="text-zinc-700 dark:text-zinc-200">{state.email}</strong></p>}
      <p className="mt-3 text-xs leading-5 text-zinc-400">The link expires soon. Check your spam folder if it does not arrive.</p>
      <Link to="/login" className="mt-6 inline-block font-semibold text-teal-600">Return to Sign In</Link>
    </div>
  </AuthCard>;
}
