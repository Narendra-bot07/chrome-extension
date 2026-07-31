import React from 'react';
import { useApp } from '../context/AppContext';
import TemplateSelectionView from '../components/TemplateSelectionView';
import { useNavigate } from 'react-router-dom';

function TemplatesPage() {
  const navigate = useNavigate();
  const {
    workflowResume,
    resumeWorkflowHydrated,
    loading
  } = useApp();

  const activeResume = workflowResume || tailoredResume || parsedResume;

  if (loading || !resumeWorkflowHydrated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-300 gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#00bda5]/20 border-t-[#00bda5]" />
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Loading Templates Studio...</span>
      </div>
    );
  }

  if (!activeResume) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-300 gap-4 p-6 text-center">
        <div className="text-base font-extrabold text-zinc-100">Finalized Resume Not Available</div>
        <p className="text-xs text-zinc-400 max-w-sm">Return to Document Review and finalize your accepted/rejected decisions. The original resume will not be substituted.</p>
        <button
          onClick={() => navigate('/review-changes')}
          className="px-4 py-2.5 bg-[#00bda5] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-[#00a894] transition cursor-pointer shadow-sm"
        >
          Return to Document Review
        </button>
      </div>
    );
  }

  return (
    <TemplateSelectionView
      onBack={() => navigate('/review-changes')}
    />
  );
}

export default TemplatesPage;
