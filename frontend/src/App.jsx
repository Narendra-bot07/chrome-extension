import React, { useEffect } from 'react';
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
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
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

function ProtectedRoute({ children }) {
  const { user, loadingAuth } = useApp();
  
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[#FAFAFB] dark:bg-[#0C0D10] flex flex-col items-center justify-center">
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
    return <Navigate to="/login" replace />;
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
    hasRedirectedOnStartup,
    setHasRedirectedOnStartup,
    isExtension
  } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loadingAuth && !loadingResume && !loadingPreferences && user) {
      const isExtensionLanding = isExtension && location.pathname === '/';
      const isOnboardingRoute = location.pathname === '/onboarding/job-preferences';
      const isSettingsPreferencesRoute = location.pathname === '/settings/job-preferences';

      if (!hasCompletedPreferences && !isOnboardingRoute) {
        navigate('/onboarding/job-preferences', { replace: true });
        return;
      }

      if (isExtensionLanding) {
        setHasRedirectedOnStartup(true);
        navigate(parsedResume ? '/tailor' : '/resume-detect', { replace: true });
        return;
      }

      // 1. Dynamic Route Guard: Protect /tailor route when user has no resume
      if (!parsedResume && location.pathname === '/tailor') {
        navigate('/resume-detect', { replace: true });
        return;
      }

      // 2. Startup / Login Redirection: Only run once on startup or login
      if (!hasRedirectedOnStartup) {
        if (parsedResume) {
          if (location.pathname === '/login' || location.pathname === '/register') {
            setHasRedirectedOnStartup(true);
            navigate('/tailor', { replace: true });
          }
        } else {
          if (!isSettingsPreferencesRoute && (location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/tailor')) {
            setHasRedirectedOnStartup(true);
            navigate('/resume-detect', { replace: true });
          }
        }
      }
    }
  }, [loadingAuth, loadingResume, loadingPreferences, user, hasCompletedPreferences, parsedResume, hasRedirectedOnStartup, location.pathname, navigate, setHasRedirectedOnStartup, isExtension]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tailor" element={<JobExtractPage />} />
        <Route path="/job-tracker" element={<JobTrackerPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings/security" element={<SecurityPage />} />
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
        <AppRoutes />
      </AppProvider>
    </HashRouter>
  );
}

export default App;
