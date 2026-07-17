import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import UploaderView from '../components/UploaderView';
import JobReviewView from '../components/JobReviewView';
import ChecklistLoader from '../components/ChecklistLoader';
import { useNavigate } from 'react-router-dom';

function JobExtractPage() {
  const navigate = useNavigate();
  const {
    jobText, setJobText,
    companyName, setCompanyName,
    jobTitle, setJobTitle,
    dragActive, setDragActive,
    parsedResume, setParsedResume,
    resumeFile, setResumeFile,
    jobAnalysis, setJobAnalysis,
    loadingProgress, loadingMessage,
    handleScanPage, handleExtractJob, handleFreshSessionExtraction,
    jobDetectionStatus,
    loading, isExtension
  } = useApp();

  // Strictly stateless: Run fresh extraction session (Steps 1-12) every time popup opens or user navigates tabs/SPA
  useEffect(() => {
    if (isExtension && chrome.tabs) {
      const timer = setTimeout(() => {
        handleFreshSessionExtraction();
      }, 100);

      const handleTabUpdate = (tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete') {
          chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
            if (activeTab && activeTab.id === tabId) {
              handleFreshSessionExtraction();
            }
          });
        }
      };

      const handleTabActivated = (activeInfo) => {
        handleFreshSessionExtraction();
      };

      chrome.tabs.onUpdated.addListener(handleTabUpdate);
      chrome.tabs.onActivated.addListener(handleTabActivated);

      return () => {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(handleTabUpdate);
        chrome.tabs.onActivated.removeListener(handleTabActivated);
      };
    } else {
      handleFreshSessionExtraction();
    }
  }, []);

  if (loadingProgress > 0 && loadingProgress < 100) {
    return (
      <ChecklistLoader
        title="Extracting details"
        progress={loadingProgress}
        message={loadingMessage}
        checklistItems={[
          { label: "Reading Job Description", progressThreshold: 20 },
          { label: "Extracting Company Details", progressThreshold: 40 },
          { label: "Analyzing Required Skills", progressThreshold: 60 },
          { label: "Finding ATS Keywords", progressThreshold: 80 }
        ]}
      />
    );
  }

  if (jobAnalysis) {
    const isRelated = jobAnalysis.is_job_related !== false && jobAnalysis.normalized_content?.is_job_related !== false;
    if (!isRelated) {
      setTimeout(() => navigate('/no-job-detected'), 0);
      return null;
    }

    return (
      <JobReviewView
        jobAnalysis={jobAnalysis}
        handleContinueToMatch={() => navigate('/resume-detect')}
        handleReExtract={() => {
          setJobAnalysis(null);
          setJobText("");
        }}
        loading={loading}
      />
    );
  }

  return (
    <UploaderView
      parsedResume={parsedResume}
      setParsedResume={setParsedResume}
      resumeFile={resumeFile}
      setResumeFile={setResumeFile}
      dragActive={dragActive}
      setDragActive={setDragActive}
      jobText={jobText}
      setJobText={setJobText}
      companyName={companyName}
      setCompanyName={setCompanyName}
      jobTitle={jobTitle}
      setJobTitle={setJobTitle}
      handleScanPage={handleScanPage}
      handleAnalyzeAndMatch={handleExtractJob}
      loading={loading}
      isExtension={isExtension}
    />
  );
}

export default JobExtractPage;
