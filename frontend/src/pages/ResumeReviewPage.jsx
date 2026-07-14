import React from 'react';
import { useApp } from '../context/AppContext';
import ResumeEditorView from '../components/Resume/ResumeEditorView';
import { useNavigate } from 'react-router-dom';

function ResumeReviewPage() {
  const navigate = useNavigate();
  const { parsedResume, setParsedResume, setResumeFile, jobAnalysis, loading } = useApp();

  if (!parsedResume) return null;

  const handleLooksGood = () => {
    if (jobAnalysis) {
      navigate('/tailor-config');
    } else {
      navigate('/tailor');
    }
  };

  return (
    <ResumeEditorView
      parsedResume={parsedResume}
      setParsedResume={setParsedResume}
      onLooksGood={handleLooksGood}
      onUploadDifferent={() => {
        setResumeFile(null);
        setParsedResume(null);
        navigate('/resume-detect');
      }}
      loading={loading}
    />
  );
}

export default ResumeReviewPage;
