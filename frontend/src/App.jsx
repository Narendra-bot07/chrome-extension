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
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import JobTrackerPage from './pages/JobTrackerPage';

function ProtectedRoute({ children }) {
  const { user, loadingAuth } = useApp();
  
  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-slate-400 text-sm font-medium">Verifying Session...</span>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

function AppRoutes() {
  const { user, loadingAuth, loadingResume, parsedResume, hasRedirectedOnStartup, setHasRedirectedOnStartup } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loadingAuth && !loadingResume && user) {
      // 1. Dynamic Route Guard: Protect /tailor route when user has no resume
      if (!parsedResume && location.pathname === '/tailor') {
        navigate('/', { replace: true });
        return;
      }

      // 2. Startup / Login Redirection: Only run once on startup or login
      if (!hasRedirectedOnStartup) {
        if (parsedResume) {
          if (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/register') {
            setHasRedirectedOnStartup(true);
            navigate('/tailor', { replace: true });
          }
        } else {
          if (location.pathname === '/login' || location.pathname === '/register' || location.pathname === '/tailor') {
            setHasRedirectedOnStartup(true);
            navigate('/', { replace: true });
          }
        }
      }
    }
  }, [loadingAuth, loadingResume, user, parsedResume, hasRedirectedOnStartup, location.pathname, navigate, setHasRedirectedOnStartup]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/tailor" element={<JobExtractPage />} />
        <Route path="/job-tracker" element={<JobTrackerPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/resume-detect" element={<ResumeDetectPage />} />
        <Route path="/resume-parse" element={<ResumeParsePage />} />
        <Route path="/resume-review" element={<ResumeReviewPage />} />
        <Route path="/tailor-config" element={<TailorConfigPage />} />
        <Route path="/tailor-progress" element={<TailorProgressPage />} />
        <Route path="/review-changes" element={<ReviewChangesPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/download" element={<DownloadPage />} />
        <Route path="/cover-letter" element={<CoverLetterPage />} />
      </Route>
      <Route path="/print" element={<PrintLayout />} />
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
