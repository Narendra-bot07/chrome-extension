import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Briefcase, Search, Trash2, Clock, 
  MapPin, Send, BrainCircuit, ExternalLink, Lightbulb, Bell, FileText,
  X, Zap, CheckCircle2, AlertCircle, Building, ArrowRight, Check,
  ClipboardCheck, Eye, Calendar, FileEdit, ShieldCheck, DollarSign, User, Link, Plus, Archive,
  ArrowLeft, Layers, UserCheck, BookOpen, LayoutGrid, List, Columns, Filter, RefreshCw, MoreHorizontal, Maximize2, Minimize2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import CompanyLogo from '../components/CompanyLogoView';

// Job Tracker Components
import JobCard from '../components/JobTracker/JobCard';
import JobWorkspaceHeader from '../components/JobTracker/JobWorkspaceHeader';
import OverviewTab from '../components/JobTracker/OverviewTab';
import WorkflowTab from '../components/JobTracker/WorkflowTab';
import DocumentsTab from '../components/JobTracker/DocumentsTab';
import RecruiterTab from '../components/JobTracker/RecruiterTab';
import TimelineTab from '../components/JobTracker/TimelineTab';
import NotesTab from '../components/JobTracker/NotesTab';
import HistoryTab from '../components/JobTracker/HistoryTab';
import RemindersModal from '../components/JobTracker/RemindersModal';
import JobTrackerEmptyState from '../components/JobTracker/JobTrackerEmptyState';

// Error Boundary wrapper to print exact crash logs on screen
class JobTrackerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("JobTrackerErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-center font-sans min-h-[400px]">
          <AlertCircle className="w-10 h-10 text-rose-500 mb-4" />
          <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-white">
            Job Tracker Crash Intercepted
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mt-2 font-normal">
            {this.state.error?.toString() || "An unexpected rendering crash occurred."}
          </p>
          <pre className="text-[10px] text-rose-600 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 p-4 rounded-xl max-w-lg overflow-x-auto mt-4 text-left max-h-[200px] w-full font-mono">
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-5 py-2.5 bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer border-none"
          >
            Reload Window
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

import { useSearchParams, useLocation } from 'react-router-dom';

function JobTrackerContent() {
  const { session, applications: rawApps, updateApplicationStage, fetchApplications, apiUrl } = useApp();
  const applications = rawApps || [];
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const [selectedAppId, setSelectedAppId] = useState(null);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [isFullscreenPopup, setIsFullscreenPopup] = useState(false);

  // Auto-open target application modal if appId is present in URL searchParams or location state
  useEffect(() => {
    const targetAppId = searchParams.get('appId') || searchParams.get('application') || location.state?.selectedAppId;
    if (targetAppId && applications.length > 0) {
      const found = applications.find(a => a && String(a.id) === String(targetAppId));
      if (found) {
        setSelectedAppId(found.id);
        setShowWorkspaceModal(true);
        setWorkspaceTab('Workflow');
      }
    }
  }, [searchParams, location, applications]);

  // Search & Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('All'); // 'All' | 'Active' | 'Preparing' | 'Applied' | 'Interviewing' | 'Offers' | 'Closed'
  const [readinessFilter, setReadinessFilter] = useState('All'); // 'All' | 'resume_pending' | 'cover_letter_pending' | 'followup_due'
  const [sortBy, setSortBy] = useState('last_activity');
  const [viewMode, setViewMode] = useState(() => {
    return localStorage.getItem('tailr4u.job_tracker_view_mode') || 'list';
  });
  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('tailr4u.job_tracker_view_mode', mode);
  };
  const [loading, setLoading] = useState(() => applications.length === 0);

  // Active Workspace Tab inside Pop-Up Modal
  const [workspaceTab, setWorkspaceTab] = useState('Workflow');

  // Modals State
  const [showEditJobModal, setShowEditJobModal] = useState(false);
  const [showRemindersModal, setShowRemindersModal] = useState(false);

  // Form Fields for Editing
  const [jobFormData, setJobFormData] = useState({
    company_name: '',
    job_title: '',
    location: '',
    job_url: '',
    current_stage: 'Ready To Apply'
  });

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      if (applications.length === 0) setLoading(true);
      try {
        await Promise.race([
          fetchApplications(),
          new Promise(resolve => setTimeout(resolve, 8000))
        ]);
      } catch (error) {
        console.error('Job Tracker refresh failed:', error);
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => { active = false; };
    // fetchApplications is intentionally omitted because AppContext recreates
    // it each render; session identity is the stable refresh boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, apiUrl]);

  // Keyboard Access: ESC key closes modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showWorkspaceModal) {
        setShowWorkspaceModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showWorkspaceModal]);

  // Prevent background scroll jump when workspace modal is open
  useEffect(() => {
    if (showWorkspaceModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showWorkspaceModal]);

  const selectedApp = applications.find(a => a && a.id === selectedAppId);

  // GET /api/v1/applications/ (used to populate `applications` above) is
  // deliberately lightweight and omits organized_jd, resume_snapshot,
  // cover_letter_snapshot, job_description, employment_type, and seniority --
  // large/derived fields left out to keep the board's list load fast. Every
  // workspace tab (Overview's "Job Intelligence Summary", Documents' resume/
  // cover letter previews, etc.) needs those fields, so fetch the full
  // record once per opened application and merge it over the lightweight
  // one. Without this, OverviewTab silently fell back to hardcoded
  // placeholder text ("Full-time" / "Mid-Senior Level") for every single
  // application, indistinguishable from genuinely extracted JD data.
  const [selectedAppDetails, setSelectedAppDetails] = useState(null);

  // Shared by the effect below (runs once per opened application) AND by
  // every mutation handler that changes a field this fetch owns (current_stage,
  // contacts, notes_list, reminders...). Without re-running this after those
  // mutations, selectedAppFull's merge below spreads the now-stale
  // selectedAppDetails *over* the freshly-refetched lightweight selectedApp,
  // so the stale value wins -- e.g. moving a Job Tracker application's stage
  // updated the header badge (sourced straight from selectedApp) but the
  // Workflow board (sourced from selectedAppFull) kept showing the old stage.
  const refreshSelectedAppDetails = React.useCallback(async (appId) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!appId || !token) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/applications/${appId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setSelectedAppDetails(await res.json());
    } catch {}
  }, [session?.access_token, apiUrl]);

  useEffect(() => {
    setSelectedAppDetails(null);
    if (!selectedAppId) return;
    refreshSelectedAppDetails(selectedAppId);
  }, [selectedAppId, session?.access_token, apiUrl]);

  const selectedAppFull = selectedApp
    ? { ...selectedApp, ...(selectedAppDetails || {}) }
    : selectedApp;

  const handleOpenWorkspaceModal = (appId) => {
    setSelectedAppId(appId);
    setShowWorkspaceModal(true);
  };

  // Handlers for API Mutations
  const handleUpdateStage = async (appId, newStage, note = null, date = null) => {
    try {
      await updateApplicationStage(appId, newStage, note, date);
      await Promise.all([fetchApplications(), refreshSelectedAppDetails(appId)]);
    } catch (err) {
      console.error("Failed to update application stage:", err);
    }
  };

  const handleSaveContacts = async (appId, contactsList) => {
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token) return;

      const res = await fetch(`${apiUrl}/api/v1/applications/${appId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ contacts: contactsList })
      });

      if (res.ok) {
        await Promise.all([fetchApplications(), refreshSelectedAppDetails(appId)]);
      }
    } catch (err) {
      console.error("Failed to save recruiter contacts:", err);
    }
  };

  const handleSaveNotesList = async (appId, notesList) => {
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token) return;

      const res = await fetch(`${apiUrl}/api/v1/applications/${appId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ notes_list: notesList })
      });

      if (res.ok) {
        await Promise.all([fetchApplications(), refreshSelectedAppDetails(appId)]);
      }
    } catch (err) {
      console.error("Failed to save notes:", err);
    }
  };

  const handleSaveReminders = async (appId, remindersList) => {
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token) return;

      const res = await fetch(`${apiUrl}/api/v1/applications/${appId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ reminders: remindersList })
      });

      if (res.ok) {
        await Promise.all([fetchApplications(), refreshSelectedAppDetails(appId)]);
      }
    } catch (err) {
      console.error("Failed to save reminders:", err);
    }
  };

  const handleEditJobDetails = async (e) => {
    e.preventDefault();
    if (!selectedApp) return;
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token) return;

      const res = await fetch(`${apiUrl}/api/v1/applications/${selectedApp.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(jobFormData)
      });

      if (res.ok) {
        await Promise.all([fetchApplications(), refreshSelectedAppDetails(selectedApp.id)]);
        setShowEditJobModal(false);
      }
    } catch (err) {
      console.error("Failed to update application details:", err);
    }
  };

  const handleDeleteJob = async (appId) => {
    if (!window.confirm("Are you sure you want to delete this job application workspace?")) return;
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token) return;

      const res = await fetch(`${apiUrl}/api/v1/applications/${appId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (res.ok) {
        await fetchApplications();
        setShowWorkspaceModal(false);
        setSelectedAppId(null);
      }
    } catch (err) {
      console.error("Failed to delete application:", err);
    }
  };

  const handleArchiveJob = async (appId) => {
    await handleUpdateStage(appId, 'Archived');
  };

  // CALCULATE DYNAMIC SUMMARY STATS
  const totalAppsCount = applications.length;
  const activeAppsCount = applications.filter(a => !['Accepted', 'Rejected', 'Archived'].includes(a.current_stage)).length;
  const preparingCount = applications.filter(a => a.current_stage === 'Preparing' || a.current_stage === 'Ready To Apply').length;
  const appliedCount = applications.filter(a => a.current_stage === 'Applied').length;
  const interviewingCount = applications.filter(a => ['Assessment', 'Recruiter Contact', 'Interview', 'Final Round'].includes(a.current_stage)).length;
  const offersCount = applications.filter(a => a.current_stage === 'Offer' || a.current_stage === 'Offer Received' || a.current_stage === 'Accepted').length;
  const followupsDueCount = applications.filter(a => a.reminders?.some(r => !r.is_completed)).length;

  // FILTER & SORT APPLICATIONS DATASET
  const filteredApps = applications.filter(app => {
    if (!app) return false;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (app.job_title || '').toLowerCase().includes(q);
      const matchCompany = (app.company_name || '').toLowerCase().includes(q);
      const matchLocation = (app.location || '').toLowerCase().includes(q);
      if (!matchTitle && !matchCompany && !matchLocation) return false;
    }

    // Stage filter
    if (stageFilter === 'Active') {
      if (['Accepted', 'Rejected', 'Archived'].includes(app.current_stage)) return false;
    } else if (stageFilter === 'Preparing') {
      if (!['Saved', 'Preparing', 'Ready To Apply'].includes(app.current_stage)) return false;
    } else if (stageFilter === 'Applied') {
      if (app.current_stage !== 'Applied') return false;
    } else if (stageFilter === 'Interviewing') {
      if (!['Assessment', 'Recruiter Contact', 'Interview', 'Final Round'].includes(app.current_stage)) return false;
    } else if (stageFilter === 'Offers') {
      if (!['Offer', 'Offer Received', 'Accepted'].includes(app.current_stage)) return false;
    } else if (stageFilter === 'Closed') {
      if (!['Rejected', 'Archived'].includes(app.current_stage)) return false;
    }

    // Additional readiness filter
    if (readinessFilter === 'resume_pending') {
      if (app.resume_status === 'ready' || Boolean(app.resume_version)) return false;
    } else if (readinessFilter === 'cover_letter_pending') {
      if (app.cover_letter_status === 'ready' || Boolean(app.cover_letter_version)) return false;
    } else if (readinessFilter === 'followup_due') {
      if (!app.reminders?.some(r => !r.is_completed)) return false;
    }

    return true;
  });

  // Sort Filtered Applications
  const sortedApps = [...filteredApps].sort((a, b) => {
    if (sortBy === 'company') {
      return (a.company_name || '').localeCompare(b.company_name || '');
    } else if (sortBy === 'stage') {
      return (a.current_stage || '').localeCompare(b.current_stage || '');
    } else if (sortBy === 'match_score') {
      return (b.resume_match_score || b.match_score || 0) - (a.resume_match_score || a.match_score || 0);
    } else if (sortBy === 'ats_score') {
      return (b.ats_score || 0) - (a.ats_score || 0);
    } else if (sortBy === 'application_date') {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }
    // Default: last_activity / updated_at
    return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
  });

  // Modal Tab Badges
  const resumeReady = selectedApp?.resume_status === 'ready' || Boolean(selectedApp?.resume_version);
  const coverLetterReady = selectedApp?.cover_letter_status === 'ready' || Boolean(selectedApp?.cover_letter_version);
  const docBadgeCount = `${(resumeReady ? 1 : 0) + (coverLetterReady ? 1 : 0)}/2`;
  const recruiterCount = selectedApp?.contacts?.length || 0;
  const notesCount = selectedApp?.notes_list?.length || 0;
  const followUpCount = selectedApp?.reminders?.filter(r => !r.is_completed)?.length || 0;

  const TABS = [
    { id: 'Overview', label: 'Overview' },
    { id: 'Workflow', label: 'Workflow' },
    { id: 'Documents', label: 'Documents', badge: docBadgeCount },
    { id: 'Recruiter', label: 'Recruiter', badge: recruiterCount > 0 ? recruiterCount : null },
    { id: 'Timeline', label: 'Timeline' },
    { id: 'Notes', label: 'Notes', badge: notesCount > 0 ? notesCount : null },
    { id: 'History', label: 'History' }
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto custom-scrollbar bg-zinc-50/60 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 relative font-sans">
      
      {/* Subtle Ambient Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-tr from-teal-500/5 via-blue-500/5 to-purple-500/5 pointer-events-none" />

      <main className="w-full space-y-5 z-10 p-4 md:p-5">



        {/* 2. COMPACT SUMMARY STRIP (INTERACTIVE FILTER PILLS) */}
        <section className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
          <button
            onClick={() => setStageFilter('Active')}
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              stageFilter === 'Active'
                ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-300 shadow-2xs'
                : 'bg-white/80 dark:bg-zinc-900/80 border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-teal-500" />
            <span>Active Applications</span>
            <span className="px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px]">{activeAppsCount}</span>
          </button>

          <button
            onClick={() => setStageFilter('Preparing')}
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              stageFilter === 'Preparing'
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 shadow-2xs'
                : 'bg-white/80 dark:bg-zinc-900/80 border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>Preparing</span>
            <span className="px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px]">{preparingCount}</span>
          </button>

          <button
            onClick={() => setStageFilter('Applied')}
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              stageFilter === 'Applied'
                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                : 'bg-white/80 dark:bg-zinc-900/80 border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            <span>Applied</span>
            <span className="px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px]">{appliedCount}</span>
          </button>

          <button
            onClick={() => setStageFilter('Interviewing')}
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              stageFilter === 'Interviewing'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 shadow-2xs'
                : 'bg-white/80 dark:bg-zinc-900/80 border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Interviewing</span>
            <span className="px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px]">{interviewingCount}</span>
          </button>

          <button
            onClick={() => setStageFilter('Offers')}
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              stageFilter === 'Offers'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                : 'bg-white/80 dark:bg-zinc-900/80 border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Offers</span>
            <span className="px-1.5 py-0.2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px]">{offersCount}</span>
          </button>

          <button
            onClick={() => setReadinessFilter(readinessFilter === 'followup_due' ? 'All' : 'followup_due')}
            className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              readinessFilter === 'followup_due'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 shadow-2xs'
                : 'bg-white/80 dark:bg-zinc-900/80 border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
            }`}
          >
            <Bell size={13} className="text-rose-500" />
            <span>Follow-ups Due</span>
            <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 text-[10px] font-extrabold">{followupsDueCount}</span>
          </button>
        </section>

        {/* 3. SEARCH AND FILTER TOOLBAR (FULL WIDTH) */}
        <section className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-4 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs space-y-3">
          
          {/* Row 1: Search & Stage Pills */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search by role title, company, or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 rounded-xl text-xs font-medium text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-teal-500 transition-colors"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Stage Filter Buttons */}
            <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
              {['All', 'Active', 'Preparing', 'Applied', 'Interviewing', 'Offers', 'Closed'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStageFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    stageFilter === st
                      ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-800 shadow-2xs'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Additional Filters, Sort & View Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs">
            
            {/* Additional Filter Dropdowns */}
            <div className="flex items-center gap-2">
              <select
                value={readinessFilter}
                onChange={(e) => setReadinessFilter(e.target.value)}
                className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
              >
                <option value="All">All Document States</option>
                <option value="resume_pending">Resume Pending</option>
                <option value="cover_letter_pending">Cover Letter Pending</option>
                <option value="followup_due">Follow-up Due</option>
              </select>

              {(searchQuery || stageFilter !== 'All' || readinessFilter !== 'All') && (
                <button
                  onClick={() => { setSearchQuery(''); setStageFilter('All'); setReadinessFilter('All'); }}
                  className="px-2.5 py-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-white font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw size={12} /> Reset
                </button>
              )}
            </div>

            {/* Sort & View Switcher */}
            <div className="flex items-center gap-3">
              {/* Sort Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 font-medium text-[11px]">Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
                >
                  <option value="last_activity">Last Activity</option>
                  <option value="application_date">Application Date</option>
                  <option value="company">Company</option>
                  <option value="stage">Stage</option>
                  <option value="match_score">Match Score</option>
                  <option value="ats_score">ATS Score</option>
                </select>
              </div>

              {/* View Switcher */}
              <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <button
                  onClick={() => handleSetViewMode('cards')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  }`}
                  title="Card Grid View"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  onClick={() => handleSetViewMode('list')}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-zinc-900 text-teal-600 dark:text-teal-400 shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                  }`}
                  title="Compact List View"
                >
                  <List size={15} />
                </button>
              </div>
            </div>

          </div>

        </section>

        {/* 4. FULL-WIDTH APPLICATION CONTENT AREA */}
        {loading ? (
          /* SKELETON SHIMMER LOADING GRID */
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-5 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-48 bg-white/70 dark:bg-zinc-900/70 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="w-2/3 h-5 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                  <div className="w-1/4 h-5 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
                </div>
                <div className="w-1/2 h-4 bg-zinc-100 dark:bg-zinc-800 rounded-md" />
                <div className="w-full h-12 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl" />
              </div>
            ))}
          </div>
        ) : sortedApps.length === 0 ? (
          /* EMPTY STATE */
          <JobTrackerEmptyState
            isFilterEmpty={applications.length > 0}
            onClearFilters={() => { setSearchQuery(''); setStageFilter('All'); setReadinessFilter('All'); }}
            onOpenExtensionGuide={() => window.open('https://tailr4u.com', '_blank')}
          />
        ) : viewMode === 'cards' ? (
          /* FULL-WIDTH RESPONSIVE CARD GRID (3 COLUMNS ON DESKTOP) */
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-5">
            {sortedApps.map((app) => (
              <JobCard
                key={app.id}
                application={app}
                onSelect={(id) => handleOpenWorkspaceModal(id)}
                onMoveStage={(app) => { handleOpenWorkspaceModal(app.id); setWorkspaceTab('Workflow'); }}
                onAddNote={(app) => { handleOpenWorkspaceModal(app.id); setWorkspaceTab('Notes'); }}
                onAddReminder={(app) => { handleOpenWorkspaceModal(app.id); setShowRemindersModal(true); }}
                onViewSource={(app) => app.job_url && window.open(app.job_url, '_blank')}
              />
            ))}
          </div>
        ) : (
          /* COMPACT LIST VIEW */
          <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 font-bold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="p-4">Application</th>
                  <th className="p-4">Stage</th>
                  <th className="p-4">Resume</th>
                  <th className="p-4">Cover Letter</th>
                  <th className="p-4">Match %</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {sortedApps.map((app) => {
                  const rReady = app.resume_status === 'ready' || Boolean(app.resume_version);
                  const cReady = app.cover_letter_status === 'ready' || Boolean(app.cover_letter_version);

                  return (
                    <tr
                      key={app.id}
                      onClick={() => handleOpenWorkspaceModal(app.id)}
                      className="hover:bg-teal-50/40 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors"
                    >
                      <td className="p-4 font-bold text-zinc-900 dark:text-white">
                        <div className="flex items-center gap-3">
                          <CompanyLogo
                            companyName={app.company_name}
                            companyDomain={app.company_domain}
                            size={32}
                            className="rounded-lg"
                          />
                          <div className="min-w-0">
                            <div className="truncate">{app.job_title}</div>
                            <div className="truncate text-[11px] font-medium text-zinc-500">{app.company_name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-teal-600 dark:text-teal-400">
                        {app.current_stage || 'Ready To Apply'}
                      </td>
                      <td className="p-4 font-semibold">
                        {rReady ? <span className="text-emerald-600">Ready</span> : <span className="text-zinc-400">Pending</span>}
                      </td>
                      <td className="p-4 font-semibold">
                        {cReady ? <span className="text-teal-600">Ready</span> : <span className="text-zinc-400">Pending</span>}
                      </td>
                      <td className="p-4 font-bold text-zinc-900 dark:text-white">
                        {(() => {
                          // `||` treated a genuine 0% match the same as
                          // missing data, and silently fabricated a 60% for
                          // any application with no computed score at all --
                          // indistinguishable from a real number. Only show
                          // a percentage when one was actually computed.
                          const score = app.resume_match_score ?? app.match_score;
                          return score != null ? `${Math.round(score)}%` : '—';
                        })()}
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenWorkspaceModal(app.id); }}
                          className="px-3 py-1 bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950 dark:text-teal-400 rounded-lg text-xs font-bold hover:bg-teal-100"
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </main>

      {/* 5. JOB APPLICATION WORKSPACE POP-UP MODAL (FULL OVERLAY & PERFECTLY FIT) */}
      {showWorkspaceModal && selectedApp && createPortal((
        <div className="fixed inset-x-0 bottom-0 top-16 z-[9999] bg-white dark:bg-zinc-950 overflow-hidden overscroll-none animate-fade-in">
          <div className="w-full h-full min-h-0 bg-white dark:bg-zinc-950 flex flex-col overflow-hidden relative text-zinc-900 dark:text-zinc-100">
            
            {/* Pop-Up Modal Header */}
            <div className="relative shrink-0">
              <JobWorkspaceHeader
                application={selectedApp}
                onMoveStage={() => setWorkspaceTab('Workflow')}
                onEditJob={() => {
                  setJobFormData({
                    company_name: selectedApp.company_name || '',
                    job_title: selectedApp.job_title || '',
                    location: selectedApp.location || '',
                    job_url: selectedApp.job_url || '',
                    current_stage: selectedApp.current_stage || 'Ready To Apply'
                  });
                  setShowEditJobModal(true);
                }}
                onArchiveJob={() => handleArchiveJob(selectedApp.id)}
                onDeleteJob={() => handleDeleteJob(selectedApp.id)}
                isFullscreenPopup={isFullscreenPopup}
                onToggleFullscreen={() => setIsFullscreenPopup(!isFullscreenPopup)}
                onClose={() => setShowWorkspaceModal(false)}
              />
            </div>

            {/* STICKY TAB NAVIGATION BAR */}
            <div className="px-4 md:px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between overflow-x-auto custom-scrollbar shrink-0 select-none shadow-xs sticky top-0 z-20">
              <div className="flex items-center gap-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setWorkspaceTab(tab.id)}
                    className={`px-4 py-3 text-xs font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer border-b-2 whitespace-nowrap ${
                      workspaceTab === tab.id
                        ? 'border-[#00bda5] text-[#00bda5] bg-teal-50/40 dark:bg-zinc-900'
                        : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                    }`}
                  >
                    <span>{tab.label}</span>
                    {tab.badge !== null && tab.badge !== undefined && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        workspaceTab === tab.id
                          ? 'bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      }`}>
                        {tab.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Reminders Shortcut Button */}
              <button
                onClick={() => setShowRemindersModal(true)}
                className="px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700 shadow-xs my-1 shrink-0"
              >
                <Bell size={13} className="text-teal-600 dark:text-teal-400" />
                <span>Reminders</span>
                {followUpCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 font-extrabold text-[10px]">
                    {followUpCount}
                  </span>
                )}
              </button>
            </div>

            {/* TAB CONTENT WORKSPACE CANVAS */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar bg-zinc-50/40 dark:bg-zinc-950 p-2 md:p-4 relative">
              {/* selectedAppFull (lightweight selectedApp merged with the fetched
                  full record) -- these tabs need organized_jd/employment_type/
                  seniority/resume_snapshot/cover_letter_snapshot, none of which
                  are on the lightweight list-derived selectedApp. */}
              {workspaceTab === 'Overview' && (
                <OverviewTab application={selectedAppFull} onNavigateTab={(tab) => setWorkspaceTab(tab)} />
              )}
              {workspaceTab === 'Workflow' && (
                <WorkflowTab application={selectedAppFull} onUpdateStage={handleUpdateStage} />
              )}
              {workspaceTab === 'Documents' && (
                <DocumentsTab application={selectedAppFull} />
              )}
              {workspaceTab === 'Recruiter' && (
                <RecruiterTab application={selectedAppFull} onSaveContacts={handleSaveContacts} />
              )}
              {workspaceTab === 'Timeline' && (
                <TimelineTab application={selectedAppFull} />
              )}
              {workspaceTab === 'Notes' && (
                <NotesTab application={selectedAppFull} onSaveNotesList={handleSaveNotesList} />
              )}
              {workspaceTab === 'History' && (
                <HistoryTab application={selectedAppFull} />
              )}
            </div>

          </div>
        </div>
      ), document.body)}

      {/* MODAL 1: EDIT JOB DETAILS MODAL */}
      {showEditJobModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <form onSubmit={handleEditJobDetails} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl text-zinc-900 dark:text-zinc-100">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <FileEdit size={16} className="text-teal-600 dark:text-teal-400" />
                Edit Application Details
              </h3>
              <button type="button" onClick={() => setShowEditJobModal(false)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Company Name</label>
                <input
                  type="text"
                  value={jobFormData.company_name}
                  onChange={(e) => setJobFormData({ ...jobFormData, company_name: e.target.value })}
                  className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Role Title</label>
                <input
                  type="text"
                  value={jobFormData.job_title}
                  onChange={(e) => setJobFormData({ ...jobFormData, job_title: e.target.value })}
                  className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Location</label>
                <input
                  type="text"
                  value={jobFormData.location}
                  onChange={(e) => setJobFormData({ ...jobFormData, location: e.target.value })}
                  className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Job URL</label>
                <input
                  type="url"
                  value={jobFormData.job_url}
                  onChange={(e) => setJobFormData({ ...jobFormData, job_url: e.target.value })}
                  className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button type="button" onClick={() => setShowEditJobModal(false)} className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 bg-[#00bda5] hover:bg-[#00a38e] text-white font-bold text-xs rounded-xl cursor-pointer border-none shadow-xs">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: REMINDERS MODAL */}
      <RemindersModal
        application={selectedApp}
        isOpen={showRemindersModal}
        onClose={() => setShowRemindersModal(false)}
        onSaveReminders={handleSaveReminders}
      />

    </div>
  );
}

export default function JobTrackerPage() {
  return (
    <JobTrackerErrorBoundary>
      <JobTrackerContent />
    </JobTrackerErrorBoundary>
  );
}
