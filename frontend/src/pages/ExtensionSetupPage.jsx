import React, { useEffect } from 'react';
import { ArrowRight, Check, FileText, LockKeyhole, LogIn, Zap, UserRoundCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ApplicationLogo } from '../components/ApplicationLogo';
import BrandLogo from '../components/BrandLogo';
import { useApp } from '../context/AppContext';
import './ExtensionSetupPage.css';

export default function ExtensionSetupPage() {
  const navigate = useNavigate();
  const { user, parsedResume, resumesList, loadingAuth, loadingResume } = useApp();
  const signedIn = Boolean(user);
  const hasResume = Boolean(parsedResume) || (Array.isArray(resumesList) && resumesList.length > 0);

  useEffect(() => {
    if (!loadingAuth && !loadingResume && signedIn && hasResume) {
      navigate('/tailor', { replace: true });
    }
  }, [signedIn, hasResume, loadingAuth, loadingResume, navigate]);

  return (
    <main className="extension-setup">
      <section className="extension-setup-card">
        <div className="extension-setup-brand"><BrandLogo size={42} /></div>
        <span className="extension-setup-kicker"><Zap size={14} /> Extension setup</span>
        <h1>Complete two steps to start tailoring.</h1>
        <p>We need a secure account and one source resume before we can review the job open in your browser.</p>

        <div className="extension-setup-steps">
          <article className={signedIn ? 'complete' : 'required'}>
            <span className="extension-step-icon">{signedIn ? <Check size={20} /> : <LockKeyhole size={20} />}</span>
            <div><small>Step 1</small><h2>{signedIn ? 'Account connected' : 'Sign in to your account'}</h2><p>{signedIn ? user?.email : 'Securely connect your tailr4u workspace.'}</p></div>
            {signedIn
              ? <span className="extension-step-status">Ready</span>
              : <button onClick={() => navigate('/login?redirect=%2Fextension-setup')}>Sign in <LogIn size={16} /></button>}
          </article>

          <article className={hasResume ? 'complete' : signedIn ? 'required' : 'locked'}>
            <span className="extension-step-icon">{hasResume ? <Check size={20} /> : <FileText size={20} />}</span>
            <div><small>Step 2</small><h2>{hasResume ? 'Resume available' : 'Add your source resume'}</h2><p>{hasResume ? 'Your resume is ready for job matching.' : 'Upload at least one resume to continue.'}</p></div>
            {hasResume
              ? <span className="extension-step-status">Ready</span>
              : signedIn
                ? <button onClick={() => navigate('/resume-detect')}>Add resume <ArrowRight size={16} /></button>
                : <span className="extension-step-locked">Sign in first</span>}
          </article>
        </div>

        <div className="extension-setup-footer">
          <UserRoundCheck size={17} />
          <span>Once both steps are ready, the extension opens JD extraction automatically.</span>
        </div>
      </section>
    </main>
  );
}
