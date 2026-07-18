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
    handleScanPage, handleExtractJob,
    jobDetectionStatus,
    loading, isExtension
  } = useApp();

  // Auto-run scanning on side panel mount and listen to active tab updates/switches
  useEffect(() => {
    if (isExtension && chrome.tabs) {
      const timer = setTimeout(() => {
        handleScanPage();
      }, 150);

      const handleTabUpdate = (tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete') {
          chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
            if (activeTab && activeTab.id === tabId) {
              handleScanPage();
            }
          });
        }
      };

      const handleTabActivated = (activeInfo) => {
        handleScanPage();
      };

      chrome.tabs.onUpdated.addListener(handleTabUpdate);
      chrome.tabs.onActivated.addListener(handleTabActivated);

      return () => {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(handleTabUpdate);
        chrome.tabs.onActivated.removeListener(handleTabActivated);
      };
    } else {
      handleScanPage();
    }
  }, []);

  // Auto-run job extraction as soon as jobText is scraped or pasted
  useEffect(() => {
    if (jobText && jobText.length > 50 && !jobAnalysis && loadingProgress === 0) {
      handleExtractJob();
    }
  }, [jobText, jobAnalysis]);

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
