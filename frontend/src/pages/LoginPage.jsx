import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, LogIn, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isMagicLink, setIsMagicLink] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  
  const navigate = useNavigate();

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
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
      setErrorMsg(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Direct local developer bypass login for convenience
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
      setErrorMsg(err.message || `Login with ${provider} failed.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6 relative overflow-hidden">
      {/* Visual background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-zinc-200 dark:bg-zinc-800/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-zinc-200 dark:bg-zinc-800/20 rounded-full blur-[120px]" />

      <div className="w-full max-w-md bg-white dark:bg-zinc-900/60 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm dark:shadow-2xl relative z-10 transition-all duration-300">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 font-bold text-xl shadow-sm mb-4">
            A
          </div>
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight">Welcome Back</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">Tailor your resumes instantly with AI</p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 text-sm">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <Label>Email Address</Label>
            <Input
              icon={Mail}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="py-3.5 h-auto"
            />
          </div>

          {!isMagicLink && (
            <div>
              <Label>Password</Label>
              <div className="relative">
                <Input
                  icon={Lock}
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="py-3.5 h-auto pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <Button
            type="submit"
            isLoading={loading}
            variant="primary"
            className="w-full py-3.5 h-auto mt-2"
          >
            {!loading && (
              <>
                {isMagicLink ? 'Send Magic Link' : 'Sign In'}
                <ChevronRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </form>

        <div className="relative my-8 text-center">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200 dark:border-zinc-800" /></div>
          <span className="relative bg-white dark:bg-zinc-900 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Or continue with</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOAuthLogin('google')}
            className="py-3"
          >
            Google
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOAuthLogin('github')}
            className="py-3"
          >
            GitHub
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOAuthLogin('azure')}
            className="py-3"
          >
            Microsoft
          </Button>
        </div>

        <div className="mt-8 text-center flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setIsMagicLink(!isMagicLink)}
            className="text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-300 font-medium transition-colors"
          >
            {isMagicLink ? 'Sign in with Password instead' : 'Request a Magic Link'}
          </button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
            Don't have an account?{' '}
            <Link to="/register" className="text-zinc-900 hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-300 font-semibold transition-colors">
              Sign Up
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
