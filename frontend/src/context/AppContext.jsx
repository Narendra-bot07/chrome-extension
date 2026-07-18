import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { compressResumeData } from '../utils/resumeCompression';
import { runJobExtractionInPage } from '../utils/jobExtractionEngine';

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
    setCompanyName('Company');
    setJobTitle('Software Engineer');
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
  const [companyName, setCompanyName] = useState('Company');
  const [jobTitle, setJobTitle] = useState('Software Engineer');
  const [lastAnalyzedUrl, setLastAnalyzedUrl] = useState('');
  const [currentJobIdentity, setCurrentJobIdentity] = useState('');

  // Data states
  const [parsedResume, setParsedResume] = useState(null);
  const [resumesList, setResumesList] = useState([]);
  const [jobAnalysis, setJobAnalysis] = useState(null);
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

  const logExtraction = (event, meta = {}) => {
    if (import.meta.env?.MODE === 'production') return;
    console.log(`[ApplyFlow:Extraction] ${event}`, meta);
  };

  const getJobIdentityFromUrl = (url = '') => {
    try {
      const parsed = new URL(url);
      const currentJobId = parsed.searchParams.get('currentJobId');
      if (currentJobId) return `linkedin:${currentJobId}`;
      const linkedInMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)/i);
      if (linkedInMatch) return `linkedin:${linkedInMatch[1]}`;
      const pathMatch = parsed.pathname.match(/\/(?:job|jobs|careers|career|opening|position|vacancy|details)\/?([^/?#]+)?/i);
      if (pathMatch) return `${parsed.hostname}:${parsed.pathname}`;
      return `${parsed.hostname}:${parsed.pathname}`;
    } catch {
      return url || '';
    }
  };

  const resetExtractedJobState = (reason, meta = {}) => {
    logExtraction('old job invalidated', { reason, ...meta });
    setJobText('');
    setJobAnalysis(null);
    setComparison(null);
    setCompanyName('Company');
    setJobTitle('Software Engineer');
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
      chrome.storage.local.get(['groqApiKey', 'apiUrl', 'parsedResume', 'tailoredResume', 'selectedTemplate', 'jobAnalysis', 'jobText', 'companyName', 'jobTitle', 'comparison'], (result) => {
        if (result.groqApiKey) setApiKey(result.groqApiKey);
        if (result.apiUrl) setApiUrl(result.apiUrl);
        if (result.parsedResume) setParsedResume(result.parsedResume);
        if (result.tailoredResume) setTailoredResume(result.tailoredResume);
        if (result.selectedTemplate) setSelectedTemplate(result.selectedTemplate);
        if (result.jobAnalysis) setJobAnalysis(result.jobAnalysis);
        if (result.jobText) setJobText(result.jobText);
        if (result.companyName) setCompanyName(result.companyName);
        if (result.jobTitle) setJobTitle(result.jobTitle);
        if (result.comparison) setComparison(result.comparison);
      });
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

  // Save/Remove job analysis context storage so full browser tabs open cleanly with extracted job.
  // Extension side panel intentionally does not persist job data globally; it must represent the active tab.
  useEffect(() => {
    if (isExtension) return;
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
  }, [jobAnalysis, jobText, companyName, jobTitle]);

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
  const handleScanPage = async (isManual = false) => {
    if (!ensureExtractionProfileReady()) return;

    let currentTabUrl = '';
    if (isExtension && chrome.tabs) {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && activeTab.url) {
          currentTabUrl = activeTab.url;
        }
      } catch (e) {
        console.warn("Could not query active tab URL:", e);
      }
    }

    if (isManual) {
      setLastAnalyzedUrl('');
      resetExtractedJobState('manual rescan');
    }
    
    if (!isExtension) {
      setCompanyName("Target Company");
      setJobTitle("Hello");
      setJobText("Hello Dummy Description for non-extension environment.");
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error("No active browser window or tab found.");
      
      const url = tab.url || currentTabUrl || '';
      const scanVersion = extractionVersionRef.current + 1;
      extractionVersionRef.current = scanVersion;
      const expectedIdentity = getJobIdentityFromUrl(url);
      const previousIdentity = activeExtractionIdentityRef.current || currentJobIdentity;
      activeExtractionIdentityRef.current = expectedIdentity;
      setCurrentJobIdentity(expectedIdentity);
      setJobDetectionStatus("checking");
      logExtraction('extraction started', { tabId: tab.id, url, jobIdentity: expectedIdentity, navigationVersion: scanVersion });

      if (previousIdentity && previousIdentity !== expectedIdentity) {
        resetExtractedJobState('job identity changed', { from: previousIdentity, to: expectedIdentity });
      }

      if (url.includes('linkedin.com/in/') || 
          url.includes('linkedin.com/feed/') || 
          url.includes('linkedin.com/messaging/') || 
          url.includes('linkedin.com/mynetwork/')) {
        resetExtractedJobState('not a job page', { url, navigationVersion: scanVersion });
        setLastAnalyzedUrl(url);
        setJobDetectionStatus("not-job");
        logExtraction('page classified', { tabId: tab.id, url, pageType: 'NOT_A_JOB_PAGE', reason: 'LinkedIn non-job route' });
        return;
      }
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: runJobExtractionInPage
      });

      if (false) await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [runJobExtractionInPage.toString()],
        func: async (engineSource) => {
          const runExtraction = (0, eval)(`(${engineSource})`);
          return await runExtraction();

          let title = '';
          let company = '';
          let text = '';
          const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
          const meaningfulDescription = (value) => {
            const normalized = clean(value);
            if (normalized.length < 120) return false;
            if (/^0 notifications$/i.test(normalized)) return false;
            if (/^(apply|save|share|view job|show more|see more)$/i.test(normalized)) return false;
            return /(responsibilit|qualification|requirement|experience|skills|about the job|minimum qualifications|preferred qualifications|what you)/i.test(normalized);
          };
          const hasJobPostingJsonLd = () => {
            const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
            return scripts.some((script) => {
              try {
                const parsed = JSON.parse(script.textContent || '{}');
                const items = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] || [])];
                return items.some((item) => {
                  const type = item?.['@type'];
                  return Array.isArray(type) ? type.includes('JobPosting') : type === 'JobPosting';
                });
              } catch {
                return false;
              }
            });
          };
          const hasApplyButton = () => Array.from(document.querySelectorAll('button, a'))
            .some((el) => /\bapply\b/i.test(el.innerText || el.textContent || ''));
          const urlLooksJobLike = /\/(job|jobs|careers|career|opening|position|vacancy|details)(\/|\?|#|$)/i.test(window.location.pathname);

          if (window.location.host.includes('linkedin.com')) {
            const readText = (selector) => {
              const el = document.querySelector(selector);
              return el ? clean(el.innerText || el.textContent) : '';
            };
            const usefulDescription = (value) => {
              const normalized = clean(value);
              return normalized.length > 120 && !/^0 notifications$/i.test(normalized);
            };
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const descriptionSelectors = [
              '#job-details',
              '.jobs-description__content',
              '.jobs-description-content__text',
              '.jobs-box__html-content',
              '.jobs-description',
              '[class*="jobs-description"]',
              '[class*="job-details"]'
            ];

            const titleSelectors = [
              '.job-details-jobs-unified-top-card__job-title h1',
              '.job-details-jobs-unified-top-card__job-title',
              '.jobs-unified-top-card__job-title',
              'h1'
            ];
            for (const selector of titleSelectors) {
              title = readText(selector);
              if (title) break;
            }

            const companySelectors = [
              '.job-details-jobs-unified-top-card__company-name a',
              '.job-details-jobs-unified-top-card__company-name',
              '.jobs-unified-top-card__company-name a',
              '.jobs-unified-top-card__company-name',
              '.jobs-unified-top-card__primary-description a'
            ];
            for (const selector of companySelectors) {
              company = readText(selector);
              if (company) break;
            }

            for (let attempt = 0; attempt < 18 && !usefulDescription(text); attempt += 1) {
              for (const selector of descriptionSelectors) {
                const candidate = readText(selector);
                if (candidate.length > text.length) text = candidate;
                if (usefulDescription(text)) break;
              }

              if (usefulDescription(text)) break;

              const detailsPanel = document.querySelector('.jobs-search__job-details--container, .jobs-details, main');
              if (detailsPanel) detailsPanel.scrollBy(0, 450);
              window.scrollBy(0, 450);
              await sleep(250);
            }

            const showMore = Array.from(document.querySelectorAll('button'))
              .find((button) => /show more|see more/i.test(button.innerText || button.textContent || ''));
            if (showMore) {
              showMore.click();
              await sleep(150);
              for (const selector of descriptionSelectors) {
                const candidate = readText(selector);
                if (candidate.length > text.length) text = candidate;
              }
            }

            if (!usefulDescription(text) && document.body) {
              const bodyText = clean(document.body.innerText);
              const starts = ['About the job', 'Job description', 'Responsibilities', 'Minimum qualifications', 'What you will do'];
              for (const marker of starts) {
                const idx = bodyText.toLowerCase().indexOf(marker.toLowerCase());
                if (idx !== -1) {
                  const candidate = bodyText.slice(idx);
                  if (candidate.length > text.length) text = candidate;
                }
              }
            }
          } else if (
            window.location.host.includes('google.com') &&
            window.location.pathname.includes('/about/careers/applications/jobs/results/')
          ) {
            const readText = (selector) => {
              const el = document.querySelector(selector);
              return el ? (el.innerText || el.textContent || '').trim() : '';
            };
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

            title = readText('h1') || document.title.replace(/\s*-\s*Google Careers.*$/i, '').trim();
            company = 'Google';

            const collectGoogleJobText = () => {
              const mainText = readText('main') || readText('[role="main"]') || document.body.innerText || '';
              const normalized = mainText.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
              const sectionNames = [
                'Minimum qualifications',
                'Preferred qualifications',
                'About the job',
                'Responsibilities'
              ];
              const lower = normalized.toLowerCase();
              const positions = sectionNames
                .map((name) => ({ name, index: lower.indexOf(name.toLowerCase()) }))
                .filter((section) => section.index >= 0)
                .sort((a, b) => a.index - b.index);

              if (positions.length === 0) return normalized;

              const chunks = [];
              for (let i = 0; i < positions.length; i += 1) {
                const start = positions[i].index;
                const end = positions[i + 1]?.index ?? normalized.length;
                const chunk = normalized.slice(start, end).trim();
                if (chunk) chunks.push(chunk);
              }

              return chunks.join('\n\n')
                .replace(/\n?Apply\s*$/i, '')
                .replace(/\n?Share\s*$/i, '')
                .trim();
            };

            for (let attempt = 0; attempt < 6; attempt += 1) {
              text = collectGoogleJobText();
              if (/Minimum qualifications|Preferred qualifications|About the job|Responsibilities/i.test(text) && text.length > 500) {
                break;
              }
              window.scrollBy(0, 700);
              await sleep(200);
            }
          } else if (window.location.host.includes('indeed.com')) {
            const titleEl = document.querySelector('.jobsearch-JobInfoHeader-title, h1');
            if (titleEl) title = titleEl.innerText.trim();
            const companyEl = document.querySelector('[data-company-name="true"], .jobsearch-CompanyInfoContainer, .jobsearch-InlineCompanyRating');
            if (companyEl) company = companyEl.innerText.trim();
            const descEl = document.querySelector('#jobDescriptionText, .jobsearch-JobComponent-description');
            if (descEl) text = descEl.innerText.trim();
          } else if (window.location.host.includes('mail.google.com')) {
            const subjectEl = document.querySelector('h2.hP');
            if (subjectEl) title = subjectEl.innerText.trim();
            const bodies = document.querySelectorAll('.a3s');
            if (bodies.length > 0) {
              const activeBody = bodies[bodies.length - 1];
              text = activeBody.innerText.trim();
            }
          } else if (window.location.host.includes('greenhouse.io')) {
            const titleEl = document.querySelector('h1.app-title, .app-title');
            if (titleEl) title = titleEl.innerText.trim();
            const companyEl = document.querySelector('.company-name');
            if (companyEl) {
              company = companyEl.innerText.replace('at ', '').trim();
            }
            const descEl = document.querySelector('#content, #main');
            if (descEl) text = descEl.innerText.trim();
          } else if (window.location.host.includes('lever.co')) {
            const titleEl = document.querySelector('.posting-header h2, h2');
            if (titleEl) title = titleEl.innerText.trim();
            const companyEl = document.querySelector('.posting-header img, .logo img');
            if (companyEl) {
              company = companyEl.getAttribute('alt') || 'Lever Company';
            }
            const descEl = document.querySelector('.posting-description, .section.page-centered');
            if (descEl) text = descEl.innerText.trim();
          } else if (window.location.host.includes('myworkdayjobs.com')) {
            const titleEl = document.querySelector('[data-automation-id="jobPostingHeader"], h2');
            if (titleEl) title = titleEl.innerText.trim();
            const descEl = document.querySelector('[data-automation-id="jobPostingDescription"], .job-description');
            if (descEl) text = descEl.innerText.trim();
          }
          
          if (!title) {
            const mainHeading = document.querySelector('h1, h2.job-title, .job-title, [class*="jobTitle"], [class*="job-title"], .app-title');
            if (mainHeading) title = mainHeading.innerText.trim();
          }
          
          if (!company || company === 'Target Company') {
            const ogSiteEl = document.querySelector('meta[property="og:site_name"]');
            if (ogSiteEl && ogSiteEl.getAttribute('content')) {
              company = ogSiteEl.getAttribute('content').trim();
            } else {
              const authorEl = document.querySelector('meta[name="author"]');
              if (authorEl && authorEl.getAttribute('content')) {
                company = authorEl.getAttribute('content').trim();
              }
            }
          }

          if ((!title || title === 'Software Engineer' || !company || company === 'Target Company') && document.title && document.title.includes('| LinkedIn')) {
            const parts = document.title.split('|')[0].trim();
            if (parts.includes(' hiring at ')) {
              const [t, c] = parts.split(' hiring at ');
              title = t.trim();
              company = c.trim();
            } else if (parts.includes(' at ')) {
              const [t, c] = parts.split(' at ');
              title = t.trim();
              company = c.trim();
            }
          }

          if (!text && document.body) {
            text = document.body.innerText.trim();
          }

          const jobId = new URL(window.location.href).searchParams.get('currentJobId') ||
            (window.location.pathname.match(/\/jobs\/view\/(\d+)/i)?.[1] || '');
          const isJobPage = hasJobPostingJsonLd() ||
            (title && meaningfulDescription(text) && (hasApplyButton() || urlLooksJobLike || company)) ||
            (window.location.host.includes('linkedin.com') && Boolean(jobId) && meaningfulDescription(text));

          console.log(" [LetMeApply Page Script] Scraped -> Title:", title || "Software Engineer", "| Company:", company || "Target Company", "| Text chars:", text ? text.length : 0);

          return {
            title: title || 'Software Engineer',
            company: company || 'Target Company',
            text: text || '',
            isJobPage,
            jobId,
            url: window.location.href
          };
        }
      });
      
      let activeResult = null;
      if (results && results.length > 0) {
        const validFrames = results
          .map(r => r.result)
          .filter(r => r && r.isJobPage && r.text && r.text.length > 100);
          
        if (validFrames.length > 0) {
          validFrames.sort((a, b) => b.text.length - a.text.length);
          activeResult = validFrames[0];
        } else {
          activeResult = results[0].result;
        }
      }

      if (activeResult) {
        const resultIdentity = activeResult.jobId ? `linkedin:${activeResult.jobId}` : getJobIdentityFromUrl(activeResult.url || url);
        const [latestTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const latestUrl = latestTab?.url || '';
        const latestIdentity = getJobIdentityFromUrl(latestUrl);

        if (scanVersion !== extractionVersionRef.current || expectedIdentity !== activeExtractionIdentityRef.current || latestIdentity !== expectedIdentity) {
          logExtraction('stale result discarded', {
            tabId: tab.id,
            url,
            latestUrl,
            expectedIdentity,
            resultIdentity,
            latestIdentity,
            navigationVersion: scanVersion,
            currentVersion: extractionVersionRef.current
          });
          return;
        }

        if (!activeResult.isJobPage) {
          resetExtractedJobState('not a job page', { url, jobIdentity: expectedIdentity, navigationVersion: scanVersion });
          setLastAnalyzedUrl(url);
          setJobDetectionStatus("not-job");
          logExtraction('page classified', { tabId: tab.id, url, pageType: 'NOT_A_JOB_PAGE', reason: 'No strong job-page signal' });
          return;
        }

        const { title, company, text } = activeResult;
        const cleanedTitle = title
          .replace(/\(verified job\)/i, '')
          .replace(/\(remote\)/i, '')
          .replace(/\(hybrid\)/i, '')
          .replace(/\(on-site\)/i, '')
          .split('•')[0]
          .split('-')[0]
          .split('–')[0]
          .trim();
          
        const cleanedCompany = company
          .replace(/•.*$/g, '')
          .split('-')[0]
          .split('–')[0]
          .trim();
          
        let cleanedText = text;
        const noiseDividers = [
          "About the company",
          "Trending employee content",
          "Put your best foot forward",
          "Fraud Awareness",
          "E-Verify",
          "US Only",
          "Illinois: Click here",
          "Equal Opportunity Employer",
          "Fraud Privacy Policy",
          "We value your privacy",
          "Interested in working with us",
          "Members who share that",
          "Hire a resume writer",
          "Get a resume review",
          "Job search faster with Premium",
          "Access company insights",
          "Set alert for similar jobs"
        ];
        
        for (const divider of noiseDividers) {
          const matchIdx = cleanedText.toLowerCase().indexOf(divider.toLowerCase());
          if (matchIdx !== -1 && matchIdx > 200) {
            cleanedText = cleanedText.substring(0, matchIdx);
          }
        }

        if (cleanedText.trim().length < 100 || /^0 notifications$/i.test(cleanedText.trim())) {
          console.warn("[LetMeApply Extraction] Rejected invalid scrape:", {
            url,
            title: cleanedTitle,
            company: cleanedCompany,
            textLength: cleanedText.trim().length,
            preview: cleanedText.trim()
          });
          setJobText('');
          setCompanyName(cleanedCompany);
          setJobTitle(cleanedTitle);
          setLastAnalyzedUrl(url);
          setJobDetectionStatus("not-job");
          setApiError("Couldn't read the job description from this page yet. Scroll the job details panel once, then click Scan Again.");
          logExtraction('extraction rejected', { tabId: tab.id, url, jobIdentity: expectedIdentity, navigationVersion: scanVersion, descriptionLength: cleanedText.trim().length });
          return;
        }
        
        cleanedText = cleanedText
          .replace(/At \w+, we strive for an environment[\s\S]*$/gi, '')
          .trim();

        console.group(" [LetMeApply Extraction] Scraped Page Content");
        console.log(" URL:", url);
        console.log(" Title:", cleanedTitle);
        console.log(" Company:", cleanedCompany);
        console.log(" Text Length:", cleanedText.length, "characters");
        console.log(" Scraped Text Preview:\n", cleanedText.substring(0, 600) + (cleanedText.length > 600 ? "\n[...truncated for console]" : ""));
        console.groupEnd();

        if (url.includes('google.com/about/careers/applications/jobs/results/')) {
          cleanedText = cleanedText
            .replace(/Google is proud to be an equal opportunity workplace[\s\S]*$/i, '')
            .replace(/See also[\s\S]*$/i, '')
            .replace(/Related information[\s\S]*$/i, '')
            .replace(/Privacy\s+Terms[\s\S]*$/i, '')
            .trim();
        }

        setJobText(cleanedText);
        setCompanyName(cleanedCompany);
        setJobTitle(cleanedTitle);
        setLastAnalyzedUrl(url);
        setCurrentJobIdentity(expectedIdentity);
        setJobDetectionStatus("ready");
        logExtraction('extraction succeeded', {
          tabId: tab.id,
          url,
          jobIdentity: expectedIdentity,
          navigationVersion: scanVersion,
          descriptionLength: cleanedText.length,
          source: activeResult.jobId ? 'linkedin-selectors' : 'dom-selectors'
        });
      }
    } catch (error) {
      console.warn("Auto-scan page error (silenced):", error.message);
    }
  };

  // Perform Job Description Extraction (Step 1)
  const handleExtractJob = async () => {
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
          throw new Error(errData?.detail?.message || errData?.detail || "V1 extract route returned error or not found");
        }
        const jobPayload = await jobRes.json();
        if (jobPayload?.usage) {
          setUsage(prev => ({ ...(prev || {}), jd_extraction: jobPayload.usage }));
          await fetchSubscription();
        }
        analyzedJob = jobPayload?.data || jobPayload;
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
      const details = analyzedJob?.normalized_content || analyzedJob || {};
      const finalTitle = isValidText(analyzedJob?.job_title) ? analyzedJob.job_title : (isValidText(details.title) ? details.title : (isValidText(analyzedJob?.title) ? analyzedJob.title : (isValidText(jobTitle) ? jobTitle : 'Software Engineer')));
      const finalCompany = isValidText(analyzedJob?.company_name) ? analyzedJob.company_name : (isValidText(details.company) ? details.company : (isValidText(analyzedJob?.company) ? analyzedJob.company : (isValidText(companyName) ? companyName : 'Target Company')));

      console.group(" [LetMeApply Extraction] AI Job Analysis Output");
      console.log(" Title:", finalTitle);
      console.log(" Company:", finalCompany);
      console.log(" Location:", details.location || analyzedJob.location);
      console.log(" Salary:", details.salary || analyzedJob.salary);
      console.log(" Job Type:", details.job_type || analyzedJob.job_type);
      console.log(" Key Highlights:", details.highlights || analyzedJob.highlights);
      console.log(" Required Skills:", details.required_skills || analyzedJob.required_skills);
      console.log(" ATS Keywords:", analyzedJob.ats_keywords || details.ats_keywords || details.keywords);
      console.log(" Full Structured Output Object:", analyzedJob);
      console.groupEnd();

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
      const refreshedResumes = await fetchResumesList();
      const backendActiveResume = refreshedResumes?.find((resume) => resume.id === resumeRecord.id) || resumeRecord;
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
          resume: activeParsed,
          job: jobAnalysis
        })
      });

      if (!compareRes.ok) return null;
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
          resume: activeParsed,
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
      let idCounter = 1;
      const patch = compResult.patch;

      if (selectedSections.includes('summary') && patch.summary) {
        list.push({
          id: `change-${idCounter++}`,
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
              id: `change-${idCounter++}`,
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
              id: `change-${idCounter++}`,
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
            id: `change-${idCounter++}`,
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

  const handleGenerateFinalResume = async () => {
    // Build final patch from accepted suggestions
    const finalPatch = {
      summary: null,
      skills_append: [],
      experience: {},
      projects: {}
    };

    reviewSuggestions.forEach((s) => {
      if (s.status === 'accepted') {
        if (s.sectionType === 'summary') {
          finalPatch.summary = s.suggested;
        } else if (s.sectionType === 'experience') {
          if (!finalPatch.experience[s.itemIndex]) finalPatch.experience[s.itemIndex] = {};
          finalPatch.experience[s.itemIndex][s.bulletIndex] = s.suggested;
        } else if (s.sectionType === 'projects') {
          if (!finalPatch.projects[s.itemIndex]) finalPatch.projects[s.itemIndex] = {};
          finalPatch.projects[s.itemIndex][s.bulletIndex] = s.suggested;
        } else if (s.sectionType === 'skills') {
          finalPatch.skills_append.push(s.skillName);
        }
      }
    });

    try {
      setLoading(true);
      setLoadingMessage("Applying tailored changes...");
      const tailorResponse = await fetch(`${apiUrl}/api/tailor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-groq-key": apiKey } : {})
        },
        body: JSON.stringify({
          resume: parsedResume,
          patch: finalPatch
        })
      });

      if (!tailorResponse.ok) {
        throw new Error("Tailoring error: " + (await tailorResponse.json()).detail);
      }

      const tailoredResult = await tailorResponse.json();
      setTailoredResume(tailoredResult);
      setLoading(false);

      // Auto-create application session
      try {
        const appData = {
          company_name: companyName || "Target Company",
          job_title: jobTitle || "Software Engineer",
          location: jobAnalysis?.location || "Remote",
          job_url: lastAnalyzedUrl || "",
          resume_version: "v1 (Tailored)",
          cover_letter_version: null,
          ats_score: comparison?.ats_score || (comparison?.score ? parseFloat(comparison.score) : 85),
          resume_match_score: comparison?.match_score || (comparison?.score ? parseFloat(comparison.score) : 80),
          current_stage: "Ready To Apply",
          timeline: [
            { event: "JD Extracted", timestamp: new Date().toISOString() },
            { event: "Resume Tailored", timestamp: new Date().toISOString() }
          ]
        };
        const token = session?.access_token || localStorage.getItem('access_token');
        if (token) {
          const res = await fetch(`${apiUrl}/api/v1/applications/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(appData)
          });
          if (res.ok) {
            const data = await res.json();
            setActiveApplicationId(data.id);
            // Refresh list
            const freshRes = await fetch(`${apiUrl}/api/v1/applications/`, {
              headers: { "Authorization": `Bearer ${token}` }
            });
            if (freshRes.ok) {
              setApplications(await freshRes.json());
            }
          }
        }
      } catch (err) {
        console.error("Failed to automatically create application session:", err);
      }

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
    if (layoutLevel !== undefined) {
      const pruneLevel = Math.max(0, 5 - Math.floor(layoutLevel / 2));
      finalRes = compressResumeData(activeRes, pruneLevel);
      finalRes.layout_level = layoutLevel;
    }

    setLoading(true);
    setLoadingProgress(50);
    setLoadingMessage("Generating high-quality PDF...");

    try {
      const response = await fetch(`${apiUrl}/api/download-pdf?company_name=${encodeURIComponent(companyName || 'Company')}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          resume: finalRes,
          template_name: selectedTemplate || 'ExecutiveATS'
        })
      });

      if (!response.ok) {
        throw new Error("Failed to generate PDF from server.");
      }

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
          resume: activeParsed,
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
      fetchApplications, updateApplicationStage,
      selectedSkills, setSelectedSkills,
      selectedRewrites, setSelectedRewrites,
      acceptSummary, setAcceptSummary,
      selectedSections, setSelectedSections,
      tailoringIntensity, setTailoringIntensity,
      reviewSuggestions, setReviewSuggestions,
      selectedTemplate, setSelectedTemplate,
      customFileName, setCustomFileName,
      jobDetectionStatus, setJobDetectionStatus,
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


