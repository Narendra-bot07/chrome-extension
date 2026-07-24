import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { compressResumeData } from '../utils/resumeCompression';
import { toRenderableResume } from '../utils/renderableResume';
import { mergeReviewResume, validateWorkingResume } from '../utils/resumeReviewMerge';
import {
  assessBrowserJobEvidence, captureActiveTabJobEvidence, classifyBrowserPageUrl,
  collectJobSkills, isExtractableHttpUrl, validateJDResponse
} from '../services/jdExtractionFlow';

const AppContext = createContext();

export function AppProvider({ children }) {
  const navigate = useNavigate();

  // Theme & Settings
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');

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
  const [jobAnalysis, setJobAnalysis] = useState(null);
  const [jobSessionHydrated, setJobSessionHydrated] = useState(
    () => !(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)
  );
  const [comparison, setComparison] = useState(null);
  const [tailoredResume, setTailoredResume] = useState(null);
  const [coverLetter, setCoverLetter] = useState(null);

  // Summarization & Checklist states
  const [applications, setApplications] = useState([]);
  const [activeApplicationId, setActiveApplicationId] = useState(null);
  const [pendingApplicationSubmitted, setPendingApplicationSubmitted] = useState(null);
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [selectedRewrites, setSelectedRewrites] = useState([]);
  const [acceptSummary, setAcceptSummary] = useState(false);

  // Config states
  const [selectedSections, setSelectedSections] = useState([
    'summary', 'skills', 'experience', 'projects'
  ]);
  const [tailoringIntensity, setTailoringIntensity] = useState('balanced');
  const [jobDetectionStatus, setJobDetectionStatus] = useState("idle");
  const [jobDetectionMeta, setJobDetectionMeta] = useState(null);
  const [reviewSuggestions, setReviewSuggestions] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('ExecutiveATS');
  const [customFileName, setCustomFileName] = useState('');

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
          if (Array.isArray(result.resumeReviewSession?.suggestions)) {
            setReviewSuggestions(result.resumeReviewSession.suggestions);
          }
          const saved = result.jobExtractionSession;
          const finishHydration = (activeUrl = '') => {
            const savedUrl = saved?.lastAnalyzedUrl || saved?.jobAnalysis?.source_url || '';
            const savedIdentity = getJobIdentityFromUrl(savedUrl);
            const activeIsJobPage = isExtractableHttpUrl(activeUrl);
            const activeIsExtensionPage = /^chrome-extension:\/\//i.test(activeUrl);
            const activeIdentity = activeIsJobPage
              ? getJobIdentityFromUrl(activeUrl)
              : '';
            const sessionMatchesActiveJob = Boolean(
              saved?.jobAnalysis
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
            setJobAnalysis(saved.jobAnalysis);
            setJobText(saved.jobText || saved.jobAnalysis.description || '');
            setCompanyName(saved.companyName || saved.jobAnalysis.company || saved.jobAnalysis.company_name || '');
            setJobTitle(saved.jobTitle || saved.jobAnalysis.title || saved.jobAnalysis.job_title || '');
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
            } else if (saved?.jobAnalysis) {
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
      if (savedJobAnalysis) {
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
          if (Array.isArray(review?.suggestions)) setReviewSuggestions(review.suggestions);
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

  const updateApplicationStage = async (appId, newStage) => {
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token || !appId) return;

      const app = applications.find(a => a.id === appId);
      if (!app) return;

      const updatedTimeline = [...(app.timeline || [])];
      updatedTimeline.push({
        event: `Moved to ${newStage}`,
        timestamp: new Date().toISOString()
      });

      const res = await fetch(`${apiUrl}/api/v1/applications/${appId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          current_stage: newStage,
          timeline: updatedTimeline
        })
      });
      if (res.ok) {
        await fetchApplications();
      }
    } catch (err) {
      console.error("Failed to update application stage:", err);
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
        chrome.storage.session.set({
          jobExtractionSession: {
            jobAnalysis,
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
      localStorage.setItem('job_analysis', JSON.stringify(jobAnalysis));
      if (jobText) localStorage.setItem('job_text', jobText);
      if (companyName) localStorage.setItem('company_name', companyName);
      if (jobTitle) localStorage.setItem('job_title', jobTitle);
    } else {
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
      suggestions: reviewSuggestions
    };
    if (isExtension && chrome.storage.session) {
      if (reviewSuggestions.length) chrome.storage.session.set({ resumeReviewSession: payload });
      else chrome.storage.session.remove('resumeReviewSession');
    } else if (reviewSuggestions.length) {
      sessionStorage.setItem('resume_review_session', JSON.stringify(payload));
    } else {
      sessionStorage.removeItem('resume_review_session');
    }
  }, [reviewSuggestions, parsedResume?.id, currentJobIdentity, isExtension]);

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

  const syncCurrentJobToTracker = async (currentStage = "Ready To Apply", notes = "") => {
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
        { event: "Synced to Job Tracker", timestamp: new Date().toISOString() }
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
      job_title: jobTitle || "",
      location: jobAnalysis?.location || "Remote",
      job_url: lastAnalyzedUrl || "",
      resume_version: tailoredResume ? "v1 (Tailored)" : null,
      cover_letter_version: coverLetter ? "v1" : null,
      ats_score: strictScore(comparison?.ats_score_after),
      resume_match_score: strictScore(
        comparison?.ats_score_before ?? comparison?.match_score ?? comparison?.score
      ),
      current_stage: currentStage,
      notes: notes.trim() || null,
      timeline: [{
        event: "Synced to Job Tracker",
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
  const handleParseResume = async (fileOverride = null) => {
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
        body: formData
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
        body: JSON.stringify({
          resume_id: activeParsed.id,
          resume: toRenderableResume(activeParsed),
          job: jobAnalysis
        })
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

      // Deterministically recover descriptions and actual PDF annotation URLs
      // from the immutable source file. This is intentionally not an AI call.
      if (activeParsed.id && activeParsed.source_preservation_version !== '7.3') {
        setLoadingMessage("Preserving original descriptions and links...");
        const recoveryToken = session?.access_token || localStorage.getItem('access_token');
        const recoveryRes = await fetch(
          `${apiUrl}/api/v1/resumes/${activeParsed.id}/recover-source`,
          {
            method: "POST",
            headers: recoveryToken ? { "Authorization": `Bearer ${recoveryToken}` } : {}
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
        body: JSON.stringify({
          resume_id: activeParsed.id,
          resume: toRenderableResume(activeParsed),
          job: jobAnalysis
        })
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

      if (selectedSections.includes('summary') && patch.summary) {
        list.push({
          id: 'summary:0',
          change_id: 'summary:0',
          category: 'Professional Summary',
          status: 'pending',
          original: activeParsed.summary || '',
          suggested: patch.summary,
          reason: 'Aligns summary with job keywords and targets core requirements.',
          atsImpact: 3,
          confidence: 'High',
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
              reason: 'Improves wording and adds relevant ATS keywords.',
              atsImpact: 5,
              confidence: 'High',
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
              reason: 'Improves wording and adds relevant ATS keywords.',
              atsImpact: 5,
              confidence: 'High',
              sectionType: 'projects',
              itemIndex: itemIdx,
              bulletIndex: bulletIdx
            });
          });
        });
      }

      if (selectedSections.includes('skills') && patch.skills_append && patch.skills_append.length > 0) {
        patch.skills_append.forEach(skill => {
          list.push({
            id: `skills:${String(skill).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            change_id: `skills:${String(skill).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            category: 'Skills',
            status: 'pending',
            original: '(Skill not present)',
            suggested: `Add skill: ${skill}`,
            reason: 'Requested directly in job description requirements.',
            atsImpact: 2,
            confidence: 'High',
            sectionType: 'skills',
            skillName: skill
          });
        });
      }

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

      // Re-score the exact resume produced from the user's accepted changes.
      // Do not persist the projected score for all suggested changes.
      let exactTailoredScore = null;
      try {
        const scoreToken = session?.access_token || localStorage.getItem('access_token');
        const scoreResponse = await fetch(`${apiUrl}/api/score`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(scoreToken ? { "Authorization": `Bearer ${scoreToken}` } : {})
          },
          body: JSON.stringify({ resume: tailoredResult, job: jobAnalysis })
        });
        if (scoreResponse.ok) {
          const scoreResult = await scoreResponse.json();
          const numericScore = Number(scoreResult.ats_score);
          if (Number.isFinite(numericScore) && numericScore >= 0 && numericScore <= 100) {
            exactTailoredScore = numericScore;
            setComparison((previous) => ({ ...(previous || {}), ats_score_after: numericScore }));
          }
        } else {
          console.warn("Strict ATS scoring failed", await scoreResponse.text());
        }
      } catch (scoreError) {
        console.warn("Strict ATS scoring unavailable", scoreError);
      }

      setLoading(false);
      navigate('/templates');
    } catch (err) {
      console.error(err);
      setApiError(err.message || "Failed to apply changes.");
      setLoading(false);
    }
  };

  const handleDownloadFinalPDF = async (layoutLevel) => {
    const activeRes = tailoredResume || parsedResume;
    if (!activeRes) return;

    let finalRes = { ...activeRes };
    let originalForAudit = parsedResume || activeRes;

    setLoading(true);
    setLoadingProgress(50);
    setLoadingMessage("Finalizing resume structure...");

    try {
      // Existing tailored state may predate the latest deterministic source
      // repair. Refresh it immediately at export and replace only sections the
      // tailoring workflow never edits.
      if (parsedResume?.id && parsedResume.source_preservation_version !== '7.3') {
        setLoadingMessage("Repairing original achievement and certification evidence...");
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
          approved_additions: reviewSuggestions
            .filter(suggestion =>
              suggestion.status === 'accepted'
              && suggestion.sectionType === 'skills'
              && suggestion.skillName
            )
            .map(suggestion => suggestion.skillName),
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
        const safeMessage = typeof detail === 'object' && detail?.message
          ? detail.message
          : "We could not finalize the resume automatically. Your original resume data is safe. Please retry.";
        throw new Error(
          requestId ? `${safeMessage} Support ID: ${requestId}` : safeMessage
        );
      }

      setLoadingMessage("Validating the final document...");
      const blob = await response.blob();
      const rawName = activeRes.personal_info?.name || 'User';
      const cleanUser = rawName.replace(/\s+/g, '_');
      const cleanCompany = (companyName || 'Company').replace(/\s+/g, '_');
      const defaultFilename = `${cleanUser}_${cleanCompany}_Resume.pdf`;
      const filename = customFileName.trim() ? (customFileName.endsWith('.pdf') ? customFileName : `${customFileName}.pdf`) : defaultFilename;

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
                  event: "Resume Downloaded",
                  timestamp: new Date().toISOString()
                });
                await fetch(`${apiUrl}/api/v1/applications/${activeApplicationId}`, {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                  },
                  body: JSON.stringify({
                    timeline: updatedTimeline
                  })
                });
              }
            }
          }
        } catch (err) {
          console.error("Failed to update timeline with download:", err);
        }
      }
    } catch (e) {
      console.error(e);
      alert("Error generating PDF: " + e.message);
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

  const handleGenerateCoverLetter = async () => {
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
    setLoadingMessage("Drafting tailored cover letter...");

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

      const response = await fetch(`${apiUrl}/api/cover-letter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          resume: toRenderableResume(activeParsed),
          job: jobAnalysis
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate cover letter: " + (await response.json()).detail);
      }

      const clResult = await response.json();
      setCoverLetter(clResult);

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
      comparison, setComparison,
      tailoredResume, setTailoredResume,
      coverLetter, setCoverLetter,
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
      selectedTemplate, setSelectedTemplate,
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
      handleScanPage,
      handleExtractJob,
      handleCompareActiveResumeToJob,
      handleParseResume,
      handleRunGapAnalysis,
      handleGenerateFinalResume,
      handleDownloadFinalPDF,
      handleDownloadCoverLetterPDF,
      handleGenerateCoverLetter,
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


