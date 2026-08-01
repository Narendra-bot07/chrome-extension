import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import ResumeReviewView from '../components/ResumeReviewView';
import { useNavigate } from 'react-router-dom';
import {
  mergeReviewResume,
  reviewProgress,
  validateWorkingResume
} from '../utils/resumeReviewMerge';

export default function ReviewChangesPage() {
  const navigate = useNavigate();
  const {
    parsedResume,
    setTailoredResume,
    reviewSuggestions, setReviewSuggestions,
    handleGenerateFinalResume, loading, comparison
  } = useApp();

  const reviewState = useMemo(() => {
    const state = mergeReviewResume(parsedResume, reviewSuggestions);
    console.log('[RESUME-PIPELINE:05] Document Review state merged:', {
      has_parsedResume: Boolean(parsedResume),
      parsedResume_id: parsedResume?.id,
      parsedResume_sections: {
        summary: Boolean(parsedResume?.summary),
        experience: parsedResume?.experience?.length || 0,
        projects: parsedResume?.projects?.length || 0,
        education: parsedResume?.education?.length || 0,
        skills: parsedResume?.skills?.length || 0
      },
      workingResume_sections: {
        summary: Boolean(state.workingResume?.summary),
        experience: state.workingResume?.experience?.length || 0,
        projects: state.workingResume?.projects?.length || 0,
        education: state.workingResume?.education?.length || 0,
        skills: state.workingResume?.skills?.length || 0
      },
      suggestions_count: reviewSuggestions.length
    });
    return state;
  }, [parsedResume, reviewSuggestions]);
  const progress = useMemo(
    () => reviewProgress(reviewSuggestions),
    [reviewSuggestions]
  );

  const validation = useMemo(() => {
    const result = validateWorkingResume(
      reviewState.originalResume,
      reviewState.workingResume,
      reviewState.operations
    );
    const targetIssues = [
      ...new Set(reviewState.invalidOperations.map(issue => issue.reason))
    ];
    return {
      valid: result.valid && targetIssues.length === 0,
      issues: [...new Set([...result.issues, ...targetIssues])]
    };
  }, [reviewState]);

  const handleUpdateSuggestionStatus = (id, newStatus) => {
    setReviewSuggestions(previous => {
      const next = previous.map(s => s.id === id ? { ...s, status: newStatus } : s);
      const merged = mergeReviewResume(parsedResume, next);
      if (merged.workingResume) setTailoredResume(merged.workingResume);
      return next;
    });
  };

  const handleUpdateSuggestionText = (id, newText) => {
    setReviewSuggestions(previous => {
      const next = previous.map(s => s.id === id ? { ...s, suggested: newText } : s);
      const merged = mergeReviewResume(parsedResume, next);
      if (merged.workingResume) setTailoredResume(merged.workingResume);
      return next;
    });
  };

  const handleAcceptAll = () => {
    setReviewSuggestions(previous => {
      const next = previous.map(s => ({ ...s, status: 'accepted' }));
      const merged = mergeReviewResume(parsedResume, next);
      if (merged.workingResume) setTailoredResume(merged.workingResume);
      return next;
    });
  };

  const handleRejectAll = () => {
    setReviewSuggestions(previous => {
      const next = previous.map(s => ({ ...s, status: 'rejected' }));
      const merged = mergeReviewResume(parsedResume, next);
      if (merged.workingResume) setTailoredResume(merged.workingResume);
      return next;
    });
  };

  const handleGenerateReviewedResume = () => {
    setTailoredResume(reviewState.workingResume);
    return handleGenerateFinalResume(
      reviewState.workingResume,
      reviewState.operations,
      validation
    );
  };

  if (!comparison && reviewSuggestions.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-300 gap-4 p-6 text-center font-sans">
        <div className="text-base font-extrabold text-zinc-100 font-sans">Tailoring Analysis Required</div>
        <p className="text-xs text-zinc-400 max-w-sm font-sans">You must run the tailoring analysis to generate ATS metrics and section recommendations before opening Document Review.</p>
        <button
          onClick={() => navigate('/tailor-config')}
          className="px-4 py-2.5 bg-[#00bda5] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-[#00a894] transition cursor-pointer shadow-sm font-sans"
        >
          Configure & Run TailorFlow
        </button>
      </div>
    );
  }

  return (
    <ResumeReviewView
      parsedResume={reviewState.workingResume}
      originalResume={reviewState.originalResume}
      suggestions={reviewSuggestions}
      reviewOperations={reviewState.operations}
      reviewProgress={progress}
      validation={validation}
      onUpdateSuggestionStatus={handleUpdateSuggestionStatus}
      onUpdateSuggestionText={handleUpdateSuggestionText}
      onAcceptAll={handleAcceptAll}
      onRejectAll={handleRejectAll}
      onGenerateResume={handleGenerateReviewedResume}
      onBack={() => navigate('/tailor-config')}
      loading={loading}
    />
  );
}
