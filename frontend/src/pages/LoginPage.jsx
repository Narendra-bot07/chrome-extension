import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Mail, Lock, User, ChevronRight, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

const isExtension = typeof chrome !== 'undefined' && chrome.identity;

const WebGoogleLoginButton = ({ onSuccess, onError }) => {
  const loginGoogleWeb = useGoogleLogin({ onSuccess, onError });
  return (
    <button
      type="button"
      onClick={() => loginGoogleWeb()}
      className="flex items-center justify-center gap-2 w-full h-[42px] rounded-xl border border-zinc-200 bg-white text-zinc-700 font-semibold text-sm hover:bg-zinc-50 transition-colors cursor-pointer border-none"
    >
      <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
      Continue with Google
    </button>
  );
};

function LoginPage() {

  const navigate = useNavigate();
  const location = useLocation();
  const isRegisterPath = location.pathname === '/register';

  // Auth Mode State (triggered by route change)
  const [isFlipped, setIsFlipped] = useState(isRegisterPath);

  useEffect(() => {
    setIsFlipped(location.pathname === '/register');
  }, [location.pathname]);

  // --- LOGIN STATES ---
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isMagicLink, setIsMagicLink] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const [loginSuccess, setLoginSuccess] = useState(null);

  // --- REGISTER STATES ---
  const [regFullName, setRegFullName] = useState('');
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

  // --- LOGIN SUBMIT ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    setLoginSuccess(null);

    try {
      const res = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Login failed.');
      }
      
      const data = await res.json();
      localStorage.setItem('access_token', data.session.access_token);
      window.location.href = '#/';
      window.location.reload();
    } catch (err) {
      setLoginError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoginLoading(false);
    }
  };

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
      const res = await fetch('http://localhost:8000/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail,
          password: regPassword,
          full_name: regFullName
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Sign up failed.');
      }
      
      setRegSuccess("Registration successful! Flipping to Login...");
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (err) {
      setRegError(err.message || "Sign up failed. Please try again.");
    } finally {
      setRegLoading(false);
    }
  };

  // --- OAUTH BYPASS ---
  const handleGoogleSuccess = async (credentialResponse) => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch('http://localhost:8000/api/v1/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Google login failed.');
      }
      const data = await res.json();
      localStorage.setItem('access_token', data.session.access_token);
      window.location.href = '#/';
      window.location.reload();
    } catch (err) {
      setLoginError(err.message || 'Google login failed.');
    } finally {
      setLoginLoading(false);
    }
  };

  const loginGoogleExtension = (errorSetter) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "984139464223-rb9kbtqjseqbepu9ke8j9qhgna1gh05l.apps.googleusercontent.com";
    const redirectUrl = chrome.identity.getRedirectURL();
    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUrl)}&scope=email%20profile%20openid`;
    
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
    <div className="min-h-screen flex bg-tf-bg text-tf-text font-sans overflow-hidden relative">
      
      {/* Dynamic hardware flip transitions styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .perspective-container {
          perspective: 1500px;
        }
        .flip-card-inner {
          position: relative;
          width: 100%;
          min-height: 620px;
          height: auto;
          transition: transform 180ms cubic-bezier(0.2, 0, 0, 1), opacity 180ms cubic-bezier(0.2, 0, 0, 1);
          transform-style: preserve-3d;
        }
        .flip-card-inner.flipped {
          transform: rotateY(180deg);
        }
        .flip-card-front, .flip-card-back {
          position: absolute;
          width: 100%;
          height: 100%;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          top: 0;
          left: 0;
          background: var(--tf-surface);
          border: 1px solid var(--tf-border);
          border-radius: 16px;
          padding: 32px;
          box-shadow: 0 8px 24px 0 rgba(0,0,0,0.06);
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .flip-card-back {
      `}} />

      {/* LEFT COLUMN: Showcase */}
      <div 
        className="hidden lg:flex lg:w-[46%] border-r border-tf-border flex-col justify-between p-12 relative overflow-hidden shrink-0 bg-tf-surface"
      >
        {/* Brand logo header */}
        <div className="flex items-center gap-2.5 relative z-10">
          <div className="w-8 h-8 rounded-md bg-tf-accent text-tf-accent-fg flex items-center justify-center font-semibold text-xs">
            T
          </div>
          <span className="text-sm font-semibold tracking-tight text-tf-text">
            TailorFlow
          </span>
        </div>

        {/* Dynamic feature showcase items */}
        <div className="space-y-8 my-auto relative z-10 max-w-md select-none">
          <div className="space-y-3">
            <span className="inline-block px-2.5 py-0.5 bg-tf-accent/10 border border-tf-accent/20 text-tf-accent text-xs font-medium rounded-sm">
              Enterprise Orchestration
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-tf-text leading-tight">
              Build stronger applications with AI.
            </h1>
            <p className="text-tf-text-secondary font-normal text-sm leading-relaxed max-w-[68ch]">
              Tailor your resume, create cover letters, and track every application in one quiet workspace.
            </p>
          </div>

          {/* Stepper display */}
          <div className="space-y-4 pt-5 border-t border-tf-border">
            <div className="flex items-start gap-4">
              <div className="w-5 h-5 rounded-full bg-tf-accent/15 text-tf-accent flex items-center justify-center text-xs font-medium shrink-0">
                1
              </div>
              <div>
                <h4 className="text-xs font-semibold text-tf-text leading-none">Upload Master Resume</h4>
                <p className="text-xs text-tf-text-tertiary font-normal mt-1">Sync your background details instantly</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-5 h-5 rounded-full bg-tf-surface-2 text-tf-text-tertiary border border-tf-border flex items-center justify-center text-xs font-medium shrink-0">
                2
              </div>
              <div>
                <h4 className="text-xs font-semibold text-tf-text leading-none">AI Tailoring Scan</h4>
                <p className="text-xs text-tf-text-tertiary font-normal mt-1">Generate optimized keyword alignments for JD benchmarks</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-5 h-5 rounded-full bg-tf-surface-2 text-tf-text-tertiary border border-tf-border flex items-center justify-center text-xs font-medium shrink-0">
                3
              </div>
              <div>
                <h4 className="text-xs font-semibold text-tf-text leading-none">Active Pipeline Board</h4>
                <p className="text-xs text-tf-text-tertiary font-normal mt-1">Drag, drop, log status and track offer transitions</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info copy */}
        <div className="text-xs text-tf-text-tertiary font-medium relative z-10">
          © {new Date().getFullYear()} TailorFlow Inc. All rights reserved.
        </div>
      </div>


      {/* RIGHT COLUMN: The Form Workspace */}
      <div className="w-full lg:w-[54%] flex items-center justify-center p-5 sm:p-10 relative z-10 min-h-screen bg-tf-bg">
        <div className="w-full max-w-md perspective-container">
          
          <div className={`flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
            
            {/* FRONT SIDE CARD: Login Workspace */}
            <div className="flip-card-front">
              
              <div className="text-center mb-6 select-none">
                <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-md bg-tf-accent text-tf-accent-fg flex items-center justify-center font-semibold text-xs">
                    T
                  </div>
                  <span className="text-sm font-semibold tracking-tight text-tf-text">
                    TailorFlow
                  </span>
                </div>
                <h1 className="text-xl font-semibold text-tf-text tracking-tight">Welcome back</h1>
                <p className="text-tf-text-secondary text-xs mt-1 font-normal">Sign in to your account</p>
              </div>

              {loginError && (
                <div className="mb-4 p-3 rounded-md bg-tf-danger/10 border border-tf-danger/20 text-tf-danger text-xs font-normal flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {loginSuccess && (
                <div className="mb-4 p-3 rounded-md bg-tf-success/10 border border-tf-success/20 text-tf-success text-xs font-normal flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{loginSuccess}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4 text-left">
                <Input
                  label="Email Address"
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="you@example.com"
                />

                {!isMagicLink && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="block text-[13px] font-medium text-tf-text">Password</label>
                    </div>
                    <div className="relative">
                      <Input
                        type={showLoginPassword ? "text" : "password"}
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-tf-text-tertiary hover:text-tf-text"
                      >
                        {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={loginLoading}
                  className="w-full mt-2"
                >
                  {isMagicLink ? 'Send Magic Link' : 'Sign In'}
                  <ChevronRight size={16} />
                </Button>
              </form>

              {/* Social OAuth Buttons */}
              <div className="mt-6 flex justify-center">
                {isExtension ? (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => loginGoogleExtension(setLoginError)}
                    className="w-full"
                  >
                    Continue with Google
                  </Button>
                ) : (
                  <WebGoogleLoginButton 
                    onSuccess={(tokenResponse) => handleGoogleSuccess({ credential: tokenResponse.access_token })}
                    onError={() => setLoginError('Google login failed.')}
                  />
                )}
              </div>

              {/* Action Link Footer */}
              <div className="mt-6 text-center text-xs text-tf-text-secondary font-normal">
                <span>Don't have an account? </span>
                <button 
                  type="button"
                  onClick={() => navigate('/register')}
                  className="text-tf-accent font-medium hover:underline"
                >
                  Sign Up
                </button>
              </div>

            </div>

            {/* BACK SIDE CARD: Register Workspace */}
            <div className="flip-card-back">
              
              <div className="text-center mb-4 select-none">
                <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-md bg-tf-accent text-tf-accent-fg flex items-center justify-center font-semibold text-xs">
                    T
                  </div>
                  <span className="text-sm font-semibold tracking-tight text-tf-text">
                    TailorFlow
                  </span>
                </div>
                <h1 className="text-xl font-semibold text-tf-text tracking-tight">Create Account</h1>
                <p className="text-tf-text-secondary text-xs mt-1 font-normal">Get started tailoring your resumes with AI</p>
              </div>

              {regError && (
                <div className="mb-3 p-3 rounded-md bg-tf-danger/10 border border-tf-danger/20 text-tf-danger text-xs font-normal flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{regError}</span>
                </div>
              )}

              {regSuccess && (
                <div className="mb-3 p-3 rounded-md bg-tf-success/10 border border-tf-success/20 text-tf-success text-xs font-normal flex items-center gap-2">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{regSuccess}</span>
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-3 text-left">
                <Input
                  label="Full Name"
                  type="text"
                  required
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  placeholder="John Doe"
                />

                <Input
                  label="Email Address"
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="you@example.com"
                />

                <div className="space-y-1">
                  <Input
                    label="Password"
                    type={showRegPassword ? "text" : "password"}
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  {regPassword && (
                    <div className="mt-2 rounded-md border border-tf-border bg-tf-surface-2 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-tf-text-secondary">Password strength</span>
                        <span className={`font-semibold ${isStrongPassword ? 'text-tf-success' : passwordStrengthScore >= 2 ? 'text-tf-warning' : 'text-tf-danger'}`}>
                          {isStrongPassword ? 'Strong' : passwordStrengthScore >= 2 ? 'Medium' : 'Weak'}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[0, 1, 2, 3].map((idx) => (
                          <div
                            key={idx}
                            className={`h-1 rounded-full ${idx < passwordStrengthScore ? (isStrongPassword ? 'bg-tf-success' : 'bg-tf-warning') : 'bg-tf-border'}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <Input
                  label="Confirm Password"
                  type={showRegConfirmPassword ? "text" : "password"}
                  required
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={regLoading}
                  disabled={!isStrongPassword || !passwordsMatch}
                  className="w-full mt-2"
                >
                  Create Account
                  <ChevronRight size={16} />
                </Button>
              </form>

              {/* Social OAuth Buttons */}
              <div className="mt-4 flex justify-center">
                {isExtension ? (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => loginGoogleExtension(setRegError)}
                    className="w-full"
                  >
                    Continue with Google
                  </Button>
                ) : (
                  <WebGoogleLoginButton 
                    onSuccess={(tokenResponse) => handleGoogleSuccess({ credential: tokenResponse.access_token })}
                    onError={() => setRegError('Google registration failed.')}
                  />
                )}
              </div>

              {/* Already have account toggler */}
              <div className="mt-4 text-center text-xs text-tf-text-secondary font-normal">
                <span>Already have an account? </span>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-tf-accent font-medium hover:underline"
                >
                  Sign In
                </button>
              </div>

            </div>

          </div>
          
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
