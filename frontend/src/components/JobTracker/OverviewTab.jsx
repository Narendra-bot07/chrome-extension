import React from 'react';
import { 
  FileText, Wand2, UserCheck, ArrowRight, Clock, 
  BrainCircuit, CheckCircle2, AlertCircle, Calendar, Zap, ShieldCheck
} from 'lucide-react';

export function OverviewTab({ application, onNavigateTab }) {
  if (!application) return null;

  const resumeReady = application.resume_status === 'ready' || Boolean(application.resume_version);
  const coverLetterReady = application.cover_letter_status === 'ready' || Boolean(application.cover_letter_version);
  const recruiterAdded = Boolean(application.contacts && application.contacts.length > 0) || Boolean(application.recruiter_notes);

  // Previously a flat lookup keyed only on current_stage -- it never looked
  // at whether the resume/cover letter were actually ready or how long the
  // application had actually been sitting in its stage, so it kept
  // recommending the same generic action (e.g. "Tailor resume & submit
  // application") even for an application that already had both documents
  // ready, or "Follow up in 5-7 days" whether that was said the day of
  // applying or three weeks later. Weighs the real signals already computed
  // above (resumeReady/coverLetterReady/recruiterAdded) plus elapsed time
  // since the stage's last activity, so the recommendation reflects this
  // specific application's actual state.
  const daysSince = (() => {
    const raw = application.last_activity || application.updated_at || application.created_at;
    if (!raw) return null;
    const then = new Date(raw).getTime();
    if (Number.isNaN(then)) return null;
    return Math.max(0, Math.floor((Date.now() - then) / 86400000));
  })();

  const computedNextAction = (() => {
    switch (application.current_stage) {
      case 'Ready To Apply':
        if (!resumeReady) return 'Tailor your resume for this role';
        if (!coverLetterReady) return 'Add a cover letter, then submit your application';
        return 'Submit your application -- resume and cover letter are ready';
      case 'Applied':
        if (daysSince == null) return 'Follow up in 5–7 days';
        if (daysSince >= 7 && !recruiterAdded) return `Applied ${daysSince} day${daysSince === 1 ? '' : 's'} ago -- add a recruiter contact for a warmer follow-up`;
        if (daysSince >= 5) return `Follow up now -- it's been ${daysSince} day${daysSince === 1 ? '' : 's'} since you applied`;
        return `Applied ${daysSince} day${daysSince === 1 ? '' : 's'} ago -- follow up in ${Math.max(1, 5 - daysSince)} more day${(5 - daysSince) === 1 ? '' : 's'}`;
      case 'Assessment':
        return application.next_action_due_at
          ? `Complete assessment / code test by ${new Date(application.next_action_due_at).toLocaleDateString()}`
          : 'Complete assessment / code test';
      case 'Recruiter Contact':
        return recruiterAdded ? 'Schedule a call with your recruiter contact' : 'Add your recruiter\'s contact details';
      case 'Interview':
        return application.next_action_due_at
          ? `Prepare interview notes -- scheduled ${new Date(application.next_action_due_at).toLocaleDateString()}`
          : 'Prepare interview notes & questions';
      default:
        return 'Review next application steps';
    }
  })();

  const nextActionText = application.next_action || computedNextAction;

  const organizedJd = application.organized_jd || {};
  const normalizeSkills = (value) => {
    if (Array.isArray(value)) {
      return value
        .map(skill => typeof skill === 'string' ? skill : skill?.name || skill?.skill)
        .filter(Boolean);
    }
    return typeof value === 'string'
      ? value.split(/[,;\n]/).map(skill => skill.trim()).filter(Boolean)
      : [];
  };
  const keySkills = [
    ...normalizeSkills(application.key_skills),
    ...normalizeSkills(organizedJd.required_skills),
    ...normalizeSkills(organizedJd.skills),
    ...normalizeSkills(organizedJd.explicit_skills)
  ].filter((skill, index, all) => (
    all.findIndex(candidate => candidate.toLowerCase() === skill.toLowerCase()) === index
  ));
  const jobDescription = application.job_description
    || organizedJd.job_description
    || organizedJd.description
    || organizedJd.raw_description
    || '';

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      
      {/* 1. APPLICATION READINESS DASHBOARD */}
      <section className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Application Readiness
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Resume Card */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${resumeReady ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' : 'bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800'}`}>
                <FileText size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Tailored Resume</h4>
                <span className={`text-[11px] font-bold ${resumeReady ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  {resumeReady ? 'Ready for Submission' : 'Pending / Needs Tailoring'}
                </span>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('Documents')}
              className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
            >
              View
            </button>
          </div>

          {/* Cover Letter Card */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${coverLetterReady ? 'bg-teal-50 text-teal-600 border border-teal-200 dark:bg-teal-950/30 dark:text-teal-400 dark:border-teal-800' : 'bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800'}`}>
                <Wand2 size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Cover Letter</h4>
                <span className={`text-[11px] font-bold ${coverLetterReady ? 'text-teal-700 dark:text-teal-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  {coverLetterReady ? 'Generated & Formatted' : 'Not Created'}
                </span>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('Documents')}
              className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
            >
              {coverLetterReady ? 'View' : 'Generate'}
            </button>
          </div>

          {/* Recruiter Card */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${recruiterAdded ? 'bg-purple-50 text-purple-600 border border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800'}`}>
                <UserCheck size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Recruiter Contact</h4>
                <span className={`text-[11px] font-bold ${recruiterAdded ? 'text-purple-700 dark:text-purple-400' : 'text-zinc-500'}`}>
                  {recruiterAdded ? `${application.contacts?.length || 1} Contact Saved` : 'No Contacts Added'}
                </span>
              </div>
            </div>
            <button
              onClick={() => onNavigateTab('Recruiter')}
              className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer"
            >
              {recruiterAdded ? 'Manage' : 'Add'}
            </button>
          </div>
        </div>
      </section>

      {/* 2. NEXT ACTION & LATEST ACTIVITY */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Next Action Card */}
        <div className="p-4 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900/50 space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1">
              <Zap size={12} />
              Recommended Next Action
            </span>
            {application.next_action_due_at && (
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                Due: {new Date(application.next_action_due_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <ArrowRight size={15} className="text-teal-600 dark:text-teal-400 shrink-0" />
            <span>{nextActionText}</span>
          </h4>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Executing recommended actions on time increases response rates by up to 40%.
          </p>
        </div>

        {/* Latest Activity Card */}
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-2.5 shadow-xs">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
            <Clock size={12} />
            Latest Activity
          </span>
          <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
            {application.timeline && application.timeline.length > 0
              ? application.timeline[application.timeline.length - 1].event || 'Application created'
              : `Stage set to ${application.current_stage || 'Ready To Apply'}`}
          </div>
          <p className="text-[11px] text-zinc-500">
            {new Date(application.updated_at || application.created_at || Date.now()).toLocaleString()}
          </p>
        </div>
      </div>

      {/* 3. JOB INTELLIGENCE SUMMARY */}
      <section className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
            <BrainCircuit size={15} className="text-teal-600 dark:text-teal-400" />
            Job Intelligence Summary
          </h3>
          <span className="text-[10px] font-semibold text-zinc-400">
            Extracted from JD
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-bold block">Company</span>
            <span className="font-bold text-zinc-900 dark:text-zinc-200 truncate block mt-0.5">{application.company_name || 'N/A'}</span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-bold block">Location</span>
            <span className="font-bold text-zinc-900 dark:text-zinc-200 truncate block mt-0.5">{application.location || 'Remote / Unspecified'}</span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-bold block">Employment Type</span>
            {/* Was `|| 'Full-time'` -- a hardcoded guess indistinguishable from
                a genuinely extracted value. Since employment_type wasn't even
                reachable from this tab until the full-record fetch was wired
                up in JobTrackerPage, EVERY application showed "Full-time"
                here regardless of what the JD actually said (even for this
                exact apprenticeship listing, which isn't full-time). */}
            <span className="font-bold text-zinc-900 dark:text-zinc-200 truncate block mt-0.5">{application.employment_type || organizedJd.job_type || 'Not specified'}</span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-bold block">Seniority</span>
            <span className="font-bold text-zinc-900 dark:text-zinc-200 truncate block mt-0.5">{application.seniority || organizedJd.seniority || 'Not specified'}</span>
          </div>
        </div>

        {jobDescription && (
          <div className="pt-2">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-2">
              Organized Job Description
            </span>
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
              {jobDescription}
            </p>
          </div>
        )}

        {/* Required Skills */}
        {keySkills.length > 0 && <div className="pt-2">
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block mb-2">
            Key Required Skills
          </span>
          <div className="flex flex-wrap gap-1.5">
            {keySkills.map((skill, idx) => (
              <span key={idx} className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold">
                {skill}
              </span>
            ))}
          </div>
        </div>}
      </section>

    </div>
  );
}

export default OverviewTab;
