import React, { useState } from 'react';
import { 
  FileText, Sparkles, MapPin, Clock, MoreVertical, Eye, Layers, 
  FileEdit, Bell, ExternalLink, Calendar, CheckCircle2, ChevronRight
} from 'lucide-react';
import CompanyLogo from '../CompanyLogoView';

export function JobCard({ 
  application, 
  onSelect, 
  onMoveStage, 
  onAddNote, 
  onAddReminder, 
  onViewSource 
}) {
  const [showMenu, setShowMenu] = useState(false);

  if (!application) return null;

  const getStageColor = (stage) => {
    switch (stage) {
      case 'Preparing': return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800';
      case 'Ready To Apply': return 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800';
      case 'Applied': return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800';
      case 'Assessment': return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800';
      case 'Recruiter Contact': return 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-400 dark:border-pink-800';
      case 'Interview': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800';
      case 'Final Round': return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800';
      case 'Offer Received': 
      case 'Offer': 
      case 'Accepted': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800';
      case 'Rejected': 
      case 'Failed': return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800';
      case 'Archived': return 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700';
      default: return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';
    }
  };

  const resumeReady = application.resume_status === 'ready' || Boolean(application.resume_version);
  const coverLetterReady = application.cover_letter_status === 'ready' || Boolean(application.cover_letter_version);

  const matchScore = Math.round(application.resume_match_score || application.match_score || 60);
  const atsScore = Math.round(application.ats_score || 70);

  const formatActivityDate = (dateStr) => {
    if (!dateStr) return 'Updated recently';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 5) return 'Updated just now';
    if (mins < 60) return `Updated ${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Updated ${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `Updated ${days}d ago`;
  };

  const remindersDue = application.reminders?.filter(r => !r.is_completed) || [];

  return (
    <div
      onClick={() => onSelect(application.id)}
      className="group relative bg-white/76 dark:bg-zinc-900/80 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800 hover:border-teal-500/50 dark:hover:border-teal-500/40 rounded-2xl p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-md cursor-pointer flex flex-col justify-between"
    >
      {/* CARD HEADER */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <CompanyLogo
            companyName={application.company_name}
            companyDomain={application.company_domain}
            size={40}
          />

          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-zinc-900 dark:text-white truncate group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
              {application.job_title || 'Untitled Role'}
            </h3>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1.5 mt-0.5">
              <span>{application.company_name || 'Company'}</span>
              {application.location && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-700">•</span>
                  <span className="truncate flex items-center gap-0.5"><MapPin size={11} />{application.location}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Stage Badge */}
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0 ${getStageColor(application.current_stage || 'Ready To Apply')}`}>
          {application.current_stage || 'Ready To Apply'}
        </span>
      </div>

      {/* CARD BODY: READINESS & SCORES */}
      <div className="my-3.5 space-y-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        
        {/* Document Readiness Badges */}
        <div className="flex items-center gap-3 text-xs">
          <span className={`flex items-center gap-1 font-bold ${resumeReady ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-400'}`}>
            <FileText size={13} />
            Resume: <span className="font-extrabold">{resumeReady ? 'Ready' : 'Pending'}</span>
          </span>
          <span className="text-zinc-300 dark:text-zinc-700">•</span>
          <span className={`flex items-center gap-1 font-bold ${coverLetterReady ? 'text-teal-700 dark:text-teal-400' : 'text-zinc-400'}`}>
            <Sparkles size={13} />
            Cover Letter: <span className="font-extrabold">{coverLetterReady ? 'Ready' : 'Pending'}</span>
          </span>
        </div>

        {/* Resume Match % & ATS Score Pills */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-800 px-2.5 py-1 rounded-lg text-xs font-bold text-teal-700 dark:text-teal-400">
            <span>Match</span>
            <span className="font-black text-teal-800 dark:text-teal-300">{matchScore}%</span>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800 px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-700 dark:text-emerald-400">
            <span>ATS Score</span>
            <span className="font-black text-emerald-800 dark:text-emerald-300">{atsScore}/100</span>
          </div>
        </div>

      </div>

      {/* CARD FOOTER */}
      <div className="flex items-center justify-between pt-2.5 border-t border-zinc-100 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400">
        
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium truncate">
            Next: <strong className="text-zinc-800 dark:text-zinc-200 font-bold">{application.next_action || 'Review details'}</strong>
          </span>
          {remindersDue.length > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400 font-extrabold text-[9px] flex items-center gap-0.5 shrink-0">
              <Bell size={9} /> Due ({remindersDue.length})
            </span>
          )}
        </div>

        <span className="shrink-0 text-[10px] font-semibold text-zinc-400">
          {formatActivityDate(application.updated_at)}
        </span>
      </div>

      {/* QUICK ACTIONS OVERFLOW MENU (ON HOVER) */}
      <div 
        onClick={(e) => e.stopPropagation()} 
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10"
      >
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-1.5 rounded-lg bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-zinc-700 shadow-xs cursor-pointer"
        >
          <MoreVertical size={14} />
        </button>

        {showMenu && (
          <div className="absolute right-0 top-8 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg p-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 space-y-1 z-30 animate-fade-in">
            <button
              onClick={() => { setShowMenu(false); onSelect(application.id); }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-2 text-zinc-900 dark:text-white"
            >
              <Eye size={13} className="text-teal-600" /> Open Details
            </button>
            <button
              onClick={() => { setShowMenu(false); onMoveStage?.(application); }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-2"
            >
              <Layers size={13} className="text-blue-600" /> Move Stage
            </button>
            <button
              onClick={() => { setShowMenu(false); onAddNote?.(application); }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-2"
            >
              <FileEdit size={13} className="text-purple-600" /> Add Note
            </button>
            <button
              onClick={() => { setShowMenu(false); onAddReminder?.(application); }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-2"
            >
              <Bell size={13} className="text-amber-600" /> Add Reminder
            </button>
            {application.job_url && (
              <a
                href={application.job_url}
                target="_blank"
                rel="noreferrer"
                onClick={() => setShowMenu(false)}
                className="w-full text-left px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg flex items-center gap-2 text-zinc-600"
              >
                <ExternalLink size={13} /> View Source
              </a>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

export default JobCard;
