import React, { useEffect, useState } from 'react';
import { 
  Check, Download, RotateCcw, Cpu, Target, FileCheck, Clock, 
  PlusCircle, ArrowUpRight, ShieldCheck, ClipboardCheck, ArrowRight, X 
} from 'lucide-react';
import { useApp } from '../context/AppContext';

function SuccessView({
  tailoredResume,
  companyName,
  syncedApplication,
  onDownloadPDF,
  onReset
}) {
  const { 
    isExtension, 
    fetchApplications, 
    session,
    comparison,
    syncCurrentJobToTracker
  } = useApp();

  const [appliedStatus, setAppliedStatus] = useState('Ready To Apply');
  const [quickNotes, setQuickNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key === 'Escape' && !saving) onReset();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onReset, saving]);

  const premiumMetrics = [
    { label: "AI Confidence", value: "98%", icon: Cpu },
    { label: "ATS Match Score", value: comparison?.ats_score_after != null ? `${Math.round(comparison.ats_score_after)}/100` : "—", icon: Target },
    { label: "Resume Quality", value: "Excellent", icon: FileCheck },
    { label: "Recruiter Read Time", value: "6s", icon: Clock }
  ];

  const handleSaveAndConfirm = async () => {
    setSaving(true);
    setSyncError('');
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (token) {
        const syncedApplication = await syncCurrentJobToTracker(appliedStatus, quickNotes);
        const syncedApplicationId = syncedApplication?.id;
        if (!syncedApplicationId) {
          throw new Error("Job tracker sync did not return an application.");
        }
        // Refresh application state
        await fetchApplications();
      }
      onReset();
    } catch (e) {
      console.error("Failed to update application tracker status:", e);
      setSyncError(e.message || "The tracker update failed. Please retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`relative flex-1 flex flex-col justify-between py-6 select-none text-zinc-650 dark:text-zinc-350 font-sans mx-auto w-full ${
      isExtension ? 'max-w-md' : 'max-w-xl'
    }`}>
      <button
        type="button"
        onClick={onReset}
        disabled={saving}
        aria-label="Close export success"
        title="Close"
        className="absolute right-0 top-0 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/90 text-zinc-300 shadow-lg transition hover:border-zinc-500 hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <X size={16} />
      </button>
      <div className="flex-1 flex flex-col items-center justify-center space-y-5">
        
        {/* Glowing Success Ring */}
        <div className="w-11 h-11 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-500 shadow-sm animate-fadeIn">
          <Check size={18} className="stroke-[3]" />
        </div>
        
        <div className="text-center space-y-1 px-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-950 dark:text-zinc-50">Dashboard & Job Tracker Synced</h3>
          <p className="text-[10px] text-zinc-550 dark:text-zinc-400 font-bold">
            Your PDF, tailored resume, and organized job description are saved to this application.
          </p>
          {syncedApplication?.job_title && (
            <p className="text-[9px] font-extrabold text-[#00a894]">
              {syncedApplication.job_title} · {syncedApplication.company_name || companyName}
            </p>
          )}
        </div>

        {/* Premium Details Grid */}
        <div className="w-full grid grid-cols-2 gap-2.5 p-3.5 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200/50 dark:border-zinc-850 rounded-2xl">
          {premiumMetrics.map((metric, idx) => {
            const Icon = metric.icon;
            return (
              <div key={idx} className="flex flex-col gap-0.5 p-2 bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800/80 rounded-xl">
                <span className="text-[7.5px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                  <Icon size={9} />
                  {metric.label}
                </span>
                <span className="text-xs font-extrabold text-zinc-800 dark:text-zinc-200">
                  {metric.value}
                </span>
              </div>
            );
          })}
        </div>

        {/* INTERACTIVE TRACKING FORM */}
        <div className="w-full p-4 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-250/60 dark:border-zinc-805 rounded-2xl space-y-3.5 shadow-2xs">
          <div className="space-y-1">
            <span className="text-[8.5px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              <ClipboardCheck size={11} className="text-[#00bda5]" /> Application Status Tracker
            </span>
            <p className="text-[9.5px] text-zinc-500 font-bold uppercase">
              Select current stage for {companyName || 'Employer'}:
            </p>
          </div>

          {/* Status option chips */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'Ready To Apply', label: 'Not Submitted' },
              { id: 'Applied', label: 'Applied' },
              { id: 'Interview', label: 'Interview' }
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAppliedStatus(opt.id)}
                className={`py-2 px-2 border rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition cursor-pointer select-none ${
                  appliedStatus === opt.id
                    ? 'bg-brand/10 border-brand text-brand font-black'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-850'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Quick Notes Input */}
          <div className="space-y-1">
            <label className="text-[8.5px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block">Quick notes</label>
            <input
              type="text"
              value={quickNotes}
              onChange={(e) => setQuickNotes(e.target.value)}
              placeholder="Referral name, job URL, comments..."
              className="w-full text-xs px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl focus:outline-hidden focus:border-[#00bda5] font-semibold"
            />
          </div>
        </div>

      </div>

      {/* Options CTA */}
      <div className="space-y-2 pt-5 shrink-0">
        {syncError && (
          <p role="alert" className="text-[10px] font-bold text-rose-600 text-center">
            {syncError}
          </p>
        )}
        <button 
          type="button"
          onClick={handleSaveAndConfirm}
          disabled={saving}
          className="w-full py-3 bg-[#00bda5] hover:bg-[#00a894] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-1 cursor-pointer border-none shadow-md"
        >
          {saving ? "Updating..." : "Update & Open Job Tracker"}
          <ArrowRight size={13} className="ml-1" />
        </button>
        
        <button 
          type="button"
          onClick={onDownloadPDF}
          className="w-full py-2 bg-transparent hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-550 dark:text-zinc-400 font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer border-none"
        >
          <Download size={11} /> Download Another Copy
        </button>
      </div>
    </div>
  );
}

export default SuccessView;
