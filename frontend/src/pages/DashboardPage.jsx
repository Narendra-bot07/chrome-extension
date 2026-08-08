import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  TrendingUp, Calendar, CheckCircle, Briefcase, ChevronRight,
  Send, Search, Clock, Award, XCircle, ChevronDown, ArrowRight, Zap, AlertCircle,
  UserCheck, FileText, Check, ShieldAlert, X, Filter
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { FadeSwap, PageLoadingState } from '../components/ui/Loading';
import CompanyLogo from '../components/CompanyLogoView';
import { notificationApi } from '../services/notificationApi';
import { mapTailoringSeries } from '../services/tailoringTrend';
import WaveText from '../components/WaveText';
import './DashboardPage.css';

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

import { resolveCompanyDomain, getInitials } from '../components/companyLogoUtils';

// Company Favicon Component with Smart Job Board Filtering and Initial Fallback
function CompanyFavicon({ companyName, jobUrl, companyDomain, className = "w-5 h-5" }) {
  const [hasError, setHasError] = useState(false);

  const domain = useMemo(
    () => resolveCompanyDomain(companyDomain, companyName, jobUrl),
    [companyDomain, companyName, jobUrl]
  );

  useEffect(() => {
    setHasError(false);
  }, [domain]);

  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : null;

  if (faviconUrl && !hasError) {
    return (
      <img
        src={faviconUrl}
        alt={companyName || 'Company'}
        onLoad={(e) => {
          // Google S2 Favicon API returns a 16x16 default fallback globe when a domain lacks a favicon.
          if (e.target.naturalWidth <= 16 && e.target.naturalHeight <= 16 && !domain.includes('google')) {
            setHasError(true);
          }
        }}
        onError={() => setHasError(true)}
        className={`${className} object-contain bg-white rounded-md shadow-2xs border border-zinc-200/50 shrink-0 p-0.5`}
      />
    );
  }

  const initials = getInitials(companyName);
  return (
    <div className={`${className} bg-teal-500/15 text-teal-600 dark:text-teal-400 font-extrabold text-[9px] flex items-center justify-center rounded-md shrink-0 border border-teal-500/20 uppercase tracking-tighter`}>
      {initials}
    </div>
  );
}

// Stage styling lookup
const getStageBadgeStyle = (stage) => {
  switch (stage) {
    case 'Applied': return 'bg-blue-500/15 text-blue-500 border-blue-500/20';
    case 'Assessment':
    case 'Screening':
    case 'Recruiter': return 'bg-orange-500/15 text-orange-500 border-orange-500/20';
    case 'Interview':
    case 'Final Round': return 'bg-amber-500/15 text-amber-500 border-amber-500/20';
    case 'Offer':
    case 'Accepted': return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20';
    case 'Rejected': return 'bg-rose-500/15 text-rose-500 border-rose-500/20';
    default: return 'bg-zinc-500/15 text-zinc-500 border-zinc-500/20';
  }
};

function CareerPerformanceRadar({ metrics, updatedAt }) {
  const width = 400;
  const height = 310;
  const centerX = 200;
  const centerY = 155;
  const radius = 98;

  // 6 Hexagon Vertices (Top, Top-Right, Bottom-Right, Bottom, Bottom-Left, Top-Left)
  const angleFor = index => -Math.PI / 2 + (index * Math.PI * 2) / metrics.length;

  const pointAt = (index, scale = 1) => {
    const angle = angleFor(index);
    return {
      x: centerX + Math.cos(angle) * radius * scale,
      y: centerY + Math.sin(angle) * radius * scale,
    };
  };

  const polygonPoints = scale => metrics
    .map((_, index) => {
      const point = pointAt(index, scale);
      return `${point.x},${point.y}`;
    })
    .join(' ');

  // Benchmark "Twins" Polygon (Baseline reference)
  const benchmarkValues = [78, 85, 72, 75, 80, 70];
  const benchmarkPolygon = metrics
    .map((_, index) => {
      const val = benchmarkValues[index % benchmarkValues.length];
      const point = pointAt(index, val / 100);
      return `${point.x},${point.y}`;
    })
    .join(' ');

  // Candidate Score Polygon
  const scorePolygon = metrics
    .map((metric, index) => {
      const point = pointAt(index, Math.max(0.1, Math.min(100, metric.value)) / 100);
      return `${point.x},${point.y}`;
    })
    .join(' ');

  return (
    <div className="dashboard-panel rounded-2xl border border-zinc-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-[#0B0F19] p-6 shadow-xs text-zinc-900 dark:text-white transition-colors">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 dark:text-slate-400 uppercase">
            CAREER & ATS ANALYTICS
          </p>
          <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-lime-600 dark:text-lime-400" title={updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Live metrics'}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-lime-500" />
            Live
          </span>
        </div>
        <h3 className="mt-1 text-xl font-bold tracking-tight text-zinc-900 dark:text-white font-sans">Performance Signature</h3>
      </div>

      <div className="relative mt-2 flex justify-center">
        <svg className="h-[310px] w-full max-w-[400px] overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Performance Signature radar chart">
          {/* Concentric Hexagon Grid Rings */}
          {[0.25, 0.5, 0.75, 1.0].map(scale => (
            <polygon
              key={scale}
              points={polygonPoints(scale)}
              fill="none"
              stroke="currentColor"
              strokeOpacity={scale === 1.0 ? "0.18" : "0.08"}
              strokeWidth="1"
            />
          ))}

          {/* Hexagon Radial Spokes */}
          {metrics.map((metric, index) => {
            const endpoint = pointAt(index, 1.0);
            return (
              <line
                key={`spoke-${metric.label}`}
                x1={centerX}
                y1={centerY}
                x2={endpoint.x}
                y2={endpoint.y}
                stroke="currentColor"
                strokeOpacity="0.08"
                strokeWidth="1"
              />
            );
          })}

          {/* Benchmark "Twins" Polygon Overlay */}
          <polygon
            points={benchmarkPolygon}
            fill="currentColor"
            fillOpacity="0.03"
            stroke="currentColor"
            strokeOpacity="0.22"
            strokeWidth="1"
            strokeDasharray="4 4"
            strokeLinejoin="round"
          />

          {/* Active User Performance Polygon (Vibrant Orange) */}
          <motion.polygon
            points={scorePolygon}
            fill="rgba(249, 115, 22, 0.22)"
            stroke="#f97316"
            strokeWidth="2.5"
            strokeLinejoin="round"
            style={{ transformOrigin: `${centerX}px ${centerY}px` }}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />

          {/* User Score Points & Labels */}
          {metrics.map((metric, index) => {
            const scorePoint = pointAt(index, Math.max(0.1, Math.min(100, metric.value)) / 100);
            const labelPoint = pointAt(index, 1.24);

            let anchor = 'middle';
            let dy = 0;
            if (index === 0) { anchor = 'middle'; dy = -6; }
            else if (index === 1 || index === 2) { anchor = 'start'; }
            else if (index === 3) { anchor = 'middle'; dy = 12; }
            else if (index === 4 || index === 5) { anchor = 'end'; }

            return (
              <g key={metric.label} className="group/radar cursor-pointer">
                {/* Score Point Marker */}
                <circle cx={scorePoint.x} cy={scorePoint.y} r="10" fill="transparent" />
                <circle cx={scorePoint.x} cy={scorePoint.y} r="4" fill="#f97316" stroke="#ffffff" strokeWidth="1.5" />

                {/* Axis Text Label - High contrast dark slate in light mode, slate-300 in dark mode */}
                <text
                  x={labelPoint.x}
                  y={labelPoint.y + dy}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fill="currentColor"
                  fontSize="12"
                  fontWeight="600"
                  className="transition-colors text-slate-600 dark:text-slate-300 font-sans"
                >
                  {metric.label}
                </text>

                {/* Tooltip on Hover */}
                <g className="pointer-events-none hidden group-hover/radar:block z-50">
                  <rect
                    x={Math.min(width - 150, Math.max(4, scorePoint.x - 70))}
                    y={Math.max(4, scorePoint.y - 54)}
                    width="140"
                    height="42"
                    rx="8"
                    fill="#0f172a"
                    stroke="#334155"
                    strokeWidth="1"
                  />
                  <text
                    x={Math.min(width - 80, Math.max(74, scorePoint.x))}
                    y={Math.max(20, scorePoint.y - 36)}
                    textAnchor="middle"
                    fill="#a3e635"
                    fontSize="11"
                    fontWeight="700"
                  >
                    {metric.label}: {metric.value}%
                  </text>
                  <text
                    x={Math.min(width - 80, Math.max(74, scorePoint.x))}
                    y={Math.max(34, scorePoint.y - 22)}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize="9"
                  >
                    {metric.detail}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function DashboardContent() {
  const { session, sessionVerified, applications: rawApps, fetchApplications, apiUrl, profile, user, parsedResume } = useApp();
  const applications = rawApps || [];
  const navigate = useNavigate();

  const [loading, setLoading] = useState(() => applications.length === 0);
  const [hoveredPointIndex, setHoveredPointIndex] = useState(-1);
  const [trendTimeframe, setTrendTimeframe] = useState('Last 7 days');
  const [trendDropdownOpen, setTrendDropdownOpen] = useState(false);
  const [trendActivity, setTrendActivity] = useState([]);
  const trendScrollRef = React.useRef(null);
  const [pipelineFilter, setPipelineFilter] = useState('All Jobs');
  const [pipelineDropdownOpen, setPipelineDropdownOpen] = useState(false);
  const [activeDonutStage, setActiveDonutStage] = useState(null);
  const [liveDataUpdatedAt, setLiveDataUpdatedAt] = useState(null);
  const [performanceSignature, setPerformanceSignature] = useState(() => {
    try {
      const cached = sessionStorage.getItem('tf_perf_signature');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const liveRefreshInFlightRef = React.useRef(false);

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
    if (!sessionVerified) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    const loadDashboardData = async () => {
      if (applications.length === 0) {
        setLoading(true);
        try {
          await fetchApplications();
        } catch (err) {
          console.error("Dashboard fetch error:", err);
        } finally {
          if (active) setLoading(false);
        }
      } else {
        if (active) setLoading(false);
        fetchApplications().catch(err => console.error("Background refresh error:", err));
      }
    };
    loadDashboardData();

    if (session?.access_token) {
      notificationApi.reminders(session.access_token)
        .then(reminders => {
          if (active) {
            setPersistedReminders(reminders.filter(item => !['completed', 'cancelled'].includes(item.status)));
          }
        })
        .catch(error => console.warn('Dashboard reminders unavailable:', error));
    }

    return () => { active = false; };
  }, [sessionVerified, session?.access_token, apiUrl]);

  useEffect(() => {
    const token = session?.access_token;
    if (!sessionVerified || !token) return undefined;
    let active = true;

    const refreshLiveDashboardData = async () => {
      // The side panel can sit open but unfocused for long stretches (user
      // working in the job-site tab). Unlike NotificationCenter's poll,
      // this one had no visibility check, so it fired 3 parallel requests
      // (applications, reminders, performance-signature) every 12s even
      // while the panel was backgrounded and nothing was watching for it.
      if (document.hidden) return;
      if (liveRefreshInFlightRef.current) return;
      liveRefreshInFlightRef.current = true;
      try {
        const [, reminders, signature] = await Promise.all([
          fetchApplications(),
          notificationApi.reminders(token),
          fetch(`${apiUrl}/api/v1/analytics/performance-signature`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(async response => {
            if (!response.ok) throw new Error('Performance signature request failed');
            return response.json();
          }),
        ]);
        if (!active) return;
        setPersistedReminders(
          (Array.isArray(reminders) ? reminders : [])
            .filter(item => !['completed', 'cancelled'].includes(item.status))
        );
        setPerformanceSignature(signature || null);
        if (signature) {
          try { sessionStorage.setItem('tf_perf_signature', JSON.stringify(signature)); } catch {}
        }
        setLiveDataUpdatedAt(new Date());
      } catch (error) {
        console.warn('Live dashboard refresh unavailable:', error);
      } finally {
        liveRefreshInFlightRef.current = false;
      }
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === 'visible') refreshLiveDashboardData();
    };
    const intervalId = window.setInterval(refreshLiveDashboardData, 12000);
    window.addEventListener('focus', refreshLiveDashboardData);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);
    refreshLiveDashboardData();

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshLiveDashboardData);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [sessionVerified, session?.access_token, apiUrl]);

  useEffect(() => {
    const token = session?.access_token;
    if (!sessionVerified || !token) return;
    const days = trendTimeframe === 'Last 7 days' ? 7 : trendTimeframe === 'Last 90 days' ? 90 : 30;
    const controller = new AbortController();
    fetch(`${apiUrl}/api/v1/analytics/trend?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Trend request failed')))
      .then(data => setTrendActivity(data.series || []))
      .catch(error => {
        if (error.name !== 'AbortError') setTrendActivity([]);
      });
    return () => controller.abort();
  }, [apiUrl, sessionVerified, session?.access_token, trendTimeframe]);

  // Clean Display Name Resolution (First Name, Middle Name, Last Name)
  const firstName = useMemo(() => {
    let nameStr = '';

    if (profile?.preferred_name?.trim()) {
      nameStr = profile.preferred_name.trim();
    } else {
      const profileParts = [
        profile?.first_name,
        profile?.middle_name,
        profile?.last_name
      ].filter(Boolean).map(s => String(s).trim()).filter(Boolean);

      if (profileParts.length > 0) {
        nameStr = profileParts.join(' ');
      } else if (profile?.full_name?.trim()) {
        nameStr = profile.full_name.trim();
      } else if (user?.user_metadata?.full_name?.trim()) {
        nameStr = user.user_metadata.full_name.trim();
      } else {
        const userMetaParts = [
          user?.user_metadata?.first_name,
          user?.user_metadata?.middle_name,
          user?.user_metadata?.last_name
        ].filter(Boolean).map(s => String(s).trim()).filter(Boolean);

        if (userMetaParts.length > 0) {
          nameStr = userMetaParts.join(' ');
        } else if (user?.user_metadata?.name?.trim()) {
          nameStr = user.user_metadata.name.trim();
        } else if (user?.email) {
          nameStr = user.email.split('@')[0];
        }
      }
    }

    if (!nameStr) return 'there';

    // 1. Split concatenated patterns (e.g. Bandinarendra -> Bandi Narendra) & camelCase/PascalCase
    // 2. Replace separators (._-+), remove digits
    const cleaned = String(nameStr)
      .replace(/(bandi)(narendra)/i, '$1 $2')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[._\-+]+/g, ' ')
      .replace(/\d+/g, '')
      .trim();

    if (!cleaned) return 'there';

    const words = cleaned.split(/\s+/).filter(Boolean);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'there';
  }, [profile, user]);

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

  const appliedApps = filteredApplications.filter(a => ['Applied', 'Ready To Apply', 'Resume Ready', 'Draft'].includes(a.current_stage));
  const screeningApps = filteredApplications.filter(a => ['Screening', 'Assessment', 'Recruiter', 'Recruiter Contact'].includes(a.current_stage));
  const interviewApps = filteredApplications.filter(a => ['Interview', 'Final Round'].includes(a.current_stage));
  const offerApps = filteredApplications.filter(a => ['Offer', 'Accepted'].includes(a.current_stage));
  const rejectedApps = filteredApplications.filter(a => a.current_stage === 'Rejected');

  const appliedGraphBars = useMemo(() => {
    const applied = filteredApplications.filter(a => (
      ['Applied', 'Ready To Apply', 'Resume Ready', 'Draft'].includes(a.current_stage)
    ));
    const bucketCount = 8;
    const dayMs = 86400000;
    const timestamps = applied
      .map((item) => {
        const date = new Date(item.created_at || item.updated_at || 0);
        date.setHours(0, 0, 0, 0);
        return date.getTime();
      })
      .filter(Number.isFinite);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const earliest = timestamps.length ? Math.min(...timestamps) : today.getTime();
    const latest = timestamps.length ? Math.max(...timestamps) : today.getTime();
    const spanDays = Math.max(1, Math.floor((latest - earliest) / dayMs) + 1);
    const daysPerBucket = Math.max(1, Math.ceil(spanDays / bucketCount));
    const chartStart = latest - ((bucketCount * daysPerBucket) - 1) * dayMs;

    return Array.from({ length: bucketCount }, (_, index) => {
      const start = chartStart + index * daysPerBucket * dayMs;
      const end = start + daysPerBucket * dayMs;
      const count = timestamps.filter(timestamp => timestamp >= start && timestamp < end).length;
      const startDate = new Date(start);
      const endDate = new Date(end - dayMs);
      const dateLabel = daysPerBucket === 1
        ? startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : `${startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}–${endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      return { count, dateLabel };
    });
  }, [filteredApplications]);

  const topDashboardGraphs = useMemo(() => {
    const weekMs = 7 * 86400000;
    const currentWeekStart = new Date();
    currentWeekStart.setHours(0, 0, 0, 0);
    currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay());
    const firstWeekStart = currentWeekStart.getTime() - 7 * weekMs;

    const downloaded = applications.filter((app) => (
      app?.resume_status === 'ready'
      || Boolean(app?.resume_version)
      || app?.timeline?.some(event => /resume downloaded/i.test(String(event?.event || '')))
    ));
    const hasGeneratedCoverLetter = (app) => {
      const status = String(app?.cover_letter_status || '').trim().toLowerCase();
      const version = String(app?.cover_letter_version || '').trim().toLowerCase();
      const snapshot = app?.cover_letter_snapshot;
      const snapshotHasContent = typeof snapshot === 'string'
        ? snapshot.trim().length > 0
        : Boolean(
            snapshot
            && typeof snapshot === 'object'
            && Object.keys(snapshot).length > 0
            && String(snapshot.content || snapshot.body || snapshot.letter || '').trim().length > 0
          );
      const hasRealVersion = Boolean(version)
        && !['pending', 'not created', 'none', 'null', 'draft'].includes(version)
        && /^v?\d/.test(version);
      const hasGenerationEvent = app?.timeline?.some(event => (
        /cover letter (generated|downloaded|created)/i.test(String(event?.event || ''))
      ));

      return status === 'ready' || snapshotHasContent || hasRealVersion || hasGenerationEvent;
    };
    const coverLetters = applications.filter(hasGeneratedCoverLetter);
    const successful = applications.filter(app => ['Offer', 'Accepted'].includes(app?.current_stage));
    const rejected = applications.filter(app => app?.current_stage === 'Rejected');

    const eventTime = (app, type) => {
      if (type === 'downloaded') {
        const downloadEvent = [...(app.timeline || [])]
          .reverse()
          .find(event => /resume downloaded/i.test(String(event?.event || '')));
        if (downloadEvent?.timestamp) return new Date(downloadEvent.timestamp).getTime();
      }
      if (type === 'cover-letter') {
        const coverLetterEvent = [...(app.timeline || [])]
          .reverse()
          .find(event => /cover letter (generated|downloaded)/i.test(String(event?.event || '')));
        if (coverLetterEvent?.timestamp) return new Date(coverLetterEvent.timestamp).getTime();
      }
      // Offer/rejection stages can change long after an application was
      // created. Plot outcomes on their persisted activity timestamp.
      return new Date(app.last_activity_at || app.last_activity || app.updated_at || app.created_at || 0).getTime();
    };

    const makeSeries = (records, type) => Array.from({ length: 8 }, (_, index) => {
      const start = firstWeekStart + index * weekMs;
      const end = start + weekMs;
      return {
        label: `W${index + 1}`,
        dateLabel: `${new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}–${new Date(end - 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
        count: records.filter((record) => {
          const timestamp = eventTime(record, type);
          return Number.isFinite(timestamp) && timestamp >= start && timestamp < end;
        }).length,
      };
    });

    return {
      downloadedTotal: downloaded.length,
      coverLetterTotal: coverLetters.length,
      successfulTotal: successful.length,
      rejectedTotal: rejected.length,
      downloadedSeries: makeSeries(downloaded, 'downloaded'),
      coverLetterSeries: makeSeries(coverLetters, 'cover-letter'),
      successfulSeries: makeSeries(successful, 'successful'),
      rejectedSeries: makeSeries(rejected, 'rejected'),
    };
  }, [applications]);

  const activeAppsCount = applications.filter(a => a && !['Accepted', 'Rejected', 'Archived'].includes(a.current_stage)).length;
  const appsSubmitted = applications.filter(a => a && a.current_stage !== 'Ready To Apply').length;
  const acceptedCount = applications.filter(a => a && a.current_stage === 'Accepted').length;
  const successRate = appsSubmitted === 0 ? 0 : Math.round(((acceptedCount + offerApps.length) / appsSubmitted) * 100);

  // Recent Resume ATS Score Calculation (Most Recent Application or Master Resume)
  const sortedScoredApps = useMemo(() => {
    return [...applications]
      .filter(a => a && (a.ats_score != null || a.resume_match_score != null))
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
  }, [applications]);

  const recentScoredApp = sortedScoredApps[0];

  // A brand-new user with no scored applications and no parsed resume score
  // previously fell through to a hardcoded `78` here -- indistinguishable
  // from a real score, and reported directly as "showing hardcoded values"
  // for a new account. Every other KPI card on this dashboard (Success
  // Rate, Interviews, Offers) already shows an honest 0/empty state when
  // there's no real data; this one should too.
  const hasScoredResume = Boolean(
    recentScoredApp || (parsedResume && (parsedResume.ats_score != null || parsedResume.score != null))
  );
  const recentResumeScore = useMemo(() => {
    if (recentScoredApp) {
      return Math.round(Number(recentScoredApp.ats_score ?? recentScoredApp.resume_match_score));
    }
    if (parsedResume && (parsedResume.ats_score != null || parsedResume.score != null)) {
      return Math.round(Number(parsedResume.ats_score ?? parsedResume.score));
    }
    return 0;
  }, [recentScoredApp, parsedResume]);

  const recentScoreSubtitle = useMemo(() => {
    if (recentScoredApp) {
      const company = recentScoredApp.company_name;
      return company ? `${company}` : 'Recent match';
    }
    if (parsedResume) return 'Primary Resume';
    return 'Target Score';
  }, [recentScoredApp, parsedResume]);

  // Animated KPI Counts
  const displayScore = useCountUp(recentResumeScore);
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

    if (!hasScoredResume) {
      items.push({
        id: 'score-resume',
        icon: Zap,
        type: 'Optimizer',
        title: 'Score your resume',
        subtitle: 'Run a tailoring pass to see your ATS match score.',
        actionLabel: 'Get Started',
        onAction: () => navigate('/resume-detect')
      });
    } else if (recentResumeScore < 85) {
      items.push({
        id: 'optimize-resume',
        icon: Zap,
        type: 'Optimizer',
        title: 'Resume score can improve',
        subtitle: `Your recent ATS match score is ${recentResumeScore}/100`,
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
  }, [applications, interviewApps, screeningApps, recentResumeScore, profile, parsedResume, navigate]);

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
  const donutStages = [
    { key: 'Applied', count: appliedApps.length, percent: pApplied, color: '#3B82F6' },
    { key: 'Screening', count: screeningApps.length, percent: pScreening, color: '#8B5CF6' },
    { key: 'Interview', count: interviewApps.length, percent: pInterview, color: '#F59E0B' },
    { key: 'Offer', count: offerApps.length, percent: pOffer, color: '#10B981' },
    { key: 'Rejected', count: rejectedApps.length, percent: pRejected, color: '#EF4444' },
  ];
  const selectedDonut = donutStages.find(stage => stage.key === activeDonutStage);
  const completeReminder = async (event, reminderId) => {
    event.stopPropagation();
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token) return;
    await notificationApi.completeReminder(token, reminderId);
    setPersistedReminders(items => items.filter(item => item.id !== reminderId));
  };
  const snoozeReminder = async (event, reminderId) => {
    event.stopPropagation();
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token) return;
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const updated = await notificationApi.snoozeReminder(token, reminderId, until);
    setPersistedReminders(items => items.map(item => item.id === reminderId ? updated : item));
  };

  // The API already returns the complete timezone-aware daily series.
  const trendPoints = useMemo(() => {
    const points = mapTailoringSeries(trendActivity);
    const maxCount = Math.max(...points.map(p => p.count), 1);
    const maxScale = Math.max(maxCount, 4);
    return points.map(point => ({ ...point, maxScale }));
  }, [trendActivity]);

  useEffect(() => {
    const container = trendScrollRef.current;
    if (!container || trendPoints.length === 0) return;
    window.requestAnimationFrame(() => {
      container.scrollLeft = container.scrollWidth - container.clientWidth;
    });
  }, [trendPoints, trendTimeframe]);

  const activeHoveredPoint = trendPoints[hoveredPointIndex] || trendPoints[trendPoints.length - 1];
  const trendLine = useMemo(() => {
    const width = Math.max(480, trendPoints.length * 42);
    const left = 34;
    const right = 14;
    const top = 10;
    const baseline = 112;
    const scale = trendPoints[0]?.maxScale || 4;
    const points = trendPoints.map((point, index) => ({
      ...point,
      x: trendPoints.length === 1
        ? width / 2
        : left + (index / (trendPoints.length - 1)) * (width - left - right),
      y: baseline - (point.count / scale) * (baseline - top)
    }));
    const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
    return { width, left, right, top, baseline, scale, points, path };
  }, [trendPoints]);

  const displayRecentApps = applications.slice(0, 5);

  const allReminders = useMemo(() => {
    return persistedReminders.map((reminder, idx) => {
      const d = new Date(reminder.event_at || reminder.snoozed_until || reminder.due_at);
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      return {
        id: reminder.id || idx,
        applicationId: reminder.application_id,
        month: months[d.getMonth()],
        day: d.getDate(),
        title: reminder.title,
        company: reminder.company_name || 'Personal reminder',
        role: reminder.job_title || reminder.description || 'Career action',
        description: reminder.next_action || reminder.description,
        stage: reminder.status,
        time: formatRelativeTime(reminder.snoozed_until || reminder.due_at),
        dueAt: reminder.snoozed_until || reminder.due_at,
        eventAt: reminder.event_at
      };
    });
  }, [persistedReminders]);

  const upcomingEvents = allReminders.slice(0, 3);

  const careerRadarMetrics = useMemo(() => {
    const db = performanceSignature?.metrics || {};
    const counts = performanceSignature?.counts || {};

    const applicationsCount = Number(counts.applications) || applications.length;
    const submittedCount = Number(counts.submitted) || applications.filter(a => a && a.current_stage !== 'Ready To Apply').length;

    // Instant client-side fallback metrics calculation if backend signature is loading/empty.
    // These used to fall back to flattering placeholder numbers (75/80/65/70)
    // for a brand-new user with zero real data -- presented as if computed,
    // reported directly as "showing hardcoded values" for a new account.
    // Interviews/Offers below already did this correctly (0 when there's
    // nothing to compute from); made the rest consistent with that.
    const computeAtsScore = () => {
      if (db.ats_match != null && Number(db.ats_match) > 0) return Math.round(Number(db.ats_match));
      if (recentResumeScore > 0) return recentResumeScore;
      return 0;
    };

    const computeResumeReady = () => {
      if (db.resume_ready != null && Number(db.resume_ready) > 0) return Math.round(Number(db.resume_ready));
      if (applications.length === 0) return 0;
      const readyCount = applications.filter(a => a?.resume_status === 'ready' || Boolean(a?.resume_version)).length;
      return Math.round((readyCount / applications.length) * 100);
    };

    const computeAppProgress = () => {
      if (db.application_progress != null && Number(db.application_progress) > 0) return Math.round(Number(db.application_progress));
      if (applications.length === 0) return 0;
      const stageScores = applications.map(a => {
        const stg = a?.current_stage;
        if (stg === 'Offer' || stg === 'Accepted') return 100;
        if (stg === 'Final Round') return 85;
        if (stg === 'Interview') return 70;
        if (stg === 'Assessment' || stg === 'Recruiter' || stg === 'Recruiter Contact') return 55;
        if (stg === 'Applied') return 35;
        return 15;
      });
      const avg = stageScores.reduce((sum, val) => sum + val, 0) / applications.length;
      return Math.round(avg);
    };

    const computeInterviews = () => {
      if (db.interviews != null && Number(db.interviews) > 0) return Math.round(Number(db.interviews));
      if (submittedCount === 0) return 0;
      const interviewCount = applications.filter(a => ['Interview', 'Final Round', 'Offer', 'Accepted'].includes(a?.current_stage)).length;
      return Math.round((interviewCount / submittedCount) * 100);
    };

    const computeCoverLetters = () => {
      if (db.cover_letter_ready != null && Number(db.cover_letter_ready) > 0) return Math.round(Number(db.cover_letter_ready));
      if (applications.length === 0) return 0;
      const clCount = applications.filter(a => a?.cover_letter_status === 'ready' || Boolean(a?.cover_letter_version)).length;
      return Math.round((clCount / applications.length) * 100);
    };

    const computeOffers = () => {
      if (db.offer_success != null && Number(db.offer_success) > 0) return Math.round(Number(db.offer_success));
      if (submittedCount === 0) return 0;
      const offerCount = applications.filter(a => ['Offer', 'Accepted'].includes(a?.current_stage)).length;
      return Math.round((offerCount / submittedCount) * 100);
    };

    const resumeReadyCount = Number(counts.resume_ready) || applications.filter(a => a?.resume_status === 'ready' || Boolean(a?.resume_version)).length;
    const interviewCount = Number(counts.interviews) || applications.filter(a => ['Interview', 'Final Round', 'Offer', 'Accepted'].includes(a?.current_stage)).length;
    const coverLetterCount = Number(counts.cover_letters) || applications.filter(a => a?.cover_letter_status === 'ready' || Boolean(a?.cover_letter_version)).length;

    return [
      { label: 'ATS Match', value: computeAtsScore(), detail: 'ATS Match & Keyword Strength' },
      { label: 'Tailored Fit', value: computeResumeReady(), detail: `${resumeReadyCount} of ${applicationsCount} resumes tailored` },
      { label: 'Impact Score', value: computeAppProgress(), detail: 'Impact & Conversion Score' },
      { label: 'Interviews', value: computeInterviews(), detail: `${interviewCount} of ${submittedCount || 1} interviews` },
      { label: 'Cover Letters', value: computeCoverLetters(), detail: `${coverLetterCount} active pipeline volume` },
      { label: 'Offer Rate', value: computeOffers(), detail: `${offerApps.length} offers & career mobility` },
    ];
  }, [performanceSignature, applications, recentResumeScore, offerApps.length]);

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
        <div className="dashboard-career-canvas flex-1 w-full flex flex-col gap-6 font-sans pb-12 select-none text-tf-text animate-in fade-in slide-in-from-bottom-2 duration-300">

          {/* 1. HERO GREETING BANNER */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }} className="dashboard-greeting dashboard-interactive-surface bg-gradient-to-br from-sky-50/70 via-white to-teal-50/40 dark:bg-zinc-900/80 backdrop-blur-md p-6 rounded-2xl border border-sky-200/60 dark:border-zinc-800 shadow-2xs space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-tf-text">
              {greetingPrefix}, <WaveText text={firstName} trigger="hover" amplitude={9} stagger={0.03} duration={0.4} />.
            </h1>
            <p className="text-xs font-medium text-tf-text-secondary">
              {priorityActionItems.length > 0
                ? `Your application pipeline is active. ${priorityActionItems.length} priority ${priorityActionItems.length === 1 ? 'action requires' : 'actions require'} your attention today.`
                : 'Your application pipeline is up to date and performing smoothly.'}
            </p>
          </motion.div>

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
                    Add your contact details and preferred roles to improve tailr4u recommendation accuracy.
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

          {/* 3. PRIMARY ANALYTICS — LARGE GRAPHS FIRST */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {[
              {
                key: 'downloads',
                eyebrow: 'DOCUMENT OUTPUT',
                title: 'Generated Documents',
                description: 'Completed resume and cover-letter outputs over the last eight weeks',
                lines: [
                  { label: 'Resumes', total: topDashboardGraphs.downloadedTotal, series: topDashboardGraphs.downloadedSeries, stroke: '#38BDF8', unit: 'resumes' },
                  { label: 'Cover letters', total: topDashboardGraphs.coverLetterTotal, series: topDashboardGraphs.coverLetterSeries, stroke: '#F97316', unit: 'cover letters' },
                ],
              },
              {
                key: 'success',
                eyebrow: 'APPLICATION OUTCOMES',
                title: 'Offer Outcomes',
                description: 'Secured and rejected offers over the last eight weeks',
                lines: [
                  { label: 'Secured', total: topDashboardGraphs.successfulTotal, series: topDashboardGraphs.successfulSeries, stroke: '#F97316', unit: 'offers' },
                  { label: 'Rejected', total: topDashboardGraphs.rejectedTotal, series: topDashboardGraphs.rejectedSeries, stroke: '#38BDF8', unit: 'rejections' },
                ],
              },
            ].map((graph, graphIndex) => {
              const width = 620;
              const height = 190;
              const left = 34;
              const right = 18;
              const top = 18;
              const bottom = 32;
              const graphMax = Math.max(...graph.lines.flatMap(line => line.series.map(item => item.count)), 1);
              const renderedLines = graph.lines.map(line => {
                const points = line.series.map((item, index) => ({
                  ...item,
                  x: left + (index / Math.max(line.series.length - 1, 1)) * (width - left - right),
                  y: top + (1 - item.count / graphMax) * (height - top - bottom),
                }));
                return {
                  ...line,
                  points,
                  path: points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '),
                };
              });

              return (
                <motion.section
                  key={graph.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: .04 + graphIndex * .06 }}
                  className={`dashboard-panel dashboard-interactive-surface overflow-hidden rounded-2xl border ${
                    graph.key === 'downloads' ? 'border-sky-200/60 bg-gradient-to-br from-sky-50/50 via-white to-blue-50/30' : 'border-orange-200/60 bg-gradient-to-br from-orange-50/50 via-white to-amber-50/30'
                  } dark:border-tf-border dark:bg-zinc-900/85 p-6 shadow-2xs`}
                >
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <p className="text-[10px] font-bold tracking-[0.18em] text-tf-text-tertiary">{graph.eyebrow}</p>
                      <h2 className="mt-2 text-base font-extrabold text-tf-text">{graph.title}</h2>
                      <p className="mt-1 text-[11px] text-tf-text-secondary">{graph.description}</p>
                    </div>
                    <div className="flex shrink-0 gap-4 text-right">
                      {graph.lines.map(line => (
                        <div key={line.label}>
                          <div className="text-3xl font-black tracking-tight" style={{ color: line.stroke }}>{line.total}</div>
                          <div className="text-[9px] font-bold uppercase tracking-wider text-tf-text-tertiary">{line.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    {graph.lines.map(line => (
                      <div key={line.label} className="flex items-center gap-2 text-[10px] font-bold text-tf-text-secondary">
                        <span className="h-0.5 w-6 rounded-full" style={{ backgroundColor: line.stroke }} />
                        <span>{line.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5">
                    <svg className="h-[190px] w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={graph.title}>
                      {[top, top + (height - top - bottom) / 2, height - bottom].map((y) => (
                        <line key={y} x1={left} x2={width - right} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.1" strokeDasharray="4 5" />
                      ))}
                      {renderedLines.map((line, lineIndex) => (
                        <g key={line.label}>
                          <motion.path
                            d={line.path}
                            fill="none"
                            stroke={line.stroke}
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: .7, delay: lineIndex * .08, ease: 'easeOut' }}
                          />
                          {line.points.map((point) => (
                            <g key={`${line.label}-${point.label}`} className="group/point">
                              <circle cx={point.x} cy={point.y} r="11" fill="transparent" />
                              <circle cx={point.x} cy={point.y} r="4.5" fill={line.stroke} stroke="white" strokeWidth="2" />
                              <g className="pointer-events-none hidden group-hover/point:block">
                                <rect x={Math.min(width - 150, Math.max(4, point.x - 67))} y={Math.max(2, point.y - 48 - lineIndex * 38)} width="134" height="34" rx="8" fill="#09090b" />
                                <text x={Math.min(width - 83, Math.max(71, point.x))} y={Math.max(16, point.y - 34 - lineIndex * 38)} fill="white" fontSize="9" fontWeight="700" textAnchor="middle">
                                  {point.dateLabel}
                                </text>
                                <text x={Math.min(width - 83, Math.max(71, point.x))} y={Math.max(27, point.y - 23 - lineIndex * 38)} fill="white" fontSize="9" textAnchor="middle">
                                  {line.label}: {point.count}
                                </text>
                              </g>
                              {lineIndex === 0 && (
                                <text x={point.x} y={height - 10} fill="currentColor" opacity="0.58" fontSize="10" textAnchor="middle">{point.label}</text>
                              )}
                            </g>
                          ))}
                        </g>
                      ))}
                    </svg>
                  </div>
                </motion.section>
              );
            })}
          </div>

          {/* 4. SUPPORTING KPI CARDS BELOW THE GRAPHS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* KPI Card 1: Recent ATS */}
            <motion.div tabIndex="0" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .06 }} className="dashboard-kpi-card dashboard-interactive-surface kpi-emerald bg-gradient-to-br from-emerald-50/80 via-white to-lime-50/30 dark:bg-zinc-900/80 border border-emerald-300/60 dark:border-emerald-500/30 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-2xs">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-tf-text-secondary">Recent ATS</span>
                  <div className="text-3xl font-extrabold tracking-tight text-tf-text flex items-baseline gap-1">
                    <span>{displayScore}</span>
                    <span className="text-xs font-semibold text-tf-text-tertiary">/100</span>
                  </div>
                  <div className="mt-2 h-1.5 w-24 overflow-hidden rounded-full bg-emerald-500/10">
                    <motion.div
                      className="h-full rounded-full bg-emerald-500/80"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(0, Math.min(100, recentResumeScore || 0))}%` }}
                      transition={{ duration: 0.7, ease: [0.2, 0, 0, 1] }}
                    />
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center border border-orange-500/20">
                  <Award size={16} />
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-2 border-t border-orange-500/10">
                <span className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 truncate max-w-[110px]" title={recentScoreSubtitle}>
                  {!hasScoredResume ? 'Not scored yet' : recentResumeScore >= 80 ? (recentScoreSubtitle || 'Optimized match') : '3 improvements'}
                </span>
                <button
                  onClick={() => navigate('/resume-detect')}
                  className="text-[11px] font-bold text-tf-accent hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  {hasScoredResume ? 'Improve' : 'Get Started'} <ArrowRight size={11} />
                </button>
              </div>
            </motion.div>

            {/* KPI Card 2: Success Rate */}
            <motion.div tabIndex="0" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .14 }} className="dashboard-kpi-card dashboard-interactive-surface kpi-mint bg-gradient-to-br from-teal-50/80 via-white to-emerald-50/30 dark:bg-zinc-900/80 border border-teal-200/60 dark:border-zinc-800 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-2xs">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-tf-text-secondary">Success Rate</span>
                  <div className="text-2xl font-extrabold tracking-tight text-tf-text">{displaySuccess}%</div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-500/20">
                  <TrendingUp size={16} />
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-2 border-t border-tf-border/50">
                <span className="text-[11px] font-semibold text-emerald-500 flex items-center gap-0.5">
                  ↗ {successRate}% <span className="text-tf-text-tertiary font-normal pl-0.5">vs last month</span>
                </span>
                <svg className="dashboard-sparkline w-14 h-5 text-emerald-500 overflow-visible" viewBox="0 0 80 30" fill="none">
                  <path
                    d={successRate <= 0 ? "M0 24 L 80 24" : "M0 25 Q 20 28, 35 15 T 70 8 T 80 5"}
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    opacity={successRate <= 0 ? 0.35 : 1}
                  />
                </svg>
              </div>
            </motion.div>

            {/* Secondary KPI Card 4: Interviews */}
            <motion.div tabIndex="0" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .18 }} className="dashboard-kpi-card dashboard-interactive-surface kpi-amber bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/30 dark:bg-zinc-900/80 border border-indigo-200/60 dark:border-zinc-800 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-2xs">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-tf-text-secondary">Interviews</span>
                  <div className="text-2xl font-extrabold tracking-tight text-tf-text">
                    {displayInterviews}
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20">
                  <Calendar size={16} />
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-2 border-t border-tf-border/50">
                <span className="text-[11px] font-medium text-tf-text-secondary">This month</span>
                <svg className="dashboard-sparkline w-14 h-5 text-indigo-500 overflow-visible" viewBox="0 0 80 30" fill="none">
                  <path
                    d={interviewApps.length <= 0 ? "M0 24 L 80 24" : interviewApps.length < 3 ? "M0 24 Q 40 20, 80 10" : "M0 26 Q 20 22, 40 24 T 65 12 T 80 8"}
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    opacity={interviewApps.length <= 0 ? 0.35 : 1}
                  />
                </svg>
              </div>
            </motion.div>

            {/* Secondary KPI Card 5: Offers */}
            <motion.div tabIndex="0" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .22 }} className="dashboard-kpi-card dashboard-interactive-surface kpi-emerald bg-gradient-to-br from-lime-50/80 via-white to-emerald-50/30 dark:bg-zinc-900/80 border border-lime-200/60 dark:border-zinc-800 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-2xs">
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
            </motion.div>


          </div>

          {/* 4. MAIN DASHBOARD CONTENT (2 COLUMNS) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* LEFT COLUMN (2/3 width) */}
            <div className="lg:col-span-2 space-y-6">

              {/* ROW 1: RESUME ACTIVITY & RECENT ACTIVITY (SIDE-BY-SIDE) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <CareerPerformanceRadar metrics={careerRadarMetrics} updatedAt={liveDataUpdatedAt} />

                {/* CARD A: APPLICATION TREND CHART */}
                <div className="hidden dashboard-panel dashboard-trend-panel dashboard-interactive-surface bg-white/80 dark:bg-zinc-900/80 border border-tf-border rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between relative">
                  <div className="flex items-center justify-between relative z-20">
                    <div>
                      <h3 className="text-xs font-bold text-tf-text">JD Activity</h3>
                      <p className="text-[11px] text-tf-text-tertiary">Job descriptions extracted by day</p>
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
                                setHoveredPointIndex(-1);
                              }}
                              className={`w-full text-left px-3 py-1.5 text-[11px] font-medium transition cursor-pointer ${trendTimeframe === opt ? 'bg-tf-accent/15 text-tf-accent font-bold' : 'text-tf-text hover:bg-tf-surface-2'
                                }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Daily histogram: one visible bar and date for every day. */}
                  <div className="relative pt-2">
                    {activeHoveredPoint && (
                      <div className="mb-3 flex items-center justify-between rounded-xl border border-orange-500/15 bg-orange-500/5 px-3 py-2">
                        <span className="text-[10px] font-semibold text-tf-text-secondary">{activeHoveredPoint.accessibleLabel}</span>
                        <span className="text-[11px] font-bold text-orange-500">
                          {activeHoveredPoint.count} {activeHoveredPoint.count === 1 ? 'JD' : 'JDs'} extracted
                        </span>
                      </div>
                    )}
                    <div ref={trendScrollRef} className="min-w-0 overflow-x-auto pb-2">
                      <svg
                        className="h-[174px] select-none"
                        width={trendLine.width}
                        viewBox={`0 0 ${trendLine.width} 154`}
                        role="img"
                        aria-label={`JD extraction trend for ${trendTimeframe.toLowerCase()}`}
                      >
                        <defs>
                          <linearGradient id="trendLineArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#F97316" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#F97316" stopOpacity="0.01" />
                          </linearGradient>
                        </defs>

                        {[trendLine.top, (trendLine.top + trendLine.baseline) / 2, trendLine.baseline].map((y, index) => (
                          <g key={y}>
                            <line
                              x1={trendLine.left}
                              y1={y}
                              x2={trendLine.width - trendLine.right}
                              y2={y}
                              stroke="currentColor"
                              strokeOpacity={index === 2 ? 0.18 : 0.1}
                            />
                            <text x="2" y={y + 3} fill="currentColor" opacity="0.45" fontSize="9">
                              {index === 0 ? trendLine.scale : index === 1 ? Math.round(trendLine.scale / 2) : 0}
                            </text>
                          </g>
                        ))}

                        {trendLine.points.length > 1 && (
                          <>
                            <path
                              d={`${trendLine.path} L ${trendLine.points.at(-1).x} ${trendLine.baseline} L ${trendLine.points[0].x} ${trendLine.baseline} Z`}
                              fill="url(#trendLineArea)"
                            />
                            <motion.path
                              d={trendLine.path}
                              fill="none"
                              stroke="#F97316"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ duration: .55 }}
                            />
                          </>
                        )}

                        {trendLine.points.map((point, index) => {
                          const selected = hoveredPointIndex === index;
                          return (
                            <g
                              key={point.timestamp}
                              className="cursor-pointer"
                              tabIndex="0"
                              role="button"
                              aria-label={`${point.accessibleLabel}: ${point.count} resume activities`}
                              onMouseEnter={() => setHoveredPointIndex(index)}
                              onFocus={() => setHoveredPointIndex(index)}
                              onClick={() => setHoveredPointIndex(index)}
                            >
                              <rect
                                x={point.x - 18}
                                y={trendLine.top}
                                width="36"
                                height={trendLine.baseline - trendLine.top}
                                fill="transparent"
                              />
                              {selected && <line x1={point.x} x2={point.x} y1={trendLine.top} y2={trendLine.baseline} stroke="#F97316" strokeOpacity=".28" strokeDasharray="3 3" />}
                              <motion.circle
                                cx={point.x}
                                cy={point.y}
                                r={selected ? 5 : 3}
                                fill="var(--tf-surface, white)"
                                stroke="#F97316"
                                strokeWidth="2"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1, opacity: hoveredPointIndex < 0 || selected ? 1 : .38 }}
                                transition={{ delay: Math.min(index * .015, .45) }}
                              />
                              <text
                                x={point.x}
                                y="140"
                                textAnchor="middle"
                                fill={selected ? '#F97316' : 'currentColor'}
                                opacity={selected ? 1 : 0.5}
                                fontSize="8"
                                fontWeight={selected ? 700 : 500}
                              >
                                {point.label}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                    {trendPoints.every(point => point.count === 0) && (
                      <div className="dashboard-chart-empty">
                        <span>No resumes were tailored during this period.</span>
                        <button onClick={() => navigate('/tailor')}>Tailor a resume</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* CARD B: RECENT ACTIVITY FEED */}
                <div className="dashboard-panel dashboard-activity-panel dashboard-interactive-surface bg-gradient-to-br from-sky-50/70 via-white to-cyan-50/40 dark:bg-zinc-900/80 border border-sky-200/60 dark:border-zinc-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-xs font-bold text-tf-text">Recent Activity</h3>
                    <p className="text-[11px] text-tf-text-tertiary">Real-time log of application updates</p>
                  </div>

                  <div className="space-y-2.5">
                    {recentActivities.length > 0 ? (
                      recentActivities.map((act, index) => (
                        <motion.button
                          key={act.id}
                          type="button"
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * .05, duration: .24 }}
                          onClick={() => {
                            if (act.applicationId) {
                              navigate(`/job-tracker?appId=${act.applicationId}`, { state: { selectedAppId: act.applicationId } });
                            } else {
                              navigate('/job-tracker');
                            }
                          }}
                          className="dashboard-activity-item dashboard-solid-row w-full flex items-center justify-between p-2.5 rounded-xl text-left transition cursor-pointer border"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                            <span className="w-1.5 h-1.5 rounded-full bg-lime-500 shrink-0" />
                            <CompanyFavicon companyName={act.company} jobUrl={act.jobUrl} className="w-5 h-5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-tf-text truncate">{act.company || 'Application'}</div>
                              <div className="text-[10px] text-tf-text-secondary truncate">{act.event}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-auto">
                            <span className="text-[10px] font-medium text-tf-text-tertiary whitespace-nowrap text-right min-w-[50px]">
                              {formatRelativeTime(act.timestamp)}
                            </span>
                            <ArrowRight className="dashboard-activity-action text-tf-text-tertiary shrink-0" size={12} aria-hidden="true" />
                          </div>
                        </motion.button>
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

              {/* ROW 2: JOB PIPELINE STAGES FLOW WITH COMPANY FAVICONS */}
              <div className="hidden dashboard-panel dashboard-pipeline-panel dashboard-interactive-surface bg-white/80 dark:bg-zinc-900/80 border border-tf-border rounded-2xl p-6 shadow-xs space-y-5">
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
                            className={`w-full text-left px-3.5 py-1.5 text-xs font-medium transition cursor-pointer ${pipelineFilter === opt ? 'bg-tf-accent/15 text-tf-accent font-bold' : 'text-tf-text hover:bg-tf-surface-2'
                              }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* TWO-CHART PIPELINE SUMMARY */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => navigate('/job-tracker')}
                    className="group rounded-2xl border border-blue-500/15 bg-blue-500/[0.04] p-5 text-left transition hover:border-blue-500/35 hover:bg-blue-500/[0.07]"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-bold text-tf-text">Jobs Applied</p>
                        <p className="mt-1 text-[11px] text-tf-text-secondary">Applications in the selected period</p>
                      </div>
                      <span className="text-3xl font-black tracking-tight text-blue-500">{appliedApps.length}</span>
                    </div>
                    <div className="mt-6 flex h-28 items-end gap-2" aria-label={`${appliedApps.length} jobs applied`}>
                      {appliedGraphBars.map((bar, index) => {
                        const chartMax = Math.max(...appliedGraphBars.map(item => item.count), 1);
                        const height = bar.count > 0
                          ? Math.max(14, Math.round((bar.count / chartMax) * 100))
                          : 5;
                        return (
                          <div key={`${bar.dateLabel}-${index}`} className="group/bar relative flex h-full min-w-0 flex-1 items-end">
                            <motion.span
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: `${height}%`, opacity: bar.count > 0 ? 1 : 0.18 }}
                              transition={{ delay: index * 0.035, duration: 0.35 }}
                              className="w-full rounded-t-md bg-blue-500 transition-colors group-hover/bar:bg-blue-600"
                            />
                            <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-zinc-950 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-xl group-hover/bar:block">
                              {bar.dateLabel}: {bar.count} {bar.count === 1 ? 'application' : 'applications'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-tf-border/60 pt-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-tf-text-tertiary">Total applied</span>
                      <ArrowRight size={14} className="text-blue-500 transition-transform group-hover:translate-x-1" />
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/job-tracker')}
                    className="group rounded-2xl border border-orange-500/15 bg-orange-500/[0.04] p-5 text-left transition hover:border-orange-500/35 hover:bg-orange-500/[0.07]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold text-tf-text">Offers & Rejections</p>
                        <p className="mt-1 text-[11px] text-tf-text-secondary">Application outcomes in the selected period</p>
                      </div>
                      <div className="flex gap-3 text-right">
                        <div>
                          <div className="text-2xl font-black text-emerald-500">{offerApps.length}</div>
                          <div className="text-[9px] font-bold uppercase tracking-wider text-tf-text-tertiary">Offers</div>
                        </div>
                        <div>
                          <div className="text-2xl font-black text-orange-500">{rejectedApps.length}</div>
                          <div className="text-[9px] font-bold uppercase tracking-wider text-tf-text-tertiary">Rejected</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-7 space-y-5">
                      {[
                        { label: 'Offers', value: offerApps.length, color: 'bg-emerald-500' },
                        { label: 'Rejected', value: rejectedApps.length, color: 'bg-orange-500' },
                      ].map((item) => {
                        const outcomeMax = Math.max(offerApps.length, rejectedApps.length, 1);
                        return (
                          <div key={item.label}>
                            <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold">
                              <span className="text-tf-text-secondary">{item.label}</span>
                              <span className="text-tf-text">{item.value}</span>
                            </div>
                            <div className="group/outcome relative h-3 rounded-full bg-tf-border/60">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(item.value / outcomeMax) * 100}%` }}
                                transition={{ duration: 0.55, ease: 'easeOut' }}
                                className={`h-full rounded-full ${item.color}`}
                              />
                              <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-zinc-950 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-xl group-hover/outcome:block">
                                {item.label}: {item.value} {item.value === 1 ? 'job' : 'jobs'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-tf-border/60 pt-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-tf-text-tertiary">Outcome comparison</span>
                      <ArrowRight size={14} className="text-orange-500 transition-transform group-hover:translate-x-1" />
                    </div>
                  </button>
                </div>

                {false && (
                /* Legacy stage columns retained outside the rendered layout. */
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 relative">

                  {/* Stage 1: Applied */}
                  <div className="bg-zinc-100/70 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60 rounded-xl p-3.5 space-y-3 relative hover:border-zinc-300 dark:hover:border-zinc-600 transition-all shadow-2xs">
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-200/60 dark:border-zinc-700/50">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                          <Send size={11} />
                        </div>
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Applied</span>
                      </div>
                      <span className="text-xs font-extrabold text-zinc-700 dark:text-zinc-300 bg-zinc-200/60 dark:bg-zinc-700/50 px-2 py-0.5 rounded-full">
                        {appliedApps.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {appliedApps.length > 0 ? (
                        appliedApps.slice(0, 3).map((item, idx) => (
                          <div
                            key={item.id || idx}
                            onClick={() => navigate(`/job-tracker?appId=${item.id}`, { state: { selectedAppId: item.id } })}
                            className="flex items-center justify-between text-[11px] p-1.5 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <CompanyFavicon companyName={item.company_name} jobUrl={item.job_url} companyDomain={item.company_domain} className="w-4 h-4" />
                              <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[80px]">{item.company_name}</span>
                            </div>
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium shrink-0">{formatRelativeTime(item.created_at)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500 italic py-2 text-center">No jobs in this stage</div>
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
                  <div className="bg-zinc-100/70 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60 rounded-xl p-3.5 space-y-3 relative hover:border-zinc-300 dark:hover:border-zinc-600 transition-all shadow-2xs">
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-200/60 dark:border-zinc-700/50">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                          <Search size={11} />
                        </div>
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Screening</span>
                      </div>
                      <span className="text-xs font-extrabold text-zinc-700 dark:text-zinc-300 bg-zinc-200/60 dark:bg-zinc-700/50 px-2 py-0.5 rounded-full">
                        {screeningApps.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {screeningApps.length > 0 ? (
                        screeningApps.slice(0, 3).map((item, idx) => (
                          <div
                            key={item.id || idx}
                            onClick={() => navigate(`/job-tracker?appId=${item.id}`, { state: { selectedAppId: item.id } })}
                            className="flex items-center justify-between text-[11px] p-1.5 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <CompanyFavicon companyName={item.company_name} jobUrl={item.job_url} companyDomain={item.company_domain} className="w-4 h-4" />
                              <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[80px]">{item.company_name}</span>
                            </div>
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium shrink-0">{formatRelativeTime(item.created_at)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500 italic py-2 text-center">No jobs in this stage</div>
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
                  <div className="bg-zinc-100/70 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60 rounded-xl p-3.5 space-y-3 relative hover:border-zinc-300 dark:hover:border-zinc-600 transition-all shadow-2xs">
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-200/60 dark:border-zinc-700/50">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                          <Calendar size={11} />
                        </div>
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Interview</span>
                      </div>
                      <span className="text-xs font-extrabold text-zinc-700 dark:text-zinc-300 bg-zinc-200/60 dark:bg-zinc-700/50 px-2 py-0.5 rounded-full">
                        {interviewApps.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {interviewApps.length > 0 ? (
                        interviewApps.slice(0, 3).map((item, idx) => (
                          <div
                            key={item.id || idx}
                            onClick={() => navigate(`/job-tracker?appId=${item.id}`, { state: { selectedAppId: item.id } })}
                            className="flex items-center justify-between text-[11px] p-1.5 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <CompanyFavicon companyName={item.company_name} jobUrl={item.job_url} companyDomain={item.company_domain} className="w-4 h-4" />
                              <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[80px]">{item.company_name}</span>
                            </div>
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium shrink-0">{formatRelativeTime(item.created_at)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500 italic py-2 text-center">No jobs in this stage</div>
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
                  <div className="bg-zinc-100/70 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60 rounded-xl p-3.5 space-y-3 relative hover:border-zinc-300 dark:hover:border-zinc-600 transition-all shadow-2xs">
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-200/60 dark:border-zinc-700/50">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                          <Award size={11} />
                        </div>
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Offer</span>
                      </div>
                      <span className="text-xs font-extrabold text-zinc-700 dark:text-zinc-300 bg-zinc-200/60 dark:bg-zinc-700/50 px-2 py-0.5 rounded-full">
                        {offerApps.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {offerApps.length > 0 ? (
                        offerApps.slice(0, 3).map((item, idx) => (
                          <div
                            key={item.id || idx}
                            onClick={() => navigate(`/job-tracker?appId=${item.id}`, { state: { selectedAppId: item.id } })}
                            className="flex items-center justify-between text-[11px] p-1.5 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <CompanyFavicon companyName={item.company_name} jobUrl={item.job_url} companyDomain={item.company_domain} className="w-4 h-4" />
                              <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[80px]">{item.company_name}</span>
                            </div>
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium shrink-0">{formatRelativeTime(item.created_at)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500 italic py-2 text-center">No jobs in this stage</div>
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
                  <div className="bg-zinc-100/70 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-700/60 rounded-xl p-3.5 space-y-3 relative hover:border-zinc-300 dark:hover:border-zinc-600 transition-all shadow-2xs">
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-200/60 dark:border-zinc-700/50">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                          <XCircle size={11} />
                        </div>
                        <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">Rejected</span>
                      </div>
                      <span className="text-xs font-extrabold text-zinc-700 dark:text-zinc-300 bg-zinc-200/60 dark:bg-zinc-700/50 px-2 py-0.5 rounded-full">
                        {rejectedApps.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {rejectedApps.length > 0 ? (
                        rejectedApps.slice(0, 3).map((item, idx) => (
                          <div
                            key={item.id || idx}
                            onClick={() => navigate(`/job-tracker?appId=${item.id}`, { state: { selectedAppId: item.id } })}
                            className="flex items-center justify-between text-[11px] p-1.5 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <CompanyFavicon companyName={item.company_name} jobUrl={item.job_url} companyDomain={item.company_domain} className="w-4 h-4" />
                              <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[80px]">{item.company_name}</span>
                            </div>
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium shrink-0">{formatRelativeTime(item.created_at)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-[11px] text-zinc-400 dark:text-zinc-500 italic py-2 text-center">No jobs in this stage</div>
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
                )}
              </div>

            </div>

            {/* RIGHT COLUMN (1/3 width) */}
            <div className="space-y-6">
          <div className="dashboard-panel dashboard-interactive-surface bg-gradient-to-br from-lime-50/70 via-white to-emerald-50/40 dark:bg-zinc-900/80 border border-lime-200/60 dark:border-zinc-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-tf-text">Upcoming Reminders</h3>
              <span className="text-[11px] font-semibold text-tf-accent">{upcomingEvents.length} scheduled</span>
            </div>

                <div className="space-y-3">
                  {upcomingEvents.length > 0 ? (
                    upcomingEvents.map((evt) => (
                      <motion.div
                        key={evt.id}
                        layout
                        onClick={() => setShowRemindersModal(true)}
                        className="dashboard-reminder-item dashboard-solid-row flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer relative"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="dashboard-row-date w-10 h-10 rounded-xl border flex flex-col items-center justify-center leading-none text-tf-text shrink-0">
                            <span className="text-[9px] font-black text-tf-text-tertiary uppercase">{evt.month}</span>
                            <span className="text-sm font-black">{evt.day}</span>
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-tf-text truncate">{evt.title}</h4>
                            <p className="text-[10px] text-tf-text-secondary truncate mt-0.5">{evt.company} · {evt.role}</p>
                            <span className="text-[9px] font-semibold text-tf-accent">{evt.time}</span>
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-tf-text-tertiary shrink-0" />
                      </motion.div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-tf-border bg-tf-surface-2/40 px-4 py-7 text-center">
                      <CheckCircle size={20} className="mx-auto text-tf-success mb-2" />
                      <p className="text-xs font-semibold text-tf-text">No upcoming reminders</p>
                      <p className="text-[10px] text-tf-text-tertiary mt-1">You are all caught up.</p>
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
              <div className="hidden dashboard-panel dashboard-overview-panel dashboard-interactive-surface bg-white/80 dark:bg-zinc-900/80 border border-tf-border rounded-2xl p-6 shadow-xs space-y-5">
                <h3 className="text-sm font-bold text-tf-text">Pipeline Overview</h3>

                <div className="flex flex-col items-center gap-5">
                  <div className="relative w-40 h-40 flex items-center justify-center">
                    <svg className="dashboard-donut w-full h-full transform -rotate-90" viewBox="0 0 100 100" onMouseLeave={() => setActiveDonutStage(null)}>
                      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" opacity="0.08" strokeWidth="16" />
                      {donutStages.map((stage, index) => {
                        if (!stage.percent) return null;
                        const preceding = donutStages.slice(0, index).reduce((sum, item) => sum + item.percent, 0);
                        const active = !activeDonutStage || activeDonutStage === stage.key;
                        return <motion.circle
                          key={stage.key}
                          tabIndex="0"
                          role="button"
                          aria-label={`${stage.key}: ${stage.count} jobs, ${stage.percent}%`}
                          cx="50" cy="50" r="38" fill="none" stroke={stage.color} strokeWidth="16"
                          strokeDasharray={`${(stage.percent / 100) * 238} 238`}
                          strokeDashoffset={`-${(preceding / 100) * 238}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: active ? 1 : .28 }}
                          transition={{ duration: .55, delay: index * .04 }}
                          onMouseEnter={() => setActiveDonutStage(stage.key)}
                          onFocus={() => setActiveDonutStage(stage.key)}
                          onBlur={() => setActiveDonutStage(null)}
                          onClick={() => navigate(`/job-tracker?stage=${encodeURIComponent(stage.key)}`)}
                        />;
                      })}
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-2xl font-black text-tf-text">{selectedDonut?.count ?? totalTracked}</span>
                      <span className="text-[10px] font-semibold text-tf-text-tertiary uppercase tracking-wider">{selectedDonut?.key || 'Total Jobs'}</span>
                      {selectedDonut && <span className="text-[9px] font-bold text-tf-accent">{selectedDonut.percent}%</span>}
                    </div>
                  </div>

                  <div className="dashboard-donut-legend w-full space-y-1 text-xs">
                    {donutStages.map(stage => <button
                      key={stage.key}
                      onMouseEnter={() => setActiveDonutStage(stage.key)}
                      onMouseLeave={() => setActiveDonutStage(null)}
                      onFocus={() => setActiveDonutStage(stage.key)}
                      onBlur={() => setActiveDonutStage(null)}
                      onClick={() => navigate(`/job-tracker?stage=${encodeURIComponent(stage.key)}`)}
                    >
                      <span className="flex items-center gap-2 text-tf-text-secondary"><i style={{ backgroundColor: stage.color }} /> {stage.key}</span>
                      <strong>{stage.count} ({stage.percent}%)</strong>
                    </button>)}
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
          {showRemindersModal && typeof document !== 'undefined' && createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 backdrop-blur-sm p-4 animate-in fade-in duration-200"
              role="presentation"
              onMouseDown={() => setShowRemindersModal(false)}
            >
              <div
                className="bg-tf-surface border border-tf-border rounded-2xl max-w-lg w-full max-h-[calc(100vh-2rem)] overflow-hidden p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200"
                role="dialog"
                aria-modal="true"
                aria-labelledby="upcoming-reminders-title"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-3 border-b border-tf-border">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-tf-accent/10 text-tf-accent flex items-center justify-center border border-tf-accent/20">
                      <Calendar size={18} />
                    </div>
                    <div>
                      <h3 id="upcoming-reminders-title" className="text-base font-bold text-tf-text">Upcoming Reminders</h3>
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
                            {rem.description && <p className="text-[10px] text-tf-text-secondary truncate">{rem.description}</p>}
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
                            if (rem.applicationId) {
                              navigate(`/job-tracker?appId=${rem.applicationId}`, {
                                state: { selectedAppId: rem.applicationId }
                              });
                            }
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
            </div>,
            document.body
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
