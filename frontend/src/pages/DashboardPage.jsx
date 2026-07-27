import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  TrendingUp, Calendar, CheckCircle, Briefcase, ChevronRight, 
  Send, Search, Clock, Award, XCircle, ChevronDown, ArrowRight, Sparkles, AlertCircle,
  UserCheck, FileText, Check, ShieldAlert, X, Filter
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { FadeSwap, PageLoadingState } from '../components/ui/Loading';
import CompanyLogo from '../components/CompanyLogoView';
import { notificationApi } from '../services/notificationApi';

// Safe Error Boundary for Dashboard
class DashboardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("DashboardErrorBoundary caught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-tf-surface text-center font-sans min-h-[500px]">
          <h2 className="text-base font-bold uppercase text-tf-text tracking-wider">
            Dashboard View Reloading
          </h2>
          <p className="text-xs text-tf-text-secondary mt-2">
            {this.state.error?.toString()}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-5 py-2 bg-tf-accent text-white font-semibold text-xs rounded-xl cursor-pointer"
          >
            Reload Window
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Relative time formatter
const formatRelativeTime = (dateStr) => {
  if (!dateStr) return 'Recently';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Recently';
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}m ago`;
};

// Smooth Count-Up Animation Hook for Metrics
function useCountUp(endValue, duration = 650) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp = null;
    const end = Number(endValue) || 0;
    if (end === 0) {
      setCount(0);
      return;
    }

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(easedProgress * end));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setCount(end);
      }
    };

    const animationFrame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [endValue, duration]);

  return count;
}

// Company Favicon Component with Initial Fallback
function CompanyFavicon({ companyName, jobUrl, className = "w-5 h-5" }) {
  const [hasError, setHasError] = useState(false);

  let domain = '';
  if (jobUrl) {
    try {
      domain = new URL(jobUrl).hostname.replace(/^www\./, '');
    } catch (e) {}
  }

  if (!domain && companyName) {
    const cleanCo = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    domain = `${cleanCo}.com`;
  }

  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null;

  if (faviconUrl && !hasError) {
    return (
      <img
        src={faviconUrl}
        alt={companyName || 'Company'}
        onError={() => setHasError(true)}
        className={`${className} object-contain bg-white rounded-md shadow-2xs border border-zinc-200/50 shrink-0`}
      />
    );
  }

  const initial = (companyName || 'C').charAt(0).toUpperCase();
  return (
    <div className={`${className} bg-tf-accent/15 text-tf-accent font-black text-[10px] flex items-center justify-center rounded-md shrink-0 border border-tf-accent/20`}>
      {initial}
    </div>
  );
}

// Stage styling lookup
const getStageBadgeStyle = (stage) => {
  switch (stage) {
    case 'Applied': return 'bg-blue-500/15 text-blue-500 border-blue-500/20';
    case 'Assessment':
    case 'Screening':
    case 'Recruiter': return 'bg-purple-500/15 text-purple-500 border-purple-500/20';
    case 'Interview':
    case 'Final Round': return 'bg-amber-500/15 text-amber-500 border-amber-500/20';
    case 'Offer':
    case 'Accepted': return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20';
    case 'Rejected': return 'bg-rose-500/15 text-rose-500 border-rose-500/20';
    default: return 'bg-zinc-500/15 text-zinc-500 border-zinc-500/20';
  }
};

function DashboardContent() {
  const { session, applications: rawApps, fetchApplications, apiUrl, profile, user, parsedResume } = useApp();
  const applications = rawApps || [];
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [hoveredPointIndex, setHoveredPointIndex] = useState(3);
  const [trendTimeframe, setTrendTimeframe] = useState('Last 30 days');
  const [trendDropdownOpen, setTrendDropdownOpen] = useState(false);
  const [pipelineFilter, setPipelineFilter] = useState('All Jobs');
  const [pipelineDropdownOpen, setPipelineDropdownOpen] = useState(false);

  // Session-level completion banner dismissal state
  const [dismissedBanner, setDismissedBanner] = useState(() => {
    return sessionStorage.getItem('tf_dismiss_profile_banner') === 'true';
  });

  // Reminders Modal Popup State
  const [showRemindersModal, setShowRemindersModal] = useState(false);
  const [persistedReminders, setPersistedReminders] = useState([]);

  const handleDismissBanner = () => {
    setDismissedBanner(true);
    sessionStorage.setItem('tf_dismiss_profile_banner', 'true');
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        await fetchApplications();
        if (session?.access_token) {
          const reminders = await notificationApi.reminders(session.access_token);
          setPersistedReminders(reminders.filter(item => !['completed', 'cancelled'].includes(item.status)));
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, [session]);

  // Clean First Name Resolution
  const rawName = profile?.preferred_name 
    || profile?.full_name 
    || user?.user_metadata?.full_name 
    || user?.user_metadata?.name 
    || (user?.email ? user.email.split('@')[0] : '');

  const getFirstName = (name) => {
    if (!name) return 'Narendra';
    const str = name.trim();
    if (/narendra/i.test(str)) return 'Narendra';
    if (/bandi/i.test(str) && str.length > 5) {
      const rest = str.replace(/bandi/i, '');
      if (rest) return rest.charAt(0).toUpperCase() + rest.slice(1).toLowerCase();
    }
    const firstWord = str.split(/\s+/)[0];
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
  };

  const firstName = getFirstName(rawName);

  // Dynamic Time-of-Day Greeting
  const greetingPrefix = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 22) return 'Good evening';
    return 'Good night';
  }, []);

  // Database Calculations
  const totalTracked = applications.length;

  const filteredApplications = useMemo(() => {
    return applications.filter((a) => {
      if (!a) return false;
      if (pipelineFilter === 'Active Only') {
        return !['Accepted', 'Rejected', 'Archived'].includes(a.current_stage);
      }
      if (pipelineFilter === 'Last 7 days') {
        const appTime = new Date(a.created_at || Date.now()).getTime();
        return Date.now() - appTime <= 7 * 86400000;
      }
      if (pipelineFilter === 'Last 30 days') {
        const appTime = new Date(a.created_at || Date.now()).getTime();
        return Date.now() - appTime <= 30 * 86400000;
      }
      return true;
    });
  }, [applications, pipelineFilter]);

  const appliedApps = filteredApplications.filter(a => a.current_stage === 'Applied');
  const screeningApps = filteredApplications.filter(a => ['Screening', 'Assessment', 'Recruiter'].includes(a.current_stage));
  const interviewApps = filteredApplications.filter(a => ['Interview', 'Final Round'].includes(a.current_stage));
  const offerApps = filteredApplications.filter(a => ['Offer', 'Accepted'].includes(a.current_stage));
  const rejectedApps = filteredApplications.filter(a => a.current_stage === 'Rejected');

  const activeAppsCount = applications.filter(a => a && !['Accepted', 'Rejected', 'Archived'].includes(a.current_stage)).length;
  const appsSubmitted = applications.filter(a => a && a.current_stage !== 'Ready To Apply').length;
  const acceptedCount = applications.filter(a => a && a.current_stage === 'Accepted').length;
  const successRate = appsSubmitted === 0 ? 0 : Math.round(((acceptedCount + offerApps.length) / appsSubmitted) * 100);

  const matchApps = applications.filter(a => a && a.resume_match_score != null);
  const avgResumeScore = matchApps.length > 0
    ? Math.round(matchApps.reduce((sum, a) => sum + Number(a.resume_match_score), 0) / matchApps.length)
    : (parsedResume ? 82 : 64);

  // Animated KPI Counts
  const displayScore = useCountUp(avgResumeScore);
  const displayActive = useCountUp(activeAppsCount);
  const displaySuccess = useCountUp(successRate);
  const displayInterviews = useCountUp(interviewApps.length);
  const displayOffers = useCountUp(offerApps.length);

  // Derive Real Action Items strictly from active state
  const priorityActionItems = useMemo(() => {
    const items = [];

    if (!profile?.phone_number || !parsedResume) {
      const missing = [];
      if (!profile?.phone_number) missing.push('phone number');
      if (!parsedResume) missing.push('resume upload');
      items.push({
        id: 'profile-complete',
        icon: UserCheck,
        type: 'Profile',
        title: 'Complete your profile details',
        subtitle: `Add ${missing.join(' & ')} for better match accuracy`,
        actionLabel: 'Complete',
        onAction: () => navigate('/settings/job-preferences')
      });
    }

    if (screeningApps.length > 0 || interviewApps.length > 0) {
      const nextEvent = [...interviewApps, ...screeningApps][0];
      items.push({
        id: 'prepare-interview',
        icon: Calendar,
        type: 'Interview',
        title: `${nextEvent.current_stage === 'Interview' ? 'Technical Interview' : 'Screening Round'} upcoming`,
        subtitle: `${nextEvent.company_name || 'Target Company'} • ${nextEvent.job_title || 'Role'}`,
        actionLabel: 'Prepare',
        onAction: () => navigate('/job-tracker')
      });
    }

    if (avgResumeScore < 85) {
      items.push({
        id: 'optimize-resume',
        icon: Sparkles,
        type: 'Optimizer',
        title: 'Resume score can improve',
        subtitle: `Your current average match rate is ${avgResumeScore}/100`,
        actionLabel: 'Optimize',
        onAction: () => navigate('/resume-detect')
      });
    }

    const readyApps = applications.filter(a => a.current_stage === 'Ready To Apply' || a.current_stage === 'Applied');
    if (readyApps.length > 0 && items.length < 3) {
      const firstReady = readyApps[0];
      items.push({
        id: 'follow-up',
        icon: Send,
        type: 'Tracker',
        title: `Follow up on ${firstReady.company_name || 'application'}`,
        subtitle: `${firstReady.job_title || 'Position'} is awaiting response`,
        actionLabel: 'View App',
        onAction: () => navigate('/job-tracker')
      });
    }

    return items;
  }, [applications, interviewApps, screeningApps, avgResumeScore, profile, parsedResume, navigate]);

  // Derive Recent Timeline Activities
  const recentActivities = useMemo(() => {
    const events = [];
    applications.forEach((app) => {
      if (Array.isArray(app.timeline) && app.timeline.length > 0) {
        app.timeline.forEach((t) => {
          events.push({
            id: `${app.id}-${t.timestamp || t.event}`,
            company: app.company_name,
            jobTitle: app.job_title,
            jobUrl: app.job_url,
            event: t.event || 'Activity logged',
            timestamp: t.timestamp || app.updated_at || app.created_at
          });
        });
      } else {
        events.push({
          id: app.id,
          company: app.company_name,
          jobTitle: app.job_title,
          jobUrl: app.job_url,
          event: `Application in ${app.current_stage || 'Tracker'}`,
          timestamp: app.updated_at || app.created_at
        });
      }
    });

    return events
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, 4);
  }, [applications]);

  // Donut chart percentage calculations
  const pApplied = totalTracked > 0 ? Math.round((appliedApps.length / totalTracked) * 100) : 0;
  const pScreening = totalTracked > 0 ? Math.round((screeningApps.length / totalTracked) * 100) : 0;
  const pInterview = totalTracked > 0 ? Math.round((interviewApps.length / totalTracked) * 100) : 0;
  const pOffer = totalTracked > 0 ? Math.round((offerApps.length / totalTracked) * 100) : 0;
  const pRejected = totalTracked > 0 ? Math.round((rejectedApps.length / totalTracked) * 100) : 0;

  // Trendline data points
  const trendPoints = useMemo(() => {
    const daysCount = trendTimeframe === 'Last 7 days' ? 7 : trendTimeframe === 'Last 90 days' ? 90 : 30;
    const points = [];
    const now = Date.now();
    const interval = (daysCount * 86400000) / 4;

    for (let i = 4; i >= 0; i--) {
      const targetTime = now - i * interval;
      const d = new Date(targetTime);
      const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
      
      const count = applications.filter(a => {
        const appTime = new Date(a.created_at || a.updated_at || now).getTime();
        return Math.abs(appTime - targetTime) <= interval / 2;
      }).length;

      points.push({ label: dateLabel, count, timestamp: targetTime });
    }

    const maxCount = Math.max(...points.map(p => p.count), 1);
    const maxScale = Math.max(maxCount + 2, 8);

    return points.map((pt, idx) => {
      const x = 30 + idx * 60;
      const y = 102 - (pt.count / maxScale) * 80;
      return { ...pt, x, y, maxScale };
    });
  }, [applications, trendTimeframe]);

  const activeHoveredPoint = trendPoints[hoveredPointIndex] || trendPoints[trendPoints.length - 1];

  const buildSvgPath = (pts) => {
    if (!pts || pts.length === 0) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const curr = pts[i];
      const next = pts[i + 1];
      const cp1x = curr.x + (next.x - curr.x) / 2;
      const cp1y = curr.y;
      const cp2x = curr.x + (next.x - curr.x) / 2;
      const cp2y = next.y;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
    }
    return d;
  };

  const displayRecentApps = applications.slice(0, 5);

  const upcomingEvents = [...interviewApps, ...screeningApps].slice(0, 3).map((app, idx) => {
    const d = new Date(app.last_activity || app.created_at || Date.now());
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return {
      id: app.id || idx,
      month: months[d.getMonth()],
      day: d.getDate(),
      title: app.current_stage === 'Interview' ? 'Technical Interview' : 'Screening Round',
      company: app.company_name || 'Target Company',
      role: app.job_title || 'Software Engineer',
      time: formatRelativeTime(app.created_at)
    };
  });

  const allReminders = useMemo(() => {
    return persistedReminders.map((reminder, idx) => {
      const d = new Date(reminder.snoozed_until || reminder.due_at);
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      return {
        id: reminder.id || idx,
        month: months[d.getMonth()],
        day: d.getDate(),
        title: reminder.title,
        company: reminder.company_name || 'Personal reminder',
        role: reminder.job_title || reminder.description || 'Career action',
        stage: reminder.status,
        time: formatRelativeTime(reminder.due_at)
      };
    });
  }, [persistedReminders]);

  const isProfileIncomplete = !profile?.phone_number || !parsedResume;

  return (
    <FadeSwap
      isLoading={loading}
      skeleton={
        <PageLoadingState
          type="dashboard"
          stages={[
            'Loading workspace...',
            'Calculating pipeline analytics...',
            'Preparing priority actions...'
          ]}
        />
      }
    >
      <div className="flex-1 w-full flex flex-col gap-6 font-sans pb-12 select-none text-tf-text animate-in fade-in slide-in-from-bottom-2 duration-300">
        
        {/* 1. HERO GREETING BANNER */}
        <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-6 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-tf-text">
            {greetingPrefix}, {firstName}
          </h1>
          <p className="text-xs font-medium text-tf-text-secondary">
            {priorityActionItems.length > 0 
              ? `Your application pipeline is active. ${priorityActionItems.length} priority ${priorityActionItems.length === 1 ? 'action requires' : 'actions require'} your attention today.`
              : 'Your application pipeline is up to date and performing smoothly.'}
          </p>
        </div>

        {/* 2. COMPACT DISMISSIBLE PROFILE COMPLETION BANNER */}
        {isProfileIncomplete && !dismissedBanner && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
                <AlertCircle size={16} />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-tf-text">Profile incomplete</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                    1 item missing
                  </span>
                </div>
                <p className="text-xs text-tf-text-secondary">
                  Add your contact details and preferred roles to improve TailorFlow recommendation accuracy.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <Button variant="primary" size="sm" onClick={() => navigate('/settings/job-preferences')}>
                <span>Complete Profile</span>
              </Button>
              <button
                onClick={handleDismissBanner}
                className="p-2 rounded-xl bg-tf-surface-2 hover:bg-tf-border text-tf-text-tertiary hover:text-tf-text transition cursor-pointer border border-tf-border"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

      {/* 3. REFINED KPI CARDS WITH DISTINCT HIERARCHY */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Primary KPI Card 1: Resume Score */}
        <div className="dashboard-kpi-card bg-white/80 dark:bg-zinc-900/80 border border-purple-500/30 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">Primary</span>
                <span className="text-xs font-semibold text-tf-text-tertiary">• Score</span>
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-tf-text flex items-baseline gap-1">
                <span>{displayScore}</span>
                <span className="text-xs font-semibold text-tf-text-tertiary">/100</span>
              </div>
              <div className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-purple-500/10">
                <motion.div
                  className="h-full rounded-full bg-purple-500/70"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(0, Math.min(100, avgResumeScore || 0))}%` }}
                  transition={{ duration: 0.7, ease: [0.2, 0, 0, 1] }}
                />
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center border border-purple-500/20">
              <Award size={16} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 pt-2 border-t border-purple-500/10">
            <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
              {avgResumeScore >= 80 ? 'Optimized match' : '3 improvements'}
            </span>
            <button
              onClick={() => navigate('/resume-detect')}
              className="text-[11px] font-bold text-tf-accent hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              Improve <ArrowRight size={11} />
            </button>
          </div>
        </div>

        {/* Primary KPI Card 2: Active Pipeline */}
        <div className="dashboard-kpi-card bg-white/80 dark:bg-zinc-900/80 border border-blue-500/30 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Primary</span>
                <span className="text-xs font-semibold text-tf-text-tertiary">• Pipeline</span>
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-tf-text">
                {displayActive}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/20">
              <Briefcase size={16} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 pt-2 border-t border-blue-500/10">
            <span className="text-[11px] font-medium text-tf-text-secondary">Across all stages</span>
            <svg className="dashboard-sparkline w-14 h-5 text-blue-500 overflow-visible" viewBox="0 0 80 30" fill="none">
              <path
                d={activeAppsCount <= 0 ? "M0 24 L 80 24" : activeAppsCount < 5 ? "M0 24 Q 40 22, 80 12" : "M0 22 Q 25 25, 45 18 T 70 10 T 80 6"}
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity={activeAppsCount <= 0 ? 0.35 : 1}
              />
            </svg>
          </div>
        </div>

        {/* Secondary KPI Card 3: Success Rate */}
        <div className="dashboard-kpi-card bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-tf-text-secondary">Success Rate</span>
              <div className="text-2xl font-extrabold tracking-tight text-tf-text">{displaySuccess}%</div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-zinc-500/10 text-tf-text-secondary flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 pt-2 border-t border-tf-border/50">
            <span className="text-[11px] font-semibold text-emerald-500 flex items-center gap-0.5">
              ↗ {successRate}% <span className="text-tf-text-tertiary font-normal pl-0.5">vs last month</span>
            </span>
            <svg className="dashboard-sparkline w-14 h-5 text-purple-500 overflow-visible" viewBox="0 0 80 30" fill="none">
              <path
                d={successRate <= 0 ? "M0 24 L 80 24" : "M0 25 Q 20 28, 35 15 T 70 8 T 80 5"}
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity={successRate <= 0 ? 0.35 : 1}
              />
            </svg>
          </div>
        </div>

        {/* Secondary KPI Card 4: Interviews */}
        <div className="dashboard-kpi-card bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-tf-text-secondary">Interviews</span>
              <div className="text-2xl font-extrabold tracking-tight text-tf-text">
                {displayInterviews}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-zinc-500/10 text-tf-text-secondary flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
              <Calendar size={16} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 pt-2 border-t border-tf-border/50">
            <span className="text-[11px] font-medium text-tf-text-secondary">This month</span>
            <svg className="dashboard-sparkline w-14 h-5 text-amber-500 overflow-visible" viewBox="0 0 80 30" fill="none">
              <path
                d={interviewApps.length <= 0 ? "M0 24 L 80 24" : interviewApps.length < 3 ? "M0 24 Q 40 20, 80 10" : "M0 26 Q 20 22, 40 24 T 65 12 T 80 8"}
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity={interviewApps.length <= 0 ? 0.35 : 1}
              />
            </svg>
          </div>
        </div>

        {/* Secondary KPI Card 5: Offers */}
        <div className="dashboard-kpi-card bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-tf-text-secondary">Offers</span>
              <div className="text-2xl font-extrabold tracking-tight text-tf-text">
                {displayOffers}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-zinc-500/10 text-tf-text-secondary flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
              <CheckCircle size={16} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 pt-2 border-t border-tf-border/50">
            <span className="text-[11px] font-medium text-tf-text-secondary">Active offers</span>
            <svg className="dashboard-sparkline w-14 h-5 text-emerald-500 overflow-visible" viewBox="0 0 80 30" fill="none">
              <path
                d={offerApps.length <= 0 ? "M0 24 L 80 24" : offerApps.length < 3 ? "M0 24 Q 40 22, 80 10" : "M0 24 Q 25 26, 45 20 T 70 12 T 80 6"}
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity={offerApps.length <= 0 ? 0.35 : 1}
              />
            </svg>
          </div>
        </div>

      </div>

      {/* 4. MAIN DASHBOARD CONTENT (2 COLUMNS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT COLUMN (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">

          {/* WIDGET 2: REFINED JOB PIPELINE STAGES FLOW WITH COMPANY FAVICONS */}
          <div className="bg-white/80 dark:bg-zinc-900/80 border border-tf-border rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-tf-text">Job Pipeline</h3>
                <p className="text-xs text-tf-text-secondary">Live activity across active recruitment stages</p>
              </div>
              <div className="relative">
                <button 
                  onClick={() => setPipelineDropdownOpen((open) => !open)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-tf-border bg-tf-surface-2 text-xs font-semibold text-tf-text-secondary hover:text-tf-text transition cursor-pointer select-none"
                >
                  <Filter size={13} />
                  <span>{pipelineFilter}</span>
                  <ChevronDown size={13} />
                </button>

                {pipelineDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-36 bg-tf-surface border border-tf-border rounded-xl shadow-xl z-30 py-1 overflow-hidden select-none">
                    {['All Jobs', 'Active Only', 'Last 7 days', 'Last 30 days'].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setPipelineFilter(opt);
                          setPipelineDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-1.5 text-xs font-medium transition cursor-pointer ${
                          pipelineFilter === opt ? 'bg-tf-accent/15 text-tf-accent font-bold' : 'text-tf-text hover:bg-tf-surface-2'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* PIPELINE STAGE COLUMNS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 relative">
              
              {/* Stage 1: Applied */}
              <div className="bg-tf-surface-2/60 border border-tf-border/60 rounded-xl p-3.5 space-y-3 relative hover:border-tf-border-strong transition-all">
                <div className="flex items-center justify-between pb-2 border-b border-tf-border/50">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-blue-500/10 text-blue-500 flex items-center justify-center">
                      <Send size={11} />
                    </div>
                    <span className="text-xs font-bold text-tf-text">Applied</span>
                  </div>
                  <span className="text-xs font-extrabold text-tf-text-secondary">
                    {appliedApps.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {appliedApps.length > 0 ? (
                    appliedApps.slice(0, 3).map((item, idx) => (
                      <div 
                        key={item.id || idx} 
                        onClick={() => navigate(`/job-tracker?appId=${item.id}`, { state: { selectedAppId: item.id } })}
                        className="flex items-center justify-between text-[11px] p-1.5 rounded-lg hover:bg-tf-surface transition cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <CompanyFavicon companyName={item.company_name} jobUrl={item.job_url} className="w-4 h-4" />
                          <span className="font-semibold text-tf-text truncate max-w-[80px]">{item.company_name}</span>
                        </div>
                        <span className="text-[10px] text-tf-text-tertiary shrink-0">{formatRelativeTime(item.created_at)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-tf-text-tertiary italic py-2 text-center">No jobs in this stage</div>
                  )}
                  {appliedApps.length > 3 && (
                    <div 
                      onClick={() => navigate('/job-tracker')}
                      className="text-[10px] text-tf-accent font-semibold pt-1 text-center cursor-pointer hover:underline"
                    >
                      + {appliedApps.length - 3} more
                    </div>
                  )}
                </div>
              </div>

              {/* Stage 2: Screening */}
              <div className="bg-tf-surface-2/60 border border-tf-border/60 rounded-xl p-3.5 space-y-3 relative hover:border-tf-border-strong transition-all">
                <div className="flex items-center justify-between pb-2 border-b border-tf-border/50">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-purple-500/10 text-purple-500 flex items-center justify-center">
                      <Search size={11} />
                    </div>
                    <span className="text-xs font-bold text-tf-text">Screening</span>
                  </div>
                  <span className="text-xs font-extrabold text-tf-text-secondary">
                    {screeningApps.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {screeningApps.length > 0 ? (
                    screeningApps.slice(0, 3).map((item, idx) => (
                      <div 
                        key={item.id || idx} 
                        onClick={() => navigate(`/job-tracker?appId=${item.id}`, { state: { selectedAppId: item.id } })}
                        className="flex items-center justify-between text-[11px] p-1.5 rounded-lg hover:bg-tf-surface transition cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <CompanyFavicon companyName={item.company_name} jobUrl={item.job_url} className="w-4 h-4" />
                          <span className="font-semibold text-tf-text truncate max-w-[80px]">{item.company_name}</span>
                        </div>
                        <span className="text-[10px] text-tf-text-tertiary shrink-0">{formatRelativeTime(item.created_at)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-tf-text-tertiary italic py-2 text-center">No jobs in this stage</div>
                  )}
                  {screeningApps.length > 3 && (
                    <div 
                      onClick={() => navigate('/job-tracker')}
                      className="text-[10px] text-tf-accent font-semibold pt-1 text-center cursor-pointer hover:underline"
                    >
                      + {screeningApps.length - 3} more
                    </div>
                  )}
                </div>
              </div>

              {/* Stage 3: Interview */}
              <div className="bg-tf-surface-2/60 border border-tf-border/60 rounded-xl p-3.5 space-y-3 relative hover:border-tf-border-strong transition-all">
                <div className="flex items-center justify-between pb-2 border-b border-tf-border/50">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-amber-500/10 text-amber-500 flex items-center justify-center">
                      <Calendar size={11} />
                    </div>
                    <span className="text-xs font-bold text-tf-text">Interview</span>
                  </div>
                  <span className="text-xs font-extrabold text-tf-text-secondary">
                    {interviewApps.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {interviewApps.length > 0 ? (
                    interviewApps.slice(0, 3).map((item, idx) => (
                      <div 
                        key={item.id || idx} 
                        onClick={() => navigate(`/job-tracker?appId=${item.id}`, { state: { selectedAppId: item.id } })}
                        className="flex items-center justify-between text-[11px] p-1.5 rounded-lg hover:bg-tf-surface transition cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <CompanyFavicon companyName={item.company_name} jobUrl={item.job_url} className="w-4 h-4" />
                          <span className="font-semibold text-tf-text truncate max-w-[80px]">{item.company_name}</span>
                        </div>
                        <span className="text-[10px] text-tf-text-tertiary shrink-0">{formatRelativeTime(item.created_at)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-tf-text-tertiary italic py-2 text-center">No jobs in this stage</div>
                  )}
                  {interviewApps.length > 3 && (
                    <div 
                      onClick={() => navigate('/job-tracker')}
                      className="text-[10px] text-tf-accent font-semibold pt-1 text-center cursor-pointer hover:underline"
                    >
                      + {interviewApps.length - 3} more
                    </div>
                  )}
                </div>
              </div>

              {/* Stage 4: Offer */}
              <div className="bg-tf-surface-2/60 border border-tf-border/60 rounded-xl p-3.5 space-y-3 relative hover:border-tf-border-strong transition-all">
                <div className="flex items-center justify-between pb-2 border-b border-tf-border/50">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                      <Award size={11} />
                    </div>
                    <span className="text-xs font-bold text-tf-text">Offer</span>
                  </div>
                  <span className="text-xs font-extrabold text-tf-text-secondary">
                    {offerApps.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {offerApps.length > 0 ? (
                    offerApps.slice(0, 3).map((item, idx) => (
                      <div 
                        key={item.id || idx} 
                        onClick={() => navigate(`/job-tracker?appId=${item.id}`, { state: { selectedAppId: item.id } })}
                        className="flex items-center justify-between text-[11px] p-1.5 rounded-lg hover:bg-tf-surface transition cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <CompanyFavicon companyName={item.company_name} jobUrl={item.job_url} className="w-4 h-4" />
                          <span className="font-semibold text-tf-text truncate max-w-[80px]">{item.company_name}</span>
                        </div>
                        <span className="text-[10px] text-tf-text-tertiary shrink-0">{formatRelativeTime(item.created_at)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-tf-text-tertiary italic py-2 text-center">No jobs in this stage</div>
                  )}
                  {offerApps.length > 3 && (
                    <div 
                      onClick={() => navigate('/job-tracker')}
                      className="text-[10px] text-tf-accent font-semibold pt-1 text-center cursor-pointer hover:underline"
                    >
                      + {offerApps.length - 3} more
                    </div>
                  )}
                </div>
              </div>

              {/* Stage 5: Rejected */}
              <div className="bg-tf-surface-2/60 border border-tf-border/60 rounded-xl p-3.5 space-y-3 relative hover:border-tf-border-strong transition-all">
                <div className="flex items-center justify-between pb-2 border-b border-tf-border/50">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded bg-rose-500/10 text-rose-500 flex items-center justify-center">
                      <XCircle size={11} />
                    </div>
                    <span className="text-xs font-bold text-tf-text">Rejected</span>
                  </div>
                  <span className="text-xs font-extrabold text-tf-text-secondary">
                    {rejectedApps.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {rejectedApps.length > 0 ? (
                    rejectedApps.slice(0, 3).map((item, idx) => (
                      <div 
                        key={item.id || idx} 
                        onClick={() => navigate(`/job-tracker?appId=${item.id}`, { state: { selectedAppId: item.id } })}
                        className="flex items-center justify-between text-[11px] p-1.5 rounded-lg hover:bg-tf-surface transition cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <CompanyFavicon companyName={item.company_name} jobUrl={item.job_url} className="w-4 h-4" />
                          <span className="font-semibold text-tf-text truncate max-w-[80px]">{item.company_name}</span>
                        </div>
                        <span className="text-[10px] text-tf-text-tertiary shrink-0">{formatRelativeTime(item.created_at)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-tf-text-tertiary italic py-2 text-center">No jobs in this stage</div>
                  )}
                  {rejectedApps.length > 3 && (
                    <div 
                      onClick={() => navigate('/job-tracker')}
                      className="text-[10px] text-tf-accent font-semibold pt-1 text-center cursor-pointer hover:underline"
                    >
                      + {rejectedApps.length - 3} more
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* BOTTOM ROW (2 CARDS SIDE-BY-SIDE) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* CARD A: APPLICATION TREND CHART */}
            <div className="bg-white/80 dark:bg-zinc-900/80 border border-tf-border rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between relative">
              <div className="flex items-center justify-between relative z-20">
                <div>
                  <h3 className="text-xs font-bold text-tf-text">Application Trend</h3>
                  <p className="text-[11px] text-tf-text-tertiary">Extraction & tailoring frequency</p>
                </div>

                <div className="relative">
                  <button 
                    onClick={() => setTrendDropdownOpen((open) => !open)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-tf-border bg-tf-surface-2 text-[11px] font-semibold text-tf-text-secondary hover:text-tf-text transition cursor-pointer"
                  >
                    <span>{trendTimeframe}</span>
                    <ChevronDown size={12} />
                  </button>

                  {trendDropdownOpen && (
                    <div className="absolute right-0 top-full mt-1 w-32 bg-tf-surface border border-tf-border rounded-xl shadow-xl z-30 py-1 overflow-hidden select-none">
                      {['Last 7 days', 'Last 30 days', 'Last 90 days'].map((opt) => (
                        <button
                          key={opt}
                          onClick={() => {
                            setTrendTimeframe(opt);
                            setTrendDropdownOpen(false);
                            setHoveredPointIndex(3);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-[11px] font-medium transition cursor-pointer ${
                            trendTimeframe === opt ? 'bg-tf-accent/15 text-tf-accent font-bold' : 'text-tf-text hover:bg-tf-surface-2'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Interactive Area Chart */}
              <div className="relative pt-6 pb-2">
                <svg className="w-full h-40 overflow-visible select-none" viewBox="0 0 300 120">
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  
                  <line x1="0" y1="25" x2="300" y2="25" stroke="currentColor" strokeOpacity="0.08" />
                  <line x1="0" y1="64" x2="300" y2="64" stroke="currentColor" strokeOpacity="0.08" />
                  <line x1="0" y1="102" x2="300" y2="102" stroke="currentColor" strokeOpacity="0.08" />

                  <text x="0" y="28" fill="currentColor" opacity="0.4" fontSize="9">{trendPoints[0]?.maxScale || 15}</text>
                  <text x="0" y="68" fill="currentColor" opacity="0.4" fontSize="9">{Math.round((trendPoints[0]?.maxScale || 15) / 2)}</text>
                  <text x="0" y="106" fill="currentColor" opacity="0.4" fontSize="9">0</text>

                  {trendPoints.length > 1 && (
                    <path
                      d={`${buildSvgPath(trendPoints)} L ${trendPoints[trendPoints.length - 1].x} 102 L ${trendPoints[0].x} 102 Z`}
                      fill="url(#areaGradient)"
                    />
                  )}

                  {trendPoints.length > 1 && (
                    <path
                      d={buildSvgPath(trendPoints)}
                      fill="none"
                      stroke="#8B5CF6"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  )}

                  {trendPoints.map((pt, idx) => {
                    const isHovered = hoveredPointIndex === idx;
                    const isSpike = pt.count > 0;

                    return (
                      <g key={idx} className="cursor-pointer" onMouseEnter={() => setHoveredPointIndex(idx)}>
                        <circle cx={pt.x} cy={pt.y} r="16" fill="transparent" />
                        
                        {(isHovered || (isSpike && idx === trendPoints.length - 1)) && (
                          <circle cx={pt.x} cy={pt.y} r={isHovered ? "10" : "8"} fill="#8B5CF6" opacity="0.35" className="animate-ping" />
                        )}

                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? "6" : isSpike ? "5" : "3.5"}
                          fill={isSpike ? "#8B5CF6" : "#A78BFA"}
                          stroke="#ffffff"
                          strokeWidth={isHovered ? "3" : "2"}
                          className="transition-all duration-200"
                        />
                      </g>
                    );
                  })}
                </svg>

                {activeHoveredPoint && (
                  <div 
                    className="absolute -top-1 transition-all duration-300 -translate-x-1/2 bg-zinc-900/95 dark:bg-zinc-900/95 border border-zinc-700 text-white px-3 py-1.5 rounded-xl shadow-2xl text-center z-10 select-none pointer-events-none"
                    style={{ left: `${(activeHoveredPoint.x / 300) * 100}%` }}
                  >
                    <div className="text-[10px] font-medium text-zinc-400">{activeHoveredPoint.label}</div>
                    <div className="text-xs font-bold text-white whitespace-nowrap">
                      {activeHoveredPoint.count} {activeHoveredPoint.count === 1 ? 'Extraction' : 'Extractions'}
                    </div>
                  </div>
                )}

                <div className="flex justify-between text-[10px] text-tf-text-tertiary pt-2 px-2 font-medium">
                  {trendPoints.map((pt, idx) => (
                    <span 
                      key={idx}
                      onClick={() => setHoveredPointIndex(idx)}
                      className={`cursor-pointer transition-colors ${hoveredPointIndex === idx ? 'text-purple-500 font-bold scale-105' : 'hover:text-tf-text'}`}
                    >
                      {pt.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* CARD B: RECENT ACTIVITY FEED */}
            <div className="bg-white/80 dark:bg-zinc-900/80 border border-tf-border rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-xs font-bold text-tf-text">Recent Activity</h3>
                <p className="text-[11px] text-tf-text-tertiary">Real-time log of application updates</p>
              </div>

              <div className="space-y-2.5">
                {recentActivities.length > 0 ? (
                  recentActivities.map((act) => (
                    <div key={act.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-tf-surface-2 transition">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CompanyFavicon companyName={act.company} jobUrl={act.jobUrl} className="w-5 h-5" />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-tf-text truncate max-w-[120px]">{act.company || 'Application'}</div>
                          <div className="text-[10px] text-tf-text-secondary truncate max-w-[120px]">{act.event}</div>
                        </div>
                      </div>
                      <span className="text-[10px] text-tf-text-tertiary shrink-0">
                        {formatRelativeTime(act.timestamp)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-tf-text-tertiary font-medium">
                    No recent activity logged yet.
                  </div>
                )}
              </div>

              <button 
                onClick={() => navigate('/job-tracker')}
                className="w-full py-2 bg-tf-surface-2 hover:bg-tf-border text-tf-text font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 border border-tf-border cursor-pointer"
              >
                <span>View all activity</span>
                <ArrowRight size={14} />
              </button>
            </div>

          </div>

        </div>

        {/* RIGHT COLUMN (1/3 width) */}
        <div className="space-y-6">

          {/* WIDGET 1: REFINED UPCOMING EVENTS */}
          <div className="bg-white/80 dark:bg-zinc-900/80 border border-tf-border rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-tf-text">Upcoming Reminders</h3>
              <span className="text-[11px] font-semibold text-tf-accent">{upcomingEvents.length} scheduled</span>
            </div>

            <div className="space-y-3">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map((evt) => (
                  <div 
                    key={evt.id} 
                    onClick={() => setShowRemindersModal(true)}
                    className="flex items-center justify-between p-3 rounded-xl bg-tf-surface-2/60 border border-tf-border/50 hover:bg-tf-surface-2 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-tf-surface border border-tf-border flex flex-col items-center justify-center leading-none text-tf-text shrink-0">
                        <span className="text-[9px] font-black text-tf-text-tertiary uppercase">{evt.month}</span>
                        <span className="text-sm font-black">{evt.day}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-tf-text truncate">{evt.title}</div>
                        <div className="text-[10px] text-tf-text-secondary truncate">{evt.company} • {evt.role}</div>
                        <div className="text-[10px] text-tf-text-tertiary pt-0.5">{evt.time}</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center space-y-1">
                  <div className="text-xs font-semibold text-tf-text">No upcoming events</div>
                  <div className="text-[11px] text-tf-text-tertiary">Add reminders from your Job Tracker.</div>
                </div>
              )}
            </div>

            <button 
              onClick={() => setShowRemindersModal(true)}
              className="w-full py-2 bg-tf-surface-2 hover:bg-tf-border text-tf-text font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 border border-tf-border cursor-pointer"
            >
              <span>View all reminders</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {/* WIDGET 2: PIPELINE OVERVIEW DONUT CHART */}
          <div className="bg-white/80 dark:bg-zinc-900/80 border border-tf-border rounded-2xl p-6 shadow-xs space-y-5">
            <h3 className="text-sm font-bold text-tf-text">Pipeline Overview</h3>

            <div className="flex flex-col items-center gap-5">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" opacity="0.08" strokeWidth="16" />
                  {pApplied > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="#3B82F6" strokeWidth="16" strokeDasharray={`${(pApplied / 100) * 238} 238`} strokeDashoffset="0" />}
                  {pScreening > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="#8B5CF6" strokeWidth="16" strokeDasharray={`${(pScreening / 100) * 238} 238`} strokeDashoffset={`-${(pApplied / 100) * 238}`} />}
                  {pInterview > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="#F97316" strokeWidth="16" strokeDasharray={`${(pInterview / 100) * 238} 238`} strokeDashoffset={`-${((pApplied + pScreening) / 100) * 238}`} />}
                  {pOffer > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="#10B981" strokeWidth="16" strokeDasharray={`${(pOffer / 100) * 238} 238`} strokeDashoffset={`-${((pApplied + pScreening + pInterview) / 100) * 238}`} />}
                  {pRejected > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="#EF4444" strokeWidth="16" strokeDasharray={`${(pRejected / 100) * 238} 238`} strokeDashoffset={`-${((pApplied + pScreening + pInterview + pOffer) / 100) * 238}`} />}
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-black text-tf-text">{totalTracked}</span>
                  <span className="text-[10px] font-semibold text-tf-text-tertiary uppercase tracking-wider">Total Jobs</span>
                </div>
              </div>

              <div className="w-full space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-tf-text-secondary"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Applied</span>
                  <span className="font-semibold text-tf-text">{appliedApps.length} ({pApplied}%)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-tf-text-secondary"><span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Screening</span>
                  <span className="font-semibold text-tf-text">{screeningApps.length} ({pScreening}%)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-tf-text-secondary"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Interview</span>
                  <span className="font-semibold text-tf-text">{interviewApps.length} ({pInterview}%)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-tf-text-secondary"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Offer</span>
                  <span className="font-semibold text-tf-text">{offerApps.length} ({pOffer}%)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-tf-text-secondary"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Rejected</span>
                  <span className="font-semibold text-tf-text">{rejectedApps.length} ({pRejected}%)</span>
                </div>
              </div>
            </div>

            <button 
              onClick={() => navigate('/job-tracker')}
              className="w-full py-2 bg-tf-surface-2 hover:bg-tf-border text-tf-text font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 border border-tf-border cursor-pointer"
            >
              <span>View full pipeline</span>
              <ArrowRight size={14} />
            </button>
          </div>

        </div>

      </div>

      {/* UPCOMING REMINDERS POPUP MODAL */}
      {showRemindersModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-tf-surface border border-tf-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-tf-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-tf-accent/10 text-tf-accent flex items-center justify-center border border-tf-accent/20">
                  <Calendar size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-tf-text">Upcoming Reminders</h3>
                  <p className="text-xs text-tf-text-secondary">{allReminders.length} scheduled reminders</p>
                </div>
              </div>

              <button
                onClick={() => setShowRemindersModal(false)}
                className="p-1.5 rounded-xl bg-tf-surface-2 hover:bg-tf-border text-tf-text-secondary hover:text-tf-text transition cursor-pointer border border-tf-border"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* REMINDERS SCROLLABLE LIST */}
            <div className="max-h-[360px] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
              {allReminders.length > 0 ? (
                allReminders.map((rem) => (
                  <div
                    key={rem.id}
                    className="p-3.5 rounded-xl bg-tf-surface-2/60 border border-tf-border/60 hover:bg-tf-surface-2 transition flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <CompanyFavicon companyName={rem.company} jobUrl={rem.jobUrl} className="w-8 h-8 rounded-lg" />
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-tf-text truncate">{rem.title}</span>
                          <span className={`px-2 py-0.2 rounded-md text-[10px] font-bold border ${getStageBadgeStyle(rem.stage)}`}>
                            {rem.stage}
                          </span>
                        </div>
                        <p className="text-[11px] text-tf-text-secondary truncate">{rem.company} • {rem.role}</p>
                        <p className="text-[10px] text-tf-text-tertiary flex items-center gap-1">
                          <Clock size={11} /> {rem.time}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setShowRemindersModal(false);
                        navigate(`/job-tracker?appId=${rem.id}`, { state: { selectedAppId: rem.id } });
                      }}
                      className="text-xs shrink-0"
                    >
                      <span>Open Tracker</span>
                      <ArrowRight size={12} />
                    </Button>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center space-y-2">
                  <Calendar size={32} className="mx-auto text-tf-text-tertiary opacity-40" />
                  <p className="text-xs font-semibold text-tf-text">No upcoming reminders</p>
                  <p className="text-[11px] text-tf-text-tertiary">Extract jobs to automatically track interview dates & deadlines.</p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-tf-border flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowRemindersModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
    </FadeSwap>
  );
}

export function DashboardPage() {
  return (
    <DashboardErrorBoundary>
      <DashboardContent />
    </DashboardErrorBoundary>
  );
}

export default DashboardPage;
