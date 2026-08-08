import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, ArrowRight, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ChecklistLoader from '../components/ChecklistLoader';

function NoJobDetectedPage() {
  const navigate = useNavigate();
  const { handleScanPage, jobDetectionStatus, setJobDetectionStatus, apiError, loadingMessage, loadingProgress } = useApp();

  const isChecking = jobDetectionStatus === 'checking' || jobDetectionStatus === 'extracting';

  useEffect(() => {
    if (isChecking) {
      navigate('/tailor', { replace: true });
    }
  }, [isChecking, navigate]);

  if (isChecking) {
    const progress = loadingProgress > 0 ? loadingProgress : 15;
    const message = loadingMessage || "Scanning current job page...";
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
          { label: "Calculating Resume Match", progressThreshold: 100 }
        ]}
      />
    );
  }

  const states = {
    checking: ['Extracting Job Description', loadingMessage || 'Scanning the active browser tab to extract job title, company, and key requirements...'],
    extracting: ['Extracting Job Description', loadingMessage || 'Analyzing job details and company requirements...'],
    'browser-new-tab': ['No Job Page Open', 'Open an individual job posting in this tab, then tailr4u will scan it automatically.'],
    'job-list': ['Job Listing Page Detected', 'This is a job listing page. Open a specific job to extract its description.'],
    'job-search': ['Job Search Results Detected', 'This is a job search results page. Open a specific job posting to extract details.'],
    'career-home': ['Company Careers Homepage', 'Open an individual job vacancy to continue.'],
    'company-page': ['Company Page Detected', 'Open an individual job posting on this company site to extract details.'],
    profile: ['Profile Page Detected', 'This is a profile page, not a job description. Open an individual job details page and try again.'],
    feed: ['Social Feed Page Detected', 'This is a social feed. Open a specific job posting to extract details.'],
    article: ['Article Page Detected', 'This is an article or blog post. Open an active job vacancy to continue.'],
    login: ['Login Required', 'Sign in to the job site and open the individual listing before retrying.'],
    'login-required': ['Login Required', 'Sign in to the job site and open the individual listing before retrying.'],
    captcha: ['Security Check Detected', 'Complete the website security check, then retry extraction.'],
    'security-challenge': ['Security Check Detected', 'Complete the website security challenge in the current tab, then scan again.'],
    'rate-limited': ['Job Site Temporarily Limited', 'The job platform is rate limiting access. Wait briefly and scan again, or enter the details manually.'],
    blocked: ['Access Blocked', 'This website blocked automated access or requires login verification. Enter job details manually.'],
    'manual-review': ['Job Page Needs Review', apiError || 'Some job evidence was found, but it was not complete enough to extract safely.'],
    'page-inaccessible': ['Page Inaccessible', apiError || 'This browser page cannot be read by the extension.'],
    'extraction-failed': ['Extraction Failed', apiError || 'The page could not be extracted. Retry or paste the JD manually.'],
    'extraction-incomplete': ['Job Details Still Loading', 'A job was selected, but its description was not available after retries. Wait for the detail panel to finish loading, then retry.'],
    loading: ['Job Details Still Loading', 'Wait for the detail panel to finish loading, then try scanning again.'],
    uncertain: ['Uncertain Job Page', 'This page does not appear to contain a verified job description. Open an individual job details page and try again.'],
    'non-job': ['Non-Job Page Detected', 'This page does not appear to contain a job description. Open an individual job details page and try again.'],
    'non-job-page': ['Non-Job Page Detected', 'This page does not appear to contain a job description. Open an individual job details page and try again.']
  };
  const [heading, message] = states[jobDetectionStatus] || states['non-job'];

  const handleScanAgain = () => {
    setJobDetectionStatus('checking');
    navigate('/tailor');
    handleScanPage(true);
  };

  const handleEnterManually = () => {
    navigate('/manual-job-entry');
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50/50 dark:bg-slate-950 flex flex-col justify-center items-center p-6 animate-in fade-in duration-300">
      <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-8 sm:p-10 shadow-sm transition-all space-y-8">
        
        {/* Icon & Titles */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto shadow-inner mb-4 transition-all bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
            <Search className="w-7 h-7" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            {heading}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base leading-relaxed max-w-sm mx-auto">
            {message}
          </p>
        </div>

        {/* Common Reasons */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Common Reasons
          </h2>
          <ul className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex items-start gap-3">
              <span className="text-indigo-500 font-bold mt-0.5">•</span>
              <span><strong>Search results</strong> or multi-job listing feeds</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-indigo-500 font-bold mt-0.5">•</span>
              <span><strong>Job recommendation pages</strong> (e.g. "Top job picks for you")</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-indigo-500 font-bold mt-0.5">•</span>
              <span><strong>Company home pages</strong> or general career portals</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-indigo-500 font-bold mt-0.5">•</span>
              <span><strong>Login or security checks</strong> preventing visible access</span>
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={handleEnterManually}
            className="flex-1 py-3 px-5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl shadow-sm hover:shadow transition-all duration-150 flex items-center justify-center gap-2 text-sm"
          >
            <span>Enter Details Manually</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleScanAgain}
            className="sm:w-36 py-3 px-5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl transition-all duration-150 flex items-center justify-center gap-2 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Scan Again</span>
          </button>
        </div>

      </div>
    </div>
  );
}

export default NoJobDetectedPage;
