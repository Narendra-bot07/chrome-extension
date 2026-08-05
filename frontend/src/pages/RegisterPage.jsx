import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Mail, Lock, ChevronRight, Eye, EyeOff, AlertCircle, User, ShieldCheck } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';

import { ApplicationLogo } from '../components/ApplicationLogo';
import BrandLogo from '../components/BrandLogo';
import { authDestinationFromSearch } from '../utils/authRedirect';
import { storeAuthenticatedSession } from '../services/authSession';
import { getOrCreateInstallationId } from '../utils/installationId';
import { getApiUrl } from '../config/apiConfig';

const isExtension = typeof chrome !== 'undefined' && chrome.identity;
const BASIC_GOOGLE_SCOPES = ['openid', 'email', 'profile'];
const EXTENDED_GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/user.birthday.read',
  'https://www.googleapis.com/auth/user.gender.read',
  'https://www.googleapis.com/auth/user.phonenumbers.read',
  'https://www.googleapis.com/auth/user.addresses.read',
  'https://www.googleapis.com/auth/user.organization.read',
  'https://www.googleapis.com/auth/profile.language.read'
];
const GOOGLE_PROFILE_SCOPES = (
  import.meta.env.VITE_ENABLE_GOOGLE_PROFILE_ENRICHMENT === 'true'
    ? [...BASIC_GOOGLE_SCOPES, ...EXTENDED_GOOGLE_SCOPES]
    : BASIC_GOOGLE_SCOPES
).join(' ');

const WebGoogleLoginButton = ({ onSuccess, onError }) => {
  const loginGoogleWeb = useGoogleLogin({ onSuccess, onError, scope: GOOGLE_PROFILE_SCOPES });
  return (
    <button
      type="button"
      onClick={() => loginGoogleWeb()}
      className="flex items-center justify-center gap-2 w-full h-[42px] rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold text-sm hover:bg-zinc-50 transition-colors cursor-pointer"
    >
      <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
      Continue with Google
    </button>
  );
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const postAuthDestination = authDestinationFromSearch(location.search);

  // --- REGISTER STATES ---
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [regError, setRegError] = useState(null);
  const [regSuccess, setRegSuccess] = useState(null);

  const passwordRules = [
    { label: '8+ characters', valid: regPassword.length >= 8 },
    { label: 'At least one number', valid: /\d/.test(regPassword) },
    { label: 'At least one special character', valid: /[^A-Za-z0-9]/.test(regPassword) },
    { label: 'Upper and lowercase letters', valid: /[a-z]/.test(regPassword) && /[A-Z]/.test(regPassword) }
  ];
  const passwordStrengthScore = passwordRules.filter(rule => rule.valid).length;
  const isStrongPassword = passwordStrengthScore === passwordRules.length;
  const passwordsMatch = regConfirmPassword.length > 0 && regPassword === regConfirmPassword;

  // --- REGISTER SUBMIT ---
  const handleRegister = async (e) => {
    e.preventDefault();
    setRegLoading(true);
    setRegError(null);
    setRegSuccess(null);

    if (regPassword !== regConfirmPassword) {
      setRegError("Passwords do not match.");
      setRegLoading(false);
      return;
    }

    if (!isStrongPassword) {
      setRegError("Use a stronger password: 8+ characters, one number, one special character, and mixed case letters.");
      setRegLoading(false);
      return;
    }

    try {
      const installationId = getOrCreateInstallationId();
      const res = await fetch(`${getApiUrl()}/api/v1/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Installation-Id': installationId
        },
        body: JSON.stringify({
          email: regEmail,
          password: regPassword,
          installation_id: installationId
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Sign up failed.');
      }
      
      setRegSuccess("Registration successful! Navigating to Login...");
      setTimeout(() => {
        navigate(`/login?redirect=${encodeURIComponent(postAuthDestination)}`);
      }, 1200);
    } catch (err) {
      setRegError(err.message || "Sign up failed. Please try again.");
    } finally {
      setRegLoading(false);
    }
  };

  // --- OAUTH GOOGLE ---
  const handleGoogleSuccess = async (credentialResponse) => {
    setRegLoading(true);
    setRegError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/auth/google`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // installation_id was missing here too (same gap as LoginPage.jsx's
        // Google handler) -- every Google sign-up went through with no
        // device signal at all.
        body: JSON.stringify({ credential: credentialResponse.credential, installation_id: getOrCreateInstallationId() })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Google signup failed.');
      }
      const data = await res.json();
      if (data.google_profile_import) {
        localStorage.setItem(
          'tailr4u.google-profile-import-debug',
          JSON.stringify(data.google_profile_import)
        );
        console.info('[tailr4u] Google profile import', data.google_profile_import);
      }
      if (Array.isArray(data.other_accounts_on_device) && data.other_accounts_on_device.length > 0) {
        try { sessionStorage.setItem('tailr4u_device_notice', JSON.stringify(data.other_accounts_on_device)); } catch (e) {}
      }
      storeAuthenticatedSession(data.session?.access_token, data.session?.refresh_token);
      window.location.hash = `#${postAuthDestination}`;
      window.location.reload();
    } catch (err) {
      setRegError(err.message || 'Google registration failed.');
    } finally {
      setRegLoading(false);
    }
  };

  const loginGoogleExtension = (errorSetter) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "984139464223-rb9kbtqjseqbepu9ke8j9qhgna1gh05l.apps.googleusercontent.com";
    const redirectUrl = chrome.identity.getRedirectURL();
    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=${encodeURIComponent(GOOGLE_PROFILE_SCOPES)}&include_granted_scopes=true`;
    
    chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    }, (redirectUrlAfterAuth) => {
      if (chrome.runtime.lastError) {
         errorSetter(`Google setup incomplete! Please add this EXACT URL to your Google Cloud Console "Authorized redirect URIs": ${redirectUrl}`);
         return;
      }
      if (redirectUrlAfterAuth) {
        const url = new URL(redirectUrlAfterAuth);
        const params = new URLSearchParams(url.hash.substring(1));
        const token = params.get('access_token');
        if (token) {
          handleGoogleSuccess({ credential: token });
        } else {
          errorSetter('Failed to get access token from Google.');
        }
      }
    });
  };

  return (
    <div className="min-h-screen flex bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans overflow-hidden relative">
      
      {/* LEFT SIDE BRANDING HERO PANEL */}
      <div className="hidden lg:flex flex-col justify-between w-[48%] p-12 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 relative z-10">
        <div>
          <div className="flex items-center">
            <BrandLogo size={40} />
          </div>

          <div className="mt-20 max-w-lg space-y-6">
            <span className="px-3.5 py-1.5 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800 text-xs font-black uppercase tracking-wider">
              Enterprise Orchestration
            </span>

            <h1 className="text-4xl font-black tracking-tight text-zinc-900 dark:text-white leading-tight">
              Orchestrate your application pipeline with AI.
            </h1>

            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 leading-relaxed uppercase tracking-wider">
              Dynamically tailor your resumes for ATS benchmarks, monitor interviews in real time, and negotiate job offers with a modern Kanban dashboard.
            </p>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="space-y-4 pt-10 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-4">
            <span className="w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 font-bold text-xs flex items-center justify-center border border-teal-200 dark:border-teal-800">1</span>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-white">Upload Master Resume</h4>
              <p className="text-[11px] text-zinc-500 font-medium">Sync your background details instantly</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 font-bold text-xs flex items-center justify-center border border-teal-200 dark:border-teal-800">2</span>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-white">AI Tailoring Scan</h4>
              <p className="text-[11px] text-zinc-500 font-medium">Generate optimized keyword alignments for JD benchmarks</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 font-bold text-xs flex items-center justify-center border border-teal-200 dark:border-teal-800">3</span>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-white">Active Pipeline Board</h4>
              <p className="text-[11px] text-zinc-500 font-medium">Drag, drop, log status and track offer transitions</p>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE REGISTRATION FORM PANEL */}
      <div className="flex-1 flex items-center justify-center p-6 bg-zinc-50 dark:bg-zinc-950 relative z-10">
        <div className="flex w-full max-w-md flex-col gap-6 rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          
          {/* Header */}
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-white uppercase">
              Create Account
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-semibold">
              Get started tailoring your resumes with AI
            </p>
          </div>

          {/* Feedback Banners */}
          {regError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 text-xs font-bold rounded-xl flex items-center gap-2 animate-fade-in">
              <AlertCircle size={16} className="text-rose-600 shrink-0" />
              <span>{regError}</span>
            </div>
          )}

          {regSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-xl flex items-center gap-2 animate-fade-in">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{regSuccess}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleRegister} className="order-4 space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 shrink-0" size={16} />
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3.5 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#00bda5]/25 focus:border-[#00bda5] transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 shrink-0" size={16} />
                <input
                  type={showRegPassword ? "text" : "password"}
                  required
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Password123!"
                  className="w-full pl-10 pr-10 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#00bda5]/25 focus:border-[#00bda5] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword(!showRegPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white border-none bg-transparent cursor-pointer p-0.5"
                >
                  {showRegPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-1">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 shrink-0" size={16} />
                <input
                  type={showRegConfirmPassword ? "text" : "password"}
                  required
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="Password123!"
                  className="w-full pl-10 pr-10 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#00bda5]/25 focus:border-[#00bda5] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white border-none bg-transparent cursor-pointer p-0.5"
                >
                  {showRegConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {regConfirmPassword && (
                <p className={`mt-1 text-xs font-bold ${passwordsMatch ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {passwordsMatch ? 'Passwords match.' : 'Passwords do not match.'}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={regLoading || !isStrongPassword || !passwordsMatch}
              className="w-full py-2.5 bg-[#00bda5] hover:bg-[#00a38e] text-white font-bold rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer border-none shadow-xs disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              <span>{regLoading ? 'Registering...' : 'Create Account'}</span>
              <ChevronRight size={16} />
            </button>
          </form>

          {/* Social OAuth Buttons */}
          <div className="order-3 space-y-3 border-b border-zinc-100 pb-5 dark:border-zinc-800">
            <div className="text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              Or continue with
            </div>

            {isExtension ? (
              <button
                type="button"
                onClick={() => loginGoogleExtension(setRegError)}
                className="flex items-center justify-center gap-2 w-full h-[42px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 font-semibold text-xs hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
              >
                <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Continue with Google
              </button>
            ) : (
              <WebGoogleLoginButton 
                onSuccess={(tokenResponse) => handleGoogleSuccess({ credential: tokenResponse.access_token })}
                onError={() => setRegError('Google registration failed.')}
              />
            )}
          </div>

          {/* Toggle to Sign In Page */}
          <div className="order-5 text-center text-xs font-medium text-zinc-500">
            Already have an account?{' '}
            <Link
              to={`/login?redirect=${encodeURIComponent(postAuthDestination)}`}
              className="text-[#00bda5] font-bold hover:underline ml-1"
            >
              Sign In
            </Link>
            <span className="mx-2 text-zinc-300">·</span>
            <Link to="/forgot-password" className="font-bold text-[#00bda5] hover:underline">Forgot Password?</Link>
            <span className="mx-2 text-zinc-300">·</span>
            <Link to="/" className="font-bold text-[#00bda5] hover:underline">Back to tailr4u</Link>
          </div>

        </div>
      </div>

    </div>
  );
}
