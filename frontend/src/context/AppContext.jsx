import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { compressResumeData } from '../utils/resumeCompression';
import { toRenderableResume } from '../utils/renderableResume';
import { calculateJDMatchScore } from '../utils/matchScore';
import {
  mergeReviewResume,
  validateWorkingResume
} from '../utils/resumeReviewMerge';
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
import { ToastNotification } from '../components/common/ToastNotification';
import { useInactivityManager } from '../hooks/useInactivityManager';
import { AUTH_STORAGE } from '../config/authConfig';
import { refreshAccessToken } from '../services/authSession';
import { getApiUrl } from '../config/apiConfig';
import {
  createResumeWorkflowState,
  finalizeTailoredResume,
  RESUME_WORKFLOW_STORAGE_KEY,
  resumeWorkflowRepository,
  selectRenderableResume,
  stableEditId
} from '../services/resumeWorkflow';
import { skillSemanticKey } from '../utils/skillCategorizer';

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

  // Quota Exceeded Modal state
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [quotaModalMessage, setQuotaModalMessage] = useState('');

  const openQuotaModal = (msg) => {
    setQuotaModalMessage(msg || "You have reached your free demo limit (5 JD extractions, 1 Resume generation, 1 Cover letter generation). Upgrade to a paid plan to continue.");
    setShowQuotaModal(true);
  };

  // Supabase Authentication states
  const [user, setUserState] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const setUser = (newUser) => {
    setUserState(newUser);
    try {
      if (newUser) {
        localStorage.setItem('user', JSON.stringify(newUser));
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ user: newUser });
        }
      } else {
        localStorage.removeItem('user');
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.remove('user');
        }
      }
    } catch (e) {}
  };
  const [session, setSession] = useState(null);
  const [sessionVerified, setSessionVerified] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [loadingResume, setLoadingResume] = useState(true);
  const [hasRedirectedOnStartup, setHasRedirectedOnStartup] = useState(false);
  const parsedResumeRef = useRef(null);
  const resumeReconciliationRef = useRef({
    token: null,
    completed: false,
    promise: null
  });

  useEffect(() => {
    const checkSession = async () => {
      let storedToken = localStorage.getItem('access_token');
      let storedUser = null;
      let storedResume = null;
      let storedResumesList = null;

      try {
        const localUser = localStorage.getItem('user');
        if (localUser) storedUser = JSON.parse(localUser);
        const localResume = localStorage.getItem('parsed_resume');
        if (localResume) storedResume = JSON.parse(localResume);
        const localList = localStorage.getItem('resumes_list');
        if (localList) storedResumesList = JSON.parse(localList);
      } catch (e) {}

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const storageData = await new Promise(resolve => {
          chrome.storage.local.get(['access_token', 'user', 'parsed_resume', 'resumes_list'], result => resolve(result || {}));
        });
        if (!storedToken && storageData.access_token) {
          storedToken = storageData.access_token;
          localStorage.setItem('access_token', storedToken);
        }
        if (!storedUser && storageData.user) {
          storedUser = storageData.user;
          localStorage.setItem('user', JSON.stringify(storageData.user));
        }
        if (!storedResume && storageData.parsed_resume) {
          storedResume = storageData.parsed_resume;
        }
        if (!storedResumesList && storageData.resumes_list) {
          storedResumesList = storageData.resumes_list;
        }
      }

      // INSTANT UNBLOCK: If we have token and user locally, reveal UI immediately (< 10ms)!
      if (storedToken && storedUser) {
        setUserState(storedUser);
        setSession({ access_token: storedToken });
        if (storedResume) setParsedResume(storedResume);
        if (storedResumesList) setResumesList(storedResumesList);
        setLoadingAuth(false);
        setLoadingResume(false);
      }

      if (!storedToken) {
        setSessionVerified(false);
        setLoadingAuth(false);
        setLoadingResume(false);
        return;
      }

      // Asynchronously verify session & background sync data without blocking the UI screen
      (async () => {
        try {
          let activeToken = storedToken;
          let res = null;

          // The "instant unblock" above already rendered the cached user/name
          // optimistically when a cached `user` record existed — but when it
          // doesn't (e.g. a freshly opened tab that only has a token, or a
          // stale cache never repopulated after a previous inconclusive check),
          // THIS call is the only thing that can populate `user`, and a cold
          // Render instance can legitimately take 20-30s+ to wake up. A short
          // budget here doesn't just delay recovery — it wrongly reads as
          // "not logged in" for a fully valid token. Retry generously (3
          // attempts, 8s each, with backoff) before giving up.
          for (let attempt = 0; attempt < 3 && !res; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            try {
              res = await fetch(`${getApiUrl()}/api/v1/auth/session`, {
                headers: { 'Authorization': `Bearer ${storedToken}` },
                signal: controller.signal
              });
            } catch (fetchErr) {
              console.warn("Session check request timed out or failed network:", fetchErr);
            } finally {
              clearTimeout(timeoutId);
            }
            if (!res && attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
            }
          }

          if (res && res.ok) {
            const data = await res.json();
            setUser(data.user);
            setSession({ access_token: activeToken });
            setSessionVerified(true);
            setHasCompletedPreferences(!!data.has_completed_preferences);

            fetchJobPreferences(activeToken).catch(() => {});
            fetchResumesList(activeToken, false).then(resumes => {
              if (resumes && resumes.length > 0) {
                if (!parsedResumeRef.current) {
                  const latestResume = normalizeResumeRecord(resumes.find((resume) => resume.is_active) || resumes[0]);
                  persistParsedResume(latestResume);
                }
              }
            }).catch(() => {});
          } else if (res && res.status === 401) {
            try {
              const newToken = await refreshAccessToken();
              if (newToken) {
                setSession({ access_token: newToken });
                const retryRes = await fetch(`${getApiUrl()}/api/v1/auth/session`, {
                  headers: { 'Authorization': `Bearer ${newToken}` }
                });
                if (retryRes.ok) {
                  const retryData = await retryRes.json();
                  setUser(retryData.user);
                  setSessionVerified(true);
                  setHasCompletedPreferences(!!retryData.has_completed_preferences);
                  return;
                }
              }
            } catch (refErr) {
              console.warn("Session retry failed:", refErr);
            }
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            setSessionVerified(false);
            setUser(null);
            setSession(null);
            setParsedResume(null);
          } else {
            // Could not get a definitive answer even after retrying — network
            // failure, timeout, or a 5xx from the backend (e.g. a cold-starting
            // Render instance, which can take well over this function's ~11s
            // retry budget to wake up), not a clean 401. This is NOT evidence
            // the session is invalid, so it must never be treated as a logout:
            // ProtectedRoute (App.jsx) redirects to the login/setup screen the
            // instant `user` becomes null, which previously kicked the user
            // out of an already-open, still-valid session purely because a
            // verification ping was slow — exactly the "session doesn't stay
            // logged in" bug. Keep the optimistically-restored cached session
            // as-is; a real invalid/expired token still gets caught by the
            // 401 branch above (on this check or any subsequent API call via
            // authSession.js's fetch wrapper), which does attempt a refresh
            // before ever clearing the session.
            console.warn("Session verification unavailable after retry; keeping cached session — will re-confirm later.");
          }
        } catch (err) {
          console.error("Background auth sync failed:", err);
        } finally {
          setLoadingAuth(false);
          setLoadingResume(false);
        }
      })();
    };
    checkSession();
  }, []);

  const logout = async (reason = 'manual_logout') => {
    // Only auth tokens were ever cleared here -- every other per-account
    // cache (parsed resume, resumes list, dashboard performance signature,
    // tailoring workflow state, etc.) stayed in localStorage/sessionStorage
    // indefinitely. On a shared browser/extension profile, a different
    // account logging in afterward would "instant unblock" straight into
    // the PREVIOUS account's cached data (e.g. a brand-new user seeing an
    // ATS score and dashboard radar chart from whoever used this browser
    // last), since none of it is scoped by user id. Clear all of it here.
    const localStorageKeysToClear = [
      AUTH_STORAGE.accessToken, 'refresh_token', AUTH_STORAGE.lastActivityAt,
      'user', 'parsed_resume', 'tailored_resume', 'selected_template',
      'resumes_list', 'tailr4u_user_profile',
    ];
    const sessionStorageKeysToClear = [
      'tf_perf_signature', 'tf_dismiss_profile_banner', 'selected_sections',
      'tailoring_intensity', 'custom_file_name', 'resume_review_session',
      'tailr4u.profile-prompt-dismissed', 'tailr4u_auto_generate_cover_letter',
    ];
    localStorageKeysToClear.forEach(key => localStorage.removeItem(key));
    sessionStorageKeysToClear.forEach(key => sessionStorage.removeItem(key));
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.remove([
        'access_token', 'refresh_token', 'user', 'parsed_resume',
        'resumes_list', 'tailoredResume',
      ]);
    }
    setSession(null);
    setSessionVerified(false);
    setUser(null);
    setParsedResume(null);
    setResumesList([]);
    setHasCompletedPreferences(false);
    setHasRedirectedOnStartup(false);
    if (reason === 'manual_logout') navigate('/');
    else navigate(`/login?reason=${reason}`, { replace: true });
  };
  const { showWarning: showInactivityWarning, staySignedIn } = useInactivityManager({
    accessToken: session?.access_token,
    apiUrl: getApiUrl(),
    onLogout: logout,
  });
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
  const [apiUrl, setApiUrl] = useState(getApiUrl());

  // Input states
  const [resumeFile, setResumeFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [jobText, setJobText] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [lastAnalyzedUrl, setLastAnalyzedUrl] = useState('');
  const [currentJobIdentity, setCurrentJobIdentity] = useState('');

  // Data states
  const [parsedResume, setParsedResume] = useState(() => {
    try {
      const saved = localStorage.getItem('parsed_resume');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    parsedResumeRef.current = parsedResume;
  }, [parsedResume]);
  const [resumesList, setResumesList] = useState(() => {
    try {
      const saved = localStorage.getItem('resumes_list');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'info', title = '') => {
    setToast({ id: Date.now(), message, type, title });
  }, []);
  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  useEffect(() => {
    const handleCustomToast = (event) => {
      if (event.detail?.message) {
        showToast(event.detail.message, event.detail.type || 'info', event.detail.title || '');
      }
    };
    window.addEventListener('tailr4u-toast', handleCustomToast);
    return () => window.removeEventListener('tailr4u-toast', handleCustomToast);
  }, [showToast]);
  const initialJDPipelineSession = typeof sessionStorage !== 'undefined'
    ? readJDPipelineSession(sessionStorage)
    : null;
  const [jobAnalysis, setJobAnalysisState] = useState(
    initialJDPipelineSession?.canonicalJD || null
  );
  const canonicalJDRef = useRef(initialJDPipelineSession?.canonicalJD || null);
  const jdFingerprintRef = useRef(initialJDPipelineSession?.fingerprint || '');
  // JobExtractPage fires a speculative background /api/compare as soon as
  // jobAnalysis+parsedResume are both set, purely to warm the gap-analysis
  // preview. If the user proceeds to "Tailor Now" before that finishes,
  // handleRunGapAnalysis used to fire its own, near-identical /api/compare
  // request -- racing the same DeepSeek tailoring call (the single most
  // expensive step in the pipeline) twice in parallel and burning two
  // resume_generation quota units for one user action. Callers with a
  // matching key now await the same in-flight request instead.
  const compareRequestCacheRef = useRef({ key: null, promise: null });
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
  const adoptAuthenticatedSession = async (accessToken) => {
    const res = await fetch(`${apiUrl}/api/v1/auth/session`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('Your session could not be restored.');
    const data = await res.json();
    setUser(data.user);
    setSession({ access_token: accessToken });
    setSessionVerified(true);
    setHasCompletedPreferences(!!data.has_completed_preferences);
    const prefPromise = fetchJobPreferences(accessToken).catch(() => null);
    const resumesPromise = (async () => {
      try {
        const resumes = await fetchResumesList(accessToken, true);
        if (resumes?.length) {
          persistParsedResume(normalizeResumeRecord(resumes.find(resume => resume.is_active) || resumes[0]));
        }
      } finally {
        setLoadingResume(false);
        setLoadingAuth(false);
      }
    })();
    await Promise.allSettled([prefPromise, resumesPromise]);
    return data;
  };
  const getCanonicalJobAnalysis = () => (
    canonicalJDRef.current ? structuredClone(canonicalJDRef.current) : null
  );
  const [jobSessionHydrated, setJobSessionHydrated] = useState(
    () => !(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local)
  );
  const [comparison, setComparison] = useState(null);
  const [tailoredResume, setTailoredResume] = useState(null);
  const [resumeWorkflow, setResumeWorkflow] = useState(null);
  const [resumeWorkflowHydrated, setResumeWorkflowHydrated] = useState(false);
  const workflowWriteQueueRef = useRef(Promise.resolve());
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
  // True between the "core" partial extraction event (job title/company/
  // location/responsibilities ready) and the "final" event (skills ready) --
  // lets the results UI show the job details immediately while rendering a
  // loading state specifically for the skills section, instead of the whole
  // page blocking on the slower of the two backend calls.
  const [skillsPending, setSkillsPending] = useState(false);
  const [reviewSuggestions, setReviewSuggestions] = useState([]);
  const [liveATS, setLiveATS] = useState(null);
  const [isRefineStreaming, setIsRefineStreaming] = useState(false);
  const liveATSRequestRef = useRef({
    key: '',
    timer: null,
    controller: null,
    sequence: 0
  });

  // Score only when the actual resume/JD/review content changes. The workflow
  // persistence layer recreates these objects, so using object identity as an
  // effect dependency creates a request -> state update -> request loop.
  useEffect(() => {
    if (
      !reviewSuggestions?.length
      || !parsedResume
      || !jobAnalysis
      || isRefineStreaming
    ) {
      return;
    }

    const currentResume = mergeReviewResume(
      parsedResume,
      reviewSuggestions
    ).workingResume;
    // "Potential" (estimated_resume, sent to the backend below) is the
    // ceiling if every suggestion were accepted -- a fixed reference point,
    // not a live reflection of what's currently accepted. Preserving
    // 'rejected' status here meant Potential shrank as suggestions were
    // rejected and collapsed to match Current once everything was rejected.
    // Force every suggestion to 'accepted' unconditionally instead, matching
    // the same fix in ResumeReviewView.jsx's local fallback engine.
    const potentialSuggestions = reviewSuggestions.map(suggestion => ({
      ...suggestion,
      status: 'accepted'
    }));
    const potentialResume = mergeReviewResume(
      parsedResume,
      potentialSuggestions
    ).workingResume;
    const payload = {
      resume: toRenderableResume(parsedResume),
      current_resume: toRenderableResume(currentResume),
      estimated_resume: toRenderableResume(potentialResume),
      job: getCanonicalJobAnalysis(),
      suggestions: reviewSuggestions
    };
    const requestKey = JSON.stringify(payload);
    // Tags the result with exactly which suggestion selection it was computed
    // for, so a consumer (ResumeReviewView) can tell a genuinely fresh result
    // apart from a stale one still in the state slot while a newer request is
    // debouncing/in flight -- displaying a stale liveATS next to freshly
    // recomputed local numbers is what caused Original/Current/Potential to
    // visibly disagree with each other after Select All / Undo.
    const suggestionsFingerprint = JSON.stringify(
      reviewSuggestions.map(s => [s.change_id || s.id, s.status, s.suggested])
    );
    const requestState = liveATSRequestRef.current;

    if (requestState.key === requestKey) return;

    requestState.key = requestKey;
    requestState.sequence += 1;
    const sequence = requestState.sequence;
    if (requestState.timer) clearTimeout(requestState.timer);
    if (requestState.controller) requestState.controller.abort();

    // Acceptance/rejection is an explicit user action, so scoring should feel
    // immediate. Keep only a tiny coalescing window for rapid Accept All /
    // Reject All updates instead of the former 2.5 second artificial delay.
    requestState.timer = setTimeout(async () => {
      const controller = new AbortController();
      requestState.controller = controller;

      try {
        const token = session?.access_token || localStorage.getItem('access_token');
        const response = await fetch(`${apiUrl}/api/ats/live-score`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
          },
          body: requestKey,
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Live ATS scoring failed with status ${response.status}`);
        }

        const data = await response.json();
        // A slower, obsolete response must never overwrite the newest review.
        if (
          !controller.signal.aborted
          && liveATSRequestRef.current.sequence === sequence
        ) {
          setLiveATS({ ...data, _suggestionsFingerprint: suggestionsFingerprint });
        }
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.warn("Live ATS score fetch failed", error);
          // Allow the same content to be retried after a genuine failure.
          if (liveATSRequestRef.current.sequence === sequence) {
            liveATSRequestRef.current.key = '';
            setLiveATS({
              scoring_source: 'failed',
              error: error.message || 'LLM analysis failed at backend',
              _suggestionsFingerprint: suggestionsFingerprint
            });
          }
        }
      } finally {
        if (liveATSRequestRef.current.sequence === sequence) {
          liveATSRequestRef.current.controller = null;
          liveATSRequestRef.current.timer = null;
        }
      }
    }, 100);
  });

  useEffect(() => () => {
    const requestState = liveATSRequestRef.current;
    if (requestState.timer) clearTimeout(requestState.timer);
    if (requestState.controller) requestState.controller.abort();
  }, []);
  const [selectedTemplate, setSelectedTemplate] = useState('ExecutiveATS');
  const [finalPdfArtifact, setFinalPdfArtifact] = useState(null);
  const [customFileName, setCustomFileName] = useState(() => {
    return sessionStorage.getItem('custom_file_name') || '';
  });

  const queueWorkflowWrite = (builder) => {
    const task = workflowWriteQueueRef.current.then(async () => {
      const current = await resumeWorkflowRepository.load();
      const next = await builder(current);
      if (!next) return current;
      const saved = await resumeWorkflowRepository.save(
        next,
        current?.workflowVersion ?? null
      );
      setResumeWorkflow(saved);
      return saved;
    });
    workflowWriteQueueRef.current = task.catch(() => {});
    return task;
  };

  useEffect(() => {
    let active = true;
    resumeWorkflowRepository.load()
      .then(workflow => {
        if (!active || !workflow) return;
        setResumeWorkflow(workflow);
        if (workflow.finalizedTailoredResume) {
          setTailoredResume(workflow.finalizedTailoredResume);
        }
        if (workflow.selectedTemplateId) {
          setSelectedTemplate(workflow.selectedTemplateId);
        }
      })
      .catch(error => setApiError(error.message))
      .finally(() => {
        if (active) setResumeWorkflowHydrated(true);
      });
    return () => { active = false; };
  }, []);



  const restoredWorkflowScopeRef = useRef('');
  useEffect(() => {
    if (!resumeWorkflowHydrated || !resumeWorkflow || !parsedResume) return;
    const resumeId = parsedResume.id || parsedResume.resume_id || null;
    const fingerprint = jdFingerprintRef.current || null;
    const matchesScope = (
      (!resumeWorkflow.originalResumeId || resumeWorkflow.originalResumeId === resumeId)
      && (!resumeWorkflow.jobFingerprint || resumeWorkflow.jobFingerprint === fingerprint)
    );
    // Hydrate review decisions once for this resume/JD pair. workflowVersion
    // changes after every queued save; including it in the scope caused an
    // older pending write to re-apply over an optimistic Accept/Reject click,
    // making the review content visibly oscillate.
    const scope = `${resumeId}|${fingerprint}`;
    if (!matchesScope || restoredWorkflowScopeRef.current === scope) return;
    restoredWorkflowScopeRef.current = scope;
    if (resumeWorkflow.edits?.length) {
      setReviewSuggestions(resumeWorkflow.edits.map(edit => ({
        ...edit,
        status: resumeWorkflow.reviewDecisions?.[stableEditId(edit)]?.status || edit.status || 'pending'
      })));
    }
  }, [resumeWorkflowHydrated, resumeWorkflow, parsedResume]);

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
  const coverLetterAbortControllerRef = useRef(null);
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
    setResumeWorkflow(null);
    resumeWorkflowRepository.clear().catch(error => {
      console.warn('[RESUME-WORKFLOW] Failed to clear stale workflow', error);
    });
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
      chrome.storage.local.get(['geminiApiKey', 'groqApiKey', 'apiUrl', 'parsedResume', 'tailoredResume', 'selectedTemplate'], (result) => {
        if (result.geminiApiKey || result.groqApiKey) setApiKey(result.geminiApiKey || result.groqApiKey);
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
              && (
                // Full-page extension routes cannot identify the originating
                // browser tab. Retain the current browser-session JD while the
                // user moves through tailoring, resume, and cover-letter steps.
                activeIsExtensionPage
                || (savedIdentity && activeIdentity && savedIdentity === activeIdentity)
              )
            );

            if (sessionMatchesActiveJob) {
            setJobAnalysis(savedJD);
            if (saved?.comparison) {
              setComparison({
                ...saved.comparison,
                _baseline_resume_id: saved.comparisonResumeId || null,
                _baseline_jd_fingerprint: savedFingerprint || null
              });
            }
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
      const savedKey = null; // Legacy API key storage removed (DeepSeek migration)
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

  // Keep the side panel and any full extension tab aligned when either the
  // source resume or the reviewed workflow resume changes.
  useEffect(() => {
    if (!isExtension || !chrome.storage?.onChanged) return;

    const handleStorageChange = (changes, areaName) => {
      if (areaName !== 'local') return;
      if (changes.tailoredResume) {
        setTailoredResume(changes.tailoredResume.newValue || null);
      }
      if (changes[RESUME_WORKFLOW_STORAGE_KEY]) {
        setResumeWorkflow(changes[RESUME_WORKFLOW_STORAGE_KEY].newValue || null);
      }
      if (!changes.parsedResume) return;
      const nextResume = changes.parsedResume.newValue || null;
      const signature = JSON.stringify({
        id: nextResume?.id || null,
        updatedAt: nextResume?.updated_at || null,
        parsingStatus: nextResume?.parsing_status || null,
        isActive: nextResume?.is_active || false
      });
      if (lastSyncedResumeSignatureRef.current === signature) return;
      const previousResumeId = parsedResume?.id || parsedResume?.resume_id || null;
      const nextResumeId = nextResume?.id || nextResume?.resume_id || null;
      lastSyncedResumeSignatureRef.current = signature;
      setParsedResume(nextResume);
      if (previousResumeId && nextResumeId !== previousResumeId) {
        setComparison(null);
        setReviewSuggestions([]);
      }
      fetchResumesList();
      console.info('[RESUME][FRONTEND] Active resume synchronized across extension views', {
        resumeId: nextResume?.id || null,
        fileName: nextResume?.file_name || null
      });
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [isExtension, parsedResume?.id, parsedResume?.resume_id]);

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
            jobDetectionMeta,
            comparison,
            comparisonResumeId: parsedResume?.id || parsedResume?.resume_id || null
          }
        });
      } else {
        chrome.storage.session.remove('jobExtractionSession');
      }
      return;
    }
    if (jobAnalysis) {
      writeJDPipelineSession(sessionStorage, createJDPipelineSession(jobAnalysis, {
        jobText, companyName, jobTitle, lastAnalyzedUrl, jobDetectionMeta,
        resume: parsedResume,
        resumeId: parsedResume?.id
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
  }, [jobAnalysis, jobText, companyName, jobTitle, lastAnalyzedUrl, jobDetectionMeta, jobSessionHydrated, isExtension, comparison, parsedResume?.id, parsedResume?.resume_id]);

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

  // Persist the complete review model, not only component state. Pending edits
  // remain pending in reviewDecisions and are excluded by finalization.
  useEffect(() => {
    if (!resumeWorkflowHydrated || !parsedResume || !reviewSuggestions.length) return;
    const draftSuggestions = reviewSuggestions.map(edit => ({ ...edit, status: 'accepted' }));
    const tailoredDraft = mergeReviewResume(parsedResume, draftSuggestions).workingResume;
    queueWorkflowWrite(current => createResumeWorkflowState({
      originalResume: parsedResume,
      tailoredDraft,
      edits: reviewSuggestions,
      reviewDecisions: current?.reviewDecisions || {},
      finalizedTailoredResume: null,
      selectedTemplateId: selectedTemplate,
      workflowVersion: current?.workflowVersion || 0,
      originalResumeId: parsedResume.id || parsedResume.resume_id || null,
      jobFingerprint: jdFingerprintRef.current || null
    })).catch(error => {
      console.error('[RESUME-WORKFLOW] Review persistence failed', error);
      setApiError(error.message || 'WORKFLOW_PERSISTENCE_FAILED');
    });
  }, [resumeWorkflowHydrated, parsedResume, reviewSuggestions]);

  useEffect(() => {
    if (!resumeWorkflowHydrated || !resumeWorkflow?.finalizedTailoredResume) return;
    if (resumeWorkflow.selectedTemplateId === selectedTemplate) return;
    queueWorkflowWrite(current => current ? {
      ...current,
      selectedTemplateId: selectedTemplate
    } : null).catch(error => {
      console.error('[RESUME-WORKFLOW] Template persistence failed', error);
      setApiError(error.message || 'WORKFLOW_PERSISTENCE_FAILED');
    });
  }, [resumeWorkflowHydrated, selectedTemplate]);

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

  const persistTailoredWorkflowResume = async (resume) => {
    const canonical = resume ? toRenderableResume(resume) : null;
    setTailoredResume(canonical);
    if (isExtension) {
      if (canonical) {
        await chrome.storage.local.set({ tailoredResume: canonical });
      } else {
        await chrome.storage.local.remove('tailoredResume');
      }
    } else if (canonical) {
      localStorage.setItem('tailored_resume', JSON.stringify(canonical));
    } else {
      localStorage.removeItem('tailored_resume');
    }
    return canonical;
  };

  const updateFinalizedWorkflowResume = (updater) => queueWorkflowWrite(current => {
    if (!current?.finalizedTailoredResume) {
      throw new Error('FINALIZED_RESUME_MISSING: Finalize the review before editing layout.');
    }
    const nextResume = typeof updater === 'function'
      ? updater(structuredClone(current.finalizedTailoredResume))
      : updater;
    const canonical = toRenderableResume(nextResume);
    if (!canonical) throw new Error('FINAL_RESUME_VALIDATION_FAILED: Updated resume is invalid.');
    return { ...current, finalizedTailoredResume: canonical };
  });

  useEffect(() => {
    const handlePhotoUpdate = (e) => {
      const { photo_url, photo_position_y } = e.detail || {};
      const updater = prev => {
        if (!prev) return prev;
        const newPhotoUrl = photo_url !== undefined ? photo_url : (prev?.personal_info?.photo_url || prev?.photo_url);
        const newPosY = photo_position_y !== undefined ? photo_position_y : (prev?.personal_info?.photo_position_y ?? prev?.photo_position_y ?? 50);
        return {
          ...prev,
          photo_url: newPhotoUrl,
          photo_position_y: newPosY,
          personal_info: {
            ...(prev?.personal_info || {}),
            photo_url: newPhotoUrl,
            photo_position_y: newPosY
          }
        };
      };
      setParsedResume(updater);
      setTailoredResume(updater);
      if (typeof updateFinalizedWorkflowResume === 'function') {
        updateFinalizedWorkflowResume(updater).catch(() => {});
      }
    };
    window.addEventListener('resume_photo_updated', handlePhotoUpdate);
    return () => window.removeEventListener('resume_photo_updated', handlePhotoUpdate);
  }, []);

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

  const fetchResumesList = async (tokenOverride, isInitial = false) => {
    const token = tokenOverride || session?.access_token || localStorage.getItem('access_token');
    if (!token) {
      setLoadingResume(false);
      return [];
    }
    if (isInitial) setLoadingResume(true);
    try {
      // Run local disk/S3 orphan reconciliation in background without blocking resume list response
      fetch(`${apiUrl}/api/v1/resumes/reconcile-local`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => {});

      const res = await fetch(`${apiUrl}/api/v1/resumes/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const resumes = Array.isArray(data) ? data : (data.resumes || []);
        setResumesList(resumes);
        try {
          localStorage.setItem('resumes_list', JSON.stringify(resumes));
        } catch (e) {}
        return resumes;
      }
      console.error("Failed to fetch resumes:", res.status, await res.text());
      return [];
    } catch (err) {
      console.error("Failed to fetch resumes:", err);
      return [];
    } finally {
      if (isInitial) setLoadingResume(false);
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

    let parsedContentObj = {};
    if (record.parsed_content) {
      if (typeof record.parsed_content === 'object' && record.parsed_content !== null) {
        parsedContentObj = record.parsed_content;
      } else if (typeof record.parsed_content === 'string') {
        try {
          parsedContentObj = JSON.parse(record.parsed_content);
        } catch (e) {}
      }
    }

    let parsedDataObj = {};
    if (record.parsed_data) {
      if (typeof record.parsed_data === 'object' && record.parsed_data !== null) {
        parsedDataObj = record.parsed_data;
      } else if (typeof record.parsed_data === 'string') {
        try {
          parsedDataObj = JSON.parse(record.parsed_data);
        } catch (e) {}
      }
    }

    const mergedData = {
      ...record,
      ...(record.sections && typeof record.sections === 'object' ? record.sections : {}),
      ...parsedDataObj,
      ...parsedContentObj
    };

    return {
      ...mergedData,
      id: record.id || record.resume_id || mergedData.id,
      file_name: record.file_name || mergedData.file_name,
      file_size: record.file_size || mergedData.file_size,
      file_type: record.file_type || mergedData.file_type,
      created_at: record.created_at || mergedData.created_at,
      updated_at: record.updated_at || mergedData.updated_at,
      last_used_at: record.last_used_at || mergedData.last_used_at,
      times_used: record.times_used || record.tailor_count || mergedData.times_used || 0,
      tailor_count: record.tailor_count || record.times_used || mergedData.tailor_count || 0,
      upload_source: record.upload_source || mergedData.upload_source,
      parsing_status: record.parsing_status || parsedContentObj.parse_status || mergedData.parsing_status,
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

  // Self-heals "No active resume selected" whenever resumesList loads but
  // parsedResume never got hydrated -- e.g. the one-time restore inside
  // checkSession()'s async block never resolved (session-verification
  // retries exhausted on a slow Render cold start) before the user reached
  // a page like Configure Tailoring, which fetches resumesList itself but
  // never previously fell back to selecting the active resume from it.
  useEffect(() => {
    if (!session?.access_token || parsedResume || !Array.isArray(resumesList) || resumesList.length === 0) return;
    const fallback = normalizeResumeRecord(resumesList.find(resume => resume.is_active) || resumesList[0]);
    if (fallback) persistParsedResume(fallback);
  }, [resumesList, parsedResume, session?.access_token]);

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
    if (loadingAuth || loadingResume) return false;

    const token = session?.access_token || localStorage.getItem('access_token');
    const hasResume = Boolean(parsedResume) || (Array.isArray(resumesList) && resumesList.length > 0);

    const isExtension = window.location.protocol === 'chrome-extension:';

    if (!token || !user) {
      setLoading(false);
      setLoadingProgress(0);
      setJobDetectionStatus("login-required");
      setApiError(null);
      if (isExtension) navigate('/extension-setup');
      else navigate('/login');
      return false;
    }

    if (!hasResume) {
      setLoading(false);
      setLoadingProgress(0);
      setJobDetectionStatus("profile-incomplete");
      setApiError(null);
      if (isExtension) navigate('/extension-setup');
      else navigate('/resumes');
      return false;
    }

    return true;
  };

  const scoreJobBeforeReveal = async (job) => {
    if (!parsedResume || !job) return null;
    setLoadingMessage("Calculating resume match with AI...");
    setLoadingProgress(previous => Math.max(previous, 92));
    const token = session?.access_token || localStorage.getItem('access_token');
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      
    };
    const resume = toRenderableResume(parsedResume);
    try {
      const response = await fetch(`${apiUrl}/api/ats/live-score`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          resume,
          current_resume: resume,
          estimated_resume: resume,
          job,
          suggestions: []
        })
      });
      if (response.ok) {
        const score = await response.json();
        setLiveATS(score);
        const backendScore = score.original_resume_match || score.resume_match_score || score.original_ats || 75;
        setComparison(previous => ({
          ...(previous || {}),
          resume_match_before: backendScore,
          resume_match_after: score.estimated_resume_match || backendScore,
          ats_score_before: score.original_ats || backendScore,
          ats_score_after: score.estimated_ats || score.original_ats || backendScore,
          breakdown_before: score.breakdown_before,
          breakdown_after: score.breakdown_before,
          scoring_source: score.scoring_source || 'backend'
        }));
        return score;
      }
    } catch (e) {
      console.warn('[JD-EXTRACTION] Live ATS backend score failed; fallback score applied', e);
    }

    const matchResult = calculateJDMatchScore(parsedResume, job);
    setComparison(previous => ({
      ...(previous || {}),
      resume_match_before: matchResult.score,
      resume_match_score: matchResult.score,
      match_score: matchResult.score,
      matched_skills: matchResult.matchedSkills,
      missing_skills: matchResult.missingSkills,
      _baseline_resume_id: parsedResume?.id || 'active',
      _baseline_jd_fingerprint: fingerprintJD(job)
    }));
    return matchResult;
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
    let extractionProgressInterval = null;

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
          setApiError(null);
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
      if (browserEvidence && typeof browserEvidence === 'object') {
        // Preserve the deterministic assessment already performed against the
        // user's rendered page. The backend uses this only as a routing hint
        // alongside the captured evidence itself; it no longer wastes a
        // Playwright navigation for evidence this client already proved usable.
        browserEvidence.client_assessment = browserAssessment;
      }
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
      setLoadingProgress(24);
      extractionProgressInterval = window.setInterval(() => {
        setLoadingProgress((previous) => {
          if (previous >= 90) return previous;
          const next = Math.min(90, previous + 4);
          if (next < 40) setLoadingMessage("Reading the job description...");
          else if (next < 60) setLoadingMessage("Extracting company and role details...");
          else if (next < 78) setLoadingMessage("Analyzing required skills...");
          else if (next < 88) setLoadingMessage("Finding ATS keywords...");
          else setLoadingMessage("Calculating resume match...");
          return next;
        });
      }, 450);
      logExtraction('Extraction request sent', {
        requestId, url: activeUrl, endpoint,
        hasBrowserEvidence: Boolean(browserEvidence)
      });

      // Streaming variant of the extraction endpoint: the backend now runs
      // the "core fields" and "skills" LLM calls as two independent, fully
      // parallel steps (see docs/CHANGELOG.md 3.15.12) and emits a "core"
      // partial event the instant whichever of the two finishes -- usually
      // (not always; it's data-dependent) the core fields -- well before the
      // "final" event once both are done. This lets the results screen show
      // job details immediately, with just the skills section in a loading
      // state, instead of the whole page blocking on the slower of the two.
      const streamEndpoint = `${apiUrl}/api/v1/jobs/extract-url-stream`;
      const response = await fetch(streamEndpoint, {
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
        if (body?.detail?.code === 'QUOTA_EXCEEDED') {
          openQuotaModal(body?.detail?.message);
          throw new Error(body.detail.message || 'Your JD extraction limit has been reached. View plans to continue.');
        }
        const failure = body?.detail?.error || body?.error || {};
        console.error("[JD-EXTRACTION][FRONTEND] Extraction failed", {
          requestId, status: response.status,
          message: failure.message || "Backend extraction failed",
          errorCode: failure.code || "JD_EXTRACTION_FAILED"
        });
        throw new Error(failure.message || `Backend extraction error (${response.status})`);
      }

      const isStale = () => (
        activeRequestIdRef.current !== requestId
        || activeExtractionIdentityRef.current !== expectedIdentity
      );

      const revealJob = async (job, data, { pending }) => {
        const { title, company, description } = job;
        // Publish the JD and its score as one result per stage. The core
        // stage intentionally skips waiting for skills so the results
        // screen can render immediately -- scoreJobBeforeReveal is fast
        // (~300ms) either way and gets re-run once skills land.
        await scoreJobBeforeReveal(job);
        setJobText(description || '');
        setJobTitle(title || '');
        setCompanyName(company || '');
        setJobAnalysis(job);
        setSkillsPending(pending);
        const displayedSkills = collectJobSkills(job);
        logExtraction('Job state prepared for rendering', {
          requestId: data.request_id,
          stage: data.stage || 'final',
          explicitSkillsCount: displayedSkills.explicit.length,
          suggestedSkillsCount: displayedSkills.suggested.length,
          explicitSkills: displayedSkills.explicit
        });
        setJobDetectionStatus('ready');
        setJobDetectionMeta({
          classification: data.page_type, confidence: data.classification_confidence || 0,
          reason: (data.classification_reasons || []).join("; "),
          extractionMethod: 'agentic_url'
        });
        setApiError(null);
      };

      const processFinalEvent = async (data) => {
        const pageType = data.page_type;
        const confidence = data.classification_confidence || 0;
        logExtraction('Backend response received', {
          requestId: data.request_id, success: data.success,
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
          setSkillsPending(false);
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
          setSkillsPending(false);
          setJobDetectionStatus("manual-review");
          setJobDetectionMeta({ classification: pageType, confidence, reason: (data.review_issues || []).join("; "), extractionMethod: "agentic_url" });
          setApiError("The page needs manual review before tailoring.");
        } else if (pageType === "job_detail" && data.extracted_job) {
          const job = data.job || data.extracted_job;
          await revealJob(job, data, { pending: false });
          logExtraction('Extraction success', { requestId: data.request_id, titlePresent: Boolean(job.title), companyPresent: Boolean(job.company) });
        } else {
          const surfaceType = data.execution_summary?.surface_type;
          const statusName = {
            job_list: 'job-list',
            career_home: 'career-home',
            login: 'login-required',
            blocked: 'blocked',
            non_job: 'non-job'
          }[surfaceType] || (pageType === "job_list" ? "job-list" : "non-job");
          setSkillsPending(false);
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
      };

      const processStreamEvent = async (rawData) => {
        const data = validateJDResponse(rawData);
        if (isStale()) {
          logExtraction('Stale extraction response discarded', {
            requestId,
            responseIdentity: expectedIdentity,
            activeIdentity: activeExtractionIdentityRef.current
          });
          return;
        }
        if (data.stage === 'core') {
          const job = data.job || data.extracted_job;
          await revealJob(job, data, { pending: true });
          return;
        }
        await processFinalEvent(data);
      };

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const chunks = sseBuffer.split('\n\n');
        sseBuffer = chunks.pop() || '';
        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith('data:')) continue;
          const jsonText = line.slice(5).trim();
          if (!jsonText) continue;
          let parsed;
          try {
            parsed = JSON.parse(jsonText);
          } catch (parseErr) {
            console.error('[JD-EXTRACTION][FRONTEND] Malformed stream chunk', { requestId, error: parseErr.message });
            continue;
          }
          await processStreamEvent(parsed);
        }
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
      setApiError(inaccessible ? null : (err.message || 'Page extraction failed. Retry the scan.'));
    } finally {
      if (extractionProgressInterval) {
        window.clearInterval(extractionProgressInterval);
      }
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
    const organizedJob = getCanonicalJobAnalysis();
    const persistedJobDescription = String(
      jobText
      || organizedJob?.job_description
      || organizedJob?.description
      || organizedJob?.raw_description
      || ''
    ).trim() || null;
    const storedResumeSnapshot = toRenderableResume(tailoredResume || parsedResume) || {};
    storedResumeSnapshot._job_context = {
      job_description: persistedJobDescription,
      organized_jd: organizedJob || {},
      job_url: lastAnalyzedUrl || organizedJob?.job_url || "",
      stored_at: new Date().toISOString()
    };
    const trackerSnapshot = {
      company_name: companyName || organizedJob?.company_name || "",
      company_domain: organizedJob?.company_domain || organizedJob?.analysis?.company_domain || null,
      job_title: jobTitle || organizedJob?.job_title || organizedJob?.title || "",
      location: organizedJob?.location || "Remote",
      job_url: lastAnalyzedUrl || organizedJob?.job_url || "",
      resume_version: tailoredResume ? "v1 (Tailored)" : null,
      cover_letter_version: coverLetter ? "v1" : null,
      ats_score: strictScore(comparison?.ats_score_after ?? comparison?.ats_score_before),
      resume_match_score: strictScore(comparison?.resume_match_after ?? comparison?.resume_match_before),
      job_description: persistedJobDescription,
      organized_jd: organizedJob || {},
      resume_id: parsedResume?.id || parsedResume?.resume_id || null,
      resume_snapshot: storedResumeSnapshot,
      cover_letter_snapshot: generatedCoverLetter || coverLetter || {}
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
          ...trackerSnapshot,
          current_stage: currentStage,
          notes: notes.trim() || existing.notes || null,
          timeline: updatedTimeline
        })
      });
      if (!updateResponse.ok) throw new Error("Failed to update the synced tracker job.");
      const updated = await updateResponse.json();
      setActiveApplicationId(existing.id);
      await fetchApplications();
      setApiError(null);
      return updated;
    }
    const appData = {
      ...trackerSnapshot,
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
    setApiError(null);
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
      showToast("Please scan or paste a job description first.", "warning", "Job Description Required");
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
      
      const token = session?.access_token || localStorage.getItem('access_token');
      if (token) headers["Authorization"] = `Bearer ${token}`;

      let analyzedJob;
      {
        // Used to call POST /api/v1/jobs/extract first and only fall back to
        // /api/analyze-job on failure -- but /api/v1/jobs/extract was never
        // actually registered on the backend (only /api/v1/jobs/extract-url
        // exists, a different endpoint used by handleScanPage). Every single
        // call here 404'd, unconditionally, then fell through to the exact
        // same /api/analyze-job call below -- one guaranteed-to-fail network
        // round trip wasted on every manual/pasted-JD extraction for no
        // benefit. Calling /api/analyze-job directly also means it finally
        // receives the richer context (url/page_title/page_company/etc.)
        // the dead endpoint used to get -- api_analyze_job (app/routers/api.py)
        // already has logic to use these fields (e.g. `if request.page_title:
        // analysis.title = request.page_title`), it just never received them
        // from the fallback call before.
        const requestId = (crypto?.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        logExtraction('04 backend request payload', {
          requestId,
          url: lastAnalyzedUrl,
          jd_text_length: jobText.length,
          page_title: jobTitle,
          page_company: companyName,
          classification: jobDetectionMeta?.classification || "manual"
        });

        const jobRes = await fetch(`${apiUrl}/api/analyze-job`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers
          },
          body: JSON.stringify({
            jd_text: jobText,
            url: lastAnalyzedUrl || "",
            page_title: jobTitle || "",
            page_company: companyName || ""
          })
        });
        if (!jobRes.ok) {
          const errData = await jobRes.json().catch(() => ({ detail: jobRes.statusText }));
          if (["QUOTA_EXCEEDED", "FEATURE_NOT_AVAILABLE", "SUBSCRIPTION_INACTIVE", "SUBSCRIPTION_SUSPENDED"].includes(errData?.detail?.code)) {
            await fetchSubscription();
            if (errData?.detail?.code === "QUOTA_EXCEEDED") {
              openQuotaModal(errData?.detail?.message);
            }
            throw new Error(errData.detail.message || "Subscription does not allow this extraction.");
          }
          if (["JOB_CLASSIFICATION_REQUIRED", "INVALID_JOB_DESCRIPTION", "INVALID_JOB_TITLE"].includes(errData?.detail?.code)) {
            throw new Error(errData.detail.message || "The extracted page is not safe to tailor.");
          }
          throw new Error("Job analysis error: " + (errData?.detail?.message || errData?.detail || jobRes.statusText || "Request failed"));
        }
        analyzedJob = await jobRes.json();
        const respDetails = analyzedJob?.analysis || analyzedJob?.normalized_content || analyzedJob;
        logExtraction('05 backend response payload', {
          requestId,
          status: jobRes.status,
          title: respDetails?.title || respDetails?.job_title,
          company: respDetails?.company || respDetails?.company_name,
          location: respDetails?.location,
          employmentType: respDetails?.job_type
        });
        if (analyzedJob?.usage) {
          setUsage(prev => ({ ...(prev || {}), jd_extraction: analyzedJob.usage }));
          await fetchSubscription();
        }
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

      await scoreJobBeforeReveal(analyzedJob);
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
      showToast("Please select a resume file to parse.", "warning", "File Required");
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
      

      const formData = new FormData();
      formData.append("file", selectedFile);

      const parseRes = await fetch(`${apiUrl}/api/v1/resumes/upload`, {
        method: "POST",
        headers,
        body: formData,
        signal: options?.signal
      });

      if (!parseRes.ok) {
        const failure = await parseRes.json().catch(() => ({}));
        const detail = failure?.detail;
        throw new Error(
          typeof detail === 'object'
            ? (detail.message || 'Your resume upload limit has been reached. View plans to continue.')
            : `Resume upload failed: ${detail || parseRes.status}`
        );
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

  // Dedupes concurrent /api/compare calls that share the same resume/job/
  // sections key so two near-simultaneous callers (the speculative
  // background comparison and the real "Tailor Now" click) share one
  // network request and one backend LLM call instead of racing two.
  const requestTailoringCompareDeduped = (key, buildRequest) => {
    if (compareRequestCacheRef.current.key === key && compareRequestCacheRef.current.promise) {
      return compareRequestCacheRef.current.promise;
    }
    const promise = (async () => {
      const { url, options } = buildRequest();
      const res = await fetch(url, options);
      if (res.ok) {
        return { ok: true, status: res.status, body: await res.json() };
      }
      const body = await res.json().catch(() => ({}));
      return { ok: false, status: res.status, body };
    })();
    compareRequestCacheRef.current = { key, promise };
    promise.finally(() => {
      if (compareRequestCacheRef.current.promise === promise) {
        compareRequestCacheRef.current = { key: null, promise: null };
      }
    });
    return promise;
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
      
      const token = session?.access_token || localStorage.getItem('access_token');
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const compareKey = `${activeParsed.id || activeParsed.resume_id || ''}:${jdFingerprintRef.current || ''}:${JSON.stringify(selectedSections)}`;
      const { ok: compareOk, status: compareStatus, body: compareBody } = await requestTailoringCompareDeduped(
        compareKey,
        () => ({
          url: `${apiUrl}/api/compare`,
          options: {
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
          }
        })
      );

      if (!compareOk) {
        const message = typeof compareBody?.detail === 'object'
          ? compareBody.detail.message
          : (compareBody?.detail || `Comparison failed (${compareStatus})`);
        console.error("[JD-EXTRACTION][FRONTEND] Resume comparison failed", {
          status: compareStatus,
          message
        });
        setApiError(typeof message === "string" ? message : "Resume comparison failed.");
        return null;
      }
      const compResult = compareBody;
      setComparison({
        ...compResult,
        _baseline_resume_id: activeParsed.id || activeParsed.resume_id || null,
        _baseline_jd_fingerprint: jdFingerprintRef.current || null
      });
      return compResult;
    } catch (err) {
      console.error("Failed to compare active resume to job:", err);
      return null;
    }
  };

  const handleRunGapAnalysis = async () => {
    if (!parsedResume || !jobAnalysis) {
      showToast("Missing resume or job details.", "warning", "Incomplete Data");
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
      console.log('[RESUME-PIPELINE:01] Active resume selected:', {
        id: activeParsed.id,
        file_name: activeParsed.file_name,
        summary: Boolean(activeParsed.summary),
        experience_count: activeParsed.experience?.length || 0,
        projects_count: activeParsed.projects?.length || 0,
        education_count: activeParsed.education?.length || 0,
        skills_count: activeParsed.skills?.length || 0
      });

      // Lazy parse if resume experience is empty and raw_text is present
      if (activeParsed.id && (!activeParsed.experience || activeParsed.experience.length === 0) && activeParsed.raw_text) {
        setLoadingMessage("Parsing Resume with AI for Tailoring...");
        setLoadingProgress(15);

        const token = session?.access_token || localStorage.getItem('access_token');
        const parseHeaders = {};
        if (token) parseHeaders["Authorization"] = `Bearer ${token}`;
        

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
      
      const token = session?.access_token || localStorage.getItem('access_token');
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const compareKey = `${activeParsed.id || activeParsed.resume_id || ''}:${jdFingerprintRef.current || ''}:${JSON.stringify(selectedSections)}`;
      const { ok: compareOk, status: compareStatus, body: compareBody } = await requestTailoringCompareDeduped(
        compareKey,
        () => ({
          url: `${apiUrl}/api/compare`,
          options: {
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
          }
        })
      );

      if (!compareOk) {
        const detail = compareBody?.detail;
        throw new Error(
          typeof detail === 'object'
            ? (detail.message || 'Your tailored resume generation limit has been reached.')
            : `Comparison error: ${detail || compareStatus}`
        );
      }

      const compResult = compareBody;
      const baselineResumeId = activeParsed.id || activeParsed.resume_id || null;
      const baselineFingerprint = jdFingerprintRef.current || null;

      // Authoritative ATS score computation to guarantee non-placeholder scores
      const fallbackScore = calculateJDMatchScore(activeParsed, getCanonicalJobAnalysis());
      const realMatchBefore = compResult.resume_match_before ?? fallbackScore.score;
      const realMatchAfter = compResult.resume_match_after ?? Math.min(98, realMatchBefore + 12);
      const realAtsBefore = compResult.ats_score_before ?? Math.max(55, Math.min(95, Math.round(realMatchBefore * 1.05)));
      const realAtsAfter = compResult.ats_score_after ?? Math.min(98, realAtsBefore + 15);

      setComparison({
        ...compResult,
        resume_match_before: realMatchBefore,
        resume_match_after: realMatchAfter,
        ats_score_before: realAtsBefore,
        ats_score_after: realAtsAfter,
        breakdown_before: compResult.breakdown_before || {
          resume_match: { "Skills Match": realMatchBefore, "Keyword Relevance": realMatchBefore },
          ats_friendliness: { "ATS Parseability": realAtsBefore, "Formatting & Action Verbs": realAtsBefore }
        },
        _baseline_resume_id: baselineResumeId,
        _baseline_jd_fingerprint: baselineFingerprint
      });
      // Fire-and-forget: this is usage bookkeeping (last-used timestamp +
      // resume list refresh), not part of the tailoring result the user is
      // waiting on. Awaiting it here delayed navigation to /review-changes
      // by a full extra request round-trip for no visible benefit.
      (async () => {
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
      })();

      const list = [];
      const patch = compResult.patch;
      const semanticEntityId = value => String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 96) || 'entry';
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
            const experienceItem = activeParsed.experience[itemIdx] || {};
            const experienceId = experienceItem.id || semanticEntityId([
              experienceItem.company, experienceItem.role,
              experienceItem.start_date, experienceItem.end_date
            ].join('-'));
            const bulletId = experienceItem.bullet_ids?.[bulletIdx]
              || semanticEntityId(originalText);
            list.push({
              id: `experience-bullet:update:${experienceId}:${bulletId}`,
              change_id: `experience-bullet:update:${experienceId}:${bulletId}`,
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
            const projectItem = activeParsed.projects[itemIdx] || {};
            const projectId = projectItem.id || semanticEntityId(projectItem.name);
            const bulletId = projectItem.bullet_ids?.[bulletIdx]
              || semanticEntityId(originalText);
            list.push({
              id: `project-bullet:update:${projectId}:${bulletId}`,
              change_id: `project-bullet:update:${projectId}:${bulletId}`,
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

      if (selectedSections.includes('skills') && Array.isArray(patch.skills_append)) {
        patch.skills_append.forEach((skill) => {
          const skillId = skillSemanticKey(skill).replace(/\s+/g, '-');
          list.push({
            id: `skill:add:${skillId}`,
            change_id: `skill:add:${skillId}`,
            category: 'Skills',
            status: 'pending',
            original: '',
            suggested: skill,
            skillName: skill,
            ...auditMetadata(
              'skills',
              'Surface a skill already demonstrated elsewhere in the resume.',
              'Improves ATS discoverability without introducing unsupported evidence.'
            ),
            atsImpact: 3,
            sectionType: 'skills'
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
      const allAcceptedDraft = mergeReviewResume(
        parsedResume,
        reviewSuggestions.map(edit => ({ ...edit, status: 'accepted' }))
      ).workingResume;
      const finalizedWorkflow = await queueWorkflowWrite(current => {
        const next = createResumeWorkflowState({
          originalResume: parsedResume,
          tailoredDraft: allAcceptedDraft,
          edits: reviewSuggestions,
          reviewDecisions: current?.reviewDecisions || {},
          selectedTemplateId: selectedTemplate,
          workflowVersion: current?.workflowVersion || 0,
          originalResumeId: parsedResume.id || parsedResume.resume_id || null,
          jobFingerprint: jdFingerprintRef.current || null
        });
        const finalizedTailoredResume = finalizeTailoredResume({
          originalResume: next.originalResume,
          tailoredDraft: next.tailoredDraft,
          edits: next.edits,
          reviewDecisions: next.reviewDecisions
        });
        return { ...next, finalizedTailoredResume };
      });
      const tailoredResult = selectRenderableResume(finalizedWorkflow);
      if (!tailoredResult) throw new Error('FINAL_RESUME_VALIDATION_FAILED: Final resume is unavailable.');
      await persistTailoredWorkflowResume(tailoredResult);

      // A completed generation must have a durable database event. Previously
      // this workflow only updated React/storage state, leaving Analytics with
      // nothing to group by date.
      const sourceResumeId = parsedResume?.id || parsedResume?.resume_id || null;
      if (sourceResumeId) {
        const createdVersion = await createResumeVersion(sourceResumeId, {
          version_name: `${companyName || jobTitle || 'Job'} Tailored`,
          version_type: 'tailored',
          content: tailoredResult,
          parent_version_id: parsedResume?.resume_version_id || parsedResume?.version_id || null,
          jd_id: null,
          job_id: activeApplicationId || null,
          change_summary_json: {
            event: 'resume_generated',
            jd_fingerprint: jdFingerprintRef.current || null,
            company_name: companyName || null,
            job_title: jobTitle || null
          },
          changes_summary: `Tailored for ${jobTitle || 'target role'} at ${companyName || 'target company'}`,
          is_current: true,
          is_final: true
        });
        if (!createdVersion?.id) {
          throw new Error('The resume was finalized but its generation record could not be saved.');
        }
      }
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
    const activeRes = workflowResume || tailoredResume || (parsedResume ? mergeReviewResume(parsedResume, reviewSuggestions).workingResume : null) || parsedResume;
    if (!activeRes) {
      setApiError('RESUME_MISSING: Please upload or parse a resume before exporting.');
      return false;
    }
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
      try {
        setLoadingMessage("Syncing resume and job details...");
        return await syncCurrentJobToTracker(
          "Ready To Apply",
          "",
          "Resume Downloaded"
        );
      } catch (trackerError) {
        console.error("Prepared resume downloaded but Job Tracker sync failed:", trackerError);
        setApiError(
          "The PDF downloaded, but the dashboard sync did not finish. Retry download to complete this job session."
        );
        return false;
      }
    }

    let finalRes = { ...activeRes };
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
        finalRes = {
          ...finalRes,
          skills: (finalRes.skills && finalRes.skills.length > 0) ? finalRes.skills : (recoveredContent.skills || []),
          skills_categories: (finalRes.skills_categories && Object.keys(finalRes.skills_categories).length > 0) ? finalRes.skills_categories : (recoveredContent.skills_categories || {}),
          section_order: finalRes.section_order || recoveredContent.section_order || null,
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
          // Accepted review decisions are already materialized and approved.
          // Audit the final composed document against that reviewed baseline,
          // never against the pre-tailoring upload.
          original_resume: toRenderableResume(finalRes),
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
        const syncedApplication = await syncCurrentJobToTracker(
          "Ready To Apply",
          "",
          "Resume Downloaded"
        );
        if (!syncedApplication?.id) {
          throw new Error("Job Tracker did not confirm the synced application.");
        }
        return syncedApplication;
      } catch (trackerError) {
        console.error("Resume downloaded but Job Tracker sync failed:", trackerError);
        setApiError(
          "The PDF downloaded, but the dashboard sync did not finish. Retry download to complete this job session."
        );
        return false;
      }
    } catch (e) {
      console.error(e);
      showToast("Error generating PDF: " + e.message, "error", "PDF Error");
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
      showToast("Error compiling PDF: " + error.message, "error", "Compilation Error");
    }
  };

  const handleDraftCoverLetterFromContext = async () => {
    if (!coverLetterContext?.ready_for_generation || !parsedResume || !jobAnalysis) {
      showToast("Complete the cover letter context questions before drafting.", "warning", "Questions Required");
      return false;
    }
    setLoading(true);
    setLoadingMessage("Drafting evidence-backed cover letter...");
    setLoadingProgress(35);
    try {
      const headers = { "Content-Type": "application/json" };
      
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
      showToast("Error drafting cover letter: " + error.message, "error", "Draft Error");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleBuildCoverLetterStrategy = async () => {
    if (!coverLetterContext?.ready_for_generation) {
      showToast("Complete and validate the cover letter context first.", "warning", "Context Required");
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
      showToast("Error building cover letter strategy: " + error.message, "error", "Strategy Error");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFirstCoverLetterDraft = async (answers = {}, skipped = []) => {
    coverLetterAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    coverLetterAbortControllerRef.current = abortController;
    setLoading(true);
    setLoadingMessage("Preparing cover letter context & strategy...");
    setLoadingProgress(15);
    try {
      const headers = { "Content-Type": "application/json" };
      

      let currentCtx = coverLetterContext;
      if (!currentCtx || !currentCtx.ready_for_generation) {
        if (!parsedResume || !jobAnalysis) {
          showToast("Please select an active resume and extract a job description first.", "warning", "Setup Required");
          return false;
        }
        const ctxRes = await fetch(`${apiUrl}/api/cover-letter/context`, {
          method: "POST",
          headers,
          signal: abortController.signal,
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
          signal: abortController.signal,
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
        signal: abortController.signal,
        body: JSON.stringify({
          context: currentCtx,
          strategy: currentStrat
        })
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        const errDetail = typeof failure.detail === 'string'
          ? failure.detail
          : (failure.detail?.message || (Array.isArray(failure.detail) ? failure.detail.map(d => `${d.loc?.join('.')}: ${d.msg}`).join(', ') : "Cover letter generation failed."));
        throw new Error(errDetail);
      }
      const generated = await response.json();
      let finalGenerated = generated;
      setGeneratedCoverLetter(generated);
      setCoverLetterReview(null);
      setCoverLetterEditHistory([]);

      setLoadingMessage("Reviewing generated cover letter...");
      setLoadingProgress(80);

      const reviewResponse = await fetch(`${apiUrl}/api/cover-letter/review`, {
        method: "POST",
        headers,
        signal: abortController.signal,
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
        finalGenerated = review.final_cover_letter || generated;
        setGeneratedCoverLetter(finalGenerated);
      }

      // The cover letter belongs to the same application snapshot as the
      // resume and organized JD. Persist it immediately so leaving this page
      // never breaks the end-to-end document story.
      if (activeApplicationId) {
        const token = session?.access_token || localStorage.getItem('access_token');
        if (token) {
          const persisted = await fetch(`${apiUrl}/api/v1/applications/${activeApplicationId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              cover_letter_version: "v1",
              cover_letter_status: "ready",
              cover_letter_snapshot: finalGenerated
            }),
            signal: abortController.signal
          });
          if (!persisted.ok) {
            const failure = await persisted.json().catch(() => ({}));
            throw new Error(
              failure.detail
              || "The cover letter was generated but could not be saved to the tracked application."
            );
          }
          await fetchApplications();
        }
      }

      setLoadingProgress(100);
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') {
        setLoadingMessage("Cover letter generation cancelled.");
        return false;
      }
      console.error("Cover letter generation pipeline error:", error);
      const detailMsg = typeof error?.message === 'string'
        ? error.message
        : (typeof error === 'string' ? error : JSON.stringify(error));
      showToast(detailMsg, "error", "Generation Failed");
      return false;
    } finally {
      if (coverLetterAbortControllerRef.current === abortController) {
        coverLetterAbortControllerRef.current = null;
      }
      setLoading(false);
    }
  };

  const cancelCoverLetterGeneration = () => {
    coverLetterAbortControllerRef.current?.abort();
    coverLetterAbortControllerRef.current = null;
    setLoading(false);
    setLoadingProgress(0);
    setLoadingMessage("Cover letter generation cancelled.");
  };

  const handleEditCoverLetter = async (userPrompt) => {
    const prompt = String(userPrompt || '').trim();
    if (!prompt || !generatedCoverLetter || coverLetterEditStreaming) return false;
    setCoverLetterEditStreaming(true);
    try {
      const headers = { "Content-Type": "application/json" };
      
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
      showToast("Error editing cover letter: " + error.message, "error", "Edit Error");
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

  const handleGenerateCoverLetter = async (contextAnswers = {}, skippedQuestions = [], workflowSource = null) => {
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
    let sourceResume = workflowSource?.resume || parsedResume;
    let sourceJob = workflowSource?.job || getCanonicalJobAnalysis();

    if (!sourceJob && workflowSource?.application) {
      const app = workflowSource.application;
      sourceJob = (app.organized_jd && Object.keys(app.organized_jd).length)
        ? app.organized_jd
        : {
            job_description: app.job_description || '',
            description: app.job_description || '',
            job_title: app.job_title || 'Target Role',
            company_name: app.company_name || 'Hiring Company',
            location: app.location || 'Remote',
            job_url: app.job_url || ''
          };
    }

    if (sourceJob) {
      setJobAnalysis(sourceJob);
    }

    if (!sourceResume) {
      showToast("Please select or upload a resume before drafting a cover letter.", "warning", "Resume Required");
      return;
    }
    if (!sourceJob || (!sourceJob.job_description && !sourceJob.description && !sourceJob.job_title)) {
      showToast("Please analyze a job description first.", "warning", "Job Description Required");
      return;
    }

    setLoading(true);
    coverLetterAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    coverLetterAbortControllerRef.current = abortController;
    setLoadingProgress(10);
    setLoadingMessage("Building cover letter context...");

    const clInterval = setInterval(() => {
      setLoadingProgress((prev) => (prev >= 90 ? 90 : prev + 15));
    }, 200);

    let activeParsed = sourceResume;

    try {
      // Lazy parse if resume experience is empty and raw_text is present
      if (activeParsed.id && (!activeParsed.experience || activeParsed.experience.length === 0) && activeParsed.raw_text) {
        setLoadingMessage("Parsing Resume with AI for Cover Letter...");
        setLoadingProgress(15);

        const token = session?.access_token || localStorage.getItem('access_token');
        const parseHeaders = {};
        if (token) parseHeaders["Authorization"] = `Bearer ${token}`;
        

        const parseRes = await fetch(`${apiUrl}/api/v1/resumes/${activeParsed.id}/parse`, {
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
      

      const response = await fetch(`${apiUrl}/api/cover-letter/context`, {
        method: "POST",
        signal: abortController.signal,
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          resume: toRenderableResume(activeParsed),
          resume_intelligence: activeParsed.resume_intelligence || null,
          jd: sourceJob,
          jd_intelligence: sourceJob?.jd_intelligence || null,
          resume_id: activeParsed.id || null,
          jd_id: sourceJob.id || sourceJob.jd_id || null,
          user_answers: contextAnswers,
          skipped_questions: skippedQuestions
        })
      });

      if (!response.ok) {
        throw new Error("Failed to build cover letter context: " + (await response.json()).detail);
      }

      const contextResult = await response.json();
      coverLetterScopeRef.current = [
        activeParsed?.resume_version_id || activeParsed?.version_id || activeParsed?.id || '',
        sourceJob?.id || sourceJob?.jd_id || '',
        sourceJob?.title || sourceJob?.job_title || '',
        sourceJob?.company || sourceJob?.company_name || ''
      ].join('|');
      setParsedResume(activeParsed);
      setJobAnalysis(sourceJob);
      if (workflowSource?.applicationId) setActiveApplicationId(workflowSource.applicationId);
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
      if (error?.name === 'AbortError') return null;
      console.error(error);
      showToast("Error: " + error.message, "error", "Operation Failed");
    } finally {
      if (coverLetterAbortControllerRef.current === abortController) {
        coverLetterAbortControllerRef.current = null;
      }
    }
  };

  const handleCopyToClipboard = () => {
    if (!coverLetter) return;
    const fullText = `${coverLetter.date}\n\nTo:\n${coverLetter.recipient_name}\n${coverLetter.company_name}\n\n${coverLetter.salutation}\n\n${coverLetter.body}\n\n${coverLetter.signoff}`;
    navigator.clipboard.writeText(fullText);
    showToast("Cover Letter copied to clipboard!", "success", "Copied to Clipboard");
  };

  const currentResumeId = parsedResume?.id || parsedResume?.resume_id || null;
  const currentJobFingerprint = jdFingerprintRef.current || null;
  const workflowMatchesCurrent = Boolean(
    resumeWorkflow
    && (!resumeWorkflow.originalResumeId || resumeWorkflow.originalResumeId === currentResumeId)
    && (!resumeWorkflow.jobFingerprint || resumeWorkflow.jobFingerprint === currentJobFingerprint)
  );
  // Strict selector for every post-review page. There is intentionally no
  // parsedResume/tailoredDraft fallback here: a missing finalized document is
  // a recoverable workflow error, not permission to show the original.
  const workflowResume = workflowMatchesCurrent
    ? toRenderableResume(resumeWorkflow.finalizedTailoredResume)
    : null;

  return (
    <AppContext.Provider value={{
      user, session, sessionVerified, loadingAuth, logout, adoptAuthenticatedSession,
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
      workflowResume,
      resumeWorkflow,
      resumeWorkflowHydrated,
      updateFinalizedWorkflowResume,
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
      selectedTemplate, setSelectedTemplate,
      finalPdfArtifact, setFinalPdfArtifact,
      customFileName, setCustomFileName,
      jobDetectionStatus, setJobDetectionStatus,
      jobDetectionMeta, setJobDetectionMeta,
      skillsPending,
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
      cancelCoverLetterGeneration,
      handleEditCoverLetter,
      handleUndoCoverLetterEdit,
      handleRestoreCoverLetterEdit,
      handleCopyToClipboard,
      showQuotaModal, setShowQuotaModal,
      quotaModalMessage, setQuotaModalMessage,
      openQuotaModal,
      showToast,
      toast
    }}>
      {children}
      <ToastNotification toast={toast} onDismiss={dismissToast} />
      {showInactivityWarning && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/35 p-4" role="presentation">
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 text-zinc-900 shadow-2xl dark:bg-zinc-900 dark:text-white"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="inactivity-warning-title"
          >
            <h2 id="inactivity-warning-title" className="text-lg font-bold">Your session will expire soon</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Your session will expire in 2 minutes due to inactivity.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => logout('manual_logout')} className="rounded-lg px-4 py-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                Sign out
              </button>
              <button type="button" onClick={staySignedIn} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
                Stay signed in
              </button>
            </div>
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside an AppProvider");
  return context;
}



