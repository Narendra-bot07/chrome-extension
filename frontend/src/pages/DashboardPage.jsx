import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  FileText, TrendingUp, Calendar, Zap, AlertCircle, Briefcase, 
  CheckCircle, ArrowUpRight, BarChart2, Plus, ArrowRight, Upload, 
  Database, UserCheck, ShieldAlert, CheckCircle2, RefreshCw, Sparkles, Bell, Send, Clock
} from 'lucide-react';
import { Button } from '../components/ui/Button';

// Error Boundary wrapper to print exact crash logs on screen for the Dashboard
class DashboardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("DashboardErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-955 text-center font-sans min-h-[500px]">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
          <h2 className="text-base font-black uppercase text-zinc-950 dark:text-zinc-50 tracking-wider">
            Dashboard Crash Intercepted
          </h2>
          <p className="text-xs text-zinc-550 dark:text-zinc-400 mt-2 font-medium">
            {this.state.error?.toString() || "An unexpected rendering crash occurred."}
          </p>
          <pre className="text-[10px] text-rose-600 bg-rose-50 dark:bg-rose-955/25 border border-rose-200 dark:border-rose-955/40 p-4 rounded-xl max-w-lg overflow-x-auto mt-4 text-left max-h-[200px] w-full font-mono">
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer border-none"
          >
            Reload Window
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function DashboardContent() {
  const { session, applications: rawApps, fetchApplications, apiUrl, profile } = useApp();
  const applications = rawApps || [];
  const [metrics, setMetrics] = useState({
    current_plan: 'free',
    credits_remaining: 0,
    credits_used: 0,
    subscription_status: 'none',
    resumes_tailored: 0,
    applications_tracked: 0,
    avg_ats_score: 0
  });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const token = session?.access_token || localStorage.getItem('access_token');
        if (!token) return;
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch analytics dashboard
        const metricsRes = await fetch(`${apiUrl}/api/v1/analytics/dashboard`, { headers });
        if (metricsRes.ok) {
          const metricsData = await metricsRes.json();
          setMetrics(metricsData);
        }

        await fetchApplications();
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [session]);

  // ==========================================
  // REAL-TIME ANALYTICS CALCULATIONS
  // ==========================================

  const totalResumesTailored = metrics.resumes_tailored;

  // Monthly and today tailoring counts
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const tailoredThisMonth = applications.filter(a => a && a.created_at && new Date(a.created_at) >= startOfMonth).length;
  const tailoredToday = applications.filter(a => a && a.created_at && new Date(a.created_at) >= startOfToday).length;

  // Growth calculation vs previous month
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const tailoredLastMonth = applications.filter(a => {
    if (!a || !a.created_at) return false;
    const d = new Date(a.created_at);
    return d >= startOfLastMonth && d <= endOfLastMonth;
  }).length;

  const monthlyGrowth = tailoredLastMonth === 0 
    ? (tailoredThisMonth > 0 ? 100 : 0)
    : Math.round(((tailoredThisMonth - tailoredLastMonth) / tailoredLastMonth) * 100);

  // Stage filters
  const jobsTracked = metrics.applications_tracked;
  const appsSubmitted = applications.filter(a => a && a.current_stage !== 'Ready To Apply').length;
  const interviewsCount = applications.filter(a => a && ['Interview', 'Final Round'].includes(a.current_stage)).length;
  const offersCount = applications.filter(a => a && ['Offer', 'Accepted'].includes(a.current_stage)).length;
  const acceptedCount = applications.filter(a => a && a.current_stage === 'Accepted').length;

  const successRate = appsSubmitted === 0 ? 0 : Math.round((acceptedCount / appsSubmitted) * 100);

  // ATS match averages
  const atsAverage = metrics.avg_ats_score;

  const activeAppsCount = applications.filter(a => 
    a && !['Accepted', 'Rejected', 'Archived'].includes(a.current_stage)
  ).length;

  // Dynamic status distributions count
  const statusCounts = {
    'Ready To Apply': applications.filter(a => a && a.current_stage === 'Ready To Apply').length,
    'Applied': applications.filter(a => a && a.current_stage === 'Applied').length,
    'Assessment': applications.filter(a => a && a.current_stage === 'Assessment').length,
    'Recruiter': applications.filter(a => a && a.current_stage === 'Recruiter').length,
    'Interview': applications.filter(a => a && a.current_stage === 'Interview').length,
    'Final Round': applications.filter(a => a && a.current_stage === 'Final Round').length,
    'Offer': applications.filter(a => a && a.current_stage === 'Offer').length,
    'Accepted': acceptedCount,
    'Rejected': applications.filter(a => a && a.current_stage === 'Rejected').length,
    'Archived': applications.filter(a => a && a.current_stage === 'Archived').length
  };

  // Company application rates
  const companyCounts = applications.reduce((acc, app) => {
    if (!app) return acc;
    const company = app.company_name || 'Unknown';
    if (!acc[company]) {
      acc[company] = { apps: 0, interviews: 0, offers: 0, accepted: 0 };
    }
    acc[company].apps += 1;
    if (['Interview', 'Final Round'].includes(app.current_stage)) acc[company].interviews += 1;
    if (['Offer', 'Accepted'].includes(app.current_stage)) acc[company].offers += 1;
    if (app.current_stage === 'Accepted') acc[company].accepted += 1;
    return acc;
  }, {});

  const sortedCompanies = Object.entries(companyCounts)
    .map(([name, stats]) => ({
      name,
      ...stats,
      acceptanceRate: stats.apps === 0 ? 0 : Math.round((stats.accepted / stats.apps) * 100)
    }))
    .sort((a, b) => b.apps - a.apps)
    .slice(0, 5);

  // Role targeted distributions
  const roleCounts = applications.reduce((acc, app) => {
    if (!app) return acc;
    const role = app.job_title || 'Software Engineer';
    let match = 'Software Engineer';
    if (role.toLowerCase().includes('backend')) match = 'Backend Engineer';
    else if (role.toLowerCase().includes('frontend')) match = 'Frontend Engineer';
    else if (role.toLowerCase().includes('data')) match = 'Data Engineer';
    else if (role.toLowerCase().includes('ml') || role.toLowerCase().includes('machine')) match = 'ML Engineer';
    else if (role.toLowerCase().includes('ai')) match = 'AI Engineer';
    else if (role.toLowerCase().includes('devops')) match = 'DevOps Engineer';
    else if (role.toLowerCase().includes('cloud')) match = 'Cloud Engineer';
    
    acc[match] = (acc[match] || 0) + 1;
    return acc;
  }, {});

  const totalRoles = Object.values(roleCounts).reduce((sum, v) => sum + v, 0) || 1;
  const sortedRoles = Object.entries(roleCounts)
    .map(([role, count]) => ({
      role,
      count,
      percent: Math.round((count / totalRoles) * 100)
    }))
    .sort((a, b) => b.count - a.count);

  // Flattened events timeline
  const activityTimeline = applications.flatMap(app => {
    if (!app) return [];
    return (app.timeline || [])
      .filter(event => event && event.timestamp)
      .map(event => ({
        ...event,
        company: app.company_name,
        role: app.job_title
      }));
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10);

  // ==========================================
  // METADATA BASED DYNAMIC INSIGHTS
  // ==========================================
  const generateInsights = () => {
    const list = [];
    if (statusCounts['Ready To Apply'] > 3 * statusCounts['Applied']) {
      list.push("You tailor many resumes but submit few applications. Increase your submission rate.");
    }
    if (appsSubmitted > 0 && (interviewsCount / appsSubmitted) > 0.25) {
      list.push("Interview conversion is above average! Your tailoring is landing discussions.");
    }
    if (statusCounts['Assessment'] > 0) {
      list.push(`You have ${statusCounts['Assessment']} applications waiting in coding assessments.`);
    }
    if (statusCounts['Offer'] > 0) {
      list.push(`You have ${statusCounts['Offer']} offers awaiting response.`);
    }
    
    // Default fallback insights
    if (list.length === 0) {
      list.push("Keep tailoring resumes to fit job descriptions. ATS score averages are strong.");
      list.push("Follow up with recruiters within 7 days of applying to stay on their radar.");
    }
    return list;
  };

  const insights = generateInsights();

  // Dynamic goal progression counts
  const goals = {
    dailyTailored: { cur: tailoredToday, target: 3 },
    dailyApplied: { cur: applications.filter(a => a && a.current_stage === 'Applied' && a.last_activity && new Date(a.last_activity) >= startOfToday).length, target: 5 },
    weeklyApplied: { cur: applications.filter(a => a && a.current_stage === 'Applied' && a.last_activity && new Date(a.last_activity) >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)).length, target: 20 }
  };

  // Smart Reminders
  const generateReminders = () => {
    const list = [];
    applications.forEach(app => {
      if (!app) return;
      if (app.current_stage === 'Assessment') {
        list.push({ message: `Complete coding assessment at ${app.company_name}`, type: 'alert' });
      }
      if (app.current_stage === 'Offer') {
        list.push({ message: `Review and negotiate offer from ${app.company_name}`, type: 'warning' });
      }
      if (app.current_stage === 'Interview') {
        list.push({ message: `Prepare for interview loop at ${app.company_name}`, type: 'info' });
      }
    });
    
    if (list.length === 0) {
      list.push({ message: 'Upload new vacancies to search tracker', type: 'info' });
    }
    return list.slice(0, 5);
  };

  const reminders = generateReminders();

  const formatSafeDate = (dateVal) => {
    if (!dateVal) return 'Recent';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Recent';
    return d.toLocaleDateString();
  };

  return (
    <div className="flex-1 flex flex-col gap-6 animate-fadeIn font-sans max-w-6xl mx-auto pb-12 select-none">
      
      {/* 1. Header cockpit */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-200 dark:border-zinc-900 pb-5">
        <div>
          <h1 className="text-xl font-black text-zinc-955 dark:text-zinc-55 tracking-tight flex items-center gap-2">
            <BarChart2 className="text-[#00bda5] w-5 h-5" /> Job Search Control Center
          </h1>
          <p className="text-[10px] text-zinc-450 dark:text-zinc-550 font-bold uppercase tracking-widest mt-0.5">
            Real-time search performance and conversions dashboard
          </p>
        </div>
      </div>

      {/* Profile check banner warning */}
      {!loading && profile?.resume_count === 0 && (
        <div className="bg-amber-50/50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-900/30 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-amber-100/50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-500 font-extrabold text-sm">
              <AlertCircle size={16} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-amber-900 dark:text-amber-500">Complete your profile setup</h3>
              <p className="text-[11px] text-amber-705 dark:text-amber-500/60 mt-0.5 font-bold uppercase tracking-wider">
                Upload your first master resume to unlock tailored resumes analytics.
              </p>
            </div>
          </div>
          <Button 
            onClick={() => navigate('/resume-detect')} 
            variant="outline"
            className="border-amber-200/80 text-amber-700 hover:bg-amber-100/30 dark:border-amber-900/30 dark:text-amber-500 dark:hover:bg-amber-500/10 text-[9.5px] font-black uppercase tracking-wider rounded-xl cursor-pointer"
          >
            Upload Resume
          </Button>
        </div>
      )}

      {/* 2. Top KPI Cards grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Card 1: Total Tailored */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 rounded-2xl p-4.5 flex flex-col justify-between h-32 shadow-xs select-none">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500 text-[8.5px] font-black uppercase tracking-widest">Resumes Tailored</span>
            <FileText className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-zinc-955 dark:text-zinc-50 leading-none">
              {totalResumesTailored}
            </div>
            <div className="text-[9.5px] text-zinc-505 dark:text-zinc-450 mt-2 font-bold uppercase tracking-wider flex items-center gap-1">
              <span className={monthlyGrowth >= 0 ? "text-emerald-500" : "text-rose-500"}>
                {monthlyGrowth >= 0 ? `+${monthlyGrowth}%` : `${monthlyGrowth}%`}
              </span>
              this month
            </div>
          </div>
        </div>

        {/* Card 2: Jobs Tracked */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 rounded-2xl p-4.5 flex flex-col justify-between h-32 shadow-xs select-none">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500 text-[8.5px] font-black uppercase tracking-widest">Jobs Tracked</span>
            <Briefcase className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-zinc-955 dark:text-zinc-50 leading-none">
              {jobsTracked}
            </div>
            <p className="text-[8.5px] text-zinc-455 dark:text-zinc-500 mt-2.5 font-black uppercase tracking-wider">Total pipeline size</p>
          </div>
        </div>

        {/* Card 3: Submitted */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 rounded-2xl p-4.5 flex flex-col justify-between h-32 shadow-xs select-none">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500 text-[8.5px] font-black uppercase tracking-widest">Submitted</span>
            <Send className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-zinc-955 dark:text-zinc-50 leading-none">
              {appsSubmitted}
            </div>
            <p className="text-[8.5px] text-zinc-455 dark:text-zinc-500 mt-2.5 font-black uppercase tracking-wider">Applied or later</p>
          </div>
        </div>

        {/* Card 4: Interviews */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 rounded-2xl p-4.5 flex flex-col justify-between h-32 shadow-xs select-none">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500 text-[8.5px] font-black uppercase tracking-widest">Interviews</span>
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-zinc-955 dark:text-zinc-50 leading-none">
              {interviewsCount}
            </div>
            <p className="text-[8.5px] text-zinc-455 dark:text-zinc-500 mt-2.5 font-black uppercase tracking-wider">Interviews loop booked</p>
          </div>
        </div>

        {/* Card 5: Offers */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 rounded-2xl p-4.5 flex flex-col justify-between h-32 shadow-xs select-none">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500 text-[8.5px] font-black uppercase tracking-widest">Offers</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#00bda5]" />
          </div>
          <div>
            <div className="text-2xl font-black text-zinc-955 dark:text-zinc-50 leading-none">
              {offersCount}
            </div>
            <p className="text-[8.5px] text-zinc-455 dark:text-zinc-500 mt-2.5 font-black uppercase tracking-wider">Offers received</p>
          </div>
        </div>

        {/* Card 6: Success Rate */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 rounded-2xl p-4.5 flex flex-col justify-between h-32 shadow-xs select-none">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500 text-[8.5px] font-black uppercase tracking-widest">Success Rate</span>
            <TrendingUp className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-zinc-955 dark:text-zinc-50 leading-none">
              {successRate}%
            </div>
            <p className="text-[8.5px] text-zinc-455 dark:text-zinc-500 mt-2.5 font-black uppercase tracking-wider">Accepted / Applied ratio</p>
          </div>
        </div>

        {/* Card 7: ATS Average */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 rounded-2xl p-4.5 flex flex-col justify-between h-32 shadow-xs select-none">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500 text-[8.5px] font-black uppercase tracking-widest">ATS Average</span>
            <Zap className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-zinc-955 dark:text-zinc-50 leading-none">
              {atsAverage}%
            </div>
            <p className="text-[8.5px] text-zinc-455 dark:text-zinc-500 mt-2.5 font-black uppercase tracking-wider">Average JD scoring</p>
          </div>
        </div>

        {/* Card 8: Active applications */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 rounded-2xl p-4.5 flex flex-col justify-between h-32 shadow-xs select-none">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500 text-[8.5px] font-black uppercase tracking-widest">Active Jobs</span>
            <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-zinc-955 dark:text-zinc-50 leading-none">
              {activeAppsCount}
            </div>
            <p className="text-[8.5px] text-zinc-455 dark:text-zinc-500 mt-2.5 font-black uppercase tracking-wider">Active tracked sessions</p>
          </div>
        </div>

      </div>

      {/* 3. Main Analytics layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 select-none">
        
        {/* Chart 1: Connected Funnel pipeline */}
        <div className="lg:col-span-2 p-5 border border-zinc-200 dark:border-zinc-900 rounded-3xl bg-zinc-50/10 dark:bg-zinc-900/5 space-y-4">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-950 dark:text-zinc-50">Conversion Pipeline</h3>
            <p className="text-[9px] text-zinc-450 dark:text-zinc-550 font-bold uppercase mt-0.5">Transition progression rate between consecutive stages</p>
          </div>

          <div className="space-y-2.5 font-sans">
            {Object.entries(statusCounts).slice(0, 8).map(([stage, count], idx) => {
              const maxCount = Math.max(...Object.values(statusCounts).slice(0, 8)) || 1;
              const percent = Math.round((count / maxCount) * 100);
              return (
                <div key={stage} className="space-y-1">
                  <div className="flex justify-between items-center text-[9px] font-bold text-zinc-650 dark:text-zinc-350">
                    <span className="uppercase tracking-wider">{stage}</span>
                    <span className="font-extrabold">{count} applications ({percent}%)</span>
                  </div>
                  <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                    <div style={{ width: `${percent}%` }} className="bg-[#00bda5] h-full rounded-full transition-all duration-500" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status Distribution progress pie list */}
        <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-3xl bg-zinc-50/10 dark:bg-zinc-900/5 flex flex-col justify-between gap-5">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-955 dark:text-zinc-50">Credits remaining</h3>
            <div className="text-3xl font-bold tracking-tight mt-2">{metrics.credits_remaining === -1 ? '∞' : metrics.credits_remaining}</div>
          </div>

          {/* Premium status bar */}
          <div className="space-y-4 font-sans select-none">
            {/* Multi color bar indicator */}
            <div className="h-3 w-full bg-zinc-100 dark:bg-zinc-900 rounded-full flex overflow-hidden">
              <div style={{ width: `${jobsTracked === 0 ? 33 : (statusCounts['Accepted'] / jobsTracked) * 100}%` }} className="bg-emerald-500 h-full" />
              <div style={{ width: `${jobsTracked === 0 ? 33 : (statusCounts['Interview'] / jobsTracked) * 100}%` }} className="bg-amber-500 h-full" />
              <div style={{ width: `${jobsTracked === 0 ? 34 : (statusCounts['Rejected'] / jobsTracked) * 100}%` }} className="bg-rose-500 h-full" />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                <span className="text-[9px] font-bold text-zinc-500 uppercase">Accepted ({statusCounts['Accepted']})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full" />
                <span className="text-[9px] font-bold text-zinc-500 uppercase">Interview ({statusCounts['Interview']})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-rose-500 rounded-full" />
                <span className="text-[9px] font-bold text-zinc-500 uppercase">Rejected ({statusCounts['Rejected']})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-zinc-400 rounded-full" />
                <span className="text-[9px] font-bold text-zinc-500 uppercase">Archived ({statusCounts['Archived']})</span>
              </div>
            </div>
          </div>

          {/* Insights summary */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-zinc-850 rounded-xl space-y-2">
            <h5 className="text-[9px] font-black uppercase text-zinc-900 dark:text-zinc-50 tracking-wider flex items-center gap-1.5">
              <Sparkles size={11} className="text-[#00bda5]" /> Productivity Insights
            </h5>
            <ul className="list-disc pl-3 text-[9px] text-zinc-555 leading-relaxed font-bold space-y-1">
              {insights.map((ins, idx) => <li key={idx}>{ins}</li>)}
            </ul>
          </div>
        </div>

      </div>

      {/* 4. Second row: Companies vs Roles grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 select-none">
        
        {/* Top companies applied table */}
        <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-3xl bg-zinc-50/10 dark:bg-zinc-900/5">
          <div className="mb-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-zinc-50">Top Companies</h3>
            <p className="text-[9px] text-zinc-455 dark:text-zinc-550 font-bold uppercase mt-0.5">List of organizations scanned in tracker sessions</p>
          </div>

          <div className="overflow-x-auto select-none font-sans text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-900 text-zinc-405 font-black uppercase text-[8.5px] tracking-wider">
                  <th className="pb-2">Company</th>
                  <th className="pb-2 text-center">Applications</th>
                  <th className="pb-2 text-center">Interviews</th>
                  <th className="pb-2 text-center">Success Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900 text-zinc-555 font-bold">
                {sortedCompanies.length > 0 ? (
                  sortedCompanies.map((c) => (
                    <tr key={c.name} className="hover:bg-zinc-50/20 dark:hover:bg-zinc-900/20">
                      <td className="py-2.5 truncate max-w-[120px]">{c.name}</td>
                      <td className="py-2.5 text-center">{c.apps}</td>
                      <td className="py-2.5 text-center">{c.interviews}</td>
                      <td className="py-2.5 text-center text-[#00bda5] font-extrabold">{c.acceptanceRate}%</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-[10px] text-zinc-455 font-black uppercase">
                      No tailored company logs recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Roles Targeted Distribution */}
        <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-3xl bg-zinc-50/10 dark:bg-zinc-900/5 flex flex-col justify-between gap-4">
          <div className="mb-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-zinc-50">Targeted Roles</h3>
            <p className="text-[9px] text-zinc-455 dark:text-zinc-550 font-bold uppercase mt-0.5">Visual distribution of job roles optimized</p>
          </div>

          <div className="space-y-2.5 font-sans select-none">
            {sortedRoles.length > 0 ? (
              sortedRoles.slice(0, 5).map((r) => (
                <div key={r.role} className="space-y-1">
                  <div className="flex justify-between items-center text-[9px] font-bold text-zinc-650">
                    <span className="uppercase">{r.role}</span>
                    <span className="font-extrabold text-zinc-800 dark:text-zinc-300">{r.count} ({r.percent}%)</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                    <div style={{ width: `${r.percent}%` }} className="bg-[#00bda5] h-full rounded-full transition-all duration-300" />
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-[10px] text-zinc-405 font-black uppercase">
                No targeted roles data logged.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 5. Goals & Target Progress Tracking */}
      <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-3xl bg-zinc-50/10 dark:bg-zinc-900/5 select-none">
        <div className="mb-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-zinc-50">Search Goals Progress</h3>
          <p className="text-[9px] text-zinc-450 dark:text-zinc-555 font-bold uppercase mt-0.5">Automatically tracked goal targets based on your search activity</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 font-sans">
          
          <div className="p-4 bg-white dark:bg-zinc-900/40 border border-zinc-150 dark:border-zinc-850 rounded-2xl space-y-2">
            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-455 block">Daily Tailored Resumes</span>
            <div className="flex justify-between text-xs font-extrabold">
              <span className="text-[#00bda5]">{goals.dailyTailored.cur} / {goals.dailyTailored.target}</span>
              <span>{Math.min(100, Math.round((goals.dailyTailored.cur / goals.dailyTailored.target) * 100))}%</span>
            </div>
            <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div style={{ width: `${Math.min(100, (goals.dailyTailored.cur / goals.dailyTailored.target) * 100)}%` }} className="bg-[#00bda5] h-full" />
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-zinc-900/40 border border-zinc-150 dark:border-zinc-850 rounded-2xl space-y-2">
            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-455 block">Daily Applications Submitted</span>
            <div className="flex justify-between text-xs font-extrabold">
              <span className="text-[#00bda5]">{goals.dailyApplied.cur} / {goals.dailyApplied.target}</span>
              <span>{Math.min(100, Math.round((goals.dailyApplied.cur / goals.dailyApplied.target) * 100))}%</span>
            </div>
            <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div style={{ width: `${Math.min(100, (goals.dailyApplied.cur / goals.dailyApplied.target) * 100)}%` }} className="bg-[#00bda5] h-full" />
            </div>
          </div>

          <div className="p-4 bg-white dark:bg-zinc-900/40 border border-zinc-150 dark:border-zinc-850 rounded-2xl space-y-2">
            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-455 block">Weekly Target Applications</span>
            <div className="flex justify-between text-xs font-extrabold">
              <span className="text-[#00bda5]">{goals.weeklyApplied.cur} / {goals.weeklyApplied.target}</span>
              <span>{Math.min(100, Math.round((goals.weeklyApplied.cur / goals.weeklyApplied.target) * 100))}%</span>
            </div>
            <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div style={{ width: `${Math.min(100, (goals.weeklyApplied.cur / goals.weeklyApplied.target) * 100)}%` }} className="bg-[#00bda5] h-full" />
            </div>
          </div>

        </div>
      </div>

      {/* 6. Smart Reminders grid */}
      <div className="select-none mb-2">
        {/* Smart Reminders list */}
        <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-3xl bg-zinc-50/10 dark:bg-zinc-900/5 flex flex-col justify-between">
          <div className="mb-4 select-none">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-zinc-50 flex items-center gap-1.5">
              <Bell size={13} className="text-[#00bda5]" /> Smart search reminders
            </h3>
            <p className="text-[9px] text-zinc-450 dark:text-zinc-555 font-bold uppercase mt-0.5 font-sans">Actions recommended to boost interview success</p>
          </div>

          <div className="space-y-3 font-sans">
            {reminders.map((rem, idx) => (
              <div key={idx} className="p-3 bg-white dark:bg-zinc-900/40 border border-zinc-150 dark:border-zinc-850 rounded-xl flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00bda5] shrink-0" />
                <span className="text-[10.5px] font-bold text-zinc-700 dark:text-zinc-350">{rem.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 7. Recent Applications directory table */}
      <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-3xl bg-zinc-50/10 dark:bg-zinc-900/5 select-none mt-2">
        <div className="mb-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-zinc-50">Recent Applications</h3>
              <p className="text-[9px] text-zinc-450 dark:text-zinc-550 font-bold uppercase mt-0.5 font-sans">Latest jobs tracked in the pipeline</p>
            </div>
            <div className="text-right">
              <h3 className="font-bold text-zinc-950 dark:text-zinc-50 capitalize text-sm">{metrics.current_plan} Tier</h3>
              <span className="px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-[10px] font-bold tracking-wider rounded-md uppercase border border-violet-200 dark:border-violet-900/50">
                {metrics.subscription_status}
              </span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto select-none font-sans text-xs">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-900 text-zinc-405 font-black uppercase text-[8.5px] tracking-wider">
                <th className="pb-2">Company</th>
                <th className="pb-2">Role</th>
                <th className="pb-2 text-center">Stage</th>
                <th className="pb-2 text-center">ATS Score</th>
                <th className="pb-2 text-center">Resume Version</th>
                <th className="pb-2 text-center">Last Updated</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900 text-zinc-555 font-bold">
              {applications.length > 0 ? (
                applications.slice(0, 5).map((app) => (
                  <tr key={app.id} className="hover:bg-zinc-50/20 dark:hover:bg-zinc-900/20">
                    <td className="py-2.5">{app.company_name}</td>
                    <td className="py-2.5">{app.job_title}</td>
                    <td className="py-2.5 text-center text-[#00bda5] uppercase text-[9px] font-black">{app.current_stage}</td>
                    <td className="py-2.5 text-center">{app.ats_score}%</td>
                    <td className="py-2.5 text-center">{app.resume_version || 'v1'}</td>
                    <td className="py-2.5 text-center text-[9px] text-zinc-455">{formatSafeDate(app.last_activity)}</td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => navigate('/job-tracker')}
                        className="px-2.5 py-1 bg-zinc-950 dark:bg-zinc-100 dark:text-zinc-950 text-white font-extrabold text-[8px] uppercase tracking-wider rounded-lg transition cursor-pointer border-none"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="py-6 text-center text-[10px] text-zinc-455 font-black uppercase">
                    No active applications in the queue yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

export default function DashboardPage() {
  return (
    <DashboardErrorBoundary>
      <DashboardContent />
    </DashboardErrorBoundary>
  );
}
