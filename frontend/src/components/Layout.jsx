import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  Settings, Sun, Moon, AlertCircle, X, Menu, 
  LayoutDashboard, FileText, Briefcase, User, 
  HelpCircle, ExternalLink, LogOut, ChevronDown, Zap
} from 'lucide-react';
import { Button } from './ui/Button';
import SettingsOverlay from './SettingsOverlay';
import InvalidJdWarningModal from './InvalidJdWarningModal';

function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const {
    darkMode, toggleDarkMode,
    showSettings, setShowSettings,
    apiUrl, setApiUrl,
    apiKey, setApiKey,
    parsedResume, setParsedResume,
    jobAnalysis, setJobAnalysis,
    apiError, setApiError,
    jobText, setJobText,
    logout,
    isExtension,
    user,
    session,
    pendingApplicationSubmitted,
    setPendingApplicationSubmitted,
    activeApplicationId,
    updateApplicationStage,
    applications
  } = useApp();

  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    subscription_plan: 'Free',
    credits_remaining: 5,
    resume_count: 0
  });

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768 && !isExtension;
    }
    return true;
  });

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch('http://localhost:8000/api/v1/profile/', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        }
      } catch (err) {
        console.error("Failed to load layout profile:", err);
      }
    };
    fetchProfileData();
  }, [currentPath]);

  const isInvalidJdError = apiError && (
    apiError.toLowerCase().includes("invalid input") ||
    apiError.toLowerCase().includes("job requirements") ||
    apiError.toLowerCase().includes("recruitment-related") ||
    apiError.toLowerCase().includes("not appear to contain")
  );

  const getHeaderTitle = () => {
    switch (currentPath) {
      case '/': return 'Dashboard';
      case '/tailor': return 'Extract Job Details';
      case '/job-tracker': return 'Job Tracker';
      case '/profile': return 'Account Settings';
      case '/resume-detect': return 'Resume Source';
      case '/resume-parse': return 'Parsing Resume';
      case '/resume-review': return 'Verify Resume Data';
      case '/tailor-config': return 'Configure Tailoring';
      case '/tailor-progress': return 'AI Tailoring';
      case '/review-changes': return 'Review AI Changes';
      case '/templates': return 'Choose Style Layout';
      case '/download': return 'Tailoring Complete';
      case '/cover-letter': return 'Draft Cover Letter';
      default: return 'ApplyFlow';
    }
  };



  return (
    <div className={`w-full h-screen flex overflow-hidden font-sans select-none transition-all duration-300 bg-grid-pattern ${
      darkMode ? 'dark bg-[#0a0a0a] text-zinc-50' : 'bg-zinc-50 text-zinc-900'
    }`}>
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 1. PREMIUM SIDEBAR */}
      <div className={`transition-all duration-300 ease-in-out z-40 absolute md:relative h-full flex-shrink-0 overflow-hidden ${
        sidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full md:translate-x-0'
      }`}>
        <aside className={`w-64 h-full border-r flex flex-col justify-between ${
          darkMode 
            ? 'bg-[#09090b] border-zinc-850' 
            : 'bg-white border-zinc-150'
        }`}>
        
        <div className="flex flex-col gap-6 p-6">
          {/* Logo Header */}
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-black text-sm">
                AF
              </div>
              <span className={`text-lg font-black tracking-tight ${darkMode ? 'text-white' : 'text-slate-905'}`}>
                Apply<span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Flow</span>
              </span>
            </Link>
            <button 
              className="md:hidden text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={16} />
            </button>
          </div>

          {/* Nav Items */}
          <nav className="flex flex-col gap-1">
            <Link 
              to="/" 
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                currentPath === '/' 
                  ? darkMode ? 'bg-zinc-900 text-zinc-50' : 'bg-zinc-100 text-zinc-950'
                  : darkMode ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-950' : 'text-zinc-650 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <LayoutDashboard size={16} />
              Dashboard
            </Link>
            <Link 
              to="/resume-detect" 
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                currentPath.startsWith('/resume-') 
                  ? darkMode ? 'bg-zinc-900 text-zinc-50' : 'bg-zinc-100 text-zinc-950'
                  : darkMode ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-950' : 'text-zinc-650 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <FileText size={16} />
              Resumes
            </Link>
            <Link 
              to="/job-tracker" 
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                currentPath === '/job-tracker' 
                  ? darkMode ? 'bg-zinc-900 text-zinc-50' : 'bg-zinc-100 text-zinc-950'
                  : darkMode ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-950' : 'text-zinc-650 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <Briefcase size={16} />
              Job Tracker
            </Link>
            <Link 
              to="/profile" 
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                currentPath === '/profile' 
                  ? darkMode ? 'bg-zinc-900 text-zinc-50' : 'bg-zinc-100 text-zinc-950'
                  : darkMode ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-950' : 'text-zinc-650 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
            >
              <User size={16} />
              Account
            </Link>
          </nav>
        </div>

        {/* Plan Overview Card */}
        <div className="p-6">
          <div className={`border rounded-xl p-4 flex flex-col gap-3 transition-colors ${
            darkMode ? 'bg-zinc-950 border-zinc-850' : 'bg-zinc-50 border-zinc-200/60'
          }`}>
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[8px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">CURRENT PLAN</span>
                <p className={`text-[11px] font-black mt-0.5 ${darkMode ? 'text-white' : 'text-zinc-800'}`}>
                  {profile.subscription_plan} Plan
                </p>
              </div>
              <Zap className="w-3.5 h-3.5 text-[#00bda5]" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                <span>Job extractions</span>
                <span className={darkMode ? 'text-white' : 'text-zinc-800'}>{profile.resume_count}/6</span>
              </div>
              <div className={`w-full h-1 rounded-full overflow-hidden ${darkMode ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
                <div 
                  className="bg-[#00bda5] h-full transition-all duration-300"
                  style={{ width: `${(profile.resume_count / 6) * 100}%` }}
                />
              </div>
            </div>
            <Link 
              to="/profile"
              className="mt-1"
            >
              <Button variant="outline" size="sm" className="w-full text-xs py-1.5 font-bold rounded-lg border-zinc-200 dark:border-zinc-800">
                Upgrade Account
              </Button>
            </Link>
          </div>
        </div>

      </aside>
      </div>

      {/* 2. MAIN PANEL */}
      <div className="flex-1 flex flex-col justify-between overflow-hidden relative">
        
        {/* TOP NAV */}
        <header className={`px-6 py-4 border-b flex justify-between items-center z-20 flex-shrink-0 transition-colors duration-200 ${
          darkMode ? 'bg-[#0a0a0a]/90 border-zinc-800/80 backdrop-blur-xl' : 'bg-white border-zinc-200 shadow-sm'
        }`}>
          <div className="flex items-center gap-3">
            <button 
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu size={20} />
            </button>
            <span className={`text-md font-bold tracking-tight ${darkMode ? 'text-white' : 'text-zinc-900'}`}>{getHeaderTitle()}</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden md:inline text-xs text-zinc-500 font-semibold cursor-pointer hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">How it works</span>
            <span className="hidden md:inline text-xs text-zinc-500 font-semibold cursor-pointer hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">Upgrade</span>

            {/* Discord support */}
            <Button variant="outline" size="sm" className="hidden sm:inline-flex">
              Need Help?
            </Button>

            {/* Theme / settings */}
            <button 
              className={`p-2 rounded-lg border transition-colors ${
                darkMode ? 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-white hover:bg-zinc-800' : 'border-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
              onClick={toggleDarkMode}
            >
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button 
              className={`p-2 rounded-lg border transition-colors ${
                darkMode ? 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:text-white hover:bg-zinc-800' : 'border-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50'
              }`}
              onClick={() => setShowSettings(true)}
            >
              <Settings size={14} />
            </button>

            {/* Profile Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className={`flex items-center justify-center w-9 h-9 rounded-full border-2 transition-all focus:outline-none ${
                  darkMode ? 'border-slate-700 hover:border-slate-500' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="w-full h-full rounded-full bg-black text-white flex items-center justify-center font-extrabold text-sm overflow-hidden">
                  {profile.full_name ? profile.full_name.charAt(0).toUpperCase() : 'N'}
                </div>
              </button>

              {dropdownOpen && (
                <div className={`absolute right-0 mt-2 w-72 rounded-2xl shadow-xl border animate-fadeIn z-40 overflow-hidden ${
                  darkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-800'
                }`}>
                  <div className="flex items-center gap-3 p-4">
                    <div className="w-9 h-9 flex-shrink-0 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-extrabold text-sm">
                      {profile.full_name ? profile.full_name.charAt(0).toUpperCase() : 'N'}
                    </div>
                    <div className="flex flex-col">
                      <p className={`text-[14px] font-medium leading-tight ${darkMode ? 'text-white' : 'text-zinc-900'}`}>
                        {profile.full_name || user?.full_name || 'Narendra'}
                      </p>
                      <p className={`text-[13px] mt-0.5 truncate w-48 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {profile.email || user?.email || 'bandinarendra3333@gmail.com'}
                      </p>
                    </div>
                  </div>
                  
                  <div className={`border-t ${darkMode ? 'border-zinc-800' : 'border-zinc-100'}`} />

                  <button 
                    onClick={logout}
                    className={`flex items-center gap-3 w-full px-4 py-3.5 text-[14px] transition-colors ${
                      darkMode ? 'text-zinc-300 hover:bg-zinc-800/50' : 'text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    <LogOut size={16} className={darkMode ? 'text-zinc-400' : 'text-zinc-500'} />
                    Sign out
                  </button>

                  <div className={`border-t flex justify-center items-center py-2.5 ${
                    darkMode ? 'border-zinc-800 bg-zinc-950/50' : 'border-zinc-100 bg-zinc-50'
                  }`}>
                    <p className={`flex items-center gap-1.5 text-[11.5px] font-medium ${
                      darkMode ? 'text-zinc-500' : 'text-zinc-500'
                    }`}>
                      Secured by 
                      <span className="font-bold flex items-center gap-1 text-[12px] tracking-tight text-zinc-700 dark:text-zinc-400">
                        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                        clerk
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* APPLICATION SUBMISSION CONFIRMATION TOAST */}
        {pendingApplicationSubmitted && (
          <div className="px-6 py-4 bg-emerald-50 dark:bg-emerald-950/20 border-b border-emerald-200/50 text-emerald-850 dark:text-emerald-400 text-xs flex justify-between items-center gap-3 flex-shrink-0 animate-fadeIn select-none">
            <div className="flex items-center gap-2.5">
              <Zap size={14} className="text-[#00bda5] animate-pulse" />
              <p className="font-semibold text-zinc-700 dark:text-zinc-300">
                It looks like you completed this application at <span className="font-black underline">{pendingApplicationSubmitted.company}</span>. Mark as Applied?
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={async () => {
                  if (activeApplicationId) {
                    await updateApplicationStage(activeApplicationId, 'Applied');
                  } else {
                    const match = applications.find(
                      a => a.company_name?.toLowerCase() === pendingApplicationSubmitted.company?.toLowerCase()
                    );
                    if (match) {
                      await updateApplicationStage(match.id, 'Applied');
                    }
                  }
                  setPendingApplicationSubmitted(null);
                }}
                className="bg-[#00bda5] hover:bg-[#00a894] text-white font-extrabold px-3 py-1.5 rounded-lg border-none cursor-pointer transition uppercase text-[9px] tracking-wider shadow-sm"
              >
                Mark as Applied
              </button>
              <button
                onClick={() => setPendingApplicationSubmitted(null)}
                className="bg-transparent hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 p-1.5 rounded-lg border-none cursor-pointer transition flex items-center justify-center"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ERROR TOAST */}
        {apiError && !isInvalidJdError && (
          <div className="px-6 py-3 bg-rose-50 border-b border-rose-200/50 text-rose-800 text-xs flex justify-between items-start gap-2 flex-shrink-0 animate-fadeIn">
            <div className="flex gap-2">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <p className="leading-tight">{apiError}</p>
            </div>
            <button onClick={() => setApiError(null)} className="text-rose-600 hover:text-rose-800">
              <X size={14} />
            </button>
          </div>
        )}

        {/* INVALID JD WARNING MODAL */}
        <InvalidJdWarningModal 
          isOpen={isInvalidJdError}
          onClose={() => setApiError(null)}
          onPasteManually={() => {
            setJobText("");
            setApiError(null);
          }}
        />

        {/* VIEW OUTLET */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col scrollbar-thin">
          <Outlet />
        </div>

        {/* FOOTER WIZARD STEPS */}
        <footer className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-white dark:bg-zinc-950/20 flex-shrink-0">
          <span className="text-[9px] text-zinc-500 dark:text-zinc-500 font-bold uppercase tracking-widest">
            {currentPath === '/' && "Step: Dashboard Overview"}
            {currentPath === '/job-tracker' && "Step: Job Tracking Overview"}
            {currentPath === '/tailor' && "Step 1: Extract Job Description"}
            {currentPath === '/resume-detect' && "Step 2: Resume Source"}
            {currentPath === '/resume-parse' && "Step 3: Parsing Resume"}
            {currentPath === '/resume-review' && "Step 4: Verify Resume Data"}
            {currentPath === '/tailor-config' && "Step 5: Configure Tailoring"}
            {currentPath === '/tailor-progress' && "Step 6: AI Tailoring"}
            {currentPath === '/review-changes' && "Step 7: Review AI Changes"}
            {currentPath === '/templates' && "Step 8: Choose Style Layout"}
            {currentPath === '/download' && "Step 9: Tailoring Complete"}
            {currentPath === '/cover-letter' && "Draft: Cover Letter"}
          </span>
        </footer>

        {/* SETTINGS OVERLAY */}
        {showSettings && (
          <SettingsOverlay
            apiUrl={apiUrl}
            setApiUrl={setApiUrl}
            apiKey={apiKey}
            setApiKey={setApiKey}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>

    </div>
  );
}

export default Layout;
