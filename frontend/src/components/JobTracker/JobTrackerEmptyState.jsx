import React from 'react';
import { Briefcase, Zap, FilterX, Plus, RefreshCw } from 'lucide-react';

export function JobTrackerEmptyState({ 
  isFilterEmpty, 
  onClearFilters, 
  onAddJob, 
  onOpenExtensionGuide 
}) {
  if (isFilterEmpty) {
    return (
      <div className="w-full flex flex-col items-center justify-center p-12 text-center bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800 rounded-3xl min-h-[380px] shadow-xs my-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 shadow-xs">
          <FilterX className="w-8 h-8" />
        </div>
        
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
          No applications match these filters
        </h3>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-md mt-1.5 leading-relaxed">
          Try resetting your stage, readiness, or search filters to see all your saved job applications.
        </p>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={onClearFilters}
            className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700"
          >
            <RefreshCw size={14} />
            Clear Filters
          </button>
          {onAddJob && (
            <button
              onClick={onAddJob}
              className="px-4 py-2 bg-[#00bda5] hover:bg-[#00a38e] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border-none shadow-xs"
            >
              <Plus size={14} />
              Add Job
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center justify-center p-12 text-center bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-800 rounded-3xl min-h-[420px] shadow-xs my-6">
      <div className="w-20 h-20 rounded-3xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-600 dark:text-teal-400 mb-6 shadow-xs">
        <Briefcase className="w-10 h-10" />
      </div>

      <h3 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight">
        Start tracking your applications
      </h3>
      <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-md mt-2 leading-relaxed">
        Add a job manually or capture one automatically using the browser extension on LinkedIn, Indeed, or company career sites.
      </p>

      <div className="flex items-center gap-3 mt-8">
        {onAddJob && (
          <button
            onClick={onAddJob}
            className="px-5 py-2.5 bg-[#00bda5] hover:bg-[#00a38e] text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer border-none shadow-xs"
          >
            <Plus size={15} />
            Add Job
          </button>
        )}
        <button
          onClick={onOpenExtensionGuide}
          className="px-5 py-2.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs rounded-xl flex items-center gap-2 transition-all cursor-pointer border border-zinc-200 dark:border-zinc-700"
        >
          <Zap size={15} className="text-teal-600 dark:text-teal-400" />
          Open Extension Guide
        </button>
      </div>
    </div>
  );
}

export default JobTrackerEmptyState;
