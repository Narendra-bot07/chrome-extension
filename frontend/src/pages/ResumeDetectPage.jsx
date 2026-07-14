import React from 'react';
import { useApp } from '../context/AppContext';
import ResumeDetectionView from '../components/ResumeDetectionView';

function ResumeDetectPage() {
  const {
    parsedResume, setParsedResume,
    resumeFile, setResumeFile,
    dragActive, setDragActive,
    loadingProgress,
    handleParseResume,
    loading, isExtension
  } = useApp();

  return (
    <ResumeDetectionView
      parsedResume={parsedResume}
      resumeFile={resumeFile}
      setResumeFile={setResumeFile}
      onClearResume={() => {
        setParsedResume(null);
        setResumeFile(null);
        if (isExtension) chrome.storage.local.remove('parsedResume');
      }}
      dragActive={dragActive}
      setDragActive={setDragActive}
      uploadProgress={loadingProgress}
      onContinue={handleParseResume}
      loading={loading}
    />
  );
}

export default ResumeDetectPage;
