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
      const reason = jobAnalysis.reason || jobAnalysis.normalized_content?.reason || "This page does not appear to represent a single valid job posting.";
      return (
        <div className="p-6 max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto text-2xl font-bold shadow-inner">
              ⚠️
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Not a Single Job Posting</h2>
            <p className="text-slate-600 dark:text-slate-300 max-w-md mx-auto text-sm leading-relaxed">
              {reason}
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
              <button
                onClick={() => {
                  setJobAnalysis(null);
                  setJobText("");
                }}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition shadow-sm"
              >
                Scan Another Page
              </button>
              <button
                onClick={() => {
                  // Allow user to proceed if they want to manually edit/override
                  setJobAnalysis({
                    ...jobAnalysis,
                    is_job_related: true,
                    normalized_content: { ...(jobAnalysis.normalized_content || jobAnalysis), is_job_related: true }
                  });
                }}
                className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition"
              >
                Review & Edit Anyway
              </button>
            </div>
          </div>
        </div>
      );
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
