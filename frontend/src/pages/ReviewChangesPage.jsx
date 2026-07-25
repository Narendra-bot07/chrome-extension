import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import ResumeReviewView from '../components/ResumeReviewView';
import { useNavigate } from 'react-router-dom';
import {
  mergeReviewResume,
  reviewProgress,
  validateWorkingResume
} from '../utils/resumeReviewMerge';

function ReviewChangesPage() {
  const navigate = useNavigate();
  const {
    parsedResume,
    reviewSuggestions, setReviewSuggestions,
    handleGenerateFinalResume, loading
  } = useApp();

  const reviewState = useMemo(
    () => mergeReviewResume(parsedResume, reviewSuggestions),
    [parsedResume, reviewSuggestions]
  );
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
    const targetIssues = reviewState.invalidOperations.map(issue => issue.reason);
    return {
      valid: result.valid && targetIssues.length === 0,
      issues: [...result.issues, ...targetIssues]
    };
  }, [reviewState]);

  const handleUpdateSuggestionStatus = (id, newStatus) => {
    setReviewSuggestions(reviewSuggestions.map(s => 
      s.id === id ? { ...s, status: newStatus } : s
    ));
  };

  const handleUpdateSuggestionText = (id, newText) => {
    setReviewSuggestions(reviewSuggestions.map(s =>
      s.id === id ? { ...s, suggested: newText } : s
    ));
  };

  const handleAcceptAll = () => {
    setReviewSuggestions(reviewSuggestions.map(s => ({ ...s, status: 'accepted' })));
  };

  const handleRejectAll = () => {
    setReviewSuggestions(reviewSuggestions.map(s => ({ ...s, status: 'rejected' })));
  };

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
      onGenerateResume={() => handleGenerateFinalResume(
        reviewState.workingResume,
        reviewState.operations,
        validation
      )}
      onBack={() => navigate('/tailor-config')}
      loading={loading}
    />
  );
}

export default ReviewChangesPage;
