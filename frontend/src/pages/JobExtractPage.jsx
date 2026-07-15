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

  if (jobDetectionStatus === "loading") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-[#0f0f11] text-slate-500 rounded-2xl border border-slate-200/60 dark:border-slate-900 shadow-3xs space-y-4">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-500/20 border-t-indigo-500" />
        <div className="text-center space-y-1">
          <p className="text-xs font-black uppercase tracking-wider text-indigo-500 animate-pulse">Loading New Job...</p>
          <p className="text-[9px] text-slate-400 dark:text-slate-550 uppercase tracking-widest font-bold">LinkedIn navigation observed</p>
        </div>
      </div>
    );
  }

  if (jobDetectionStatus === "extracting" && (!jobText || loadingProgress === 0)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-[#0f0f11] text-slate-500 rounded-2xl border border-slate-200/60 dark:border-slate-900 shadow-3xs space-y-4">
        <div className="animate-pulse flex space-x-2">
          <div className="h-2 w-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <div className="h-2 w-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <div className="h-2 w-2 bg-indigo-500 rounded-full animate-bounce" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-xs font-black uppercase tracking-wider text-indigo-500 animate-pulse">Extracting...</p>
          <p className="text-[9px] text-slate-400 dark:text-slate-550 uppercase tracking-widest font-bold">Waiting for DOM elements stability</p>
        </div>
      </div>
    );
  }

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
