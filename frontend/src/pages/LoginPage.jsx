import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Mail, Lock, User, ChevronRight, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';

export default function LoginPage() {
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

  const handleOAuthLogin = async (provider) => {
    if (provider === 'google') return; // Handled by components/hooks
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'local.developer@example.com', password: 'dev' })
      });
      if (!res.ok) throw new Error('Local developer login failed.');
      const data = await res.json();
      localStorage.setItem('access_token', data.session.access_token);
      window.location.href = '#/';
      window.location.reload();
    } catch (err) {
      setLoginError(err.message || `Login with ${provider} failed.`);
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white text-zinc-800 font-sans select-none overflow-hidden relative">
      
      {/* Dynamic hardware flip transitions styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .perspective-container {
          perspective: 1500px;
        }
        .flip-card-inner {
          position: relative;
          width: 100%;
          height: 640px;
          transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
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
          background: white;
          border: 1px solid #e4e4e7;
          border-radius: 24px;
          padding: 36px;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.03), 0 2px 4px -2px rgb(0 0 0 / 0.03);
          display: flex;
          flex-col: true;
          flex-direction: column;
          justify-content: center;
        }
        .flip-card-back {
          transform: rotateY(180deg);
        }
      `}} />

      {/* LEFT COLUMN: Premium Enterprise Showcase (Static left panel) */}
      <div 
        className="hidden lg:flex lg:w-[50%] border-r border-zinc-200 flex-col justify-between p-12 relative overflow-hidden shrink-0"
        style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)' }}
      >
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 opacity-5 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        
        {/* Soft background glow */}
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-[#00bda5]/5 rounded-full blur-[100px] pointer-events-none" />
        
        {/* Brand logo header */}
        <div className="flex items-center gap-2.5 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-zinc-955 text-white flex items-center justify-center font-black text-base shadow-xs">
            A
          </div>
          <span className="text-base font-black tracking-tight text-zinc-955 uppercase">
            Apply<span className="text-[#00bda5]">Flow</span>
          </span>
        </div>

        {/* Dynamic feature showcase items */}
        <div className="space-y-8 my-auto relative z-10 max-w-md select-none">
          <div className="space-y-3">
            <span className="inline-block px-3 py-1 bg-[#00bda5]/10 border border-[#00bda5]/20 text-[#00bda5] text-[9.5px] font-black uppercase tracking-widest rounded-full">
              Enterprise Orchestration
            </span>
            <h2 className="text-3xl font-black tracking-tight text-zinc-955 leading-tight">
              Orchestrate your application pipeline with AI.
            </h2>
            <p className="text-zinc-500 font-bold uppercase tracking-wider text-[11px] leading-relaxed">
              Dynamically tailor your resumes for ATS benchmarks, monitor interviews in real time, and negotiate job offers with a modern Kanban dashboard.
            </p>
          </div>

          {/* Stepper display */}
          <div className="space-y-4 pt-5 border-t border-zinc-150">
            <div className="flex items-start gap-4">
              <div className="w-6 h-6 rounded-lg bg-[#00bda5]/15 text-[#00bda5] flex items-center justify-center text-[11.5px] font-black shrink-0 border border-[#00bda5]/20">
                1
              </div>
              <div>
                <h4 className="text-xs font-black text-zinc-955 uppercase tracking-wider leading-none">Upload Master Resume</h4>
                <p className="text-[10px] text-zinc-400 font-bold mt-1 uppercase tracking-wide">Sync your background details instantly</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-6 h-6 rounded-lg bg-zinc-100 text-zinc-800 flex items-center justify-center text-[11.5px] font-black shrink-0 border border-zinc-200">
                2
              </div>
              <div>
                <h4 className="text-xs font-black text-zinc-955 uppercase tracking-wider leading-none">AI Tailoring Scan</h4>
                <p className="text-[10px] text-zinc-400 font-bold mt-1 uppercase tracking-wide">Generate optimized keyword alignments for JD benchmarks</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-6 h-6 rounded-lg bg-zinc-100 text-zinc-800 flex items-center justify-center text-[11.5px] font-black shrink-0 border border-zinc-200">
                3
              </div>
              <div>
                <h4 className="text-xs font-black text-zinc-955 uppercase tracking-wider leading-none">Active Pipeline Board</h4>
                <p className="text-[10px] text-zinc-400 font-bold mt-1 uppercase tracking-wide">Drag, drop, log status and track offer transitions</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info copy */}
        <div className="text-[9.5px] text-zinc-405 font-extrabold uppercase tracking-widest relative z-10">
          © {new Date().getFullYear()} ApplyFlow AI Corp. All rights reserved.
        </div>
      </div>

      {/* RIGHT COLUMN: The Form Workspace (With Perspective Flip Card) */}
      <div 
        className="w-full lg:w-[50%] flex items-center justify-center p-6 sm:p-12 relative z-10 min-h-screen"
        style={{ background: 'radial-gradient(circle at center, #ffffff 0%, #f1f5f9 100%)' }}
      >
        <div className="w-full max-w-md perspective-container">
          
          <div className={`flip-card-inner ${isFlipped ? 'flipped' : ''}`}>
            
            {/* FRONT SIDE CARD: Login Workspace */}
            <div className="flip-card-front">
              
              <div className="text-center mb-6 select-none">
                {/* Mobile-only brand logo header */}
                <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-zinc-955 text-white flex items-center justify-center font-black text-sm">
                    A
                  </div>
                  <span className="text-sm font-black tracking-tight text-zinc-955 uppercase">
                    Apply<span className="text-[#00bda5]">Flow</span>
                  </span>
                </div>
                <h1 className="text-2xl font-black text-zinc-955 tracking-tight uppercase">Welcome Back</h1>
                <p className="text-zinc-500 text-xs mt-1 font-medium">Tailor your resumes instantly with AI</p>
              </div>

              {loginError && (
                <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-650 text-xs font-bold select-text flex items-center gap-2 animate-fadeIn">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {loginSuccess && (
                <div className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-655 text-xs font-bold select-text flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{loginSuccess}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4 text-left">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black text-zinc-700 uppercase tracking-wider">Email Address</label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-2xl text-zinc-900 placeholder-zinc-400 text-sm focus:outline-hidden focus:border-zinc-955 transition-colors font-semibold"
                  />
                </div>

                {!isMagicLink && (
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-zinc-700 uppercase tracking-wider">Password</label>
                    <div className="relative">
                      <input
                        type={showLoginPassword ? "text" : "password"}
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-4 pr-12 py-3 bg-white border border-zinc-200 rounded-2xl text-zinc-900 placeholder-zinc-400 text-sm focus:outline-hidden focus:border-zinc-955 transition-colors font-semibold"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-450 hover:text-zinc-650 transition-colors border-none bg-transparent cursor-pointer"
                      >
                        {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full py-3 bg-zinc-950 hover:bg-zinc-900 text-white font-extrabold rounded-2xl text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer border-none shadow-xs mt-4 disabled:opacity-50"
                >
                  {loginLoading ? 'Processing...' : (isMagicLink ? 'Send Magic Link' : 'Sign In')}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </form>

              {/* Divider continue with */}
              <div className="relative my-6 text-center select-none">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-150" /></div>
                <span className="relative bg-white px-3 text-[9px] font-black text-zinc-405 uppercase tracking-widest">Or continue with</span>
              </div>

              {/* Social OAuth Buttons */}
              <div className="flex justify-center mt-2">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setLoginError('Google login failed.')}
                  useOneTap
                  shape="rectangular"
                  text="continue_with"
                />
              </div>

              {/* Action Link Footer */}
              <div className="mt-6 text-center flex flex-col gap-2 select-none text-xs text-zinc-555 font-semibold">
                <span className="text-zinc-400 font-medium">
                  Don't have an account?{' '}
                  <button 
                    onClick={() => navigate('/register')}
                    className="text-zinc-955 hover:text-zinc-800 font-bold transition-colors border-none bg-transparent cursor-pointer ml-1"
                  >
                    Sign Up
                  </button>
                </span>
              </div>

            </div>

            {/* BACK SIDE CARD: Register Workspace */}
            <div className="flip-card-back">
              
              <div className="text-center mb-4 select-none">
                {/* Mobile brand header block */}
                <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
                  <div className="w-9 h-9 rounded-xl bg-zinc-955 text-white flex items-center justify-center font-black text-sm">
                    A
                  </div>
                  <span className="text-sm font-black tracking-tight text-zinc-955 uppercase">
                    Apply<span className="text-[#00bda5]">Flow</span>
                  </span>
                </div>
                <h1 className="text-2xl font-black text-zinc-955 tracking-tight uppercase">Create Account</h1>
                <p className="text-zinc-500 text-xs mt-1 font-medium">Get started tailoring your resumes with AI</p>
              </div>

              {regError && (
                <div className="mb-3 p-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-655 text-xs font-bold select-text flex items-center gap-2 animate-fadeIn">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{regError}</span>
                </div>
              )}

              {regSuccess && (
                <div className="mb-3 p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-650 text-xs font-bold select-text flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 size={14} className="shrink-0" />
                  <span>{regSuccess}</span>
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-2.5 text-left">
                <div className="space-y-0.5">
                  <label className="block text-[9.5px] font-black text-zinc-705 uppercase tracking-wider">Full Name</label>
                  <input
                    type="text"
                    required
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-2xl text-zinc-900 placeholder-zinc-400 text-xs font-semibold focus:outline-hidden focus:border-zinc-950 transition-colors font-semibold"
                  />
                </div>

                <div className="space-y-0.5">
                  <label className="block text-[9.5px] font-black text-zinc-705 uppercase tracking-wider">Email Address</label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-2.5 bg-white border border-zinc-200 rounded-2xl text-zinc-900 placeholder-zinc-400 text-xs font-semibold focus:outline-hidden focus:border-zinc-955 transition-colors font-semibold"
                  />
                </div>

                <div className="space-y-0.5">
                  <label className="block text-[9.5px] font-black text-zinc-705 uppercase tracking-wider">Password</label>
                  <div className="relative">
                    <input
                      type={showRegPassword ? "text" : "password"}
                      required
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-4 pr-12 py-2.5 bg-white border border-zinc-200 rounded-2xl text-zinc-900 placeholder-zinc-400 text-xs font-semibold focus:outline-hidden focus:border-zinc-955 transition-colors font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-650 transition-colors border-none bg-transparent cursor-pointer"
                    >
                      {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <label className="block text-[9.5px] font-black text-zinc-705 uppercase tracking-wider">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showRegConfirmPassword ? "text" : "password"}
                      required
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-4 pr-12 py-2.5 bg-white border border-zinc-200 rounded-2xl text-zinc-900 placeholder-zinc-400 text-xs font-semibold focus:outline-hidden focus:border-zinc-955 transition-colors font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-655 transition-colors border-none bg-transparent cursor-pointer"
                    >
                      {showRegConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={regLoading}
                  className="w-full py-2.5 bg-zinc-950 hover:bg-zinc-900 text-white font-extrabold rounded-2xl text-xs transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer border-none shadow-xs mt-3.5 disabled:opacity-50"
                >
                  {regLoading ? 'Registering...' : 'Create Account'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </form>

              {/* Divider continue with */}
              <div className="relative my-4 text-center select-none">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-150" /></div>
                <span className="relative bg-white px-3 text-[9px] font-black text-zinc-405 uppercase tracking-widest">Or continue with</span>
              </div>

              {/* Social OAuth Buttons */}
              <div className="grid grid-cols-1 gap-2.5">
                <div className="flex justify-center h-[42px] overflow-hidden rounded-xl border border-zinc-200">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setRegError('Google registration failed.')}
                    shape="rectangular"
                    text="continue_with"
                  />
                </div>
              </div>

              {/* Already have account toggler */}
              <div className="mt-4 text-center text-xs text-zinc-400 font-semibold select-none">
                Already have an account?{' '}
                <button
                  onClick={() => navigate('/login')}
                  className="text-zinc-955 hover:text-zinc-850 font-bold transition-colors border-none bg-transparent cursor-pointer ml-1"
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
