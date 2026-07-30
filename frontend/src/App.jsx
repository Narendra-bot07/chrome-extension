import React, { useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';
// Page Imports
import JobExtractPage from './pages/JobExtractPage';
import ResumeDetectPage from './pages/ResumeDetectPage';
import ResumeParsePage from './pages/ResumeParsePage';
import ResumeReviewPage from './pages/ResumeReviewPage';
import TailorConfigPage from './pages/TailorConfigPage';
import TailorProgressPage from './pages/TailorProgressPage';
import ReviewChangesPage from './pages/ReviewChangesPage';
import TemplatesPage from './pages/TemplatesPage';
import DownloadPage from './pages/DownloadPage';
import CoverLetterPage from './pages/CoverLetterPage';
import PrintLayout from './components/Resume/PrintLayout';
import PrintCoverLetterLayout from './pages/PrintCoverLetterLayout';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import SecurityPage from './pages/SecurityPage';
import JobTrackerPage from './pages/JobTrackerPage';
import HelpSearchPage from './pages/HelpSearchPage';
import FAQPage from './pages/FAQPage';
import ContactSupportPage from './pages/ContactSupportPage';
import NoJobDetectedPage from './pages/NoJobDetectedPage';
import ManualJobEntryPage from './pages/ManualJobEntryPage';
import SubscriptionPage from './pages/SubscriptionPage';
import JobPreferencesPage from './pages/JobPreferencesPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import EmailSentPage from './pages/EmailSentPage';
import NotificationSettingsPage from './pages/NotificationSettingsPage';
import LandingPage from './pages/LandingPage';
import ExtensionSetupPage from './pages/ExtensionSetupPage';
import { ReducedMotionProvider, MotionPage } from './motion/MotionSystem';
import { loginPathFor } from './utils/authRedirect';
import GlobalCursor from './components/GlobalCursor';

function ProtectedRoute({ children }) {
  const { user, loadingAuth, parsedResume, resumesList, loadingResume } = useApp();
  const location = useLocation();
  const isExtension = (typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id)) || window.location.protocol === 'chrome-extension:';
  const hasAnyResume = Boolean(parsedResume) || (Array.isArray(resumesList) && resumesList.length > 0);
  
  if (loadingAuth || (isExtension && loadingResume)) {
    return (
      <div className="min-h-screen bg-[#FAFAFB] dark:bg-[#15171c] text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center transition-colors">
        <div className="w-72 space-y-3" role="status" aria-label="Verifying your session">
          <div className="h-8 w-32 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          <div className="h-3 w-full rounded bg-zinc-100 dark:bg-zinc-900 animate-pulse" />
          <div className="h-3 w-4/5 rounded bg-zinc-100 dark:bg-zinc-900 animate-pulse" />
          <span className="sr-only">Verifying session</span>
        </div>
      </div>
    );
  }
  
  if (!user) {
    if (isExtension) {
      return <Navigate to="/extension-setup" replace />;
    }
    const requested = `${location.pathname}${location.search || ''}`;
    return <Navigate to={loginPathFor(requested)} replace />;
  }

  if (isExtension && !hasAnyResume) {
    const isResumeUploadRoute = ['/resume-detect', '/resume-parse', '/resume-review'].includes(location.pathname);
    if (!isResumeUploadRoute) {
      return <Navigate to="/extension-setup" replace />;
    }
  }
  
  return children;
}

function StartupLoader() {
  return (
    <div className="min-h-screen bg-[#edf7ff] dark:bg-[#0b1220] text-zinc-900 dark:text-white flex items-center justify-center">
      <div className="w-72 text-center" role="status" aria-live="polite" aria-label="Restoring your tailr4u session">
        <div className="mx-auto mb-5 h-14 w-14 overflow-hidden rounded-2xl bg-white/80 p-2 shadow-lg dark:bg-white/10">
          <img src={`${import.meta.env.BASE_URL || '/'}application-logo.png`} alt="" className="h-full w-full object-contain" />
        </div>
        <div className="text-xl font-black tracking-tight">Tailr4U</div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-blue-950/10 dark:bg-white/10">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-blue-500 to-teal-400 motion-safe:animate-pulse" />
        </div>
        <p className="mt-3 font-mono text-[9px] font-bold uppercase tracking-[.18em] text-zinc-500 dark:text-zinc-400">
          Restoring session
        </p>
      </div>
    </div>
  );
}

function AppRoutes() {
  const {
    user,
    loadingAuth,
    loadingResume,
    loadingPreferences,
    hasCompletedPreferences,
    parsedResume,
    resumesList,
    hasRedirectedOnStartup,
    setHasRedirectedOnStartup
  } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const isExtension = (typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id)) || window.location.protocol === 'chrome-extension:';
  const hasAnyResume = Boolean(parsedResume) || (Array.isArray(resumesList) && resumesList.length > 0);

  useEffect(() => {
    if (loadingAuth || loadingResume) return;

    if (isExtension) {
      const isAuthRoute = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/email-sent'].includes(location.pathname);
      const isResumeUploadRoute = ['/resume-detect', '/resume-parse', '/resume-review'].includes(location.pathname);
      const isSetupRoute = location.pathname === '/extension-setup';
      const isSetupComplete = Boolean(user && hasAnyResume);

      if (!isSetupComplete) {
        if (!isAuthRoute && !isResumeUploadRoute && !isSetupRoute) {
          navigate('/extension-setup', { replace: true });
        }
      } else {
        if (location.pathname === '/' || location.pathname === '/extension-setup') {
          navigate('/tailor', { replace: true });
        }
      }
    } else {
      if (!loadingPreferences && user) {
        const isOnboardingRoute = location.pathname === '/onboarding/job-preferences';
        const isPublicOrAuthRoute = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/email-sent'].includes(location.pathname);

        if (!hasCompletedPreferences && !isOnboardingRoute && !isPublicOrAuthRoute) {
          navigate('/onboarding/job-preferences', { replace: true });
          return;
        }

        if (!parsedResume && location.pathname === '/tailor') {
          navigate('/resume-detect', { replace: true });
          return;
        }

        if (!hasRedirectedOnStartup && !isPublicOrAuthRoute) setHasRedirectedOnStartup(true);
      }
    }
  }, [
    isExtension,
    user,
    hasAnyResume,
    loadingAuth,
    loadingResume,
    loadingPreferences,
    hasCompletedPreferences,
    parsedResume,
    hasRedirectedOnStartup,
    location.pathname,
    navigate,
    setHasRedirectedOnStartup
  ]);

  if (loadingAuth || (isExtension && loadingResume)) return <StartupLoader />;

  return (
    <Routes>
      <Route element={<MotionPage><LandingPage /></MotionPage>}>
        <Route path="/" element={null} />
        <Route path="/login" element={null} />
        <Route path="/register" element={null} />
        <Route path="/email-sent" element={null} />
      </Route>
      <Route path="/forgot-password" element={<MotionPage><ForgotPasswordPage /></MotionPage>} />
      <Route path="/reset-password" element={<MotionPage><ResetPasswordPage /></MotionPage>} />
      <Route path="/verify-email" element={<MotionPage><VerifyEmailPage /></MotionPage>} />
      <Route path="/extension-setup" element={<MotionPage><ExtensionSetupPage /></MotionPage>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tailor" element={<JobExtractPage />} />
        <Route path="/job-tracker" element={<JobTrackerPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings/security" element={<SecurityPage />} />
        <Route path="/settings/notifications" element={<NotificationSettingsPage />} />
        <Route path="/security" element={<Navigate to="/settings/security" replace />} />
        <Route path="/resume-detect" element={<ResumeDetectPage />} />
        <Route path="/resume-parse" element={<ResumeParsePage />} />
        <Route path="/resume-review" element={<ResumeReviewPage />} />
        <Route path="/tailor-config" element={<TailorConfigPage />} />
        <Route path="/tailor-progress" element={<TailorProgressPage />} />
        <Route path="/review-changes" element={<ReviewChangesPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/download" element={<DownloadPage />} />
        <Route path="/cover-letter" element={<CoverLetterPage />} />
        <Route path="/support/search" element={<HelpSearchPage />} />
        <Route path="/support/faq" element={<FAQPage />} />
        <Route path="/support/contact" element={<ContactSupportPage />} />
        <Route path="/no-job-detected" element={<NoJobDetectedPage />} />
        <Route path="/manual-job-entry" element={<ManualJobEntryPage />} />
        <Route path="/subscription" element={<SubscriptionPage />} />
        <Route path="/onboarding/job-preferences" element={<JobPreferencesPage />} />
        <Route path="/settings/job-preferences" element={<JobPreferencesPage />} />
      </Route>
      <Route path="/print" element={<PrintLayout />} />
      <Route path="/print-cover-letter" element={<PrintCoverLetterLayout />} />
    </Routes>
  );
}

function App() {
  return (
    <HashRouter>
      <AppProvider>
        <ReducedMotionProvider>
          <GlobalCursor />
          <AppRoutes />
        </ReducedMotionProvider>
      </AppProvider>
    </HashRouter>
  );
}

export default App;
