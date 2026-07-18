import React from 'react';
import { useApp } from '../context/AppContext';
import ResumeDetectionView from '../components/ResumeDetectionView';

function ResumeDetectPage() {
  const {
    parsedResume, setParsedResume,
    resumesList, fetchResumesList,
    handleDeleteResume,
    handleActivateResume,
    resumeFile, setResumeFile,
    session,
    loadingProgress,
    handleParseResume,
    loading,
    loadingResume
  } = useApp();

  React.useEffect(() => {
    fetchResumesList();
  }, [session?.access_token]);

  return (
    <ResumeDetectionView
      parsedResume={parsedResume}
      setParsedResume={setParsedResume}
      resumesList={resumesList}
      onDeleteResume={handleDeleteResume}
      onActivateResume={handleActivateResume}
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
      }}
      onUploadResume={handleParseResume}
      uploadProgress={loadingProgress}
      loading={loading}
      loadingResume={loadingResume}
    />
  );
}

export default ResumeDetectPage;
