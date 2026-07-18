import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import UploaderView from '../components/UploaderView';
import JobReviewView from '../components/JobReviewView';
import ChecklistLoader from '../components/ChecklistLoader';
import { useNavigate } from 'react-router-dom';

function JobExtractPage() {
  const navigate = useNavigate();
  const lastSeenTabUrlRef = useRef('');
  const scanDebounceRef = useRef(null);
  const [autoExtractionStarted, setAutoExtractionStarted] = useState(false);
  const [awaitingAutoReview, setAwaitingAutoReview] = useState(false);
  const matchRequestKeyRef = useRef('');
  const {
    jobText, setJobText,
    companyName, setCompanyName,
    jobTitle, setJobTitle,
    dragActive, setDragActive,
    parsedResume, setParsedResume,
    resumeFile, setResumeFile,
    jobAnalysis, setJobAnalysis,
    comparison, setComparison,
    loadingProgress, loadingMessage,
    handleScanPage, handleExtractJob, handleCompareActiveResumeToJob,
    jobDetectionStatus,
    loading, isExtension,
    subscription,
    apiError
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

      const pollActiveTabUrl = setInterval(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
          const nextUrl = activeTab?.url || '';
          if (!nextUrl || nextUrl === lastSeenTabUrlRef.current) return;
          const previousUrl = lastSeenTabUrlRef.current;
          lastSeenTabUrlRef.current = nextUrl;
          console.log('[ApplyFlow:Extraction] navigation detected', { previousUrl, nextUrl });
          if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
          scanDebounceRef.current = setTimeout(() => {
            handleScanPage();
          }, 450);
        });
      }, 700);

      chrome.tabs.onUpdated.addListener(handleTabUpdate);
      chrome.tabs.onActivated.addListener(handleTabActivated);

      return () => {
        clearInterval(pollActiveTabUrl);
        if (scanDebounceRef.current) clearTimeout(scanDebounceRef.current);
        chrome.tabs.onUpdated.removeListener(handleTabUpdate);
        chrome.tabs.onActivated.removeListener(handleTabActivated);
      };
    } else {
      handleScanPage();
    }
  }, []);

  // Auto-run job extraction as soon as jobText is scraped or pasted
  useEffect(() => {
    if (jobText && jobText.length > 50 && !jobAnalysis && loadingProgress === 0 && !autoExtractionStarted && !apiError) {
      setAutoExtractionStarted(true);
      setAwaitingAutoReview(true);
      handleExtractJob();
    }
  }, [jobText, jobAnalysis, loadingProgress, autoExtractionStarted, apiError, handleExtractJob]);

  useEffect(() => {
    if (jobAnalysis || apiError || !jobText) {
      setAutoExtractionStarted(false);
      setAwaitingAutoReview(false);
    }
  }, [jobAnalysis, apiError, jobText]);

  const backendMatchScore = comparison?.ats_score_before ?? comparison?.ats_score ?? comparison?.match_score ?? comparison?.score ?? null;
  const hasBackendMatchScore = backendMatchScore !== null && backendMatchScore !== undefined && Number.isFinite(Number(backendMatchScore));

  useEffect(() => {
    if (!jobAnalysis || !parsedResume) return;

    const matchKey = JSON.stringify({
      resumeId: parsedResume.id || parsedResume.resume_id || parsedResume.file_name || 'active',
      title: jobAnalysis.title || jobAnalysis.job_title || '',
      company: jobAnalysis.company || jobAnalysis.company_name || '',
      location: jobAnalysis.location || ''
    });

    if (matchRequestKeyRef.current === matchKey) return;
    matchRequestKeyRef.current = matchKey;
    setComparison?.(null);
    handleCompareActiveResumeToJob?.();
  }, [jobAnalysis, parsedResume]);

  const isAutoExtractionPending =
    isExtension &&
    !jobAnalysis &&
    !apiError &&
    (jobDetectionStatus === 'checking' || autoExtractionStarted || awaitingAutoReview);

  const isMatchScorePending = Boolean(jobAnalysis && parsedResume && !hasBackendMatchScore && !apiError);

  if (jobAnalysis && (!parsedResume || hasBackendMatchScore)) {
    return (
      <JobReviewView
        jobAnalysis={jobAnalysis}
        handleContinueToMatch={() => navigate('/resume-detect')}
        handleReExtract={() => {
          setJobAnalysis(null);
          setComparison(null);
          setJobText("");
        }}
        loading={loading}
      />
    );
  }

  if ((loadingProgress > 0 && loadingProgress < 100) || isAutoExtractionPending || isMatchScorePending) {
    const progress = isMatchScorePending ? 92 : (loadingProgress > 0 ? loadingProgress : (jobDetectionStatus === 'checking' ? 12 : 24));
    const message = isMatchScorePending ? 'Comparing active resume with extracted JD...' : (loadingMessage || (jobDetectionStatus === 'checking'
      ? 'Scanning current job page...'
      : 'Preparing job details extraction...'));

    return (
      <ChecklistLoader
        title="Extracting details"
        progress={progress}
        message={message}
        checklistItems={[
          { label: "Reading Job Description", progressThreshold: 20 },
          { label: "Extracting Company Details", progressThreshold: 40 },
          { label: "Analyzing Required Skills", progressThreshold: 60 },
          { label: "Finding ATS Keywords", progressThreshold: 80 },
          { label: "Calculating Resume Match", progressThreshold: 90 }
        ]}
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
      subscription={subscription}
    />
  );
}

export default JobExtractPage;
