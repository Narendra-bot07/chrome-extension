import React from 'react';
import { useApp } from '../context/AppContext';
import ResumeReviewView from '../components/ResumeReviewView';
import { useNavigate } from 'react-router-dom';

function ReviewChangesPage() {
  const navigate = useNavigate();
  const {
    parsedResume,
    reviewSuggestions, setReviewSuggestions,
    handleGenerateFinalResume, loading
  } = useApp();

  const handleUpdateSuggestionStatus = (id, newStatus) => {
    setReviewSuggestions(reviewSuggestions.map(s => 
      s.id === id ? { ...s, status: newStatus } : s
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
      parsedResume={parsedResume}
      suggestions={reviewSuggestions}
      onUpdateSuggestionStatus={handleUpdateSuggestionStatus}
      onAcceptAll={handleAcceptAll}
      onRejectAll={handleRejectAll}
      onGenerateResume={handleGenerateFinalResume}
      onBack={() => navigate('/tailor-config')}
      loading={loading}
    />
  );
}

export default ReviewChangesPage;
