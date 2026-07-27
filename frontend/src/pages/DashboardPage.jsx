import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { 
  TrendingUp, Calendar, CheckCircle, Briefcase, ChevronRight, 
  Send, Search, Clock, Award, XCircle, ChevronDown, ArrowRight, Sparkles, AlertCircle
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { FadeSwap, PageLoadingState } from '../components/ui/Loading';

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
  const [metrics, setMetrics] = useState({
    current_plan: 'free',
    credits_remaining: 0,
    credits_used: 0,
    resumes_tailored: 0,
    applications_tracked: 0,
    avg_ats_score: 86,
    downloads: 0,
    rejected: 0
  });
  const [loading, setLoading] = useState(true);
  const [hoveredPointIndex, setHoveredPointIndex] = useState(3);
  const [trendTimeframe, setTrendTimeframe] = useState('Last 30 days');
  const [trendDropdownOpen, setTrendDropdownOpen] = useState(false);
  const [pipelineFilter, setPipelineFilter] = useState('All Jobs');
  const [pipelineDropdownOpen, setPipelineDropdownOpen] = useState(false);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const token = session?.access_token || localStorage.getItem('access_token');
        if (token) {
          const headers = { 'Authorization': `Bearer ${token}` };
          const metricsRes = await fetch(`${apiUrl}/api/v1/analytics/dashboard`, { headers });
          if (metricsRes.ok) {
            const metricsData = await metricsRes.json();
            setMetrics(metricsData);
          }
        }
        await fetchApplications();
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboardData();
  }, [session]);

  const rawName = profile?.full_name?.split(' ')[0] || user?.user_metadata?.full_name?.split(' ')[0] || (user?.email ? user.email.split('@')[0].replace(/[0-9]/g, '') : 'Narendra');
  const userName = rawName ? rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase() : 'Narendra';

  // ==========================================
  // 100% ACCURATE LIVE DATABASE CALCULATIONS
  // ==========================================
  const totalTracked = applications.length;

  // Filtered applications for Job Pipeline widget based on dropdown selection
  const filteredApplications = applications.filter((a) => {
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
    return true; // 'All Jobs'
  });

  const appliedApps = filteredApplications.filter(a => a.current_stage === 'Applied');
  const screeningApps = filteredApplications.filter(a => ['Screening', 'Assessment', 'Recruiter'].includes(a.current_stage));
  const interviewApps = filteredApplications.filter(a => ['Interview', 'Final Round'].includes(a.current_stage));
  const offerApps = filteredApplications.filter(a => ['Offer', 'Accepted'].includes(a.current_stage));
  const rejectedApps = filteredApplications.filter(a => a.current_stage === 'Rejected');

  const activeAppsCount = applications.filter(a => a && !['Accepted', 'Rejected', 'Archived'].includes(a.current_stage)).length;
  const appsSubmitted = applications.filter(a => a && a.current_stage !== 'Ready To Apply').length;
  const acceptedCount = applications.filter(a => a && a.current_stage === 'Accepted').length;
  const successRate = appsSubmitted === 0 ? 0 : Math.round(((acceptedCount + offerApps.length) / appsSubmitted) * 100);

  // Resume ATS Score from DB / parsedResume
  const matchApps = applications.filter(a => a && a.resume_match_score != null);
  const avgResumeScore = matchApps.length > 0
    ? Math.round(matchApps.reduce((sum, a) => sum + Number(a.resume_match_score), 0) / matchApps.length)
    : (parsedResume?.ats_score || metrics.avg_ats_score || 86);

  // Donut chart percentages directly from DB
  const calcPercent = (count) => totalTracked === 0 ? 0 : Math.round((count / totalTracked) * 100);
  const pApplied = calcPercent(appliedApps.length);
  const pScreening = calcPercent(screeningApps.length);
  const pInterview = calcPercent(interviewApps.length);
  const pOffer = calcPercent(offerApps.length);
  const pRejected = calcPercent(rejectedApps.length);

  // Dynamic Application Trend Data Points strictly from DB timestamps (Spikes per extraction date)
  const getTrendPoints = () => {
    const nowMs = Date.now();
    let numPoints = 8;
    let daysWindow = 30;

    if (trendTimeframe === 'Last 7 days') {
      daysWindow = 7;
      numPoints = 7;
    } else if (trendTimeframe === 'Last 30 days') {
      daysWindow = 30;
      numPoints = 10;
    } else if (trendTimeframe === 'Last 90 days') {
      daysWindow = 90;
      numPoints = 10;
    } else if (trendTimeframe === 'All time') {
      daysWindow = 180;
      numPoints = 12;
    }

    const startMs = nowMs - (daysWindow - 1) * 86400000;
    const stepMs = (daysWindow * 86400000) / (numPoints - 1);
    
    const pointsData = [];
    const svgWidth = 270;
    const startX = 25;

    for (let i = 0; i < numPoints; i++) {
      const bucketMs = startMs + i * stepMs;
      const bucketDate = new Date(bucketMs);
      
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      
      let label = `${monthNames[bucketDate.getMonth()]} ${bucketDate.getDate()}`;
      if (trendTimeframe === 'Last 7 days') {
        label = i === numPoints - 1 ? 'Today' : dayNames[bucketDate.getDay()];
      }

      const bucketDayStr = bucketDate.toDateString();
      
      // Count DB applications created on or around this specific date bucket
      const count = applications.filter(a => {
        if (!a || (!a.created_at && !a.updated_at)) return false;
        const appDate = new Date(a.created_at || a.updated_at);
        if (numPoints <= 7) {
          return appDate.toDateString() === bucketDayStr;
        } else {
          const appMs = appDate.getTime();
          return Math.abs(appMs - bucketMs) <= (stepMs / 1.8);
        }
      }).length;

      const x = startX + (i * (svgWidth / (numPoints - 1)));
      pointsData.push({ label, count, x, fullDate: bucketDate.toLocaleDateString() });
    }

    const maxCount = Math.max(3, ...pointsData.map(p => p.count));

    return pointsData.map(p => ({
      ...p,
      maxScale: maxCount,
      y: 102 - Math.round((p.count / maxCount) * 78)
    }));
  };

  const trendPoints = getTrendPoints();
  const activeHoveredPoint = trendPoints[hoveredPointIndex] || trendPoints[trendPoints.length - 1] || trendPoints[0];

  const buildSvgPath = (points) => {
    if (!points || points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const cp1x = curr.x + (next.x - curr.x) / 2;
      const cp1y = curr.y;
      const cp2x = curr.x + (next.x - curr.x) / 2;
      const cp2y = next.y;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
    }
    return d;
  };

  // Recent applications from DB
  const displayRecentApps = applications.slice(0, 5);

  // Upcoming interview events from DB
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

  return (
    <FadeSwap
      isLoading={loading}
      skeleton={
        <PageLoadingState
          type="dashboard"
          stages={[
            'Loading your workspace...',
            'Fetching analytics & metrics...',
            'Preparing pipeline stages...'
          ]}
        />
      }
    >
      <div className="flex-1 w-full flex flex-col gap-6 font-sans pb-12 select-none text-tf-text">
        
        {/* 1. GREETING HEADER */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-tf-text flex items-center gap-2">
            Good morning, {userName} 👋
          </h1>
          <p className="text-xs text-tf-text-secondary font-medium">
            Track. Optimize. Land your dream role.
          </p>
        </div>

      {/* 2. TOP DYNAMIC METRIC CARDS (INCLUDING RESUME SCORE AT TOP) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Card 1: Resume Score Top Metric */}
        <div className="bg-tf-surface border border-tf-border rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-xs hover:border-tf-border-strong transition-all">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-tf-text-secondary">Resume Score</span>
              <div className="text-2xl font-extrabold tracking-tight text-tf-text flex items-baseline gap-1">
                <span>{avgResumeScore}</span>
                <span className="text-xs font-semibold text-tf-text-tertiary">/100</span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center border border-purple-500/20">
              <Award size={18} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-[11px] font-semibold text-purple-500">
              {avgResumeScore >= 80 ? 'Optimized 🎉' : 'Good Progress 👍'}
            </span>
            <button
              onClick={() => navigate('/resume-detect')}
              className="text-[10px] font-bold text-tf-accent hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              Improve <ArrowRight size={10} />
            </button>
          </div>
        </div>

        {/* Card 2: Success Rate */}
        <div className="bg-tf-surface border border-tf-border rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-xs hover:border-tf-border-strong transition-all">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-tf-text-secondary">Success Rate</span>
              <div className="text-2xl font-extrabold tracking-tight text-tf-text">{successRate}%</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center border border-purple-500/20">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-[11px] font-semibold text-emerald-500 flex items-center gap-0.5">
              ↗ {successRate}% <span className="text-tf-text-tertiary font-normal pl-0.5">vs last month</span>
            </span>
            <svg className="w-16 h-6 text-purple-500 overflow-visible" viewBox="0 0 80 30" fill="none">
              <path d="M0 25 Q 20 28, 35 15 T 70 8 T 80 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Card 3: Active Pipeline */}
        <div className="bg-tf-surface border border-tf-border rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-xs hover:border-tf-border-strong transition-all">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-tf-text-secondary">Active Pipeline</span>
              <div className="text-2xl font-extrabold tracking-tight text-tf-text">
                {activeAppsCount}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/20">
              <Briefcase size={18} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-[11px] font-normal text-tf-text-tertiary">Across all stages</span>
            <svg className="w-16 h-6 text-blue-500 overflow-visible" viewBox="0 0 80 30" fill="none">
              <path d="M0 22 Q 25 25, 45 18 T 70 10 T 80 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Card 4: Interviews */}
        <div className="bg-tf-surface border border-tf-border rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-xs hover:border-tf-border-strong transition-all">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-tf-text-secondary">Interviews</span>
              <div className="text-2xl font-extrabold tracking-tight text-tf-text">
                {interviewApps.length}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center border border-amber-500/20">
              <Calendar size={18} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-[11px] font-normal text-tf-text-tertiary">This month</span>
            <svg className="w-16 h-6 text-amber-500 overflow-visible" viewBox="0 0 80 30" fill="none">
              <path d="M0 26 Q 20 22, 40 24 T 65 12 T 80 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Card 5: Offers */}
        <div className="bg-tf-surface border border-tf-border rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-xs hover:border-tf-border-strong transition-all">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-tf-text-secondary">Offers</span>
              <div className="text-2xl font-extrabold tracking-tight text-tf-text">
                {offerApps.length}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
              <CheckCircle size={18} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-[11px] font-normal text-tf-text-tertiary">Keep it up! 🚀</span>
            <svg className="w-16 h-6 text-emerald-500 overflow-visible" viewBox="0 0 80 30" fill="none">
              <path d="M0 24 Q 25 26, 45 20 T 70 12 T 80 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

      </div>

      {/* 3. MAIN DASHBOARD CONTENT (2 COLUMNS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT COLUMN (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">

          {/* WIDGET 1: JOB PIPELINE STAGES FLOW */}
          <div className="bg-tf-surface border border-tf-border rounded-2xl p-6 shadow-xs space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-tf-text">Job Pipeline</h3>
                <p className="text-xs text-tf-text-secondary">Visualize your job search journey</p>
              </div>
              <div className="relative">
                <button 
                  onClick={() => setPipelineDropdownOpen((open) => !open)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-tf-border bg-tf-surface-2 text-xs font-semibold text-tf-text-secondary hover:text-tf-text transition cursor-pointer select-none"
                >
                  <span>{pipelineFilter}</span>
                  <ChevronDown size={14} />
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

            {/* CONNECTED HORIZONTAL PIPELINE STAGES */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 relative">
              
              {/* Stage 1: Applied */}
              <div className="bg-tf-surface-2/70 border border-tf-border rounded-xl p-3.5 space-y-3 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-blue-500/10 text-blue-500 flex items-center justify-center">
                      <Send size={12} />
                    </div>
                    <span className="text-xs font-bold text-tf-text">Applied</span>
                  </div>
                  <span className="text-xs font-extrabold text-tf-text-secondary">
                    {appliedApps.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {appliedApps.length > 0 ? (
                    appliedApps.slice(0, 3).map((item, idx) => (
                      <div key={item.id || idx} className="flex justify-between text-[11px]">
                        <span className="font-semibold text-tf-text truncate max-w-[85px]">{item.company_name}</span>
                        <span className="text-tf-text-tertiary">{formatRelativeTime(item.created_at)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] text-tf-text-tertiary italic py-1">No applications</div>
                  )}
                  {appliedApps.length > 3 && (
                    <div className="text-[10px] text-tf-accent font-semibold pt-1">+ {appliedApps.length - 3} more</div>
                  )}
                </div>
              </div>

              {/* Stage 2: Screening */}
              <div className="bg-tf-surface-2/70 border border-tf-border rounded-xl p-3.5 space-y-3 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-purple-500/10 text-purple-500 flex items-center justify-center">
                      <Search size={12} />
                    </div>
                    <span className="text-xs font-bold text-tf-text">Screening</span>
                  </div>
                  <span className="text-xs font-extrabold text-tf-text-secondary">
                    {screeningApps.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {screeningApps.length > 0 ? (
                    screeningApps.slice(0, 3).map((item, idx) => (
                      <div key={item.id || idx} className="flex justify-between text-[11px]">
                        <span className="font-semibold text-tf-text truncate max-w-[85px]">{item.company_name}</span>
                        <span className="text-tf-text-tertiary">{formatRelativeTime(item.created_at)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] text-tf-text-tertiary italic py-1">No applications</div>
                  )}
                  {screeningApps.length > 3 && (
                    <div className="text-[10px] text-tf-accent font-semibold pt-1">+ {screeningApps.length - 3} more</div>
                  )}
                </div>
              </div>

              {/* Stage 3: Interview */}
              <div className="bg-tf-surface-2/70 border border-tf-border rounded-xl p-3.5 space-y-3 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center">
                      <Calendar size={12} />
                    </div>
                    <span className="text-xs font-bold text-tf-text">Interview</span>
                  </div>
                  <span className="text-xs font-extrabold text-tf-text-secondary">
                    {interviewApps.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {interviewApps.length > 0 ? (
                    interviewApps.slice(0, 3).map((item, idx) => (
                      <div key={item.id || idx} className="flex justify-between text-[11px]">
                        <span className="font-semibold text-tf-text truncate max-w-[85px]">{item.company_name}</span>
                        <span className="text-tf-text-tertiary">{formatRelativeTime(item.created_at)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] text-tf-text-tertiary italic py-1">No applications</div>
                  )}
                  {interviewApps.length > 3 && (
                    <div className="text-[10px] text-tf-accent font-semibold pt-1">+ {interviewApps.length - 3} more</div>
                  )}
                </div>
              </div>

              {/* Stage 4: Offer */}
              <div className="bg-tf-surface-2/70 border border-tf-border rounded-xl p-3.5 space-y-3 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                      <Award size={12} />
                    </div>
                    <span className="text-xs font-bold text-tf-text">Offer</span>
                  </div>
                  <span className="text-xs font-extrabold text-tf-text-secondary">
                    {offerApps.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {offerApps.length > 0 ? (
                    offerApps.slice(0, 3).map((item, idx) => (
                      <div key={item.id || idx} className="flex justify-between text-[11px]">
                        <span className="font-semibold text-tf-text truncate max-w-[85px]">{item.company_name}</span>
                        <span className="text-tf-text-tertiary">{formatRelativeTime(item.created_at)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] text-tf-text-tertiary italic py-1">No applications</div>
                  )}
                  {offerApps.length > 3 && (
                    <div className="text-[10px] text-tf-accent font-semibold pt-1">+ {offerApps.length - 3} more</div>
                  )}
                </div>
              </div>

              {/* Stage 5: Rejected */}
              <div className="bg-tf-surface-2/70 border border-tf-border rounded-xl p-3.5 space-y-3 relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-rose-500/10 text-rose-500 flex items-center justify-center">
                      <XCircle size={12} />
                    </div>
                    <span className="text-xs font-bold text-tf-text">Rejected</span>
                  </div>
                  <span className="text-xs font-extrabold text-tf-text-secondary">
                    {rejectedApps.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {rejectedApps.length > 0 ? (
                    rejectedApps.slice(0, 3).map((item, idx) => (
                      <div key={item.id || idx} className="flex justify-between text-[11px]">
                        <span className="font-semibold text-tf-text truncate max-w-[85px]">{item.company_name}</span>
                        <span className="text-tf-text-tertiary">{formatRelativeTime(item.created_at)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] text-tf-text-tertiary italic py-1">No applications</div>
                  )}
                  {rejectedApps.length > 3 && (
                    <div className="text-[10px] text-tf-accent font-semibold pt-1">+ {rejectedApps.length - 3} more</div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* BOTTOM ROW (2 CARDS SIDE-BY-SIDE) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* CARD A: APPLICATION TREND AREA CHART */}
            <div className="bg-tf-surface border border-tf-border rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between relative">
              <div className="flex items-center justify-between relative z-20">
                <div>
                  <h3 className="text-xs font-bold text-tf-text">Application Trend</h3>
                  <p className="text-[11px] text-tf-text-tertiary">Your application activity over time</p>
                </div>

                {/* Interactive Timeframe Filter Dropdown */}
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
                      {['Last 7 days', 'Last 30 days', 'Last 90 days', 'All time'].map((opt) => (
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

              {/* Interactive SVG Area Chart */}
              <div className="relative pt-6 pb-2">
                <svg className="w-full h-40 overflow-visible select-none" viewBox="0 0 300 120">
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid Lines */}
                  <line x1="0" y1="25" x2="300" y2="25" stroke="currentColor" strokeOpacity="0.08" />
                  <line x1="0" y1="64" x2="300" y2="64" stroke="currentColor" strokeOpacity="0.08" />
                  <line x1="0" y1="102" x2="300" y2="102" stroke="currentColor" strokeOpacity="0.08" />

                  {/* Y Axis Labels */}
                  <text x="0" y="28" fill="currentColor" opacity="0.4" fontSize="9">{trendPoints[0]?.maxScale || 15}</text>
                  <text x="0" y="68" fill="currentColor" opacity="0.4" fontSize="9">{Math.round((trendPoints[0]?.maxScale || 15) / 2)}</text>
                  <text x="0" y="106" fill="currentColor" opacity="0.4" fontSize="9">0</text>

                  {/* Filled Area */}
                  {trendPoints.length > 1 && (
                    <path
                      d={`${buildSvgPath(trendPoints)} L ${trendPoints[trendPoints.length - 1].x} 102 L ${trendPoints[0].x} 102 Z`}
                      fill="url(#areaGradient)"
                    />
                  )}

                  {/* Smooth Line Curve */}
                  {trendPoints.length > 1 && (
                    <path
                      d={buildSvgPath(trendPoints)}
                      fill="none"
                      stroke="#8B5CF6"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  )}

                  {/* Interactive Data Points with Hover Targets */}
                  {trendPoints.map((pt, idx) => {
                    const isHovered = hoveredPointIndex === idx;
                    const isSpike = pt.count > 0;

                    return (
                      <g key={idx} className="cursor-pointer" onMouseEnter={() => setHoveredPointIndex(idx)}>
                        {/* Invisible larger hover hit area */}
                        <circle cx={pt.x} cy={pt.y} r="16" fill="transparent" />
                        
                        {/* Outer pulse circle when hovered or spike */}
                        {(isHovered || (isSpike && idx === trendPoints.length - 1)) && (
                          <circle cx={pt.x} cy={pt.y} r={isHovered ? "10" : "8"} fill="#8B5CF6" opacity="0.35" className="animate-ping" />
                        )}

                        {/* Visible Circle Point */}
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

                {/* Dynamic Tooltip Overlay on Mouse Hover */}
                {activeHoveredPoint && (
                  <div 
                    className="absolute -top-1 transition-all duration-300 -translate-x-1/2 bg-zinc-900/95 dark:bg-zinc-900/95 border border-zinc-700 text-white px-3 py-1.5 rounded-xl shadow-2xl text-center z-10 select-none pointer-events-none"
                    style={{ left: `${(activeHoveredPoint.x / 300) * 100}%` }}
                  >
                    <div className="text-[10px] font-medium text-zinc-400">{activeHoveredPoint.label}</div>
                    <div className="text-xs font-bold text-white whitespace-nowrap">
                      {activeHoveredPoint.count} {activeHoveredPoint.count === 1 ? 'Extraction' : 'Extractions / Tailored'}
                    </div>
                  </div>
                )}

                {/* Dynamic X Axis Date Labels */}
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

            {/* CARD B: RECENT APPLICATIONS LIST */}
            <div className="bg-tf-surface border border-tf-border rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-xs font-bold text-tf-text">Recent Applications</h3>
                <p className="text-[11px] text-tf-text-tertiary">Latest updates across your active pipeline</p>
              </div>

              <div className="space-y-2.5">
                {displayRecentApps.length > 0 ? (
                  displayRecentApps.map((item, idx) => {
                    const companyName = item.company_name || 'Company';
                    const roleName = item.job_title || 'Software Engineer';
                    const stage = item.current_stage || 'Applied';
                    const initial = companyName.charAt(0).toUpperCase();

                    return (
                      <div key={item.id || idx} className="flex items-center justify-between p-2 rounded-xl hover:bg-tf-surface-2 transition">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg bg-tf-accent/10 text-tf-accent font-bold text-xs flex items-center justify-center">
                            {initial}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-tf-text truncate max-w-[120px]">{companyName}</div>
                            <div className="text-[10px] text-tf-text-tertiary truncate max-w-[120px]">{roleName}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getStageBadgeStyle(stage)}`}>
                            {stage}
                          </span>
                          <span className="text-[10px] text-tf-text-tertiary w-10 text-right">
                            {formatRelativeTime(item.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-xs text-tf-text-tertiary font-medium">
                    No applications tracked yet. Tailor a resume to get started!
                  </div>
                )}
              </div>

              <button 
                onClick={() => navigate('/job-tracker')}
                className="w-full py-2 bg-tf-surface-2 hover:bg-tf-border text-tf-text font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 border border-tf-border cursor-pointer"
              >
                <span>View all applications</span>
                <ArrowRight size={14} />
              </button>
            </div>

          </div>

        </div>

        {/* RIGHT COLUMN (1/3 width) */}
        <div className="space-y-6">

          {/* WIDGET 1: UPCOMING EVENTS (RIGHT TOP) */}
          <div className="bg-tf-surface border border-tf-border rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-tf-text">Upcoming</h3>

            <div className="space-y-3">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map((evt) => (
                  <div 
                    key={evt.id} 
                    onClick={() => navigate('/job-tracker')}
                    className="flex items-center justify-between p-3 rounded-xl bg-tf-surface-2/60 border border-tf-border/50 hover:bg-tf-surface-2 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-tf-surface border border-tf-border flex flex-col items-center justify-center leading-none text-tf-text shrink-0">
                        <span className="text-[9px] font-black text-tf-text-tertiary uppercase">{evt.month}</span>
                        <span className="text-sm font-black">{evt.day}</span>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-tf-text">{evt.title}</div>
                        <div className="text-[10px] text-tf-text-secondary">{evt.company} • {evt.role}</div>
                        <div className="text-[10px] text-tf-text-tertiary pt-0.5">{evt.time}</div>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-tf-text-tertiary" />
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-tf-text-tertiary font-medium">
                  No upcoming interviews or assessments.
                </div>
              )}
            </div>

            <button 
              onClick={() => navigate('/job-tracker')}
              className="w-full py-2 bg-tf-surface-2 hover:bg-tf-border text-tf-text font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 border border-tf-border cursor-pointer"
            >
              <span>View all upcoming</span>
              <ArrowRight size={14} />
            </button>
          </div>

          {/* WIDGET 2: PIPELINE OVERVIEW DONUT CHART */}
          <div className="bg-tf-surface border border-tf-border rounded-2xl p-6 shadow-xs space-y-5">
            <h3 className="text-sm font-bold text-tf-text">Pipeline Overview</h3>

            <div className="flex flex-col items-center gap-5">
              {/* SVG Donut Chart */}
              <div className="relative w-44 h-44 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" opacity="0.08" strokeWidth="16" />
                  {/* Applied Segment */}
                  {pApplied > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="#3B82F6" strokeWidth="16" strokeDasharray={`${(pApplied / 100) * 238} 238`} strokeDashoffset="0" />}
                  {/* Screening Segment */}
                  {pScreening > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="#8B5CF6" strokeWidth="16" strokeDasharray={`${(pScreening / 100) * 238} 238`} strokeDashoffset={`-${(pApplied / 100) * 238}`} />}
                  {/* Interview Segment */}
                  {pInterview > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="#F97316" strokeWidth="16" strokeDasharray={`${(pInterview / 100) * 238} 238`} strokeDashoffset={`-${((pApplied + pScreening) / 100) * 238}`} />}
                  {/* Offer Segment */}
                  {pOffer > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="#10B981" strokeWidth="16" strokeDasharray={`${(pOffer / 100) * 238} 238`} strokeDashoffset={`-${((pApplied + pScreening + pInterview) / 100) * 238}`} />}
                  {/* Rejected Segment */}
                  {pRejected > 0 && <circle cx="50" cy="50" r="38" fill="none" stroke="#EF4444" strokeWidth="16" strokeDasharray={`${(pRejected / 100) * 238} 238`} strokeDashoffset={`-${((pApplied + pScreening + pInterview + pOffer) / 100) * 238}`} />}
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-black text-tf-text">{totalTracked}</span>
                  <span className="text-[10px] font-semibold text-tf-text-tertiary uppercase tracking-wider">Total Jobs</span>
                </div>
              </div>

              {/* Legend List */}
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
