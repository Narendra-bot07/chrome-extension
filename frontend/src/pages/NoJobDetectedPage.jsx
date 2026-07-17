import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

function NoJobDetectedPage() {
  const navigate = useNavigate();
  const { handleFreshSessionExtraction } = useApp();

  const handleScanAgain = () => {
    navigate('/tailor');
    handleFreshSessionExtraction();
  };

  const handleEnterManually = () => {
    navigate('/manual-job-entry');
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50/50 dark:bg-slate-950 flex flex-col justify-center items-center p-6 animate-in fade-in duration-300">
      <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-8 sm:p-10 shadow-sm transition-all space-y-8">
        
        {/* Icon & Titles */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner mb-4">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            No Job Posting Detected
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base leading-relaxed max-w-sm mx-auto">
            We couldn't automatically identify a single job posting on this page.
          </p>
        </div>

        {/* Possible Reasons Container */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Common Reasons
          </h2>
          <ul className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex items-start gap-3">
              <span className="text-indigo-500 font-bold mt-0.5">•</span>
              <span><strong>Search results</strong> or multi-job listing feeds</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-indigo-500 font-bold mt-0.5">•</span>
              <span><strong>Job recommendation pages</strong> (e.g. "Top job picks for you")</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-indigo-500 font-bold mt-0.5">•</span>
              <span><strong>Company home pages</strong> or general career portals</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-indigo-500 font-bold mt-0.5">•</span>
              <span><strong>Unsupported career portals</strong> or login-walled postings</span>
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={handleEnterManually}
            className="flex-1 py-3 px-5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl shadow-sm hover:shadow transition-all duration-150 flex items-center justify-center gap-2 text-sm"
          >
            <span>Enter Details Manually</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
          
          <button
            onClick={handleScanAgain}
            className="sm:w-36 py-3 px-5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl transition-all duration-150 flex items-center justify-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Scan Again</span>
          </button>
        </div>

      </div>
    </div>
  );
}

export default NoJobDetectedPage;
