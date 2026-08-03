import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, Check, Eye, EyeOff, Lock, Mail, Zap } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { authDestinationFromSearch } from '../../utils/authRedirect';
import { useTailr4uReducedMotion } from '../../motion/MotionSystem';
import { storeAuthenticatedSession } from '../../services/authSession';
import { getApiUrl } from '../../config/apiConfig';

const isExtension = typeof chrome !== 'undefined' && chrome.identity;
const scopes = ['openid', 'email', 'profile'].join(' ');
const neutralResetMessage = 'If an account exists for this email, a reset link has been sent.';

const modeFromPath = pathname => {
  if (pathname === '/register') return 'register';
  if (pathname === '/forgot-password') return 'forgot_password';
  if (pathname === '/email-sent') return 'reset_email_sent';
  return 'login';
};

function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>;
}

function WebGoogleLoginButton({ disabled, onCredential, onError }) {
  const startGoogleWeb = useGoogleLogin({
    onSuccess: response => onCredential(response.access_token),
    onError,
    scope: scopes
  });

  return (
    <button className="public-google-button" type="button" onClick={() => startGoogleWeb()} disabled={disabled}>
      <GoogleMark /> Continue with Google
    </button>
  );
}

export default function PublicAuthPanel() {
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = useTailr4uReducedMotion();
  const { user, adoptAuthenticatedSession } = useApp();
  const routeMode = modeFromPath(location.pathname);
  const [success, setSuccess] = useState(false);
  const mode = success ? 'auth_success' : routeMode;
  const destination = authDestinationFromSearch(location.search);
  const emailRef = useRef(null);
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordRules = useMemo(() => [
    password.length >= 8,
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
    /[a-z]/.test(password) && /[A-Z]/.test(password)
  ], [password]);
  const strongPassword = passwordRules.every(Boolean);

  const go = path => navigate(`${path}?redirect=${encodeURIComponent(destination)}`);
  const finishAuthentication = async (accessToken, refreshToken = null) => {
    storeAuthenticatedSession(accessToken, refreshToken);
    await adoptAuthenticatedSession(accessToken);
    setSuccess(true);
    window.setTimeout(() => navigate(destination, { replace: true }), reduced ? 80 : 520);
  };

  const exchangeGoogleToken = async credential => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`${getApiUrl()}/api/v1/auth/google`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Google authentication failed.');
      if (data.google_profile_import) localStorage.setItem('tailr4u.google-profile-import-debug', JSON.stringify(data.google_profile_import));
      await finishAuthentication(data.session?.access_token, data.session?.refresh_token);
    } catch (reason) {
      setError(reason.message || 'Google authentication failed.');
    } finally { setLoading(false); }
  };

  const startExtensionGoogle = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '984139464223-rb9kbtqjseqbepu9ke8j9qhgna1gh05l.apps.googleusercontent.com';
    const redirectUrl = chrome.identity.getRedirectURL();
    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=${encodeURIComponent(scopes)}&include_granted_scopes=true`;
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, callbackUrl => {
      if (chrome.runtime.lastError) return setError(`Google setup incomplete. Add this redirect URI: ${redirectUrl}`);
      const token = callbackUrl ? new URLSearchParams(new URL(callbackUrl).hash.slice(1)).get('access_token') : '';
      if (token) exchangeGoogleToken(token);
      else setError('Google did not return an access token.');
    });
  };

  const submit = async event => {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      if (mode === 'forgot_password') {
        await fetch(`${getApiUrl()}/api/v1/auth/forgot-password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        }).catch(() => null);
        navigate(`/email-sent?redirect=${encodeURIComponent(destination)}`, { state: { email } });
        return;
      }
      if (mode === 'register') {
        if (!strongPassword) throw new Error('Use 8+ characters with mixed case, a number, and a special character.');
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        const response = await fetch(`${getApiUrl()}/api/v1/auth/register`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Account creation failed.');
        go('/login');
        return;
      }
      const response = await fetch(`${getApiUrl()}/api/v1/auth/login`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      await finishAuthentication(data.session?.access_token, data.session?.refresh_token);
    } catch (reason) {
      setError(reason.message || 'Authentication failed.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    // Clear out automatic session timeout banners as requested
    if (!success) requestAnimationFrame(() => emailRef.current?.focus());
  }, [location.search, routeMode, success]);

  useEffect(() => {
    const escape = event => {
      if (event.key === 'Escape' && !success) navigate('/');
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [navigate, success]);

  if (user && !success) return <div className="public-auth-card public-auth-ready">
    <span><Check size={22} /></span><h2>You’re already signed in</h2><p>Your tailr4u workspace is ready.</p>
    <button className="public-auth-submit" onClick={() => navigate(destination)}>Continue to Dashboard</button>
  </div>;

  return <motion.div className="public-auth-card" initial={reduced ? { opacity: 0 } : { opacity: 0, x: 28, scale: .98 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: reduced ? .1 : .24 }}>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={mode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? .08 : .16 }}>
        {mode === 'auth_success' ? <div className="public-auth-success" role="status"><span><Check size={24} /></span><h2>Workspace ready</h2><p>Taking you to your application workspace…</p></div>
        : mode === 'reset_email_sent' ? <div className="public-auth-success" role="status"><span><Mail size={23} /></span><h2>Check your email</h2><p>{neutralResetMessage}</p><button className="public-auth-submit" onClick={() => go('/login')}>Back to Sign In</button></div>
        : <>
          <span className="lp-tech-label">{mode === 'register' ? 'CREATE YOUR WORKSPACE' : mode === 'forgot_password' ? 'ACCOUNT RECOVERY' : 'WELCOME BACK'}</span>
          <h2 tabIndex={-1}>{mode === 'register' ? 'Create your account' : mode === 'forgot_password' ? 'Reset your password' : 'Sign in to tailr4u'}</h2>
          <p>{mode === 'register' ? 'Start building stronger, connected applications.' : mode === 'forgot_password' ? 'We’ll send a secure reset link to your email.' : 'Continue your job-search workspace.'}</p>
          {error && <div className="public-auth-error" role="alert"><AlertCircle size={15} /> {error}</div>}
          {mode !== 'forgot_password' && (
            isExtension
              ? <button className="public-google-button" type="button" onClick={startExtensionGoogle} disabled={loading}><GoogleMark /> Continue with Google</button>
              : <WebGoogleLoginButton
                  disabled={loading}
                  onCredential={exchangeGoogleToken}
                  onError={() => setError('Google authentication failed.')}
                />
          )}
          {mode !== 'forgot_password' && <div className="public-auth-divider"><span>or continue with email</span></div>}
          <form onSubmit={submit}>
            <label>Email address<div><Mail size={16} /><input ref={emailRef} type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></div></label>
            {mode !== 'forgot_password' && <label>Password<div><Lock size={16} /><input type={showPassword ? 'text' : 'password'} required autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>}
            {mode === 'register' && <label>Confirm password<div><Lock size={16} /><input type="password" required autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Confirm your password" /></div><small>{password && `${passwordRules.filter(Boolean).length}/4 password requirements met`}</small></label>}
            {mode === 'login' && <button className="public-auth-link align-right" type="button" onClick={() => go('/forgot-password')}>Forgot password?</button>}
            <button className="public-auth-submit" disabled={loading}>{loading ? 'Please wait…' : mode === 'register' ? 'Create Account' : mode === 'forgot_password' ? 'Send Reset Link' : 'Sign In'} <Zap size={15} /></button>
          </form>
          <div className="public-auth-switch">
            {mode === 'login' && <>New to Tailr4U? <button onClick={() => go('/register')}>Create Account</button></>}
            {mode === 'register' && <>Already have an account? <button onClick={() => go('/login')}>Sign In</button></>}
            {mode === 'forgot_password' && <button onClick={() => go('/login')}>Back to Sign In</button>}
          </div>
        </>}
      </motion.div>
    </AnimatePresence>
    {!success && <button className="public-auth-back" onClick={() => navigate('/')}><ArrowLeft size={14} /> Back to Tailr4U</button>}
  </motion.div>;
}
