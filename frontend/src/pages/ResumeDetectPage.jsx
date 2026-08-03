import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import ResumeDetectionView from '../components/ResumeDetectionView';

function ResumeDetectPage() {
  const navigate = useNavigate();
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

  const isExtension = window.location.protocol === 'chrome-extension:';

  React.useEffect(() => {
    fetchResumesList();
  }, [session?.access_token]);

  const handleUploadAndFallback = async (file, options) => {
    const result = await handleParseResume(file, options);
    if (result && !result.cancelled && isExtension) {
      setTimeout(() => {
        navigate('/tailor', { replace: true });
      }, 700);
    }
    return result;
  };

  const handleSelectAndFallback = (selected) => {
    setParsedResume(selected);
    const isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    if (isExt) {
      chrome.storage.local.set({ parsedResume: selected });
    } else {
      localStorage.setItem('parsed_resume', JSON.stringify(selected));
    }
    if (isExtension) {
      navigate('/tailor', { replace: true });
    }
  };

  const handleActivateAndFallback = async (resumeId) => {
    if (handleActivateResume) {
      await handleActivateResume(resumeId);
    }
    if (isExtension) {
      navigate('/tailor', { replace: true });
    }
  };

  return (
    <ResumeDetectionView
      parsedResume={parsedResume}
      setParsedResume={setParsedResume}
      resumesList={resumesList}
      onDeleteResume={handleDeleteResume}
      onActivateResume={handleActivateAndFallback}
      resumeFile={resumeFile}
      setResumeFile={setResumeFile}
      onSelect={handleSelectAndFallback}
      onUploadResume={handleUploadAndFallback}
      uploadProgress={loadingProgress}
      loading={loading}
      loadingResume={loadingResume}
    />
  );
}

export default ResumeDetectPage;
