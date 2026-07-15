import React from 'react';
import { useApp } from '../context/AppContext';
import ResumeDetectionView from '../components/ResumeDetectionView';

function ResumeDetectPage() {
  const {
    parsedResume, setParsedResume,
    resumesList, fetchResumesList,
    handleDeleteResume,
    resumeFile, setResumeFile,
    dragActive, setDragActive,
    loadingProgress,
    handleParseResume,
    loading, isExtension
  } = useApp();

  React.useEffect(() => {
    fetchResumesList();
  }, []);

  // Auto-parse when a file is chosen
  React.useEffect(() => {
    if (resumeFile) {
      handleParseResume();
    }
  }, [resumeFile]);

  return (
    <ResumeDetectionView
      parsedResume={parsedResume}
      setParsedResume={setParsedResume}
      resumesList={resumesList}
      onDeleteResume={handleDeleteResume}
      resumeFile={resumeFile}
      setResumeFile={setResumeFile}
      onSelect={(selected) => {
        setParsedResume(selected);
        // Sync to storage
        const isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
        if (isExt) {
          chrome.storage.local.set({ parsedResume: selected });
        } else {
          localStorage.setItem('parsed_resume', JSON.stringify(selected));
        }
        navigate('/resume-review');
      }}
      dragActive={dragActive}
      setDragActive={setDragActive}
      uploadProgress={loadingProgress}
      loading={loading}
    />
  );
}

export default ResumeDetectPage;
