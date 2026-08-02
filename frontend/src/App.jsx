import React, { useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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
import BrandLogo from './components/BrandLogo';

function StartupLoader({ label = "Restoring session" }) {
  return (
    <div className="min-h-screen w-full bg-[#f6f9fc] dark:bg-[#0b0e14] text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-300 select-none">
      {/* Ambient Glows */}
      <div className="absolute w-96 h-96 bg-[#00bda5]/15 rounded-full blur-3xl -top-20 -left-20 pointer-events-none animate-pulse" />
      <div className="absolute w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -bottom-20 -right-20 pointer-events-none animate-pulse" />

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-xs text-center flex flex-col items-center relative z-10"
        role="status"
        aria-live="polite"
        aria-label={label}
      >
        {/* Official Brand Logo */}
        <div className="relative mb-5">
          <motion.div
            animate={{ scale: [1, 1.12, 1], opacity: [0.3, 0.75, 0.3] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -inset-3 bg-gradient-to-r from-[#00bda5] via-blue-500 to-orange-500 rounded-3xl blur-md opacity-40"
          />
          <div className="relative p-2 rounded-2xl bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800 shadow-xl">
            <BrandLogo size={48} />
          </div>
        </div>

        {/* Animated Shimmer Progress Track */}
        <div className="w-56 mt-5 h-1.5 bg-zinc-200/80 dark:bg-zinc-800/80 rounded-full overflow-hidden relative shadow-inner">
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{
              repeat: Infinity,
              duration: 1.3,
              ease: "easeInOut"
            }}
            className="h-full w-1/2 bg-gradient-to-r from-transparent via-[#00bda5] to-transparent rounded-full shadow-[0_0_12px_#00bda5]"
          />
        </div>

        {/* Status Label */}
        <div className="mt-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00bda5] animate-ping" />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
            {label}
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loadingAuth, parsedResume, resumesList, loadingResume } = useApp();
  const location = useLocation();
  const isExtension = (typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id)) || window.location.protocol === 'chrome-extension:';
  const hasAnyResume = Boolean(parsedResume) || (Array.isArray(resumesList) && resumesList.length > 0);
  
  if (loadingAuth || (isExtension && loadingResume)) {
    return <StartupLoader label="Verifying session" />;
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
      if (user) {
        if (!hasAnyResume && location.pathname === '/tailor') {
          navigate('/resumes', { replace: true });
          return;
        }
        if (!hasRedirectedOnStartup) setHasRedirectedOnStartup(true);
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
