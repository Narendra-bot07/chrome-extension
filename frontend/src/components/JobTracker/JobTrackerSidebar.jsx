import React, { useState } from 'react';
import { 
  Search, Filter, Briefcase, MapPin, Clock, ArrowRight,
  FileText, CheckCircle2, AlertCircle, Wand2, ExternalLink,
  ChevronDown, Calendar, Layers, ShieldCheck
} from 'lucide-react';
import CompanyLogo from '../CompanyLogoView';

const FILTER_TABS = [
  { id: 'All', label: 'All' },
  { id: 'Active', label: 'Active' },
  { id: 'Preparing', label: 'Preparing' },
  { id: 'Applied', label: 'Applied' },
  { id: 'Interviewing', label: 'Interviewing' },
  { id: 'Offers', label: 'Offers' },
  { id: 'Closed', label: 'Closed' }
];

const SORT_OPTIONS = [
  { id: 'last_activity', label: 'Last Activity' },
  { id: 'application_date', label: 'Application Date' },
  { id: 'company', label: 'Company' },
  { id: 'stage', label: 'Stage' },
  { id: 'highest_match', label: 'Highest Match' }
];

export function JobTrackerSidebar({
  applications = [],
  selectedAppId,
  onSelectApp,
  onMoveStageQuick,
  onAddNoteQuick,
  onAddReminderQuick,
  searchQuery,
  setSearchQuery,
  filterTab,
  setFilterTab,
  optionalFilter,
  setOptionalFilter,
  sortBy,
  setSortBy
}) {
  const getStageColor = (stage) => {
    switch (stage) {
      case 'Applied': return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800';
      case 'Assessment': return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800';
      case 'Recruiter Contact':
      case 'Recruiter': return 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/30 dark:text-pink-400 dark:border-pink-800';
      case 'Interview':
      case 'Final Round': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800';
      case 'Offer Received':
      case 'Offer':
      case 'Accepted': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800';
      case 'Rejected': return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800';
      case 'Archived': return 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700';
      default: return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
    }
  };

  const formatRelativeTime = (dateVal) => {
    if (!dateVal) return 'Updated recently';
    const date = new Date(dateVal);
    if (isNaN(date.getTime())) return 'Updated recently';
    const diffMs = new Date() - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Updated just now';
    if (diffHours === 1) return 'Updated 1 hour ago';
    if (diffHours < 24) return `Updated ${diffHours} hours ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Updated yesterday';
    return `Updated ${diffDays} days ago`;
  };

  // Filter & Sort logic
  const filteredApps = applications.filter((app) => {
    if (!app) return false;
    const matchesSearch = 
      (app.job_title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.company_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (app.location || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Stage filter
    const stage = app.current_stage || 'Ready To Apply';
    if (filterTab === 'Active' && (stage === 'Rejected' || stage === 'Archived')) return false;
    if (filterTab === 'Preparing' && stage !== 'Ready To Apply' && stage !== 'Preparing') return false;
    if (filterTab === 'Applied' && stage !== 'Applied') return false;
    if (filterTab === 'Interviewing' && stage !== 'Interview' && stage !== 'Final Round' && stage !== 'Assessment' && stage !== 'Recruiter') return false;
    if (filterTab === 'Offers' && stage !== 'Offer' && stage !== 'Offer Received' && stage !== 'Accepted') return false;
    if (filterTab === 'Closed' && stage !== 'Rejected' && stage !== 'Archived') return false;

    // Optional Filter
    if (optionalFilter === 'resume_pending' && app.resume_status === 'ready') return false;
    if (optionalFilter === 'cover_letter_pending' && app.cover_letter_status === 'ready') return false;
    if (optionalFilter === 'followup_due' && !app.next_action_due_at) return false;

    return true;
  }).sort((a, b) => {
    if (sortBy === 'highest_match') {
      return (b.resume_match_score || 0) - (a.resume_match_score || 0);
    }
    if (sortBy === 'company') {
      return (a.company_name || '').localeCompare(b.company_name || '');
    }
    if (sortBy === 'application_date') {
      return new Date(b.created_at || b.applied_at || 0) - new Date(a.created_at || a.applied_at || 0);
    }
    return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
  });

  return (
    <aside className="w-full md:w-80 lg:w-[360px] shrink-0 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-full overflow-hidden select-none">
      
      {/* Search Header */}
      <div className="p-3.5 border-b border-zinc-200 dark:border-zinc-800/80 space-y-3 bg-white dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-extrabold text-zinc-900 dark:text-white tracking-tight">Applications</h2>
            <span className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-400 text-[10px] font-bold">
              {filteredApps.length}
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search role, company, or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/20 transition-all"
          />
        </div>

        {/* Primary Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 text-xs">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                filterTab === tab.id
                  ? 'bg-teal-50 text-teal-700 border border-teal-200 dark:bg-zinc-800 dark:text-teal-400 dark:border-teal-800'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sorting & Optional Filters Dropdown */}
        <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-zinc-400">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-[11px] text-zinc-700 dark:text-zinc-300 py-0.5 px-1.5 focus:outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>

          {optionalFilter && (
            <button
              onClick={() => setOptionalFilter('')}
              className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline cursor-pointer font-semibold"
            >
              Clear Filter
            </button>
          )}
        </div>
      </div>

      {/* Directory Cards List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5 custom-scrollbar bg-zinc-50/50 dark:bg-zinc-950">
        {filteredApps.length === 0 ? (
          <div className="p-8 text-center text-zinc-400 text-xs">
            No applications match the current search filters.
          </div>
        ) : (
          filteredApps.map((app) => {
            const isSelected = selectedAppId === app.id;
            const matchScore = Math.round(app.resume_match_score || app.match_score || 60);
            const atsScore = Math.round(app.ats_score || 70);
            const resumeReady = app.resume_status === 'ready' || Boolean(app.resume_version);
            const coverLetterReady = app.cover_letter_status === 'ready' || Boolean(app.cover_letter_version);
            const stage = app.current_stage || 'Ready To Apply';

            return (
              <div
                key={app.id}
                onClick={() => onSelectApp(app.id)}
                className={`group relative p-3.5 rounded-xl border transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-teal-50/60 dark:bg-teal-950/20 border-teal-500/40 shadow-sm ring-1 ring-teal-500/20'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-xs'
                }`}
              >
                {/* Header: Company Logo/Initials, Role, Company */}
                <div className="flex items-start gap-2.5">
                  <CompanyLogo
                    companyName={app.company_name}
                    companyDomain={app.company_domain}
                    size={36}
                    className="rounded-lg"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="text-xs font-bold text-zinc-900 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-300 transition-colors">
                        {app.job_title || 'Untitled Position'}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider shrink-0 ${getStageColor(stage)}`}>
                        {stage}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium truncate mt-0.5">
                      {app.company_name || 'Company Name'}
                      {app.location && <span className="text-zinc-400 dark:text-zinc-500 ml-1">· {app.location}</span>}
                    </p>
                  </div>
                </div>

                {/* Document Readiness Badges */}
                <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 text-[10px]">
                  <div className={`flex items-center gap-1 font-semibold ${resumeReady ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-400'}`}>
                    <FileText size={12} />
                    <span>Resume: {resumeReady ? 'Ready' : 'Pending'}</span>
                  </div>
                  <span className="text-zinc-300 dark:text-zinc-700">•</span>
                  <div className={`flex items-center gap-1 font-semibold ${coverLetterReady ? 'text-teal-700 dark:text-teal-400' : 'text-zinc-400'}`}>
                    <Wand2 size={12} />
                    <span>Cover Letter: {coverLetterReady ? 'Ready' : 'Pending'}</span>
                  </div>
                </div>

                {/* Score Indicators & Last Activity */}
                <div className="flex items-center justify-between mt-2 text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                  <div className="flex items-center gap-2">
                    <span className="text-teal-700 dark:text-teal-400 font-bold">Match {matchScore}%</span>
                    <span className="text-zinc-300 dark:text-zinc-700">|</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">ATS {atsScore}/100</span>
                  </div>
                  <span className="text-zinc-400 dark:text-zinc-500">{formatRelativeTime(app.updated_at || app.created_at)}</span>
                </div>

                {/* Next Action Intelligence Banner */}
                {app.next_action && (
                  <div className="mt-2.5 p-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800/80 text-[10px] text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <ArrowRight size={11} className="text-teal-600 dark:text-teal-400 shrink-0" />
                    <span className="truncate"><strong className="text-zinc-500 font-semibold">Next:</strong> {app.next_action}</span>
                  </div>
                )}

                {/* Quick Action Overlay Buttons on Hover */}
                <div className="absolute right-2 bottom-2 hidden group-hover:flex items-center gap-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xs p-1 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-md">
                  <button
                    title="Move Stage"
                    onClick={(e) => { e.stopPropagation(); onMoveStageQuick?.(app); }}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer"
                  >
                    <Layers size={13} />
                  </button>
                  <button
                    title="Add Note"
                    onClick={(e) => { e.stopPropagation(); onAddNoteQuick?.(app); }}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer"
                  >
                    <FileText size={13} />
                  </button>
                  <button
                    title="Add Reminder"
                    onClick={(e) => { e.stopPropagation(); onAddReminderQuick?.(app); }}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer"
                  >
                    <Calendar size={13} />
                  </button>
                  {app.job_url && (
                    <a
                      href={app.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View Source Job Posting"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>

              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

export default JobTrackerSidebar;
