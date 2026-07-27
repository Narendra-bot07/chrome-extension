import React from 'react';
import { 
  Building, MapPin, Calendar, ExternalLink, Layers, Edit3, Archive, Trash2, 
  Sparkles, FileText, CheckCircle2, Award
} from 'lucide-react';
import CompanyLogo from '../CompanyLogoView';

export function JobWorkspaceHeader({
  application,
  onMoveStage,
  onEditJob,
  onArchiveJob,
  onDeleteJob
}) {
  if (!application) return null;

  const matchScore = Math.round(application.resume_match_score || application.match_score || 60);
  const atsScore = Math.round(application.ats_score || 70);
  const stage = application.current_stage || 'Ready To Apply';
  const appliedDate = application.applied_at || application.created_at;

  const getStageColor = (stg) => {
    switch (stg) {
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

  return (
    <header className="p-4 md:p-6 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none shadow-xs">
      
      {/* Role, Company, Location Metadata */}
      <div className="flex min-w-0 items-start gap-3">
        <CompanyLogo
          companyName={application.company_name}
          companyDomain={application.company_domain}
          size={48}
        />
        <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl md:text-2xl font-black text-zinc-900 dark:text-white tracking-tight truncate">
            {application.job_title || 'Untitled Position'}
          </h1>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider ${getStageColor(stage)}`}>
            {stage}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
          <div className="flex items-center gap-1.5 text-zinc-800 dark:text-zinc-200 font-semibold">
            <Building size={14} className="text-teal-600 dark:text-teal-400" />
            <span>{application.company_name || 'Company Name'}</span>
          </div>

          {application.location && (
            <div className="flex items-center gap-1">
              <MapPin size={13} className="text-zinc-400" />
              <span>{application.location}</span>
            </div>
          )}

          {application.employment_type && (
            <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[11px] font-semibold">
              {application.employment_type}
            </span>
          )}

          {appliedDate && (
            <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
              <Calendar size={13} className="text-zinc-400" />
              <span>Applied {new Date(appliedDate).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {/* Metrics Row: Match % & ATS Score */}
        <div className="flex items-center gap-3 text-xs pt-1">
          <div className="flex items-center gap-1.5 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 px-2.5 py-1 rounded-lg">
            <Sparkles size={13} className="text-teal-600 dark:text-teal-400" />
            <span className="text-zinc-600 dark:text-zinc-300 font-semibold">Resume Match:</span>
            <strong className="text-teal-700 dark:text-teal-400 font-extrabold">{matchScore}%</strong>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 rounded-lg">
            <Award size={13} className="text-emerald-600 dark:text-emerald-400" />
            <span className="text-zinc-600 dark:text-zinc-300 font-semibold">ATS Score:</span>
            <strong className="text-emerald-700 dark:text-emerald-400 font-extrabold">{atsScore}/100</strong>
          </div>
        </div>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
        {/* Primary Action Button */}
        <button
          onClick={onMoveStage}
          className="px-4 py-2 bg-[#00bda5] hover:bg-[#00a38e] text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
        >
          <Layers size={14} />
          <span>Move Stage</span>
        </button>

        {/* Secondary Actions */}
        <button
          onClick={onEditJob}
          title="Edit Job Details"
          className="p-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700 shadow-xs"
        >
          <Edit3 size={15} />
        </button>

        {application.job_url && (
          <a
            href={application.job_url}
            target="_blank"
            rel="noopener noreferrer"
            title="View Source Job Posting"
            className="p-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700 shadow-xs flex items-center"
          >
            <ExternalLink size={15} />
          </a>
        )}

        <button
          onClick={onArchiveJob}
          title="Archive Application"
          className="p-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700 shadow-xs"
        >
          <Archive size={15} />
        </button>

        <button
          onClick={onDeleteJob}
          title="Delete Application"
          className="p-2 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 text-rose-600 dark:text-rose-400 rounded-xl transition-colors cursor-pointer border border-rose-200 dark:border-rose-900/40 shadow-xs"
        >
          <Trash2 size={15} />
        </button>
      </div>

    </header>
  );
}

export default JobWorkspaceHeader;
