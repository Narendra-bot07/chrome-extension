import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { compressResumeData } from '../utils/resumeCompression';
import { toRenderableResume } from '../utils/renderableResume';
import { mergeReviewResume, validateWorkingResume } from '../utils/resumeReviewMerge';
import {
  assessBrowserJobEvidence, captureActiveTabJobEvidence, classifyBrowserPageUrl,
  collectJobSkills, isExtractableHttpUrl, validateJDResponse
} from '../services/jdExtractionFlow';
import {
  createJDPipelineSession,
  fingerprintJD,
  readJDPipelineSession,
  writeJDPipelineSession
} from '../utils/jobPipelineSession';
import { buildTailoringComparePayload } from '../utils/tailoringRequest';

const AppContext = createContext();

export function AppProvider({ children }) {
  const navigate = useNavigate();

  // Theme & Settings
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Supabase Authentication states
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingResume, setLoadingResume] = useState(true);
  const [hasRedirectedOnStartup, setHasRedirectedOnStartup] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const storedToken = localStorage.getItem('access_token');
      if (!storedToken) {
        setLoadingAuth(false);
        setLoadingResume(false);
        return;
      }
      try {
        const res = await fetch('http://localhost:8000/api/v1/auth/session', {
          headers: { 'Authorization': `Bearer ${storedToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setSession({ access_token: storedToken });
          setHasCompletedPreferences(!!data.has_completed_preferences);
          await fetchJobPreferences(storedToken);

          // Fetch resumes to check if any exist and load the latest one if not already set
          try {
            const resumes = await fetchResumesList(storedToken);
            if (resumes && resumes.length > 0) {
              const latestResume = normalizeResumeRecord(resumes.find((resume) => resume.is_active) || resumes[0]);
              persistParsedResume(latestResume);
            }
          } catch (rErr) {
            console.error("Failed to fetch resumes on startup:", rErr);
          } finally {
            setLoadingResume(false);
          }
        } else {
          localStorage.removeItem('access_token');
          setLoadingResume(false);
          setLoadingPreferences(false);
          setHasCompletedPreferences(false);
          setJobPreferences(null);
          setParsedResume(null);
          localStorage.removeItem('parsed_resume');
          const isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
          if (isExt) {
            chrome.storage.local.remove('parsedResume');
          }
        }
      } catch (err) {
        console.error("Auth check failed:", err);
        setLoadingResume(false);
      } finally {
        setLoadingAuth(false);
      }
    };
    checkSession();
  }, []);

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('parsed_resume');
    const isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    if (isExt) {
      chrome.storage.local.remove('parsedResume');
    }
    setUser(null);
    setSession(null);
    setParsedResume(null);
    setJobAnalysis(null);
    setComparison(null);
    setReviewSuggestions([]);
    setLiveATS(null);
    setTailoredResume(null);
    setCoverLetter(null);
    setJobText('');
    setCompanyName('');
    setJobTitle('');
    setJobPreferences(null);
    setHasCompletedPreferences(false);
    setLoadingPreferences(false);
    setHasRedirectedOnStartup(false);
    navigate('/login');
  };
  const toggleDarkMode = () => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return next;
    });
  };
  const [showSettings, setShowSettings] = useState(false);

  // Credentials
  const [apiKey, setApiKey] = useState('');
  const [apiUrl, setApiUrl] = useState('http://localhost:8000');

  // Input states
  const [resumeFile, setResumeFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [jobText, setJobText] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [lastAnalyzedUrl, setLastAnalyzedUrl] = useState('');
  const [currentJobIdentity, setCurrentJobIdentity] = useState('');

  // Data states
  const [parsedResume, setParsedResume] = useState(null);
  const [resumesList, setResumesList] = useState([]);
  const initialJDPipelineSession = typeof sessionStorage !== 'undefined'
    ? readJDPipelineSession(sessionStorage)
    : null;
  const [jobAnalysis, setJobAnalysisState] = useState(
    initialJDPipelineSession?.canonicalJD || null
  );
  const canonicalJDRef = useRef(initialJDPipelineSession?.canonicalJD || null);
  const jdFingerprintRef = useRef(initialJDPipelineSession?.fingerprint || '');
  const setJobAnalysis = (nextValue) => {
    const resolved = typeof nextValue === 'function'
      ? nextValue(canonicalJDRef.current)
      : nextValue;
    const canonical = resolved && typeof resolved === 'object'
      ? structuredClone(resolved)
      : null;
    canonicalJDRef.current = canonical;
    jdFingerprintRef.current = canonical ? fingerprintJD(canonical) : '';
    setJobAnalysisState(canonical);
  };
  const getCanonicalJobAnalysis = () => (
    canonicalJDRef.current ? structuredClone(canonicalJDRef.current) : null
  );
  const [jobSessionHydrated, setJobSessionHydrated] = useState(
    () => !(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)
  );
  const [comparison, setComparison] = useState(null);
  const [tailoredResume, setTailoredResume] = useState(null);
  const [coverLetter, setCoverLetter] = useState(null);
  const [coverLetterContext, setCoverLetterContext] = useState(null);
  const [coverLetterStrategy, setCoverLetterStrategy] = useState(null);
  const [generatedCoverLetter, setGeneratedCoverLetter] = useState(null);
  const [coverLetterReview, setCoverLetterReview] = useState(null);
  const [coverLetterEditHistory, setCoverLetterEditHistory] = useState([]);
  const [coverLetterEditStreaming, setCoverLetterEditStreaming] = useState(false);
  const coverLetterScopeRef = useRef('');

  useEffect(() => {
    const scope = [
      parsedResume?.resume_version_id || parsedResume?.version_id || parsedResume?.id || '',
      jobAnalysis?.id || jobAnalysis?.jd_id || '',
      jobAnalysis?.title || jobAnalysis?.job_title || '',
      jobAnalysis?.company || jobAnalysis?.company_name || ''
    ].join('|');
    if (coverLetterScopeRef.current && coverLetterScopeRef.current !== scope) {
      setCoverLetterContext(null);
      setCoverLetterStrategy(null);
      setGeneratedCoverLetter(null);
      setCoverLetterReview(null);
      setCoverLetterEditHistory([]);
      setCoverLetter(null);
    }
    coverLetterScopeRef.current = scope;
  }, [
    parsedResume?.resume_version_id, parsedResume?.version_id, parsedResume?.id,
    jobAnalysis?.id, jobAnalysis?.jd_id, jobAnalysis?.title,
    jobAnalysis?.job_title, jobAnalysis?.company, jobAnalysis?.company_name
  ]);

  // Summarization & Checklist states
  const [applications, setApplications] = useState([]);
  const [activeApplicationId, setActiveApplicationId] = useState(null);
  const [pendingApplicationSubmitted, setPendingApplicationSubmitted] = useState(null);
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [selectedRewrites, setSelectedRewrites] = useState([]);
  const [acceptSummary, setAcceptSummary] = useState(false);

  // Config states (Stateful across cycle)
  const [selectedSections, setSelectedSections] = useState(() => {
    try {
      const saved = sessionStorage.getItem('selected_sections');
      return saved ? JSON.parse(saved) : ['summary', 'skills', 'experience', 'projects'];
    } catch {
      return ['summary', 'skills', 'experience', 'projects'];
    }
  });
  const [tailoringIntensity, setTailoringIntensity] = useState(() => {
    return sessionStorage.getItem('tailoring_intensity') || 'balanced';
  });
  const [jobDetectionStatus, setJobDetectionStatus] = useState("idle");
  const [jobDetectionMeta, setJobDetectionMeta] = useState(null);
  const [reviewSuggestions, setReviewSuggestions] = useState([]);
  const [liveATS, setLiveATS] = useState(null);
  const [isRefineStreaming, setIsRefineStreaming] = useState(false);

  const fetchLiveATSScore = async (currentSuggestions) => {
    const suggestionsToSend = currentSuggestions || reviewSuggestions;
    if (!parsedResume || !jobAnalysis) return;
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      const response = await fetch(`${apiUrl}/api/ats/live-score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          resume: toRenderableResume(parsedResume),
          job: getCanonicalJobAnalysis(),
          suggestions: suggestionsToSend
        })
      });
      if (response.ok) {
        const data = await response.json();
        setLiveATS(data);
        return data;
      }
    } catch (e) {
      console.warn("Live ATS score fetch failed", e);
    }
  };

  useEffect(() => {
    if (reviewSuggestions && reviewSuggestions.length > 0 && parsedResume && jobAnalysis && !isRefineStreaming) {
      fetchLiveATSScore(reviewSuggestions);
    }
  }, [reviewSuggestions, parsedResume, jobAnalysis, isRefineStreaming]);
  const [selectedTemplate, setSelectedTemplate] = useState('ExecutiveATS');
  const [finalPdfArtifact, setFinalPdfArtifact] = useState(null);
  const [customFileName, setCustomFileName] = useState(() => {
    return sessionStorage.getItem('custom_file_name') || '';
  });

  useEffect(() => {
    try {
      sessionStorage.setItem('selected_sections', JSON.stringify(selectedSections));
    } catch (e) {
      console.warn("Failed to persist selectedSections", e);
    }
  }, [selectedSections]);

  useEffect(() => {
    sessionStorage.setItem('tailoring_intensity', tailoringIntensity);
  }, [tailoringIntensity]);

  useEffect(() => {
    if (customFileName) {
      sessionStorage.setItem('custom_file_name', customFileName);
    } else {
      sessionStorage.removeItem('custom_file_name');
    }
  }, [customFileName]);

  // Loading states
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadingType, setLoadingType] = useState('extraction');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [jobPreferences, setJobPreferences] = useState(null);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [hasCompletedPreferences, setHasCompletedPreferences] = useState(false);

  const isExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  const extractionVersionRef = useRef(0);
  const activeExtractionIdentityRef = useRef('');
  const extractionInFlightRef = useRef(false);
  const activeRequestIdRef = useRef(null);
  const extractionAbortControllerRef = useRef(null);
  const lastSyncedResumeSignatureRef = useRef('');
  const logExtraction = (event, meta = {}) => {
    console.info(`[JD-EXTRACTION][FRONTEND] ${event}`, meta);
  };

  const getJobIdentityFromUrl = (url = '') => {
    try {
      const parsed = new URL(url);
      const jobIdKeys = [
        'currentJobId', 'jobId', 'job_id', 'jobid', 'jk',
        'gh_jid', 'requisitionId', 'requisition_id', 'postingId'
      ];
      for (const key of jobIdKeys) {
        const value = parsed.searchParams.get(key);
        if (value) return `${parsed.hostname}:${key.toLowerCase()}:${value}`;
      }
      const linkedInMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)/i);
      if (linkedInMatch) return `linkedin:${linkedInMatch[1]}`;
      const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
      const jobHash = /job|position|opening|vacancy/i.test(parsed.hash)
        ? parsed.hash
        : '';
      return `${parsed.hostname}:${normalizedPath}${jobHash}`;
    } catch {
      return url || '';
    }
  };

  const resetExtractedJobState = (reason, meta = {}) => {
    logExtraction('old job invalidated', { reason, ...meta });
    setJobText('');
    setJobAnalysis(null);
    setComparison(null);
    setReviewSuggestions([]);
    setLiveATS(null);
    setTailoredResume(null);
    setCompanyName('');
    setJobTitle('');
    setJobDetectionMeta(null);
    // Tracker linkage belongs to the previous job session. A newly extracted
    // JD must remain unsynced until the user explicitly chooses to sync it.
    setActiveApplicationId(null);
  };

  const fetchSubscription = async () => {
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token) return null;
      const res = await fetch(`${apiUrl}/api/v1/subscription/me`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) return null;
      const data = await res.json();
      setSubscription(data);
      setUsage(data.usage || null);
      return data;
    } catch (err) {
      console.error("Failed to fetch subscription:", err);
      return null;
    }
  };

  // Load configs & saved resume
  useEffect(() => {
    if (isExtension) {
      // Resume/configuration data is durable. Job extraction data is deliberately
      // excluded: it belongs to the active-tab session and must never leak from
      // a previously viewed job.
      chrome.storage.local.get(['groqApiKey', 'apiUrl', 'parsedResume', 'tailoredResume', 'selectedTemplate'], (result) => {
        if (result.groqApiKey) setApiKey(result.groqApiKey);
        if (result.apiUrl) setApiUrl(result.apiUrl);
        if (result.parsedResume) setParsedResume(result.parsedResume);
        if (result.tailoredResume) setTailoredResume(result.tailoredResume);
        if (result.selectedTemplate) setSelectedTemplate(result.selectedTemplate);
      });
      const sessionStore = chrome.storage.session;
      if (sessionStore) {
        sessionStore.get(['jobExtractionSession', 'resumeReviewSession'], (result) => {
          const saved = result.jobExtractionSession;
          const savedJD = saved?.canonicalJD || saved?.jobAnalysis || null;
          const savedFingerprint = saved?.jdFingerprint || (
            savedJD ? fingerprintJD(savedJD) : ''
          );
          if (
            Array.isArray(result.resumeReviewSession?.suggestions)
            && result.resumeReviewSession?.jdFingerprint === savedFingerprint
          ) {
            setReviewSuggestions(result.resumeReviewSession.suggestions);
            if (result.resumeReviewSession.tailoringAudit) {
              setComparison(previous => ({
                ...(previous || {}),
                tailoring_audit: result.resumeReviewSession.tailoringAudit
              }));
            }
          }
          const finishHydration = (activeUrl = '') => {
            const savedUrl = saved?.lastAnalyzedUrl || savedJD?.source_url || '';
            const savedIdentity = getJobIdentityFromUrl(savedUrl);
            const activeIsJobPage = isExtractableHttpUrl(activeUrl);
            const activeIsExtensionPage = /^chrome-extension:\/\//i.test(activeUrl);
            const activeIdentity = activeIsJobPage
              ? getJobIdentityFromUrl(activeUrl)
              : '';
            const sessionMatchesActiveJob = Boolean(
              savedJD
              && savedIdentity
              && (
                (activeIdentity && savedIdentity === activeIdentity)
                // Full-page extension routes cannot identify the originating
                // browser tab. Retain the current browser-session JD while the
                // user moves through tailoring, resume, and cover-letter steps.
                || activeIsExtensionPage
              )
            );

            if (sessionMatchesActiveJob) {
            setJobAnalysis(savedJD);
            setJobText(saved.jobText || savedJD.description || '');
            setCompanyName(saved.companyName || savedJD.company || savedJD.company_name || '');
            setJobTitle(saved.jobTitle || savedJD.title || savedJD.job_title || '');
            setLastAnalyzedUrl(savedUrl);
            activeExtractionIdentityRef.current = savedIdentity;
            setCurrentJobIdentity(savedIdentity);
            setJobDetectionMeta(saved.jobDetectionMeta || null);
            setJobDetectionStatus('ready');
            setApiError(null);
            console.info('[JD-EXTRACTION][FRONTEND] Extraction session restored', {
              sourceUrl: savedUrl,
              hasJob: true
            });
            } else if (savedJD) {
              sessionStore.remove('jobExtractionSession');
              console.info('[JD-EXTRACTION][FRONTEND] Stale extraction session rejected', {
                savedIdentity,
                activeIdentity,
                activeUrl,
                activeIsExtensionPage
              });
            }
            setJobSessionHydrated(true);
          };

          if (chrome.tabs) {
            chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
              finishHydration(activeTab?.url || '');
            });
          } else {
            finishHydration('');
          }
        });
      } else {
        setJobSessionHydrated(true);
      }
    } else {
      const savedKey = localStorage.getItem('groq_api_key');
      const savedUrl = localStorage.getItem('fastapi_api_url');
      const savedResume = localStorage.getItem('parsed_resume');
      const savedTailored = localStorage.getItem('tailored_resume');
      const savedTemplate = localStorage.getItem('selected_template');
      const savedPipelineSession = readJDPipelineSession(sessionStorage);
      const savedJobAnalysis = localStorage.getItem('job_analysis');
      const savedJobText = localStorage.getItem('job_text');
      const savedCompany = localStorage.getItem('company_name');
      const savedTitle = localStorage.getItem('job_title');
      const savedReview = sessionStorage.getItem('resume_review_session');
      if (savedKey) setApiKey(savedKey);
      if (savedUrl) setApiUrl(savedUrl);
      if (savedResume) {
        try {
          setParsedResume(JSON.parse(savedResume));
        } catch (e) {
          console.error("Error loading resume:", e);
        }
      }
      if (savedTailored) {
        try {
          setTailoredResume(JSON.parse(savedTailored));
        } catch (e) {
          console.error("Error loading tailored resume:", e);
        }
      }
      if (savedTemplate) {
        setSelectedTemplate(savedTemplate);
      }
      if (savedPipelineSession?.canonicalJD) {
        setJobAnalysis(savedPipelineSession.canonicalJD);
        if (savedPipelineSession.jobText) setJobText(savedPipelineSession.jobText);
        if (savedPipelineSession.companyName) setCompanyName(savedPipelineSession.companyName);
        if (savedPipelineSession.jobTitle) setJobTitle(savedPipelineSession.jobTitle);
        if (savedPipelineSession.lastAnalyzedUrl) setLastAnalyzedUrl(savedPipelineSession.lastAnalyzedUrl);
        if (savedPipelineSession.jobDetectionMeta) setJobDetectionMeta(savedPipelineSession.jobDetectionMeta);
      } else if (savedJobAnalysis) {
        try {
          setJobAnalysis(JSON.parse(savedJobAnalysis));
        } catch (e) {
          console.error("Error loading job analysis:", e);
        }
      }
      if (savedJobText) setJobText(savedJobText);
      if (savedCompany) setCompanyName(savedCompany);
      if (savedTitle) setJobTitle(savedTitle);
      if (savedReview) {
        try {
          const review = JSON.parse(savedReview);
          const activeFingerprint = savedPipelineSession?.fingerprint || '';
          if (
            Array.isArray(review?.suggestions)
            && review?.jdFingerprint === activeFingerprint
          ) {
            setReviewSuggestions(review.suggestions);
            if (review.tailoringAudit) {
              setComparison(previous => ({
                ...(previous || {}),
                tailoring_audit: review.tailoringAudit
              }));
            }
          }
        } catch (error) {
          console.warn('Unable to restore resume review session', error);
        }
      }
    }
  }, []);

  const fetchApplications = async () => {
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token) return;

      const res = await fetch(`${apiUrl}/api/v1/applications/`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setApplications(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch applications:", err);
    }
  };

  const updateApplicationStage = async (appId, newStage, note = null, date = null) => {
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token || !appId) return;

      const app = applications.find(a => a.id === appId);
      if (!app) return;

      const updatedTimeline = [...(app.timeline || [])];
      updatedTimeline.push({
        event: `Moved to ${newStage}${note ? `: ${note}` : ''}${date ? ` (Event Date: ${date})` : ''}`,
        timestamp: new Date().toISOString()
      });

      const bodyData = {
        current_stage: newStage,
        timeline: updatedTimeline
      };

      if (note) {
        bodyData.next_action = `[${newStage}] ${note}`;
      }
      if (date) {
        bodyData.next_action_due_at = date;
        if (!bodyData.next_action) {
          bodyData.next_action = `Event/Follow-up scheduled for ${newStage}`;
        }
      }

      const res = await fetch(`${apiUrl}/api/v1/applications/${appId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(bodyData)
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.detail || "Failed to save stage details and reminder.");
      }
      const updatedApplication = await res.json();
      setApplications(current => current.map(item => (
        item.id === appId ? { ...item, ...updatedApplication } : item
      )));
      return updatedApplication;
    } catch (err) {
      console.error("Failed to update application stage:", err);
      throw err;
    }
  };

  // Fetch applications when session is loaded or changed
  useEffect(() => {
    if (session) {
      fetchJobPreferences();
      fetchApplications();
      fetchSubscription();
    }
  }, [session]);

  // Listen for real-time job description extraction events from Content/Background Scripts
  useEffect(() => {
    if (!isExtension) return;

    const handleRuntimeMessage = (message) => {
      if (message.type === "APPLICATION_SUBMITTED" && message.data) {
        console.log("[AppContext] Application submission event received:", message.data);
        setPendingApplicationSubmitted(message.data);
      }
    };

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    return () => chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
  }, [isExtension]);

  // Keep the side panel and any full extension tab aligned when the active
  // resume changes in either context.
  useEffect(() => {
    if (!isExtension || !chrome.storage?.onChanged) return;

    const handleStorageChange = (changes, areaName) => {
      if (areaName !== 'local' || !changes.parsedResume) return;
      const nextResume = changes.parsedResume.newValue || null;
      const signature = JSON.stringify({
        id: nextResume?.id || null,
        updatedAt: nextResume?.updated_at || null,
        parsingStatus: nextResume?.parsing_status || null,
        isActive: nextResume?.is_active || false
      });
      if (lastSyncedResumeSignatureRef.current === signature) return;
      lastSyncedResumeSignatureRef.current = signature;
      setParsedResume(nextResume);
      fetchResumesList();
      console.info('[RESUME][FRONTEND] Active resume synchronized across extension views', {
        resumeId: nextResume?.id || null,
        fileName: nextResume?.file_name || null
      });
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [isExtension]);

  // Keep the canonical extracted JD synchronized between the side panel and
  // full extension pages for the lifetime of the Chrome browser session.
  useEffect(() => {
    if (!isExtension || !chrome.storage?.onChanged) return;
    const handleJDSessionChange = (changes, areaName) => {
      if (areaName !== 'session' || !changes.jobExtractionSession) return;
      const sessionValue = changes.jobExtractionSession.newValue;
      const nextJD = sessionValue?.canonicalJD || sessionValue?.jobAnalysis || null;
      const nextFingerprint = sessionValue?.jdFingerprint || (
        nextJD ? fingerprintJD(nextJD) : ''
      );
      if (nextFingerprint === jdFingerprintRef.current) return;
      setJobAnalysis(nextJD);
      setJobText(sessionValue?.jobText || '');
      setCompanyName(sessionValue?.companyName || '');
      setJobTitle(sessionValue?.jobTitle || '');
      setLastAnalyzedUrl(sessionValue?.lastAnalyzedUrl || '');
      setJobDetectionMeta(sessionValue?.jobDetectionMeta || null);
      if (!nextJD) {
        setComparison(null);
        setReviewSuggestions([]);
      }
    };
    chrome.storage.onChanged.addListener(handleJDSessionChange);
    return () => chrome.storage.onChanged.removeListener(handleJDSessionChange);
  }, [isExtension]);

  // Save/Remove resume context storage
  useEffect(() => {
    if (parsedResume) {
      if (isExtension) {
        chrome.storage.local.set({ parsedResume });
      } else {
        localStorage.setItem('parsed_resume', JSON.stringify(parsedResume));
      }
    } else {
      if (isExtension) {
        chrome.storage.local.remove('parsedResume');
      } else {
        localStorage.removeItem('parsed_resume');
      }
    }
  }, [parsedResume]);

  // Preserve the active extraction while navigating between extension routes,
  // the side panel, and a full extension tab. Chrome clears storage.session
  // when the browser session ends.
  useEffect(() => {
    if (isExtension) {
      if (!jobSessionHydrated || !chrome.storage.session) return;
      if (jobAnalysis) {
        const pipelineSession = createJDPipelineSession(jobAnalysis, {
          jobText, companyName, jobTitle, lastAnalyzedUrl, jobDetectionMeta
        });
        chrome.storage.session.set({
          jobExtractionSession: {
            jobAnalysis,
            canonicalJD: pipelineSession.canonicalJD,
            jdFingerprint: pipelineSession.fingerprint,
            jobText,
            companyName,
            jobTitle,
            lastAnalyzedUrl,
            jobDetectionMeta
          }
        });
      } else {
        chrome.storage.session.remove('jobExtractionSession');
      }
      return;
    }
    if (jobAnalysis) {
      writeJDPipelineSession(sessionStorage, createJDPipelineSession(jobAnalysis, {
        jobText, companyName, jobTitle, lastAnalyzedUrl, jobDetectionMeta
      }));
      // Remove legacy durable JD storage after migration. The extracted JD is
      // scoped to the current browser session.
      localStorage.removeItem('job_analysis');
      localStorage.removeItem('job_text');
      localStorage.removeItem('company_name');
      localStorage.removeItem('job_title');
    } else {
      writeJDPipelineSession(sessionStorage, null);
      localStorage.removeItem('job_analysis');
      localStorage.removeItem('job_text');
      localStorage.removeItem('company_name');
      localStorage.removeItem('job_title');
    }
  }, [jobAnalysis, jobText, companyName, jobTitle, lastAnalyzedUrl, jobDetectionMeta, jobSessionHydrated, isExtension]);

  // Review decisions are workflow state: survive route changes and refreshes, but
  // expire with the browser session instead of becoming a durable resume copy.
  useEffect(() => {
    const payload = {
      resumeId: parsedResume?.id || null,
      jobIdentity: currentJobIdentity || null,
      jdFingerprint: jdFingerprintRef.current || null,
      suggestions: reviewSuggestions,
      tailoringAudit: comparison?.tailoring_audit || null
    };
    if (isExtension && chrome.storage.session) {
      if (reviewSuggestions.length) chrome.storage.session.set({ resumeReviewSession: payload });
      else chrome.storage.session.remove('resumeReviewSession');
    } else if (reviewSuggestions.length) {
      sessionStorage.setItem('resume_review_session', JSON.stringify(payload));
    } else {
      sessionStorage.removeItem('resume_review_session');
    }
  }, [reviewSuggestions, parsedResume?.id, currentJobIdentity, comparison?.tailoring_audit, isExtension]);

  // Save/Remove tailored resume context storage
  useEffect(() => {
    if (tailoredResume) {
      if (isExtension) {
        chrome.storage.local.set({ tailoredResume });
      } else {
        localStorage.setItem('tailored_resume', JSON.stringify(tailoredResume));
      }
    } else {
      if (isExtension) {
        chrome.storage.local.remove('tailoredResume');
      } else {
        localStorage.removeItem('tailored_resume');
      }
    }
  }, [tailoredResume]);

  // Save/Remove selected template context storage
  useEffect(() => {
    if (selectedTemplate) {
      if (isExtension) {
        chrome.storage.local.set({ selectedTemplate });
      } else {
        localStorage.setItem('selected_template', selectedTemplate);
      }
    } else {
      if (isExtension) {
        chrome.storage.local.remove('selectedTemplate');
      } else {
        localStorage.removeItem('selected_template');
      }
    }
  }, [selectedTemplate]);

  const fetchResumesList = async (tokenOverride) => {
    const token = tokenOverride || session?.access_token || localStorage.getItem('access_token');
    if (!token) return [];
    setLoadingResume(true);
    try {
      const reconcileRes = await fetch(`${apiUrl}/api/v1/resumes/reconcile-local`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (reconcileRes.ok) {
        const reconciliation = await reconcileRes.json();
        if (reconciliation.recovered > 0) {
          console.info('[RESUME][FRONTEND] Orphaned resume files recovered', reconciliation);
        }
      } else {
        console.warn('[RESUME][FRONTEND] Resume reconciliation skipped', {
          status: reconcileRes.status
        });
      }
      const res = await fetch(`${apiUrl}/api/v1/resumes/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const resumes = Array.isArray(data) ? data : (data.resumes || []);
        setResumesList(resumes);
        return resumes;
      }
      console.error("Failed to fetch resumes:", res.status, await res.text());
      return [];
    } catch (err) {
      console.error("Failed to fetch resumes:", err);
      return [];
    } finally {
      setLoadingResume(false);
    }
  };

  const fetchJobPreferences = async (tokenOverride) => {
    const token = tokenOverride || session?.access_token || localStorage.getItem('access_token');
    if (!token) {
      setLoadingPreferences(false);
      setHasCompletedPreferences(false);
      setJobPreferences(null);
      return null;
    }

    setLoadingPreferences(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/job-preferences/me`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch job preferences.");
      const data = await res.json();
      setJobPreferences(data);
      setHasCompletedPreferences(!!data.has_completed_preferences);
      return data;
    } catch (err) {
      console.error("Failed to fetch job preferences:", err);
      setJobPreferences(null);
      setHasCompletedPreferences(false);
      return null;
    } finally {
      setLoadingPreferences(false);
    }
  };

  const saveJobPreferences = async (payload) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token) throw new Error("Please sign in before saving job preferences.");

    const res = await fetch(`${apiUrl}/api/v1/job-preferences/me`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Failed to save job preferences." }));
      throw new Error(typeof err.detail === "string" ? err.detail : "Failed to save job preferences.");
    }

    const data = await res.json();
    setJobPreferences(data);
    setHasCompletedPreferences(!!data.has_completed_preferences);
    return data;
  };

  const normalizeResumeRecord = (record) => {
    if (!record) return null;
    return {
      ...(record.parsed_content || record),
      id: record.id,
      file_name: record.file_name,
      file_size: record.file_size,
      file_type: record.file_type,
      created_at: record.created_at,
      updated_at: record.updated_at,
      last_used_at: record.last_used_at,
      times_used: record.times_used || record.tailor_count || 0,
      tailor_count: record.tailor_count || record.times_used || 0,
      upload_source: record.upload_source,
      parsing_status: record.parsing_status || record.parsed_content?.parse_status,
      is_active: !!record.is_active
    };
  };

  const persistParsedResume = (resume) => {
    setParsedResume(resume);
    if (resume) {
      if (isExtension) chrome.storage.local.set({ parsedResume: resume });
      else localStorage.setItem('parsed_resume', JSON.stringify(resume));
    } else {
      if (isExtension) chrome.storage.local.remove('parsedResume');
      else localStorage.removeItem('parsed_resume');
    }
  };

  const refreshActiveResumeFromBackend = async () => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token) return null;
    const res = await fetch(`${apiUrl}/api/v1/resumes/active`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const record = await res.json();
    const activeResume = normalizeResumeRecord(record);
    persistParsedResume(activeResume);
    return activeResume;
  };

  const handleDeleteResume = async (resumeId) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/${resumeId}`, {
        method: "DELETE",
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const updatedList = await fetchResumesList();
        if (updatedList && updatedList.length > 0) {
          const next = updatedList.find((resume) => resume.is_active) || updatedList[0];
          persistParsedResume(normalizeResumeRecord(next));
        } else {
          persistParsedResume(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete resume:", err);
    }
  };

  const handleActivateResume = async (resumeId) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token) return null;
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/${resumeId}/activate`, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to activate resume.");
      const activeRecord = await res.json();
      const updatedList = await fetchResumesList();
      const activeResume = normalizeResumeRecord({ ...activeRecord, is_active: true });
      persistParsedResume(activeResume);
      return { activeResume, resumes: updatedList };
    } catch (err) {
      console.error("Failed to activate resume:", err);
      setApiError(err.message || "Failed to activate resume.");
      return null;
    }
  };

  const recordResumeUsage = async (resumeId, versionId, eventType, extra = {}) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token || !resumeId) return null;
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/${resumeId}/usage-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          version_id: versionId,
          event_type: eventType,
          ...extra
        })
      });
      if (res.ok) {
        fetchResumesList();
        return await res.json();
      }
    } catch (e) {
      console.warn("Failed to record resume usage event", e);
    }
    return null;
  };

  const fetchResumeVersions = async (resumeId) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token || !resumeId) return [];
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/${resumeId}/versions`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.error("Failed to fetch resume versions", e);
    }
    return [];
  };

  const createResumeVersion = async (resumeId, versionPayload) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token || !resumeId) return null;
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/${resumeId}/versions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(versionPayload)
      });
      if (res.ok) {
        const created = await res.json();
        fetchResumesList();
        return created;
      }
    } catch (e) {
      console.error("Failed to create resume version", e);
    }
    return null;
  };

  const setCurrentResumeVersion = async (resumeId, versionId) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token || !resumeId || !versionId) return null;
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/${resumeId}/versions/${versionId}/set-current`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const ver = await res.json();
        fetchResumesList();
        return ver;
      }
    } catch (e) {
      console.error("Failed to set current version", e);
    }
    return null;
  };

  const updateResumeVersion = async (resumeId, versionId, payload) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token || !resumeId || !versionId) return null;
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/${resumeId}/versions/${versionId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const updated = await res.json();
        fetchResumesList();
        return updated;
      }
    } catch (e) {
      console.error("Failed to update version", e);
    }
    return null;
  };

  const duplicateResumeVersion = async (resumeId, versionId) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token || !resumeId || !versionId) return null;
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/${resumeId}/versions/${versionId}/duplicate`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const dup = await res.json();
        fetchResumesList();
        return dup;
      }
    } catch (e) {
      console.error("Failed to duplicate version", e);
    }
    return null;
  };

  const restoreResumeVersion = async (resumeId, versionId) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token || !resumeId || !versionId) return null;
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/${resumeId}/versions/${versionId}/restore`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const restored = await res.json();
        fetchResumesList();
        return restored;
      }
    } catch (e) {
      console.error("Failed to restore version", e);
    }
    return null;
  };

  const deleteResumeVersion = async (resumeId, versionId) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token || !resumeId || !versionId) return { success: false, error: "Missing authentication or parameters." };
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/${resumeId}/versions/${versionId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        fetchResumesList();
        return data;
      }
      return { success: false, error: data.detail || "Failed to delete version." };
    } catch (e) {
      console.error("Failed to delete version", e);
      return { success: false, error: e.message };
    }
  };

  const compareResumeVersions = async (resumeId, versionAId, versionBId) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token || !resumeId || !versionAId || !versionBId) return null;
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/${resumeId}/versions/compare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ version_a_id: versionAId, version_b_id: versionBId })
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.error("Failed to compare versions", e);
    }
    return null;
  };

  const ensureExtractionProfileReady = () => {
    if (loadingAuth || loadingResume || loadingPreferences) return false;

    const token = session?.access_token || localStorage.getItem('access_token');
    const hasResume = Boolean(parsedResume) || (Array.isArray(resumesList) && resumesList.length > 0);

    if (!token || !user || !hasCompletedPreferences || !hasResume) {
      setLoading(false);
      setLoadingProgress(0);
      setJobDetectionStatus(hasCompletedPreferences ? "profile-incomplete" : "onboarding-incomplete");
      setApiError(null);
      navigate(hasCompletedPreferences ? '/resume-detect' : '/onboarding/job-preferences');
      return false;
    }

    return true;
  };

  // Scan Active Page content
  const handleScanPage = async (forceRescan = false) => {
    if (!ensureExtractionProfileReady()) return;
    logExtraction('Extraction request started', { forceRescan, timestamp: new Date().toISOString() });

    if (!isExtension) {
      logExtraction('Current-tab capture unavailable outside extension');
      return;
    }

    let requestId = null;
    let expectedIdentity = '';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        setJobDetectionStatus("page-inaccessible");
        setApiError("The current tab URL could not be captured.");
        return;
      }

      const activeUrl = tab.url;
      logExtraction('Current tab URL captured', { url: activeUrl, timestamp: new Date().toISOString() });
      if (!isExtractableHttpUrl(activeUrl)) {
        const browserPageType = classifyBrowserPageUrl(activeUrl);
        console.info('[JD-EXTRACTION][FRONTEND] Non-web page classified', {
          url: activeUrl,
          browserPageType,
          sessionRetained: browserPageType === 'extension-internal' && Boolean(jobAnalysis)
        });
        if (browserPageType === 'extension-internal' && jobAnalysis) {
          setJobDetectionStatus('ready');
          setApiError(null);
        } else {
          extractionAbortControllerRef.current?.abort();
          extractionVersionRef.current += 1;
          activeExtractionIdentityRef.current = '';
          activeRequestIdRef.current = null;
          setCurrentJobIdentity('');
          setLastAnalyzedUrl('');
          resetExtractedJobState('active tab is not a job-capable web page', {
            url: activeUrl,
            browserPageType
          });
          chrome.storage.session?.remove('jobExtractionSession');
          setJobDetectionStatus(browserPageType);
          setJobDetectionMeta({
            classification: browserPageType,
            confidence: 1,
            reason: browserPageType === 'browser-new-tab'
              ? 'The active tab is the browser New Tab page.'
              : 'Browser security prevents extensions from reading this internal page.',
            extractionMethod: 'client_page_gate'
          });
          setApiError(
            browserPageType === 'browser-new-tab'
              ? null
              : 'This browser-internal page cannot be read by extensions.'
          );
        }
        return;
      }

      expectedIdentity = getJobIdentityFromUrl(activeUrl);
      const previousIdentity = (
        activeExtractionIdentityRef.current
        || currentJobIdentity
        || getJobIdentityFromUrl(lastAnalyzedUrl)
      );
      const identityChanged = Boolean(previousIdentity && previousIdentity !== expectedIdentity);

      if (extractionInFlightRef.current && !identityChanged) {
        logExtraction('Duplicate request ignored', {
          reason: 'same_job_request_in_flight',
          jobIdentity: expectedIdentity,
          forceRescan
        });
        return;
      }

      if (!identityChanged && jobAnalysis && !forceRescan) {
        logExtraction('Existing extraction session retained', {
          jobIdentity: expectedIdentity,
          url: activeUrl
        });
        setJobDetectionStatus('ready');
        setApiError(null);
        return;
      }

      if (identityChanged) {
        extractionAbortControllerRef.current?.abort();
        resetExtractedJobState('active job changed', {
          from: previousIdentity,
          to: expectedIdentity
        });
        if (chrome.storage.session) {
          chrome.storage.session.remove('jobExtractionSession');
        }
        logExtraction('Previous extraction session ended', {
          previousIdentity,
          nextIdentity: expectedIdentity
        });
      }

      extractionInFlightRef.current = true;
      setApiError(null);
      setJobDetectionStatus("checking");
      setLoadingType("extraction");
      setLoadingProgress(8);
      setLoadingMessage("Capturing current job URL...");

      const scanVersion = extractionVersionRef.current + 1;
      extractionVersionRef.current = scanVersion;
      activeExtractionIdentityRef.current = expectedIdentity;
      setCurrentJobIdentity(expectedIdentity);
      setLastAnalyzedUrl(activeUrl);

      const token = session?.access_token || localStorage.getItem('access_token');
      requestId = (crypto?.randomUUID && crypto.randomUUID()) || `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      activeRequestIdRef.current = requestId;
      const abortController = new AbortController();
      extractionAbortControllerRef.current = abortController;
      const endpoint = `${apiUrl}/api/v1/jobs/extract-url`;
      setLoadingProgress(20);
      setLoadingMessage("Capturing browser-visible job evidence...");
      let browserEvidence = null;
      try {
        browserEvidence = await captureActiveTabJobEvidence(tab.id);
        logExtraction('Browser evidence captured', {
          requestId,
          visibleTextLength: browserEvidence?.visible_text?.length || 0,
          selectedPanelLength: browserEvidence?.selected_panel_text?.length || 0,
          htmlLength: browserEvidence?.html?.length || 0,
          jsonLdCount: browserEvidence?.jsonld?.length || 0,
          selectedPanelSelector: browserEvidence?.selected_panel_selector || null,
          candidateCount: browserEvidence?.capture?.candidate_count || 0,
          jobTitleHint: browserEvidence?.job_title_hint || null,
          companyHint: browserEvidence?.company_hint || null,
          locationHint: browserEvidence?.location_hint || null
        });
      } catch (captureError) {
        console.warn('[JD-EXTRACTION][FRONTEND] Browser evidence unavailable; backend fallback retained', {
          requestId,
          message: captureError?.message || String(captureError)
        });
      }
      const browserAssessment = assessBrowserJobEvidence(browserEvidence || {}, activeUrl);
      logExtraction('Browser evidence readiness assessed', {
        requestId,
        ...browserAssessment
      });
      if (
        browserEvidence
        && browserAssessment.readiness === 'NOT_READY'
        && !browserAssessment.requiresRecoveryEvaluation
      ) {
        extractionVersionRef.current += 1;
        activeExtractionIdentityRef.current = expectedIdentity;
        setCurrentJobIdentity(expectedIdentity);
        resetExtractedJobState('browser evidence is clearly non-job', {
          url: activeUrl,
          assessment: browserAssessment
        });
        chrome.storage.session?.remove('jobExtractionSession');
        setJobDetectionStatus('non-job');
        setJobDetectionMeta({
          classification: 'non_job',
          confidence: 1,
          reason: 'No coherent job identity, application action, job sections, or JobPosting data were found.',
          extractionMethod: 'browser_evidence_gate',
          readiness: browserAssessment.readiness,
          signals: browserAssessment.signals
        });
        setApiError(null);
        return;
      }
      setLoadingMessage("Backend planning evidence sources...");
      logExtraction('Extraction request sent', {
        requestId, url: activeUrl, endpoint,
        hasBrowserEvidence: Boolean(browserEvidence)
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          url: activeUrl,
          request_id: requestId,
          browser_evidence: browserEvidence
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const failure = body?.detail?.error || body?.error || {};
        console.error("[JD-EXTRACTION][FRONTEND] Extraction failed", {
          requestId, status: response.status,
          message: failure.message || "Backend extraction failed",
          errorCode: failure.code || "JD_EXTRACTION_FAILED"
        });
        throw new Error(failure.message || `Backend extraction error (${response.status})`);
      }

      const data = validateJDResponse(await response.json());
      if (
        activeRequestIdRef.current !== requestId
        || activeExtractionIdentityRef.current !== expectedIdentity
      ) {
        logExtraction('Stale extraction response discarded', {
          requestId,
          responseIdentity: expectedIdentity,
          activeIdentity: activeExtractionIdentityRef.current
        });
        return;
      }
      const pageType = data.page_type;
      const confidence = data.classification_confidence || 0;
      logExtraction('Backend response received', {
        requestId: data.request_id, status: response.status, success: data.success,
        pageType, classificationConfidence: confidence,
        hasExtractedJob: Boolean(data.extracted_job),
        needsManualReview: Boolean(data.needs_manual_review)
      });
      logExtraction('Hybrid evidence decision received', {
        requestId: data.request_id,
        ...data.execution_summary
      });
      const canonicalSkills = collectJobSkills(data.extracted_job || {});
      const compatibilitySkills = collectJobSkills(data.job || {});
      logExtraction('Backend extraction field counts', {
        requestId: data.request_id,
        canonicalSkillsCount: canonicalSkills.explicit.length,
        canonicalSuggestedSkillsCount: canonicalSkills.suggested.length,
        compatibilitySkillsCount: compatibilitySkills.explicit.length,
        responsibilitiesCount: data.extracted_job?.responsibilities?.length || 0,
        requirementsCount: data.extracted_job?.requirements?.length || 0,
        preferredQualificationsCount: data.extracted_job?.preferred_qualifications?.length || 0,
        benefitsCount: data.extracted_job?.benefits?.length || 0
      });
      logExtraction('Explicit skills received', {
        requestId: data.request_id,
        skills: canonicalSkills.explicit
      });

      if (!data.success) {
        const code = data.error?.code || "JD_EXTRACTION_FAILED";
        const restriction = data.restriction || data.execution_summary?.restriction_type;
        const restrictionStatus = {
          login_required: 'login-required',
          captcha: 'captcha',
          access_denied: 'blocked',
          rate_limited: 'rate-limited',
          security_challenge: 'security-challenge',
          empty_shell: 'extraction-incomplete',
          javascript_not_rendered: 'extraction-incomplete',
          permission_required: 'page-inaccessible'
        }[restriction];
        const outcomeStatus = {
          selection_required: 'job-list',
          non_job: 'non-job',
          manual_review: 'manual-review',
          insufficient_evidence: 'extraction-incomplete',
          blocked: restrictionStatus || 'blocked'
        }[data.status];
        const nextStatus = outcomeStatus
          || restrictionStatus
          || (code === "JOB_SELECTION_REQUIRED" ? "job-list" : null)
          || (code === "NON_JOB_PAGE" ? "non-job" : null)
          || (code === "MANUAL_REVIEW_REQUIRED" ? "manual-review" : null)
          || (code === "PAGE_BLOCKED" ? "blocked" : "extraction-failed");
        setJobDetectionStatus(nextStatus);
        setJobDetectionMeta({
          classification: data.page_type || 'unknown',
          confidence,
          reason: data.error?.message || 'Job extraction did not complete.',
          extractionMethod: 'hybrid_agentic_url',
          pageAccessStatus: data.page_access_status,
          readiness: data.readiness,
          selectedSource: data.selected_source,
          warnings: data.warnings || []
        });
        setApiError(data.error?.message || null);
        return;
      }

      if (data.needs_manual_review) {
        console.warn("[JD-EXTRACTION][FRONTEND] Manual review required", {
          requestId: data.request_id, reviewIssues: data.review_issues || []
        });
        setJobDetectionStatus("manual-review");
        setJobDetectionMeta({ classification: pageType, confidence, reason: (data.review_issues || []).join("; "), extractionMethod: "agentic_url" });
        setApiError("The page needs manual review before tailoring.");
      } else if (pageType === "job_detail" && data.extracted_job) {
        const job = data.job || data.extracted_job;
        const { title, company, description } = job;
        setJobText(description || '');
        setJobTitle(title || '');
        setCompanyName(company || '');
        setJobAnalysis(job);
        const displayedSkills = collectJobSkills(job);
        logExtraction('Job state prepared for rendering', {
          requestId: data.request_id,
          explicitSkillsCount: displayedSkills.explicit.length,
          suggestedSkillsCount: displayedSkills.suggested.length,
          explicitSkills: displayedSkills.explicit
        });
        setJobDetectionStatus('ready');
        setJobDetectionMeta({
          classification: pageType, confidence,
          reason: (data.classification_reasons || []).join("; "),
          extractionMethod: 'agentic_url'
        });
        setApiError(null);
        logExtraction('Extraction success', { requestId: data.request_id, titlePresent: Boolean(title), companyPresent: Boolean(company) });
      } else {
        const surfaceType = data.execution_summary?.surface_type;
        const statusName = {
          job_list: 'job-list',
          career_home: 'career-home',
          login: 'login-required',
          blocked: 'blocked',
          non_job: 'non-job'
        }[surfaceType] || (pageType === "job_list" ? "job-list" : "non-job");
        setJobDetectionStatus(statusName);
        setJobDetectionMeta({
          classification: pageType || 'non_job', confidence,
          reason: (data.classification_reasons || []).join("; "),
          extractionMethod: 'agentic_url'
        });
        setApiError(null);
        console.warn(`[JD-EXTRACTION][FRONTEND] ${pageType === "job_list" ? "Job-list page" : "Non-job page"} detected`, {
          requestId: data.request_id, url: activeUrl, confidence
        });
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        logExtraction('Previous job extraction request cancelled', {
          requestId,
          jobIdentity: expectedIdentity
        });
        return;
      }
      console.error('[JD-EXTRACTION][FRONTEND] Extraction failed', {
        requestId, message: err.message, errorCode: "JD_EXTRACTION_FAILED"
      });
      const inaccessible = /Cannot access|chrome:\/\/|edge:\/\/|permission|The extensions gallery cannot be scripted/i.test(err.message || '');
      setJobDetectionStatus(inaccessible ? 'page-inaccessible' : 'extraction-failed');
      setApiError(inaccessible
        ? 'This browser page cannot be read by extensions. Open an individual job listing in a regular tab.'
        : (err.message || 'Page extraction failed. Retry the scan.'));
    } finally {
      if (!requestId || activeRequestIdRef.current === requestId) {
        extractionInFlightRef.current = false;
        extractionAbortControllerRef.current = null;
        setLoadingProgress(0);
      }
    }
  };

  const syncCurrentJobToTracker = async (
    currentStage = "Ready To Apply",
    notes = "",
    timelineEvent = "Synced to Job Tracker"
  ) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token || !jobAnalysis) {
      throw new Error("A signed-in user and active job session are required to sync.");
    }
    const strictScore = (value) => {
      if (value === null || value === undefined || value === '') return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100 ? numeric : null;
    };
    const freshResponse = await fetch(`${apiUrl}/api/v1/applications/`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const freshApplications = freshResponse.ok ? await freshResponse.json() : applications;
    const normalizedUrl = String(lastAnalyzedUrl || '').replace(/\/+$/, '').toLowerCase();
    const existing = (freshApplications || []).find(application => {
      const sameUrl = normalizedUrl && String(application.job_url || '')
        .replace(/\/+$/, '').toLowerCase() === normalizedUrl;
      const hasIdentity = Boolean(String(companyName || '').trim() && String(jobTitle || '').trim());
      const sameIdentity = hasIdentity && String(application.company_name || '').trim().toLowerCase()
        === String(companyName || '').trim().toLowerCase()
        && String(application.job_title || '').trim().toLowerCase()
        === String(jobTitle || '').trim().toLowerCase();
      return sameUrl || sameIdentity;
    });
    if (existing?.id) {
      const updatedTimeline = [
        ...(existing.timeline || []),
        { event: timelineEvent, timestamp: new Date().toISOString() }
      ];
      const updateResponse = await fetch(`${apiUrl}/api/v1/applications/${existing.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          current_stage: currentStage,
          notes: notes.trim() || existing.notes || null,
          timeline: updatedTimeline
        })
      });
      if (!updateResponse.ok) throw new Error("Failed to update the synced tracker job.");
      const updated = await updateResponse.json();
      setActiveApplicationId(existing.id);
      await fetchApplications();
      return updated;
    }
    const appData = {
      company_name: companyName || "",
      company_domain: jobAnalysis?.company_domain || jobAnalysis?.analysis?.company_domain || null,
      job_title: jobTitle || "",
      location: jobAnalysis?.location || "Remote",
      job_url: lastAnalyzedUrl || "",
      resume_version: tailoredResume ? "v1 (Tailored)" : null,
      cover_letter_version: coverLetter ? "v1" : null,
      ats_score: strictScore(comparison?.ats_score_after ?? comparison?.ats_score_before),
      resume_match_score: strictScore(comparison?.resume_match_after ?? comparison?.resume_match_before),
      current_stage: currentStage,
      notes: notes.trim() || null,
      timeline: [{
        event: timelineEvent,
        timestamp: new Date().toISOString()
      }]
    };
    const response = await fetch(`${apiUrl}/api/v1/applications/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(appData)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Failed to sync job to tracker.");
    }
    const created = await response.json();
    setActiveApplicationId(created.id);
    await fetchApplications();
    return created;
  };

  // Perform Job Description Extraction (Step 1)
  const handleExtractJob = async () => {
    if (jobAnalysis) return;
    if (isExtension) {
      await handleScanPage(true);
      if (!jobAnalysis) return;
    }
    if (!isExtension) {
      setApiError("Open the Chrome extension on an individual job page to extract its complete URL.");
      setJobDetectionStatus("idle");
      return;
    }
    if (!ensureExtractionProfileReady()) return;

    if (!jobText) {
      alert("Please scan or paste a job description first.");
      return;
    }

    const extractVersion = extractionVersionRef.current;
    const extractIdentity = activeExtractionIdentityRef.current || currentJobIdentity || getJobIdentityFromUrl(lastAnalyzedUrl);
    setApiError(null);
    setLoadingType('extraction');
    setLoadingProgress(5);
    setLoadingMessage("Reading Job Description...");
    logExtraction('backend analysis started', { url: lastAnalyzedUrl, jobIdentity: extractIdentity, navigationVersion: extractVersion, descriptionLength: jobText.length });
    logExtraction('12 backend analysis preflight', { classification: jobDetectionMeta?.classification || 'manual', confidence: jobDetectionMeta?.confidence, title: jobTitle, company: companyName });

    const progressInterval = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 90) return 90;
        const stepSize = prev < 25 ? 10 : (prev < 50 ? 8 : (prev < 75 ? 5 : 2));
        const nextVal = prev + stepSize;

        if (nextVal < 20) setLoadingMessage("Reading Job Description...");
        else if (nextVal < 40) setLoadingMessage("Extracting Company Information...");
        else if (nextVal < 60) setLoadingMessage("Analyzing Required Skills...");
        else if (nextVal < 80) setLoadingMessage("Finding ATS Keywords...");
        else setLoadingMessage("Understanding Responsibilities...");

        return nextVal;
      });
    }, 200);

    try {
      const headers = {};
      if (apiKey) headers["x-groq-key"] = apiKey;
      const token = session?.access_token || localStorage.getItem('access_token');
      if (token) headers["Authorization"] = `Bearer ${token}`;

      let analyzedJob;
      try {
        const requestId = (crypto?.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        logExtraction('04 backend request payload', {
          requestId,
          url: lastAnalyzedUrl,
          jd_text_length: jobText.length,
          page_title: jobTitle,
          page_company: companyName,
          classification: jobDetectionMeta?.classification || "manual"
        });

        const jobRes = await fetch(`${apiUrl}/api/v1/jobs/extract`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers
          },
          body: JSON.stringify({
            jd_text: jobText,
            url: lastAnalyzedUrl || "",
            page_title: jobTitle || "",
            page_company: companyName || "",
            classification: jobDetectionMeta?.classification || "manual",
            detection_confidence: jobDetectionMeta?.confidence,
            detection_reason: jobDetectionMeta?.reason || "",
            extraction_method: jobDetectionMeta?.extractionMethod || (lastAnalyzedUrl ? "semantic-dom" : "manual"),
            content_hash: jobDetectionMeta?.contentHash || "",
            request_id: requestId
          })
        });
        if (!jobRes.ok) {
          const errData = await jobRes.json().catch(() => ({ detail: jobRes.statusText }));
          if (["QUOTA_EXCEEDED", "FEATURE_NOT_AVAILABLE", "SUBSCRIPTION_INACTIVE", "SUBSCRIPTION_SUSPENDED"].includes(errData?.detail?.code)) {
            await fetchSubscription();
            const subError = new Error(errData.detail.message || "Subscription does not allow this extraction.");
            subError.skipLegacyFallback = true;
            throw subError;
          }
          if (["JOB_CLASSIFICATION_REQUIRED", "INVALID_JOB_DESCRIPTION", "INVALID_JOB_TITLE"].includes(errData?.detail?.code)) {
            const validationError = new Error(errData.detail.message || "The extracted page is not safe to tailor.");
            validationError.skipLegacyFallback = true;
            throw validationError;
          }
          throw new Error(errData?.detail?.message || errData?.detail || "V1 extract route returned error or not found");
        }
        const jobPayload = await jobRes.json();
        analyzedJob = jobPayload?.analysis || jobPayload?.data || jobPayload;
        const respDetails = analyzedJob?.analysis || analyzedJob?.normalized_content || analyzedJob;
        logExtraction('05 backend response payload', {
          requestId,
          status: jobRes.status,
          title: respDetails?.title || respDetails?.job_title,
          company: respDetails?.company || respDetails?.company_name,
          location: respDetails?.location,
          employmentType: respDetails?.job_type
        });
        if (jobPayload?.usage) {
          setUsage(prev => ({ ...(prev || {}), jd_extraction: jobPayload.usage }));
          await fetchSubscription();
        }
      } catch (err) {
        if (err.skipLegacyFallback) throw err;
        const jobResFallback = await fetch(`${apiUrl}/api/analyze-job`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers
          },
          body: JSON.stringify({ jd_text: jobText })
        });
        if (!jobResFallback.ok) {
          const errData = await jobResFallback.json().catch(() => ({ detail: jobResFallback.statusText }));
          throw new Error("Job analysis error: " + (errData.detail || "Request failed"));
        }
        analyzedJob = await jobResFallback.json();
      }

      const isValidText = (str) => typeof str === 'string' && str.trim() !== '' && str.trim().toLowerCase() !== 'not available' && str.trim().toLowerCase() !== 'n/a' && str.trim().toLowerCase() !== 'unspecified';
      const INVALID_TITLE_NOISE = /^(?:people you can reach out to|about the job|about the company|job description|responsibilities|qualifications|requirements|minimum qualifications|preferred qualifications|similar jobs|recommended jobs|explore options|meet the hiring team|your profile and resume|privacy policy|terms of use|apply|easy apply|save|share|follow|show more|see more|search results|jobs for you|0 notifications|skip navigation|sign in|log in|target company)$/i;

      const isValidTitleString = (str) => isValidText(str) && !INVALID_TITLE_NOISE.test(str.trim()) && str.trim().length >= 2 && str.trim().length <= 120;
      
      const details = analyzedJob?.analysis || analyzedJob?.normalized_content || analyzedJob || {};
      const rawTitle = [details?.title, details?.job_title, analyzedJob?.job_title, analyzedJob?.title, jobTitle].find(isValidTitleString) || '';
      const rawCompany = [details?.company, details?.company_name, analyzedJob?.company_name, analyzedJob?.company, companyName].find((str) => isValidText(str) && !INVALID_TITLE_NOISE.test(str.trim()) && str.trim().toLowerCase() !== rawTitle.toLowerCase()) || '';

      const finalTitle = rawTitle;
      const finalCompany = rawCompany;

      logExtraction('06 frontend state immediately after API response', {
        finalTitle,
        finalCompany,
        stateJobTitle: finalTitle,
        stateCompanyName: finalCompany
      });

      if (extractIdentity !== activeExtractionIdentityRef.current) {
        clearInterval(progressInterval);
        setLoadingProgress(0);
        logExtraction('stale analysis discarded', {
          url: lastAnalyzedUrl,
          jobIdentity: extractIdentity,
          activeIdentity: activeExtractionIdentityRef.current,
          navigationVersion: extractVersion,
          currentVersion: extractionVersionRef.current
        });
        return;
      }

      setJobAnalysis(analyzedJob);
      if (isValidText(finalCompany)) setCompanyName(finalCompany);
      if (isValidText(finalTitle)) setJobTitle(finalTitle);

      clearInterval(progressInterval);
      setLoadingProgress(0);
      setJobDetectionStatus("ready");
    } catch (error) {
      clearInterval(progressInterval);
      console.error(error);
      setApiError(error.message || "Failed to extract job description.");
      setLoadingProgress(0);
      setJobDetectionStatus("idle");
    }
  };

  // Perform Resume Parsing (Step 4)
  const handleParseResume = async (fileOverride = null, options = {}) => {
    const selectedFile = fileOverride || resumeFile;
    if (!selectedFile && !parsedResume) {
      alert("Please select a resume file to parse.");
      return;
    }

    if (parsedResume && !selectedFile) {
      navigate('/resume-review');
      return;
    }

    setApiError(null);
    setLoadingProgress(5);
    setLoadingMessage("Reading Resume...");

    const progressInterval = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 95) return 95;
        const nextVal = prev + 8;
        if (nextVal < 20) setLoadingMessage("Reading Resume...");
        else if (nextVal < 40) setLoadingMessage("Extracting Contact Information...");
        else if (nextVal < 60) setLoadingMessage("Identifying Experience...");
        else if (nextVal < 80) setLoadingMessage("Finding Projects...");
        else setLoadingMessage("Building Resume Structure...");
        return nextVal;
      });
    }, 180);

    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      const headers = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (apiKey) headers["x-groq-key"] = apiKey;

      const formData = new FormData();
      formData.append("file", selectedFile);

      const parseRes = await fetch(`${apiUrl}/api/v1/resumes/upload`, {
        method: "POST",
        headers,
        body: formData,
        signal: options?.signal
      });

      if (!parseRes.ok) {
        throw new Error("Resume parse error: " + (await parseRes.json()).detail);
      }
      const resumeRecord = await parseRes.json();
      const optimisticRecord = {
        ...resumeRecord,
        is_active: true,
        parsing_status: resumeRecord.parsing_status || resumeRecord.parsed_content?.parse_status || 'pending'
      };
      setResumesList((previous) => [
        optimisticRecord,
        ...previous
          .filter((resume) => resume.id !== optimisticRecord.id)
          .map((resume) => ({ ...resume, is_active: false }))
      ]);
      const optimisticResume = normalizeResumeRecord(optimisticRecord);
      persistParsedResume(optimisticResume);
      console.info('[RESUME][FRONTEND] New resume uploaded and activated', {
        resumeId: optimisticRecord.id,
        fileName: optimisticRecord.file_name,
        parsingStatus: optimisticRecord.parsing_status
      });

      const refreshedResumes = await fetchResumesList();
      const backendActiveResume = refreshedResumes?.find((resume) => resume.id === resumeRecord.id) || optimisticRecord;
      const currentResume = normalizeResumeRecord(backendActiveResume);
      persistParsedResume(currentResume);

      clearInterval(progressInterval);
      setLoadingProgress(100);
      setLoadingMessage("Parsing Complete!");
      setResumeFile(null);
      setTimeout(() => {
        setLoadingProgress(0);
        setLoadingMessage("");
      }, 300);
      return currentResume;

    } catch (error) {
      clearInterval(progressInterval);
      setLoadingProgress(0);
      setLoadingMessage("");
      if (error.name === 'AbortError' || error.message === 'Canceled') {
        console.info('[RESUME][FRONTEND] Resume upload cancelled by user');
        return { cancelled: true };
      }
      console.error(error);
      setApiError(error.message || "Failed to parse resume.");
      navigate('/resume-detect');
      return null;
    }
  };

  // Perform full Gap analysis (ATS Compare) & Pre-Tailoring merge (Step 7)
  const handleCompareActiveResumeToJob = async () => {
    if (!parsedResume || !jobAnalysis) return null;

    let activeParsed = parsedResume;
    try {
      if (parsedResume.id && (!parsedResume.experience || parsedResume.experience.length === 0) && parsedResume.raw_text) {
        const token = session?.access_token || localStorage.getItem('access_token');
        const parseHeaders = {};
        if (token) parseHeaders["Authorization"] = `Bearer ${token}`;
        if (apiKey) parseHeaders["x-groq-key"] = apiKey;

        const parseRes = await fetch(`${apiUrl}/api/v1/resumes/${parsedResume.id}/parse`, {
          method: "POST",
          headers: parseHeaders
        });

        if (parseRes.ok) {
          const updatedRecord = await parseRes.json();
          activeParsed = normalizeResumeRecord(updatedRecord);
          persistParsedResume(activeParsed);
        }
      }

      const headers = {};
      if (apiKey) headers["x-groq-key"] = apiKey;
      const token = session?.access_token || localStorage.getItem('access_token');
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const compareRes = await fetch(`${apiUrl}/api/compare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify(buildTailoringComparePayload({
          resumeId: activeParsed.id,
          resume: toRenderableResume(activeParsed),
          job: getCanonicalJobAnalysis(),
          selectedSections
        }))
      });

      if (!compareRes.ok) {
        const errorBody = await compareRes.json().catch(() => ({}));
        const message = errorBody?.detail || `Comparison failed (${compareRes.status})`;
        console.error("[JD-EXTRACTION][FRONTEND] Resume comparison failed", {
          status: compareRes.status,
          message
        });
        setApiError(typeof message === "string" ? message : "Resume comparison failed.");
        return null;
      }
      const compResult = await compareRes.json();
      setComparison(compResult);
      return compResult;
    } catch (err) {
      console.error("Failed to compare active resume to job:", err);
      return null;
    }
  };

  const handleRunGapAnalysis = async () => {
    if (!parsedResume || !jobAnalysis) {
      alert("Missing resume or job details.");
      return;
    }

    setApiError(null);
    navigate('/tailor-progress');
    setLoadingProgress(5);
    setLoadingMessage("Comparing Resume with Job Description...");

    const progressInterval = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 95) return 95;
        const nextVal = prev + 6;
        if (nextVal < 25) setLoadingMessage("Comparing Resume with Job Description...");
        else if (nextVal < 50) setLoadingMessage("Matching ATS Keywords...");
        else if (nextVal < 70) setLoadingMessage("Improving Experience...");
        else if (nextVal < 85) setLoadingMessage("Optimizing Projects...");
        else setLoadingMessage("Generating Tailored Resume...");
        return nextVal;
      });
    }, 200);

    let activeParsed = parsedResume;

    try {
      const backendActive = await refreshActiveResumeFromBackend();
      if (!backendActive?.id) {
        throw new Error("No active resume selected. Choose a resume before tailoring.");
      }
      activeParsed = backendActive;

      // Lazy parse if resume experience is empty and raw_text is present
      if (activeParsed.id && (!activeParsed.experience || activeParsed.experience.length === 0) && activeParsed.raw_text) {
        setLoadingMessage("Parsing Resume with AI for Tailoring...");
        setLoadingProgress(15);

        const token = session?.access_token || localStorage.getItem('access_token');
        const parseHeaders = {};
        if (token) parseHeaders["Authorization"] = `Bearer ${token}`;
        if (apiKey) parseHeaders["x-groq-key"] = apiKey;

        const parseRes = await fetch(`${apiUrl}/api/v1/resumes/${activeParsed.id}/parse`, {
          method: "POST",
          headers: parseHeaders
        });

        if (!parseRes.ok) {
          throw new Error("AI parsing on-demand failed: " + (await parseRes.json()).detail);
        }

        const updatedRecord = await parseRes.json();
        activeParsed = normalizeResumeRecord(updatedRecord);
        persistParsedResume(activeParsed);

        setLoadingMessage("AI Parsing Complete! Starting Gap Analysis...");
        setLoadingProgress(35);
      }

      if (activeParsed.id && activeParsed.source_preservation_version !== '9.1-achievement-segmentation') {
        setLoadingMessage("AI agent is reconciling the resume with the original source...");
        const recoveryToken = session?.access_token || localStorage.getItem('access_token');
        const recoveryHeaders = {};
        if (recoveryToken) recoveryHeaders.Authorization = `Bearer ${recoveryToken}`;
        if (apiKey) recoveryHeaders['x-groq-key'] = apiKey;
        const recoveryRes = await fetch(
          `${apiUrl}/api/v1/resumes/${activeParsed.id}/recover-source`,
          {
            method: "POST",
            headers: recoveryHeaders
          }
        );
        if (!recoveryRes.ok) {
          const recoveryError = await recoveryRes.json().catch(() => ({}));
          throw new Error(
            recoveryError.detail || "Original resume source recovery failed."
          );
        }
        activeParsed = normalizeResumeRecord(await recoveryRes.json());
        persistParsedResume(activeParsed);
      }

      const headers = {};
      if (apiKey) headers["x-groq-key"] = apiKey;
      const token = session?.access_token || localStorage.getItem('access_token');
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const compareRes = await fetch(`${apiUrl}/api/compare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify(buildTailoringComparePayload({
          resumeId: activeParsed.id,
          resume: toRenderableResume(activeParsed),
          job: getCanonicalJobAnalysis(),
          selectedSections
        }))
      });

      if (!compareRes.ok) {
        throw new Error("Comparison error: " + (await compareRes.json()).detail);
      }

      const compResult = await compareRes.json();
      setComparison(compResult);
      try {
        const usedRes = await fetch(`${apiUrl}/api/v1/resumes/${activeParsed.id}/mark-used`, {
          method: "POST",
          headers: token ? { "Authorization": `Bearer ${token}` } : {}
        });
        if (usedRes.ok) {
          const usedRecord = await usedRes.json();
          persistParsedResume(normalizeResumeRecord(usedRecord));
          await fetchResumesList();
        }
      } catch (usageErr) {
        console.warn("Failed to update resume usage metadata:", usageErr);
      }

      const list = [];
      const patch = compResult.patch;
      const auditByPath = new Map(
        (compResult.tailoring_audit?.edits || []).map(edit => [edit.path, edit])
      );
      const auditMetadata = (path, fallbackReason, fallbackImpact) => {
        const audit = auditByPath.get(path);
        return {
          reason: audit?.reason || fallbackReason,
          atsBenefit: audit?.ats_benefit || fallbackImpact,
          confidence: Number(audit?.confidence ?? 90)
        };
      };

      if (selectedSections.includes('summary') && patch.summary) {
        list.push({
          id: 'summary:0',
          change_id: 'summary:0',
          category: 'Professional Summary',
          status: 'pending',
          original: activeParsed.summary || '',
          suggested: patch.summary,
          ...auditMetadata(
            'summary',
            'Minimal summary wording improvement.',
            'Improves natural alignment with the extracted JD.'
          ),
          atsImpact: 3,
          sectionType: 'summary',
          itemIndex: 0,
          bulletIndex: 0
        });
      }

      if (selectedSections.includes('experience') && patch.experience) {
        Object.keys(patch.experience).forEach(itemIdxStr => {
          const itemIdx = parseInt(itemIdxStr, 10);
          const bulletsPatch = patch.experience[itemIdxStr];
          Object.keys(bulletsPatch).forEach(bulletIdxStr => {
            const bulletIdx = parseInt(bulletIdxStr, 10);
            const suggested = bulletsPatch[bulletIdxStr];
            const originalText = activeParsed.experience[itemIdx]?.description[bulletIdx] || '';
            list.push({
              id: `experience:${itemIdx}:bullet:${bulletIdx}`,
              change_id: `experience:${itemIdx}:bullet:${bulletIdx}`,
              category: 'Work Experience',
              status: 'pending',
              original: originalText,
              suggested: suggested,
              ...auditMetadata(
                `experience.${itemIdx}.description.${bulletIdx}`,
                'Minimal experience bullet wording improvement.',
                'Improves action verbs and existing-keyword alignment.'
              ),
              atsImpact: 5,
              sectionType: 'experience',
              itemIndex: itemIdx,
              bulletIndex: bulletIdx
            });
          });
        });
      }

      if (selectedSections.includes('projects') && patch.projects) {
        Object.keys(patch.projects).forEach(itemIdxStr => {
          const itemIdx = parseInt(itemIdxStr, 10);
          const bulletsPatch = patch.projects[itemIdxStr];
          Object.keys(bulletsPatch).forEach(bulletIdxStr => {
            const bulletIdx = parseInt(bulletIdxStr, 10);
            const suggested = bulletsPatch[bulletIdxStr];
            const originalText = activeParsed.projects[itemIdx]?.description[bulletIdx] || '';
            list.push({
              id: `projects:${itemIdx}:bullet:${bulletIdx}`,
              change_id: `projects:${itemIdx}:bullet:${bulletIdx}`,
              category: 'Projects',
              status: 'pending',
              original: originalText,
              suggested: suggested,
              ...auditMetadata(
                `projects.${itemIdx}.description.${bulletIdx}`,
                'Minimal project bullet wording improvement.',
                'Improves readability and existing-keyword alignment.'
              ),
              atsImpact: 5,
              confidence: 'High',
              sectionType: 'projects',
              itemIndex: itemIdx,
              bulletIndex: bulletIdx
            });
          });
        });
      }

      // Missing JD keywords are reported by ATS analysis, but are never
      // inserted as candidate skills. Skills remain source-owned evidence.

      setReviewSuggestions(list);
      clearInterval(progressInterval);
      setLoadingProgress(100);
      setLoadingMessage("Tailoring complete!");
      setTimeout(() => {
        navigate('/review-changes');
      }, 300);

    } catch (error) {
      clearInterval(progressInterval);
      console.error(error);
      setApiError(error.message || "Failed to match details.");
      navigate('/tailor-config');
    }
  };

  const handleGenerateFinalResume = async (workingResumeOverride, operationsOverride, validationOverride) => {
    try {
      setLoading(true);
      setLoadingMessage("Validating complete reviewed resume...");
      const merged = workingResumeOverride
        ? { workingResume: toRenderableResume(workingResumeOverride), operations: operationsOverride || [] }
        : mergeReviewResume(parsedResume, reviewSuggestions);
      const validation = validationOverride || validateWorkingResume(
        parsedResume,
        merged.workingResume,
        merged.operations
      );
      if (!validation.valid) {
        console.error("[RESUME-EXPORT] Pre-export integrity check failed", {
          issues: validation.issues
        });
        throw new Error(
          "We could not finalize the resume automatically. Your original resume data is safe. Please retry or review the highlighted sections."
        );
      }
      const tailoredResult = merged.workingResume;
      if (!tailoredResult) throw new Error('The complete reviewed resume is unavailable.');
      setTailoredResume(tailoredResult);
      setLoading(false);
      navigate('/templates');

      // Re-score the exact resume produced from the user's accepted changes.
      // Navigation must never wait for the backend scorer. The exact reviewed
      // resume is already stored locally; refresh ATS intelligence in the
      // background and abandon a slow request instead of freezing the UI.
      let exactTailoredScore = null;
      try {
        const scoreToken = session?.access_token || localStorage.getItem('access_token');
        const scoreResponse = await fetch(`${apiUrl}/api/score`, {
          method: "POST",
          signal: AbortSignal.timeout(8000),
          headers: {
            "Content-Type": "application/json",
            ...(scoreToken ? { "Authorization": `Bearer ${scoreToken}` } : {})
          },
          body: JSON.stringify({ resume: tailoredResult, job: getCanonicalJobAnalysis() })
        });
        if (scoreResponse.ok) {
          const scoreResult = await scoreResponse.json();
          const numericScore = Number(scoreResult.ats_score);
          const numericMatchScore = Number(scoreResult.resume_match_score);
          if (Number.isFinite(numericScore) && numericScore >= 0 && numericScore <= 100) {
            exactTailoredScore = numericScore;
            setComparison((previous) => ({
              ...(previous || {}),
              ats_score_after: numericScore,
              resume_match_after: Number.isFinite(numericMatchScore) ? numericMatchScore : (previous?.resume_match_after || 0)
            }));
          }
        } else {
          console.warn("Strict ATS scoring failed", await scoreResponse.text());
        }
      } catch (scoreError) {
        console.warn("Strict ATS scoring unavailable", scoreError);
      }
    } catch (err) {
      console.error(err);
      setApiError(err.message || "Failed to apply changes.");
      setLoading(false);
    }
  };

  const handleDownloadFinalPDF = async (layoutLevel, options = {}) => {
    const activeRes = tailoredResume || parsedResume;
    if (!activeRes) return;
    const reusableArtifact = options.preparedArtifact || finalPdfArtifact;
    if (options.usePrepared && reusableArtifact?.blob && reusableArtifact?.url) {
      const rawName = activeRes.personal_info?.name || 'User';
      const defaultFilename = `${rawName.replace(/\s+/g, '_')}_${(companyName || 'Company').replace(/\s+/g, '_')}_Resume.pdf`;
      const filename = customFileName.trim()
        ? (customFileName.endsWith('.pdf') ? customFileName : `${customFileName}.pdf`)
        : defaultFilename;
      if (isExtension && chrome.downloads) {
        chrome.downloads.download({
          url: reusableArtifact.url, filename, conflictAction: 'uniquify'
        });
      } else {
        const link = document.createElement('a');
        link.href = reusableArtifact.url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      return true;
    }

    let finalRes = { ...activeRes };
    let originalForAudit = parsedResume || activeRes;

    setLoading(true);
    setLoadingProgress(50);
    setLoadingMessage("Finalizing resume structure...");

    try {
      // Existing tailored state may predate the latest deterministic source
      // repair. Refresh it immediately at export and replace only sections the
      // tailoring workflow never edits.
      if (parsedResume?.id && parsedResume.source_preservation_version !== '9.1-achievement-segmentation') {
        setLoadingMessage("AI agent is reconciling the complete resume with the original upload...");
        const recoveryToken = session?.access_token || localStorage.getItem('access_token');
        const recoveryResponse = await fetch(
          `${apiUrl}/api/v1/resumes/${parsedResume.id}/recover-source`,
          {
            method: "POST",
            headers: recoveryToken ? { "Authorization": `Bearer ${recoveryToken}` } : {}
          }
        );
        if (!recoveryResponse.ok) {
          const recoveryError = await recoveryResponse.json().catch(() => ({}));
          throw new Error(recoveryError.detail || "Original resume evidence repair failed.");
        }
        const recoveredRecord = normalizeResumeRecord(await recoveryResponse.json());
        const recoveredContent = toRenderableResume(recoveredRecord);
        originalForAudit = recoveredRecord;
        finalRes = {
          ...finalRes,
          achievements: recoveredContent.achievements,
          certifications: recoveredContent.certifications,
          awards: recoveredContent.awards,
          links: recoveredContent.links,
          personal_info: {
            ...(finalRes.personal_info || {}),
            linkedin: recoveredContent.personal_info?.linkedin || finalRes.personal_info?.linkedin,
            github: recoveredContent.personal_info?.github || finalRes.personal_info?.github,
            website: recoveredContent.personal_info?.website || finalRes.personal_info?.website,
            coding_profiles: recoveredContent.personal_info?.coding_profiles || finalRes.personal_info?.coding_profiles
          }
        };
        persistParsedResume(recoveredRecord);
        setTailoredResume(finalRes);
      }
      if (layoutLevel !== undefined) {
        setLoadingMessage("Refining page layout...");
        const pruneLevel = Math.max(0, 5 - Math.floor(layoutLevel / 2));
        finalRes = compressResumeData(finalRes, pruneLevel);
        finalRes.layout_level = layoutLevel;
      }
      const response = await fetch(`${apiUrl}/api/download-pdf?company_name=${encodeURIComponent(companyName || 'Company')}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          resume: toRenderableResume(finalRes),
          original_resume: toRenderableResume(originalForAudit),
          intentional_removals: [],
          approved_additions: [],
          template_name: selectedTemplate || 'ExecutiveATS'
        })
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        const detail = errorPayload.detail;
        const requestId = typeof detail === 'object' ? detail?.request_id : null;
        console.error("[RESUME-EXPORT] Export failed", {
          status: response.status,
          requestId,
          // Retained only in developer tools; never rendered to the user.
          detail
        });
        const validationMessage = Array.isArray(detail)
          ? detail
              .map(issue => {
                const path = Array.isArray(issue?.loc)
                  ? issue.loc.filter(part => part !== 'body').join('.')
                  : '';
                return `${path ? `${path}: ` : ''}${issue?.msg || ''}`.trim();
              })
              .filter(Boolean)
              .join('; ')
          : '';
        const safeMessage = typeof detail === 'object' && !Array.isArray(detail) && detail?.message
          ? detail.message
          : validationMessage
            ? `The resume data could not be prepared for PDF: ${validationMessage}`
            : "We could not finalize the resume automatically. Your original resume data is safe. Please retry.";
        throw new Error(
          requestId ? `${safeMessage} Support ID: ${requestId}` : safeMessage
        );
      }

      setLoadingMessage("Validating the final document...");
      const blob = await response.blob();
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const pdfHash = Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (finalPdfArtifact?.url) URL.revokeObjectURL(finalPdfArtifact.url);
      const preparedArtifact = {
        blob,
        url: URL.createObjectURL(blob),
        hash: response.headers.get('X-PDF-Hash') || pdfHash,
        pageCount: Number(response.headers.get('X-PDF-Page-Count') || 1),
        planHash: response.headers.get('X-Composition-Plan-Hash') || '',
        filename: response.headers.get('X-PDF-Filename') || ''
      };
      setFinalPdfArtifact(preparedArtifact);
      if (options.previewOnly) return preparedArtifact;
      const rawName = activeRes.personal_info?.name || 'User';
      const cleanUser = rawName.replace(/\s+/g, '_');
      const cleanCompany = (companyName || 'Company').replace(/\s+/g, '_');
      const defaultFilename = `${cleanUser}_${cleanCompany}_Resume.pdf`;
      const filename = customFileName.trim() ? (customFileName.endsWith('.pdf') ? customFileName : `${customFileName}.pdf`) : defaultFilename;

      const objectUrl = preparedArtifact.url;
      if (isExtension && chrome.downloads) {
        chrome.downloads.download({
          url: objectUrl,
          filename: filename,
          conflictAction: 'uniquify'
        });
      } else {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      try {
        setLoadingMessage("Adding downloaded resume to Job Tracker...");
        await syncCurrentJobToTracker(
          "Ready To Apply",
          "",
          "Resume Downloaded"
        );
      } catch (trackerError) {
        console.error("Resume downloaded but Job Tracker sync failed:", trackerError);
        setApiError(
          "Your resume downloaded successfully, but it could not be added to Job Tracker. You can retry from the success screen."
        );
      }
      return true;
    } catch (e) {
      console.error(e);
      alert("Error generating PDF: " + e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCoverLetterPDF = async () => {
    if (!coverLetter) return;
    setLoading(true);
    setLoadingProgress(50);
    setLoadingMessage("Generating cover letter PDF...");
    try {
      const response = await fetch(`${apiUrl}/api/download-cover-letter-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(coverLetter)
      });

      if (!response.ok) {
        throw new Error("Cover letter PDF download failed on server.");
      }

      const blob = await response.blob();
      const cleanCompany = (companyName || 'Company').replace(/\s+/g, '_');
      const filename = `${cleanCompany}_Cover_Letter.pdf`;

      const objectUrl = window.URL.createObjectURL(blob);
      if (isExtension && chrome.downloads) {
        chrome.downloads.download({
          url: objectUrl,
          filename: filename,
          conflictAction: 'uniquify'
        });
      } else {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setLoadingProgress(100);
      setLoading(false);
    } catch (error) {
      console.error(error);
      setLoading(false);
      alert("Error compiling PDF: " + error.message);
    }
  };

  const handleDraftCoverLetterFromContext = async () => {
    if (!coverLetterContext?.ready_for_generation || !parsedResume || !jobAnalysis) {
      alert("Complete the cover letter context questions before drafting.");
      return false;
    }
    setLoading(true);
    setLoadingMessage("Drafting evidence-backed cover letter...");
    setLoadingProgress(35);
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["x-groq-key"] = apiKey;
      const response = await fetch(`${apiUrl}/api/cover-letter`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          resume: toRenderableResume(parsedResume),
          job: {
            ...getCanonicalJobAnalysis(),
            cover_letter_context: coverLetterContext
          }
        })
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.detail || "Cover letter drafting failed.");
      }
      const draft = await response.json();
      setCoverLetter(draft);
      setCoverLetterContext(null);
      setLoadingProgress(100);
      return true;
    } catch (error) {
      console.error(error);
      alert("Error drafting cover letter: " + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleBuildCoverLetterStrategy = async () => {
    if (!coverLetterContext?.ready_for_generation) {
      alert("Complete and validate the cover letter context first.");
      return false;
    }
    setLoading(true);
    setLoadingMessage("Building cover letter generation strategy...");
    try {
      const response = await fetch(`${apiUrl}/api/cover-letter/strategy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: coverLetterContext,
          session_id: coverLetterContext.scope_fingerprint
        })
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.detail || "Strategy generation failed.");
      }
      setCoverLetterStrategy(await response.json());
      setGeneratedCoverLetter(null);
      setCoverLetterReview(null);
      setCoverLetterEditHistory([]);
      return true;
    } catch (error) {
      console.error(error);
      alert("Error building cover letter strategy: " + error.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFirstCoverLetterDraft = async (answers = {}, skipped = []) => {
    setLoading(true);
    setLoadingMessage("Preparing cover letter context & strategy...");
    setLoadingProgress(15);
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["x-groq-key"] = apiKey;

      let currentCtx = coverLetterContext;
      if (!currentCtx || !currentCtx.ready_for_generation) {
        if (!parsedResume || !jobAnalysis) {
          alert("Please select an active resume and extract a job description first.");
          return false;
        }
        const ctxRes = await fetch(`${apiUrl}/api/cover-letter/context`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            resume: toRenderableResume(parsedResume),
            jd: getCanonicalJobAnalysis() || {},
            job: getCanonicalJobAnalysis() || {},
            user_answers: answers,
            skipped_questions: skipped
          })
        });
        if (!ctxRes.ok) {
          const failure = await ctxRes.json().catch(() => ({}));
          const errDetail = typeof failure.detail === 'string'
            ? failure.detail
            : (Array.isArray(failure.detail) ? failure.detail.map(d => `${d.loc?.join('.')}: ${d.msg}`).join(', ') : "Failed to prepare cover letter context.");
          throw new Error(errDetail);
        }
        currentCtx = await ctxRes.json();
        setCoverLetterContext(currentCtx);
      }

      setLoadingMessage("Building cover letter strategy...");
      setLoadingProgress(35);
      let currentStrat = coverLetterStrategy;
      if (!currentStrat || !currentStrat.ready_for_generation) {
        const stratRes = await fetch(`${apiUrl}/api/cover-letter/strategy`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            context: currentCtx,
            session_id: currentCtx.scope_fingerprint || 'session'
          })
        });
        if (!stratRes.ok) {
          const failure = await stratRes.json().catch(() => ({}));
          const errDetail = typeof failure.detail === 'string'
            ? failure.detail
            : (Array.isArray(failure.detail) ? failure.detail.map(d => `${d.loc?.join('.')}: ${d.msg}`).join(', ') : "Failed to build cover letter strategy.");
          throw new Error(errDetail);
        }
        currentStrat = await stratRes.json();
        setCoverLetterStrategy(currentStrat);
      }

      setLoadingMessage("Generating cover letter prose...");
      setLoadingProgress(55);

      const response = await fetch(`${apiUrl}/api/cover-letter/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          context: currentCtx,
          strategy: currentStrat
        })
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        const errDetail = typeof failure.detail === 'string'
          ? failure.detail
          : (Array.isArray(failure.detail) ? failure.detail.map(d => `${d.loc?.join('.')}: ${d.msg}`).join(', ') : "Cover letter generation failed.");
        throw new Error(errDetail);
      }
      const generated = await response.json();
      setGeneratedCoverLetter(generated);
      setCoverLetterReview(null);
      setCoverLetterEditHistory([]);

      setLoadingMessage("Reviewing generated cover letter...");
      setLoadingProgress(80);

      const reviewResponse = await fetch(`${apiUrl}/api/cover-letter/review`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          context: currentCtx,
          strategy: currentStrat,
          generated_cover_letter: generated,
          review_mode: "deterministic"
        })
      });

      if (reviewResponse.ok) {
        const review = await reviewResponse.json();
        setCoverLetterReview(review);
        setGeneratedCoverLetter(review.final_cover_letter || generated);
      }

      setLoadingProgress(100);
      return true;
    } catch (error) {
      console.error("Cover letter generation pipeline error:", error);
      const detailMsg = typeof error?.message === 'string'
        ? error.message
        : (typeof error === 'string' ? error : JSON.stringify(error));
      alert(detailMsg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleEditCoverLetter = async (userPrompt) => {
    const prompt = String(userPrompt || '').trim();
    if (!prompt || !generatedCoverLetter || coverLetterEditStreaming) return false;
    setCoverLetterEditStreaming(true);
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["x-groq-key"] = apiKey;
      const response = await fetch(`${apiUrl}/api/cover-letter/edit/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          context: coverLetterContext,
          strategy: coverLetterStrategy,
          generated_cover_letter: generatedCoverLetter,
          user_prompt: prompt
        })
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.detail || "Cover letter edit failed.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamedContent = '';
      let metadata = null;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'metadata') metadata = event.data;
          if (event.type === 'content_delta') {
            streamedContent += event.data;
            setGeneratedCoverLetter(previous => ({
              ...previous,
              content: streamedContent
            }));
          }
        }
        if (done) break;
      }
      if (!metadata) throw new Error("The edit stream returned no metadata.");
      const previousLetter = generatedCoverLetter;
      const nextLetter = {
        ...previousLetter,
        content: streamedContent,
        word_count: (streamedContent.match(/\b[\w'-]+\b/g) || []).length
      };
      setGeneratedCoverLetter(nextLetter);
      setCoverLetterEditHistory(previous => [...previous, {
        ...metadata,
        before_letter: previousLetter,
        after_letter: nextLetter,
        undone: false
      }]);
      return true;
    } catch (error) {
      console.error(error);
      alert("Error editing cover letter: " + error.message);
      return false;
    } finally {
      setCoverLetterEditStreaming(false);
    }
  };

  const handleUndoCoverLetterEdit = () => {
    setCoverLetterEditHistory(previous => {
      const latestIndex = previous.findLastIndex(item => !item.undone);
      if (latestIndex < 0) return previous;
      const latest = previous[latestIndex];
      setGeneratedCoverLetter(latest.before_letter);
      return previous.map((item, index) => (
        index === latestIndex ? { ...item, undone: true } : item
      ));
    });
  };

  const handleRestoreCoverLetterEdit = (editId) => {
    const snapshot = coverLetterEditHistory.find(item => item.edit_id === editId);
    if (snapshot) {
      setGeneratedCoverLetter(snapshot.after_letter);
      setCoverLetterEditHistory(previous => previous.map(item => (
        item.edit_id === editId ? { ...item, undone: false } : item
      )));
    }
  };

  const handleGenerateCoverLetter = async (contextAnswers = {}, skippedQuestions = []) => {
    // React passes the SyntheticEvent when this handler is used directly as
    // onClick. Never treat that DOM-backed event as serializable user answers.
    if (
      !contextAnswers
      || typeof contextAnswers !== 'object'
      || contextAnswers.nativeEvent
      || contextAnswers.currentTarget
      || Array.isArray(contextAnswers)
    ) {
      contextAnswers = {};
    }
    if (!Array.isArray(skippedQuestions)) skippedQuestions = [];
    if (!parsedResume) {
      alert("Please select or upload a resume before drafting a cover letter.");
      return;
    }
    if (!jobAnalysis) {
      alert("Please analyze a job description first.");
      return;
    }

    setLoading(true);
    setLoadingProgress(10);
    setLoadingMessage("Building cover letter context...");

    const clInterval = setInterval(() => {
      setLoadingProgress((prev) => (prev >= 90 ? 90 : prev + 15));
    }, 200);

    let activeParsed = parsedResume;

    try {
      // Lazy parse if resume experience is empty and raw_text is present
      if (parsedResume.id && (!parsedResume.experience || parsedResume.experience.length === 0) && parsedResume.raw_text) {
        setLoadingMessage("Parsing Resume with AI for Cover Letter...");
        setLoadingProgress(15);

        const token = session?.access_token || localStorage.getItem('access_token');
        const parseHeaders = {};
        if (token) parseHeaders["Authorization"] = `Bearer ${token}`;
        if (apiKey) parseHeaders["x-groq-key"] = apiKey;

        const parseRes = await fetch(`${apiUrl}/api/v1/resumes/${parsedResume.id}/parse`, {
          method: "POST",
          headers: parseHeaders
        });

        if (!parseRes.ok) {
          throw new Error("AI parsing on-demand failed: " + (await parseRes.json()).detail);
        }

        const updatedRecord = await parseRes.json();
        activeParsed = {
          ...(updatedRecord.parsed_content || updatedRecord),
          id: updatedRecord.id,
          file_name: updatedRecord.file_name,
          file_size: updatedRecord.file_size,
          file_type: updatedRecord.file_type,
          created_at: updatedRecord.created_at
        };
        setParsedResume(activeParsed);
        if (isExtension) {
          chrome.storage.local.set({ parsedResume: activeParsed });
        } else {
          localStorage.setItem('parsed_resume', JSON.stringify(activeParsed));
        }

        setLoadingMessage("AI Parsing Complete! Drafting Cover Letter...");
        setLoadingProgress(35);
      }

      const headers = {};
      if (apiKey) headers["x-groq-key"] = apiKey;

      const response = await fetch(`${apiUrl}/api/cover-letter/context`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          resume: toRenderableResume(activeParsed),
          resume_intelligence: activeParsed.resume_intelligence || null,
          jd: getCanonicalJobAnalysis(),
          jd_intelligence: getCanonicalJobAnalysis()?.jd_intelligence || null,
          resume_id: activeParsed.id || null,
          jd_id: jobAnalysis.id || jobAnalysis.jd_id || null,
          user_answers: contextAnswers,
          skipped_questions: skippedQuestions
        })
      });

      if (!response.ok) {
        throw new Error("Failed to build cover letter context: " + (await response.json()).detail);
      }

      const contextResult = await response.json();
      setCoverLetter(null);
      setCoverLetterContext(contextResult);
      setCoverLetterStrategy(null);
      setGeneratedCoverLetter(null);
      setCoverLetterReview(null);
      setCoverLetterEditHistory([]);
      clearInterval(clInterval);
      setLoadingProgress(100);
      setLoading(false);
      navigate('/cover-letter');
      return contextResult;

      // Auto-update cover letter in current application session
      if (activeApplicationId) {
        try {
          const token = session?.access_token || localStorage.getItem('access_token');
          if (token) {
            const matchedAppRes = await fetch(`${apiUrl}/api/v1/applications/`, {
              headers: { "Authorization": `Bearer ${token}` }
            });
            if (matchedAppRes.ok) {
              const appList = await matchedAppRes.json();
              setApplications(appList);
              const currentApp = appList.find(a => a.id === activeApplicationId);
              if (currentApp) {
                const updatedTimeline = [...(currentApp.timeline || [])];
                updatedTimeline.push({
                  event: "Cover Letter Generated",
                  timestamp: new Date().toISOString()
                });
                await fetch(`${apiUrl}/api/v1/applications/${activeApplicationId}`, {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                  },
                  body: JSON.stringify({
                    cover_letter_version: "v1",
                    timeline: updatedTimeline
                  })
                });
              }
            }
          }
        } catch (err) {
          console.error("Failed to update application session with cover letter:", err);
        }
      }

      clearInterval(clInterval);
      setLoadingProgress(100);
      setLoading(false);
      navigate('/cover-letter');
    } catch (error) {
      clearInterval(clInterval);
      setLoading(false);
      console.error(error);
      alert("Error: " + error.message);
    }
  };

  const handleCopyToClipboard = () => {
    if (!coverLetter) return;
    const fullText = `${coverLetter.date}\n\nTo:\n${coverLetter.recipient_name}\n${coverLetter.company_name}\n\n${coverLetter.salutation}\n\n${coverLetter.body}\n\n${coverLetter.signoff}`;
    navigator.clipboard.writeText(fullText);
    alert("Cover Letter copied to clipboard!");
  };

  return (
    <AppContext.Provider value={{
      user, session, loadingAuth, logout,
      darkMode, setDarkMode, toggleDarkMode,
      showSettings, setShowSettings,
      apiKey, setApiKey,
      apiUrl, setApiUrl,
      resumeFile, setResumeFile,
      dragActive, setDragActive,
      jobText, setJobText,
      companyName, setCompanyName,
      jobTitle, setJobTitle,
      lastAnalyzedUrl, setLastAnalyzedUrl,
      parsedResume, setParsedResume,
      jobAnalysis, setJobAnalysis,
      canonicalJobAnalysis: jobAnalysis,
      jdFingerprint: jdFingerprintRef.current,
      getCanonicalJobAnalysis,
      comparison, setComparison,
      tailoredResume, setTailoredResume,
      coverLetter, setCoverLetter,
      coverLetterContext, setCoverLetterContext,
      coverLetterStrategy, setCoverLetterStrategy,
      generatedCoverLetter, setGeneratedCoverLetter,
      coverLetterReview, setCoverLetterReview,
      coverLetterEditHistory, setCoverLetterEditHistory,
      coverLetterEditStreaming,
      applications, setApplications,
      activeApplicationId, setActiveApplicationId,
      pendingApplicationSubmitted, setPendingApplicationSubmitted,
      fetchApplications, updateApplicationStage, syncCurrentJobToTracker,
      selectedSkills, setSelectedSkills,
      selectedRewrites, setSelectedRewrites,
      acceptSummary, setAcceptSummary,
      selectedSections, setSelectedSections,
      tailoringIntensity, setTailoringIntensity,
      reviewSuggestions, setReviewSuggestions,
      liveATS, setLiveATS,
      isRefineStreaming, setIsRefineStreaming,
      fetchLiveATSScore,
      selectedTemplate, setSelectedTemplate,
      finalPdfArtifact, setFinalPdfArtifact,
      customFileName, setCustomFileName,
      jobDetectionStatus, setJobDetectionStatus,
      jobDetectionMeta, setJobDetectionMeta,
      loadingProgress, setLoadingProgress,
      loadingMessage, setLoadingMessage,
      loadingType, setLoadingType,
      loading, setLoading,
      apiError, setApiError,
      subscription, setSubscription,
      usage, setUsage,
      fetchSubscription,
      jobPreferences, setJobPreferences,
      loadingPreferences,
      hasCompletedPreferences,
      fetchJobPreferences,
      saveJobPreferences,
      isExtension,
      loadingResume,
      hasRedirectedOnStartup,
      setHasRedirectedOnStartup,
      resumesList, setResumesList,
      fetchResumesList,
      refreshActiveResumeFromBackend,
      handleDeleteResume,
      handleActivateResume,
      recordResumeUsage,
      fetchResumeVersions,
      listResumeVersions: fetchResumeVersions,
      createResumeVersion,
      setCurrentResumeVersion,
      updateResumeVersion,
      duplicateResumeVersion,
      restoreResumeVersion,
      deleteResumeVersion,
      compareResumeVersions,
      handleScanPage,
      handleExtractJob,
      handleCompareActiveResumeToJob,
      handleParseResume,
      handleRunGapAnalysis,
      handleGenerateFinalResume,
      handleDownloadFinalPDF,
      handleDownloadCoverLetterPDF,
      handleGenerateCoverLetter,
      handleBuildCoverLetterStrategy,
      handleGenerateFirstCoverLetterDraft,
      handleEditCoverLetter,
      handleUndoCoverLetterEdit,
      handleRestoreCoverLetterEdit,
      handleCopyToClipboard
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside an AppProvider");
  return context;
}


