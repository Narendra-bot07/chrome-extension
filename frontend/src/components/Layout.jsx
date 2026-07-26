import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  Settings, Sun, Moon, AlertCircle, X, Menu, 
  LayoutDashboard, FileText, Briefcase, User, 
  LogOut, Zap, Target, Search, HelpCircle, Bell, ChevronDown, Shield
} from 'lucide-react';

import { Button } from './ui/Button';
import SettingsOverlay from './SettingsOverlay';
import InvalidJdWarningModal from './InvalidJdWarningModal';
import HowItWorksModal from './modals/HowItWorksModal';
import FeedbackModal from './modals/FeedbackModal';
import SupportModal from './modals/SupportModal';
import { FlowStepper } from './FlowStepper';
import { classifyBrowserPageUrl } from '../services/jdExtractionFlow';
import { InteractiveAuroraBackground } from './layout/InteractiveAuroraBackground';
import { FlowParticleBackground } from './layout/FlowParticleBackground';



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
    applications,
    subscription,
    usage,
    fetchSubscription,
    handleScanPage,
    jobDetectionStatus,
    loadingAuth,
    loadingResume,
    loadingPreferences
  } = useApp();

  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    subscription_plan: 'Free',
    credits_remaining: 5,
    resume_count: 0
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropupOpen, setProfileDropupOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [routeTitleOverride, setRouteTitleOverride] = useState('');
  const handleScanPageRef = useRef(handleScanPage);
  const fetchSubscriptionRef = useRef(fetchSubscription);

  useEffect(() => {
    handleScanPageRef.current = handleScanPage;
  }, [handleScanPage]);

  useEffect(() => {
    fetchSubscriptionRef.current = fetchSubscription;
  }, [fetchSubscription]);

  useEffect(() => {
    const handler = (event) => setRouteTitleOverride(event.detail?.title || '');
    window.addEventListener('applyflow:title', handler);
    return () => window.removeEventListener('applyflow:title', handler);
  }, []);

  useEffect(() => {
    setRouteTitleOverride('');
  }, [currentPath]);

  // Global active tab listener for extension side panel
  useEffect(() => {
    if (loadingAuth || loadingResume || loadingPreferences) return;
    if (isExtension && typeof chrome !== 'undefined' && chrome.tabs) {
      let lastScannedUrl = '';
      let scanTimer = null;
      let activeUrlCheckTimer = null;
      let monitoredWindowId = null;

      const triggerScanForUrl = (targetUrl) => {
        if (!targetUrl || targetUrl === lastScannedUrl) return;
        // Full extension pages belong to the current workflow session. Every
        // other active-tab type must be classified so New Tab/internal pages
        // can end stale job sessions and show an accurate recovery state.
        if (classifyBrowserPageUrl(targetUrl) === 'extension-internal') return;
        lastScannedUrl = targetUrl;
        if (scanTimer) clearTimeout(scanTimer);
        scanTimer = setTimeout(() => {
          handleScanPageRef.current();
        }, 200);
      };

      chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
        if (activeTab?.url) {
          monitoredWindowId = activeTab.windowId;
          triggerScanForUrl(activeTab.url);
        }
      });

      const handleTabUpdate = (tabId, changeInfo, tab) => {
        if (
          tab?.active
          && (monitoredWindowId === null || tab.windowId === monitoredWindowId)
          && (changeInfo.url || changeInfo.status === 'complete')
        ) {
          triggerScanForUrl(changeInfo.url || tab.url);
        }
      };

      const handleTabActivated = (activeInfo) => {
        if (monitoredWindowId !== null && activeInfo.windowId !== monitoredWindowId) return;
        chrome.tabs.get(activeInfo.tabId, (tab) => {
          if (tab?.url) {
            triggerScanForUrl(tab.url);
          }
        });
      };

      chrome.tabs.onUpdated.addListener(handleTabUpdate);
      chrome.tabs.onActivated.addListener(handleTabActivated);

      // SPA career portals can update history without a reliable completion
      // event. This is a local URL identity check only; it never calls the
      // backend unless the active HTTP(S) URL actually changed.
      activeUrlCheckTimer = setInterval(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
          if (activeTab?.url) {
            monitoredWindowId = activeTab.windowId;
            triggerScanForUrl(activeTab.url);
          }
        });
      }, 1500);

      return () => {
        if (scanTimer) clearTimeout(scanTimer);
        if (activeUrlCheckTimer) clearInterval(activeUrlCheckTimer);
        chrome.tabs.onUpdated.removeListener(handleTabUpdate);
        chrome.tabs.onActivated.removeListener(handleTabActivated);
      };
    }
  }, [isExtension, loadingAuth, loadingResume, loadingPreferences]);

  // Route Synchronization: Auto switch between /tailor and /no-job-detected based on jobDetectionStatus
  useEffect(() => {
    if (!isExtension) return;
    const recoveryStates = new Set([
      'non-job', 'non-job-page', 'uncertain', 'job-list', 'job-search', 'career-home',
      'company-page', 'profile', 'feed', 'article', 'login', 'login-required',
      'search-results', 'captcha', 'security-challenge', 'rate-limited',
      'browser-new-tab', 'manual-review', 'page-inaccessible',
      'extraction-failed', 'extraction-incomplete'
    ]);
    if (recoveryStates.has(jobDetectionStatus) && currentPath === '/tailor') {
      navigate('/no-job-detected', { replace: true });
    } else if (jobDetectionStatus === 'ready' && currentPath === '/no-job-detected') {
      navigate('/tailor', { replace: true });
    }
  }, [jobDetectionStatus, currentPath, navigate, isExtension]);

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
        await fetchSubscriptionRef.current();
      } catch (err) {
        console.error("Failed to load layout profile:", err);
      }
    };
    fetchProfileData();
  }, [currentPath, session?.access_token]);

  const isInvalidJdError = apiError && (
    apiError.toLowerCase().includes("invalid input") ||
    apiError.toLowerCase().includes("job requirements") ||
    apiError.toLowerCase().includes("recruitment-related") ||
    apiError.toLowerCase().includes("not appear to contain")
  );

  const getBreadcrumbTitle = () => {
    switch (currentPath) {
      case '/':
      case '/dashboard': return 'Dashboard';
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
      case '/subscription': return 'Subscription';
      case '/settings/security': return 'Security';
      case '/settings/job-preferences':
      case '/onboarding/job-preferences': return 'Job Preferences';
      case '/support/search': return 'Help Search';
      case '/support/faq': return 'FAQ';
      case '/support/contact': return 'Contact Support';
      case '/no-job-detected': return 'No Job Detected';
      case '/manual-job-entry': return 'Manual Job Entry';
      default: return 'TailorFlow';
    }
  };

  const jdUsage = subscription?.usage?.jd_extraction || usage?.jd_extraction;
  const jdLimit = jdUsage?.limit;
  const jdUsed = jdUsage?.used || 0;
  const jdRemaining = jdUsage?.remaining;
  const jdPercent = jdLimit ? Math.min(100, (jdUsed / jdLimit) * 100) : 0;

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/resume-detect', label: 'Resumes', icon: FileText },
    { path: '/job-tracker', label: 'Job Tracker', icon: Briefcase },
    { path: '/settings/job-preferences', label: 'Job Preferences', icon: Target },
  ];

  return (
    <div className={`w-full h-screen flex overflow-hidden font-sans bg-tf-bg text-tf-text relative ${darkMode ? 'dark' : ''}`}>
      {/* Global Interactive Ambient Aurora & Data Flow Backgrounds */}
      <InteractiveAuroraBackground />
      <FlowParticleBackground />

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-[#0A0B0D]/50 z-30 md:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 1. OPTIONAL MOBILE SLIDE-OVER SIDEBAR */}
      <aside 
        className={`transition-all duration-200 ease-enter z-40 fixed inset-y-0 left-0 h-full border-r border-tf-border bg-tf-surface flex flex-col justify-between ${
          sidebarOpen ? 'w-[240px] translate-x-0 shadow-2xl' : 'w-0 -translate-x-full pointer-events-none hidden'
        }`}
      >
        <div className="flex flex-col gap-5 p-3">
          {/* Logo Header */}
          <div className="h-[44px] flex items-center justify-between px-2">
            <Link to="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-7 h-7 rounded-md bg-tf-accent flex items-center justify-center text-tf-accent-fg font-semibold text-xs shrink-0">
                T
              </div>
              {sidebarOpen && (
                <span className="text-sm font-semibold tracking-tight text-tf-text truncate">
                  TailorFlow
                </span>
              )}
            </Link>
            <button 
              className="md:hidden text-tf-text-tertiary hover:text-tf-text"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={16} />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath === item.path || (item.path === '/resume-detect' && currentPath.startsWith('/resume-'));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
                    isActive 
                      ? 'text-tf-text bg-tf-surface-2 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:bg-tf-accent' 
                      : 'text-tf-text-secondary hover:text-tf-text hover:bg-tf-surface-2'
                  }`}
                >
                  <Icon size={20} className="shrink-0" />
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer (Usage + Profile) */}
        {sidebarOpen && (
          <div className="p-3 space-y-3 border-t border-tf-border">
            {/* JD Usage Mini Card */}
            <div className="border border-tf-border bg-tf-surface-2 rounded-md p-3 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-[11px] font-medium text-tf-text-tertiary uppercase tracking-wider">PLAN</span>
                <span className="font-medium text-tf-text">
                  {subscription?.plan?.name || profile.subscription_plan}
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-tf-text-secondary">
                  <span>Extractions</span>
                  <span className="font-medium text-tf-text">
                    {jdLimit ? `${jdUsed}/${jdLimit}` : `${jdUsed}/∞`}
                  </span>
                </div>
                <div className="w-full h-1 bg-tf-border rounded-full overflow-hidden">
                  <div 
                    className="bg-tf-accent h-full transition-all duration-200"
                    style={{ width: `${jdPercent}%` }}
                  />
                </div>
              </div>
              <Link to="/subscription" className="block pt-1">
                <Button variant="secondary" size="sm" className="w-full h-7 text-xs">
                  Upgrade Plan
                </Button>
              </Link>
            </div>

            {/* Profile Drop-up */}
            <div className="relative">
              {profileDropupOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-md border border-tf-border bg-tf-surface shadow-modal overflow-hidden z-50 py-1">
                  <button
                    onClick={() => {
                      setProfileDropupOpen(false);
                      navigate('/profile');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-tf-text hover:bg-tf-surface-2 transition-colors"
                  >
                    <User size={16} />
                    Account
                  </button>
                  <button
                    onClick={() => {
                      setProfileDropupOpen(false);
                      navigate('/subscription');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-tf-text hover:bg-tf-surface-2 transition-colors"
                  >
                    <Zap size={16} />
                    Subscription
                  </button>
                  <div className="border-t border-tf-border my-1" />
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-tf-danger hover:bg-tf-danger/10 transition-colors"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              )}

              <button
                onClick={() => setProfileDropupOpen((open) => !open)}
                className="w-full border border-tf-border rounded-md p-2 flex items-center gap-2.5 text-left bg-tf-surface hover:bg-tf-surface-2 transition-colors"
              >
                <div className="w-7 h-7 shrink-0 rounded-full bg-tf-accent text-tf-accent-fg flex items-center justify-center font-medium text-xs">
                  {(profile.full_name || user?.metadata?.full_name || user?.email || 'N').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-tf-text truncate leading-tight">
                    {profile.full_name || user?.metadata?.full_name || 'Narendra'}
                  </p>
                  <p className="text-xs text-tf-text-tertiary truncate leading-tight">
                    {profile.email || user?.email || 'user@example.com'}
                  </p>
                </div>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* 2. MAIN CONTAINER */}
      <div className="flex-1 flex flex-col justify-between overflow-hidden relative">
        
        {/* TOPBAR (60px) */}
        <header className="h-[60px] px-4 sm:px-6 border-b border-tf-border bg-tf-surface flex justify-between items-center z-20 shrink-0 select-none">
          <div className="flex items-center gap-6">
            {/* Sidebar toggle for mobile/compact */}
            <button 
              className="p-1.5 rounded-md text-tf-text-secondary hover:text-tf-text hover:bg-tf-surface-2 transition-colors md:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu size={18} />
            </button>

            {/* TailorFlow Brand Logo */}
            <Link to="/dashboard" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#2E5BFF] to-[#00BDA5] flex items-center justify-center text-white font-extrabold text-sm shadow-xs">
                T
              </div>
              <span className="text-base font-bold tracking-tight text-tf-text hidden sm:inline">
                TailorFlow
              </span>
            </Link>

            {/* Horizontal Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1 bg-tf-surface-2/60 p-1 rounded-xl border border-tf-border/50">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPath === item.path || (item.path === '/resume-detect' && currentPath.startsWith('/resume-'));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-tf-accent/15 text-tf-accent border border-tf-accent/20 shadow-2xs dark:bg-tf-accent/20'
                        : 'text-tf-text-secondary hover:text-tf-text hover:bg-tf-surface'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button 
              className="p-2 rounded-lg border border-tf-border bg-tf-surface text-tf-text-secondary hover:text-tf-text hover:bg-tf-surface-2 transition-colors cursor-pointer"
              onClick={toggleDarkMode}
              title="Toggle dark / light theme"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Notification Bell */}
            <button 
              className="relative p-2 rounded-lg border border-tf-border bg-tf-surface text-tf-text-secondary hover:text-tf-text hover:bg-tf-surface-2 transition-colors cursor-pointer"
              title="Notifications"
            >
              <Bell size={16} />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-tf-accent text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-tf-surface">
                3
              </span>
            </button>

            {/* User Profile Dropdown Pill */}
            {(() => {
              const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Narendra';
              const avatarInitial = displayName.charAt(0).toUpperCase();

              return (
                <div className="relative border-l border-tf-border pl-3" ref={profileMenuRef}>
                  <button
                    onClick={() => setProfileMenuOpen((prev) => !prev)}
                    className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-tf-surface-2 transition cursor-pointer select-none"
                  >
                    <div className="w-8 h-8 rounded-full bg-tf-accent/20 text-tf-accent border border-tf-accent/30 font-bold text-xs flex items-center justify-center uppercase shadow-2xs">
                      {avatarInitial}
                    </div>
                    <div className="hidden lg:flex flex-col text-left leading-tight">
                      <span className="text-xs font-semibold text-tf-text truncate max-w-[110px]">
                        {displayName}
                      </span>
                      <span className="text-[10px] text-tf-text-tertiary font-medium capitalize">
                        {profile?.subscription_plan || 'Free'}
                      </span>
                    </div>
                    <ChevronDown size={14} className="text-tf-text-tertiary hidden lg:inline" />
                  </button>

                  {/* Profile Dropdown Menu */}
                  {profileMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-tf-surface border border-tf-border rounded-xl shadow-xl z-50 py-1.5 overflow-hidden select-none">
                      {/* User Info Header */}
                      <div className="px-3.5 py-2.5 border-b border-tf-border space-y-0.5">
                        <div className="text-xs font-bold text-tf-text truncate">{displayName}</div>
                        <div className="text-[11px] text-tf-text-tertiary truncate">{user?.email || 'user@example.com'}</div>
                        <div className="pt-1">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-tf-accent/10 text-tf-accent border border-tf-accent/20">
                            {profile?.subscription_plan || 'Free Plan'}
                          </span>
                        </div>
                      </div>

                      {/* Menu Items */}
                      <div className="py-1">
                        <button
                          onClick={() => {
                            setProfileMenuOpen(false);
                            navigate('/profile');
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-tf-text hover:bg-tf-surface-2 transition cursor-pointer"
                        >
                          <User size={15} className="text-tf-text-secondary" />
                          <span>Account Settings</span>
                        </button>

                        <button
                          onClick={() => {
                            setProfileMenuOpen(false);
                            navigate('/subscription');
                          }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-tf-text hover:bg-tf-surface-2 transition cursor-pointer"
                        >
                          <Zap size={15} className="text-tf-text-secondary" />
                          <span>Subscription & Credits</span>
                        </button>
                      </div>

                      <div className="border-t border-tf-border my-1" />

                      {/* Sign Out */}
                      <button
                        onClick={() => {
                          setProfileMenuOpen(false);
                          logout();
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-tf-danger hover:bg-tf-danger/10 transition cursor-pointer"
                      >
                        <LogOut size={15} />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </header>


        {/* APPLICATION SUBMISSION CONFIRMATION TOAST */}

        {pendingApplicationSubmitted && (
          <div className="px-6 py-3 bg-tf-surface-2 border-b border-tf-border text-tf-text text-xs flex justify-between items-center gap-3 shrink-0 select-none">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-tf-accent" />
              <p className="font-medium text-tf-text">
                Application detected for <span className="font-semibold">{pendingApplicationSubmitted.company}</span>. Mark as Applied?
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="primary"
                size="sm"
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
              >
                Mark as Applied
              </Button>
              <button
                onClick={() => setPendingApplicationSubmitted(null)}
                className="text-tf-text-tertiary hover:text-tf-text p-1"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ERROR TOAST */}
        {apiError && !isInvalidJdError && (
          <div className="px-6 py-3 bg-tf-danger/10 border-b border-tf-danger/20 text-tf-danger text-xs flex justify-between items-center gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <p className="font-medium">{apiError}</p>
            </div>
            <button onClick={() => setApiError(null)} className="text-tf-danger hover:opacity-75">
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
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 lg:py-8 flex flex-col">
          <div className="max-w-[1200px] w-full mx-auto flex-1 flex flex-col">
            <Outlet />
          </div>
        </main>

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

      <HowItWorksModal isOpen={isHowItWorksOpen} onClose={() => setIsHowItWorksOpen(false)} />
      <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} />
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />
    </div>
  );
}

export default Layout;
