import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import UploaderView from '../components/UploaderView';
import JobReviewView from '../components/JobReviewView';
import ChecklistLoader from '../components/ChecklistLoader';
import SessionRestorationLoader from '../components/SessionRestorationLoader';
import { Navigate, useNavigate } from 'react-router-dom';

export default function JobExtractPage() {
  const navigate = useNavigate();
  const [autoExtractionStarted, setAutoExtractionStarted] = useState(false);
  const [awaitingAutoReview, setAwaitingAutoReview] = useState(false);
  const matchRequestKeyRef = useRef('');
  const initialScanStartedRef = useRef(false);
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
    loadingAuth, loadingResume, loadingPreferences,
    subscription,
    apiError, setApiError
  } = useApp();

  // Opening the extraction screen validates the active tab with one fresh scan.
  // The context suppresses a duplicate when the global tab listener already
  // started the same job request.
  useEffect(() => {
    if (initialScanStartedRef.current) return;
    if (loadingAuth || loadingResume || loadingPreferences) return;
    initialScanStartedRef.current = true;
    if (isExtension) handleScanPage(true);
    else if (!jobText) handleScanPage();
  }, [
    isExtension, jobText, loadingAuth, loadingResume, loadingPreferences,
    handleScanPage
  ]);

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
    console.info('[JD-EXTRACTION][FRONTEND] Starting background resume comparison', {
      matchKey
    });
    Promise.resolve(handleCompareActiveResumeToJob?.()).then((result) => {
      console.info('[JD-EXTRACTION][FRONTEND] Background resume comparison finished', {
        matchKey,
        hasResult: Boolean(result)
      });
    });
  }, [jobAnalysis, parsedResume]);

  if (loadingAuth || loadingResume || loadingPreferences) {
    return <SessionRestorationLoader label="Restoring Session & User Profile..." />;
  }

  const isAutoExtractionPending =
    isExtension &&
    !jobAnalysis &&
    !apiError &&
    (jobDetectionStatus === 'checking' || autoExtractionStarted || awaitingAutoReview);

  const nonJobRecoveryStates = new Set([
    'non-job', 'non-job-page', 'uncertain', 'job-list', 'job-search',
    'career-home', 'company-page', 'profile', 'feed', 'article', 'login',
    'login-required', 'search-results', 'captcha', 'security-challenge',
    'rate-limited', 'browser-new-tab', 'manual-review', 'page-inaccessible',
    'extraction-failed', 'extraction-incomplete'
  ]);
  if (nonJobRecoveryStates.has(jobDetectionStatus)) {
    return <Navigate to="/no-job-detected" replace />;
  }

  // Extraction success must never be hidden behind the optional ATS comparison.
  // JobReviewView already represents an unavailable score as a calculating state,
  // while the comparison continues once in the background.
  if (jobAnalysis) {
    return (
      <JobReviewView
        jobAnalysis={jobAnalysis}
        handleContinueToMatch={() => navigate('/resume-detect')}
        handleReExtract={() => {
          setJobAnalysis(null);
          setComparison(null);
          setJobText("");
          if (isExtension) {
            void handleScanPage(true);
          }
        }}
        loading={loading}
      />
    );
  }

  if ((loadingProgress > 0 && loadingProgress < 100) || isAutoExtractionPending) {
    const progress = loadingProgress > 0 ? loadingProgress : (jobDetectionStatus === 'checking' ? 12 : 24);
    const message = loadingMessage || (jobDetectionStatus === 'checking'
      ? 'Scanning current job page...'
      : 'Preparing job details extraction...');

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

  // The extension owns an automatic current-tab workflow. Never fall through
  // to the website's manual JD form while its first scan is being scheduled or
  // after extraction state has just been reset.
  if (isExtension) {
    return (
      <ChecklistLoader
        title="Extracting details"
        progress={12}
        message="Reading the active job page..."
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
      apiError={apiError}
      setApiError={setApiError}
    />
  );
}
