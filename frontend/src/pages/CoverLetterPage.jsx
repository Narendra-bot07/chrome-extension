import React from 'react';
import { useApp } from '../context/AppContext';
import CoverLetterView from '../components/CoverLetterView';
import { useNavigate } from 'react-router-dom';

function CoverLetterPage() {
  const navigate = useNavigate();
  const {
    coverLetter,
    companyName,
    handleCopyToClipboard,
    handleDownloadCoverLetterPDF,
    loading,
    handleGenerateCoverLetter
  } = useApp();

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-[#0f0f11] text-slate-500 rounded-2xl border border-slate-200 dark:border-slate-900 shadow-3xs">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-500/20 border-t-indigo-500 mb-4" />
        <p className="text-xs font-black uppercase tracking-wider animate-pulse">Drafting tailored cover letter...</p>
        <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Calling Groq AI models</p>
      </div>
    );
  }

  if (!coverLetter) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-[#0f0f11] text-slate-500 rounded-2xl border border-slate-200 dark:border-slate-900 shadow-3xs text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center text-indigo-500">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l8-5.333a2 2 0 012.22 0l8 5.333A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
          </svg>
        </div>
        <div className="space-y-1.5 max-w-sm">
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Tailor Your Cover Letter</h3>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed font-bold">
            Draft a custom, professional cover letter matching your selected resume directly to the target job description.
          </p>
        </div>
        <button
          onClick={handleGenerateCoverLetter}
          className="py-3 px-6 bg-brand hover:bg-brand-hover text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition shadow-md hover:shadow-indigo-900/30 cursor-pointer border-none"
        >
          Draft Cover Letter
        </button>
      </div>
    );
  }

  return (
    <CoverLetterView
      coverLetter={coverLetter}
      companyName={companyName}
      handleCopyToClipboard={handleCopyToClipboard}
      handleDownloadCoverLetterPDF={handleDownloadCoverLetterPDF}
      setStep={() => navigate('/tailor')}
    />
  );
}

export default CoverLetterPage;
