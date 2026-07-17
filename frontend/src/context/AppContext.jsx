import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { compressResumeData } from '../utils/resumeCompression';

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

          // Fetch resumes to check if any exist and load the latest one if not already set
          try {
            const resumes = await fetchResumesList(storedToken);
            if (resumes && resumes.length > 0) {
              const latestResume = {
                ...(resumes[0].parsed_content || resumes[0]),
                id: resumes[0].id,
                file_name: resumes[0].file_name,
                file_size: resumes[0].file_size,
                file_type: resumes[0].file_type,
                created_at: resumes[0].created_at
              };
              setParsedResume(latestResume);
              const isExt = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
              if (isExt) {
                chrome.storage.local.set({ parsedResume: latestResume });
              } else {
                localStorage.setItem('parsed_resume', JSON.stringify(latestResume));
              }
            }
          } catch (rErr) {
            console.error("Failed to fetch resumes on startup:", rErr);
          } finally {
            setLoadingResume(false);
          }
        } else {
          localStorage.removeItem('access_token');
          setLoadingResume(false);
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
  const [lastAnalyzedTitle, setLastAnalyzedTitle] = useState('');
  const [lastAnalyzedCompany, setLastAnalyzedCompany] = useState('');
  const [lastAnalyzedText, setLastAnalyzedText] = useState('');

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

  const isExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  // Load configs & saved resume (STRICTLY NO cached job extraction or UI state)
  useEffect(() => {
    if (isExtension) {
      chrome.storage.local.get(['groqApiKey', 'apiUrl', 'parsedResume', 'tailoredResume', 'selectedTemplate'], (result) => {
        if (result.groqApiKey) setApiKey(result.groqApiKey);
        if (result.apiUrl) setApiUrl(result.apiUrl);
        if (result.parsedResume) setParsedResume(result.parsedResume);
        if (result.tailoredResume) setTailoredResume(result.tailoredResume);
        if (result.selectedTemplate) setSelectedTemplate(result.selectedTemplate);
      });
      // Purge any old extraction caches from chrome.storage
      chrome.storage.local.remove(['jobAnalysis', 'jobText', 'companyName', 'jobTitle']);
    } else {
      const savedKey = localStorage.getItem('groq_api_key');
      const savedUrl = localStorage.getItem('fastapi_api_url');
      const savedResume = localStorage.getItem('parsed_resume');
      const savedTailored = localStorage.getItem('tailored_resume');
      const savedTemplate = localStorage.getItem('selected_template');
      // Purge any old extraction caches from localStorage
      localStorage.removeItem('job_analysis');
      localStorage.removeItem('job_text');
      localStorage.removeItem('company_name');
      localStorage.removeItem('job_title');
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
      fetchApplications();
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

  // Strictly stateless extraction: Never save jobAnalysis or job text to storage

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
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setResumesList(data);
        return data;
      }
    } catch (err) {
      console.error("Failed to fetch resumes:", err);
    }
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
        if (parsedResume && parsedResume.id === resumeId) {
          if (updatedList && updatedList.length > 0) {
            const nextResume = {
              ...(updatedList[0].parsed_content || updatedList[0]),
              id: updatedList[0].id,
              file_name: updatedList[0].file_name,
              file_size: updatedList[0].file_size,
              file_type: updatedList[0].file_type,
              created_at: updatedList[0].created_at
            };
            setParsedResume(nextResume);
            if (isExtension) chrome.storage.local.set({ parsedResume: nextResume });
            else localStorage.setItem('parsed_resume', JSON.stringify(nextResume));
          } else {
            setParsedResume(null);
            if (isExtension) chrome.storage.local.remove('parsedResume');
            else localStorage.removeItem('parsed_resume');
          }
        }
      }
    } catch (err) {
      console.error("Failed to delete resume:", err);
    }
  };

  // Scan Active Page content
  const handleScanPage = async (isManual = false) => {
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

    if (!isManual && jobAnalysis) {
      if (currentTabUrl && lastAnalyzedUrl && currentTabUrl === lastAnalyzedUrl) {
        console.log("[AppContext] Ignoring auto-scan because a job is already being tailored for this exact URL.");
        return;
      }
      if (currentTabUrl && lastAnalyzedUrl && currentTabUrl !== lastAnalyzedUrl) {
        console.log("[AppContext] New URL detected during auto-scan. Clearing previous job analysis.");
        setJobAnalysis(null);
      }
    }

    if (isManual) {
      setLastAnalyzedUrl('');
      setJobAnalysis(null);
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
      if (url.includes('linkedin.com/in/') || 
          url.includes('linkedin.com/feed/') || 
          url.includes('linkedin.com/messaging/') || 
          url.includes('linkedin.com/mynetwork/')) {
        console.log("Auto-scan bypassed: Active tab is a profile, feed, network, or message page.");
        return;
      }
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          let title = '';
          let company = '';
          let text = '';

          if (window.location.host.includes('linkedin.com')) {
            const titleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .p5, h1');
            if (titleEl) title = titleEl.innerText.trim();
            const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .jobs-unified-top-card__primary-description a');
            if (companyEl) company = companyEl.innerText.trim();
            const descEl = document.querySelector('.jobs-description__content, .jobs-description-content__text, .jobs-box__html-content, .jobs-description, #job-details');
            if (descEl) text = descEl.innerText.trim();
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

          console.log("⚡ [LetMeApply Page Script] Scraped -> Title:", title || "Software Engineer", "| Company:", company || "Target Company", "| Text chars:", text ? text.length : 0);

          return {
            title: title || 'Software Engineer',
            company: company || 'Target Company',
            text: text || ''
          };
        }
      });
      
      let activeResult = null;
      if (results && results.length > 0) {
        const validFrames = results
          .map(r => r.result)
          .filter(r => r && r.text && r.text.length > 100);
          
        if (validFrames.length > 0) {
          validFrames.sort((a, b) => b.text.length - a.text.length);
          activeResult = validFrames[0];
        } else {
          activeResult = results[0].result;
        }
      }

      if (activeResult) {
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
        
        cleanedText = cleanedText
          .replace(/At \w+, we strive for an environment[\s\S]*$/gi, '')
          .trim();

        console.group("🚀 [LetMeApply Extraction] Scraped Page Content");
        console.log("📍 URL:", url);
        console.log("📌 Title:", cleanedTitle);
        console.log("🏢 Company:", cleanedCompany);
        console.log("📏 Text Length:", cleanedText.length, "characters");
        console.log("📝 Scraped Text Preview:\n", cleanedText.substring(0, 600) + (cleanedText.length > 600 ? "\n[...truncated for console]" : ""));
        console.groupEnd();

        setJobText(cleanedText);
        setCompanyName(cleanedCompany);
        setJobTitle(cleanedTitle);
        setLastAnalyzedUrl(url);
      }
    } catch (error) {
      console.warn("Auto-scan page error (silenced):", error.message);
    }
  };

  // Perform Job Description Extraction (Step 1)
  const handleExtractJob = async () => {
    if (!jobText) {
      alert("Please scan or paste a job description first.");
      return;
    }

    setApiError(null);
    setLoadingType('extraction');
    setLoadingProgress(5);
    setLoadingMessage("Reading Job Description...");

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
        const jobRes = await fetch(`${apiUrl}/api/v1/jobs/extract`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers
          },
          body: JSON.stringify({
            jd_text: jobText,
            url: window.location.href,
            page_title: jobTitle || document.title,
            page_company: companyName || ""
          })
        });
        if (!jobRes.ok) throw new Error("V1 extract route returned error or not found");
        analyzedJob = await jobRes.json();
      } catch (err) {
        const jobResFallback = await fetch(`${apiUrl}/api/analyze-job`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers
          },
          body: JSON.stringify({
            jd_text: jobText,
            url: window.location.href,
            page_title: jobTitle || document.title,
            page_company: companyName || ""
          })
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

      console.group("✨ [LetMeApply Extraction] AI Job Analysis Output");
      console.log("🎯 Title:", finalTitle);
      console.log("🏢 Company:", finalCompany);
      console.log("📍 Location:", details.location || analyzedJob.location);
      console.log("💰 Salary:", details.salary || analyzedJob.salary);
      console.log("💼 Job Type:", details.job_type || analyzedJob.job_type);
      console.log("🌟 Key Highlights:", details.highlights || analyzedJob.highlights);
      console.log("🛠️ Required Skills:", details.required_skills || analyzedJob.required_skills);
      console.log("🔑 ATS Keywords:", analyzedJob.ats_keywords || details.ats_keywords || details.keywords);
      console.log("📦 Full Structured Output Object:", analyzedJob);
      console.groupEnd();

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

  // Shared submission function merging manual entry into the structured extraction pipeline
  const submitManualJobEntry = async ({
    url,
    role,
    company,
    description,
    location = "",
    employmentType = "",
    experience = "",
    salary = ""
  }) => {
    setApiError(null);
    setJobText(description);
    setCompanyName(company);
    setJobTitle(role);
    setJobAnalysis(null);
    navigate('/tailor');
    setLoadingType('extraction');
    setLoadingProgress(10);
    setLoadingMessage("Extracting Job Description Details...");

    const progressInterval = setInterval(() => {
      setLoadingProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 15;
      });
    }, 300);

    const headers = {};
    if (apiKey) headers["x-groq-key"] = apiKey;
    const token = session?.access_token || localStorage.getItem('access_token');
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      let analyzedJob;
      try {
        const jobRes = await fetch(`${apiUrl}/api/v1/jobs/extract`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers
          },
          body: JSON.stringify({
            jd_text: description,
            url: url,
            page_title: role,
            page_company: company,
            location: location,
            employment_type: employmentType,
            experience_level: experience,
            salary_range: salary
          })
        });
        if (!jobRes.ok) throw new Error("V1 extract route returned error or not found");
        analyzedJob = await jobRes.json();
      } catch (err) {
        const jobResFallback = await fetch(`${apiUrl}/api/analyze-job`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers
          },
          body: JSON.stringify({
            jd_text: description,
            url: url,
            page_title: role,
            page_company: company,
            location: location,
            employment_type: employmentType,
            experience_level: experience,
            salary_range: salary
          })
        });
        if (!jobResFallback.ok) {
          throw new Error(`Server returned ${jobResFallback.status}`);
        }
        analyzedJob = await jobResFallback.json();
      }

      clearInterval(progressInterval);

      const isValidText = (str) => typeof str === 'string' && str.trim() !== '' && str.trim().toLowerCase() !== 'not available' && str.trim().toLowerCase() !== 'n/a' && str.trim().toLowerCase() !== 'unspecified';
      const details = analyzedJob?.normalized_content || analyzedJob || {};
      const finalTitle = isValidText(analyzedJob?.job_title) ? analyzedJob.job_title : (isValidText(details.title) ? details.title : (isValidText(analyzedJob?.title) ? analyzedJob.title : role));
      const finalCompany = isValidText(analyzedJob?.company_name) ? analyzedJob.company_name : (isValidText(details.company) ? details.company : (isValidText(analyzedJob?.company) ? analyzedJob.company : company));

      setJobAnalysis(analyzedJob);
      if (isValidText(finalCompany)) setCompanyName(finalCompany);
      if (isValidText(finalTitle)) setJobTitle(finalTitle);

      setLoadingProgress(0);
      setJobDetectionStatus("ready");
    } catch (error) {
      clearInterval(progressInterval);
      console.error("Manual job submission error:", error);
      setLoadingProgress(0);
      setJobDetectionStatus("ready");
      navigate('/no-job-detected');
    }
  };

  // Strictly Stateless Fresh Session Extraction Pipeline (Steps 1 - 12)
  const handleFreshSessionExtraction = async () => {
    const sessionTimestamp = new Date().toISOString();
    console.log("==================================================");
    console.log("NEW EXTRACTION SESSION");
    console.log(`Timestamp: ${sessionTimestamp}`);
    console.log("==================================================");
    console.log("Popup Opened");

    // Steps 2, 3, & 4: Reset extraction state, Clear previous extraction variables, Clear previous UI
    console.log("Clearing Previous State");
    setJobAnalysis(null);
    setJobText("");
    setCompanyName("");
    setJobTitle("");
    setLastAnalyzedUrl("");
    setApiError(null);
    setLoadingProgress(0);
    setJobDetectionStatus("idle");

    console.log("Previous Cache Cleared");
    if (isExtension && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(['jobAnalysis', 'jobText', 'companyName', 'jobTitle']);
    }
    localStorage.removeItem('job_analysis');
    localStorage.removeItem('job_text');
    localStorage.removeItem('company_name');
    localStorage.removeItem('job_title');

    if (!isExtension || typeof chrome === 'undefined' || !chrome.tabs) {
      console.log("Current URL: dev-mode-non-extension");
      console.log("Current Title: Development Mode");
      return;
    }

    try {
      // Step 5 & 6: Query the active browser tab & Verify the tab still exists
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        console.error("No active browser window or tab found.");
        return;
      }

      const currentUrl = tab.url || '';
      const currentTitle = tab.title || '';
      console.log("Current URL:", currentUrl);
      console.log("Current Title:", currentTitle);

      if (currentUrl.includes('linkedin.com/in/') || 
          currentUrl.includes('linkedin.com/feed/') || 
          currentUrl.includes('linkedin.com/messaging/') || 
          currentUrl.includes('linkedin.com/mynetwork/')) {
        console.log("Active tab is a profile, feed, network, or message page. Bypassing extraction.");
        return;
      }

      // Step 7: Send a fresh extraction request to the content script
      console.log("Sending Extraction Request...");
      console.log("Waiting for Content Script...");

      // Step 8: The content script extracts the CURRENT page DOM
      // Step 8: The content script runs DOM Candidate Discovery & Scoring Engine (<100ms)
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const startTime = performance.now();

          // Helper for generating XPath
          const getXPath = (el) => {
            if (!el || el.nodeType !== 1) return '';
            if (el.id && el.id.indexOf(' ') === -1 && !/\d{4,}/.test(el.id)) {
              return `//*[@id="${el.id}"]`;
            }
            const parts = [];
            let curr = el;
            while (curr && curr.nodeType === 1 && curr !== document.documentElement) {
              let index = 1;
              let sibling = curr.previousElementSibling;
              while (sibling) {
                if (sibling.nodeName === curr.nodeName) index++;
                sibling = sibling.previousElementSibling;
              }
              const name = curr.nodeName.toLowerCase();
              parts.unshift(index > 1 ? `${name}[${index}]` : name);
              curr = curr.parentNode;
            }
            return '/' + parts.join('/');
          };

          // Step 1: Traverse DOM and generate candidates
          // Elements: main, article, section, div
          // Ignore: header, footer, nav, aside and anything inside them
          const allElements = document.querySelectorAll('main, article, section, div');
          const candidates = [];

          for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i];
            if (!el) continue;
            
            const tag = el.nodeName.toLowerCase();
            if (['header', 'footer', 'nav', 'aside'].includes(tag)) continue;
            if (el.closest('header, footer, nav, aside')) continue;

            const textContent = el.textContent || '';
            const textLength = textContent.trim().length;
            // Generate candidate for every reasonably large subtree
            if (textLength < 300) continue;
            if (el === document.body || el === document.documentElement) continue;

            candidates.push(el);
          }

          // Step 2: Candidate Scoring
          const scoredCandidates = candidates.map((el, index) => {
            let score = 0;
            const posReasons = [];
            const negReasons = [];
            const text = el.textContent || '';
            const textLength = text.trim().length;
            const classNameAndId = `${el.className || ''} ${el.id || ''}`.toLowerCase();

            // --- POSITIVE SIGNALS ---
            if (el.querySelector('h1')) {
              score += 20; posReasons.push("H1 Title (+20)");
            } else if (el.querySelector('h2')) {
              score += 15; posReasons.push("H2 Title (+15)");
            }

            if (/\b(company|employer|hiring at|inc\.|llc|corp|technologies|solutions)\b/i.test(text) || /company/i.test(classNameAndId)) {
              score += 10; posReasons.push("Company Name (+10)");
            }

            if (/\b(location|hybrid|remote|on-site|full-time|part-time|workplace)\b/i.test(text) || /location/i.test(classNameAndId)) {
              score += 10; posReasons.push("Location (+10)");
            }

            if (el.querySelector('a[href*="apply" i], button[class*="apply" i], [aria-label*="apply" i], .apply-button, #apply-button')) {
              score += 15; posReasons.push("Apply Button (+15)");
            }

            if (/\b(description|job description|about the job|about the role)\b/i.test(text) || /description/i.test(classNameAndId)) {
              score += 15; posReasons.push("Description (+15)");
            }

            if (/\b(responsibilities|key responsibilities|what you'll do|what you will do|daily tasks)\b/i.test(text)) {
              score += 20; posReasons.push("Responsibilities (+20)");
            }

            if (/\b(qualifications|preferred qualifications|basic qualifications|minimum qualifications)\b/i.test(text)) {
              score += 20; posReasons.push("Qualifications (+20)");
            }

            if (/\b(requirements|job requirements|what we look for|technical requirements|must have)\b/i.test(text)) {
              score += 20; posReasons.push("Requirements (+20)");
            }

            if (/\b(benefits|what we offer|perks|health insurance|paid time off)\b/i.test(text)) {
              score += 10; posReasons.push("Benefits (+10)");
            }

            if (/\b(experience|years of experience|track record|demonstrated experience)\b/i.test(text)) {
              score += 10; posReasons.push("Experience (+10)");
            }

            if (/\b(employment type|full-time|part-time|contract|permanent|internship)\b/i.test(text)) {
              score += 10; posReasons.push("Employment Type (+10)");
            }

            if (/\b(salary|compensation|pay range|\$\d+|\d+k\b|per hour|per year)\b/i.test(text)) {
              score += 10; posReasons.push("Salary (+10)");
            }

            if (textLength >= 800 && textLength <= 15000) {
              score += 20; posReasons.push("Large Readable Content (+20)");
            } else if (textLength >= 300 && textLength < 800) {
              score += 10; posReasons.push("Readable Content (+10)");
            }

            const links = el.querySelectorAll('a');
            if (links.length <= 5 && textLength >= 400) {
              score += 10; posReasons.push("Few External Links (+10)");
            }

            // --- NEGATIVE SIGNALS ---
            if (links.length > 25) {
              score -= 40; negReasons.push(`Many Links (${links.length}: -40)`);
            } else if (links.length > 12) {
              score -= 20; negReasons.push(`Repeated Links (${links.length}: -20)`);
            }

            if (/nav|menu|breadcrumb|topbar/i.test(classNameAndId)) {
              score -= 40; negReasons.push("Navigation (-40)");
            }

            if (/sidebar|aside|panel|widget|jobs-search-results-list/i.test(classNameAndId)) {
              score -= 40; negReasons.push("Sidebar (-40)");
            }

            if (/header|footer/i.test(classNameAndId)) {
              score -= 50; negReasons.push("Header/Footer (-50)");
            }

            if (/messaging|chat|inbox|conversation/i.test(classNameAndId)) {
              score -= 50; negReasons.push("Messaging (-50)");
            }

            if (/ad-|advert|banner|sponsored/i.test(classNameAndId)) {
              score -= 50; negReasons.push("Advertisements (-50)");
            }

            if (/\b(recommended jobs|similar jobs|top job picks|jobs for you|people also viewed|browse jobs)\b/i.test(text) || /recommend|similar/i.test(classNameAndId)) {
              score -= 40; negReasons.push("Recommended Jobs (-40)");
            }

            if (/job-list|jobs-list|search-results|job-card/i.test(classNameAndId) || (text.match(/\b(Promoted|Actively hiring|Verified job|Easy Apply)\b/gi) || []).length >= 3) {
              score -= 60; negReasons.push("Multiple Job Cards List (-60)");
            }

            if (/\b(jobs-description__content|job-details|jobsearch-jobcomponent-description|posting-description|job-description|app-title)\b/i.test(classNameAndId)) {
              score += 25; posReasons.push("Exact Job Container Class (+25)");
            }

            const xpath = getXPath(el);
            const reasonStr = `POS: [${posReasons.join(', ')}] | NEG: [${negReasons.join(', ')}]`;

            return {
              index: index + 1,
              xpath,
              nodeName: el.nodeName.toLowerCase(),
              childrenCount: el.children.length,
              textLength,
              score,
              reason: reasonStr,
              el
            };
          });

          scoredCandidates.sort((a, b) => b.score - a.score);

          // Step 3: Choose highest scoring candidate
          const winner = scoredCandidates.length > 0 ? scoredCandidates[0] : null;

          // Step 4: Extract ONLY the winner subtree. Use textContent. Normalize whitespace. Remove script/style.
          let extractedText = '';
          if (winner && winner.el) {
            const clone = winner.el.cloneNode(true);
            clone.querySelectorAll('script, style, noscript, svg, path, iframe, button').forEach(n => n.remove());
            extractedText = (clone.textContent || '')
              .replace(/\r\n|\r|\n/g, '\n')
              .replace(/[ \t]+/g, ' ')
              .replace(/\n\s*\n+/g, '\n\n')
              .trim();
          }

          const endTime = performance.now();
          const processingTimeMs = (endTime - startTime).toFixed(2);

          // Extract quick header info for UI
          let title = '';
          let company = '';
          const titleEl = document.querySelector('h1, .job-details-jobs-unified-top-card__job-title, .jobsearch-JobInfoHeader-title, .app-title');
          if (titleEl) title = titleEl.innerText.trim();
          const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name, [data-company-name="true"], .company-name, .jobsearch-CompanyInfoContainer');
          if (companyEl) company = companyEl.innerText.replace('at ', '').trim();

          const candidatesSummary = scoredCandidates.slice(0, 15).map(c => ({
            index: c.index,
            xpath: c.xpath,
            nodeName: c.nodeName,
            childrenCount: c.childrenCount,
            textLength: c.textLength,
            score: c.score,
            reason: c.reason
          }));

          return {
            candidatesCount: scoredCandidates.length,
            candidatesSummary,
            winnerScore: winner ? winner.score : 0,
            winnerXpath: winner ? winner.xpath : '',
            winnerNodeName: winner ? winner.nodeName : '',
            winnerDomSize: winner ? winner.childrenCount : 0,
            winnerTextLength: winner ? winner.textLength : 0,
            extractedText,
            processingTimeMs,
            title: title || 'Software Engineer',
            company: company || 'Target Company'
          };
        }
      });

      // Step 9: Return freshly extracted data & Print DEBUG LOGS
      console.log("Fresh DOM Received");
      let activeResult = null;
      if (results && results.length > 0 && results[0].result) {
        activeResult = results[0].result;
      }

      if (!activeResult) {
        console.warn("DOM Candidate Discovery returned no result. Navigating to No Job Found flow.");
        setJobAnalysis(null);
        setLoadingProgress(0);
        setJobDetectionStatus("ready");
        setLastAnalyzedUrl(currentUrl);
        setLastAnalyzedTitle(currentTitle);
        setLastAnalyzedCompany("");
        setLastAnalyzedText("");
        navigate('/no-job-detected');
        return;
      }

      console.group("====================================================\nDOM DISCOVERY\n====================================================");
      console.log(`Candidates Found: ${activeResult.candidatesCount} (Processing time: ${activeResult.processingTimeMs}ms)`);
      (activeResult.candidatesSummary || []).forEach(c => {
        console.log(`\nCandidate #${c.index}\nXPath: ${c.xpath}\nNode Name: ${c.nodeName}\nChildren: ${c.childrenCount}\nText Length: ${c.textLength}\nScore: ${c.score}\nReason: ${c.reason}\n----------------------`);
      });
      console.groupEnd();

      console.group("====================================================\nWINNER\n====================================================");
      console.log(`Winner XPath: ${activeResult.winnerXpath}`);
      console.log(`Winner Score: ${activeResult.winnerScore}`);
      console.log(`Winner DOM Size: ${activeResult.winnerDomSize} children`);
      console.log(`Winner Text Length: ${activeResult.winnerTextLength} characters`);
      console.log(`Preview:\n${(activeResult.extractedText || '').substring(0, 300)}...`);
      console.groupEnd();

      console.group("====================================================\nEXTRACTION\n====================================================");
      console.log(`Extracted Characters: ${(activeResult.extractedText || '').length}`);
      console.log(`Preview:\n${(activeResult.extractedText || '').substring(0, 500)}${(activeResult.extractedText || '').length > 500 ? '\n[...truncated]' : ''}`);
      console.groupEnd();

      // Configurable score threshold for single job validation
      const CONFIGURABLE_THRESHOLD = 35;

      console.group("====================================================\nSEND TO BACKEND\n====================================================");
      if (activeResult.winnerScore < CONFIGURABLE_THRESHOLD || !activeResult.extractedText || activeResult.extractedText.length < 150) {
        console.log(`Payload Size: 0 bytes (Aborted: Winner score ${activeResult.winnerScore} below threshold ${CONFIGURABLE_THRESHOLD})`);
        console.groupEnd();
        console.warn(`[Job Detection Engine] Validation Rejected: Winner score (${activeResult.winnerScore}) below threshold.`);
        
        setJobAnalysis(null);
        setLoadingProgress(0);
        setJobDetectionStatus("ready");
        setLastAnalyzedUrl(currentUrl);
        setLastAnalyzedTitle(activeResult.title || currentTitle);
        setLastAnalyzedCompany(activeResult.company || "");
        setLastAnalyzedText(activeResult.extractedText || "");
        console.log("Extraction Complete (Aborted by DOM Scoring Threshold - navigating to No Job Found flow)");
        console.log("==================================================");
        navigate('/no-job-detected');
        return;
      }

      const payloadObj = {
        jd_text: activeResult.extractedText,
        url: currentUrl,
        page_title: activeResult.title || currentTitle,
        page_company: activeResult.company || ""
      };
      const payloadStr = JSON.stringify(payloadObj);
      const payloadSize = new Blob([payloadStr]).size;

      console.log(`Payload Size: ${payloadSize} bytes`);
      console.log(`Preview:\n${activeResult.extractedText.substring(0, 400)}...`);
      console.groupEnd();

      setJobText(activeResult.extractedText);
      setCompanyName(activeResult.company);
      setJobTitle(activeResult.title);

      // Step 11: LLM Structured Extraction (Only invoked when winner score >= threshold)
      console.log("Extraction Started");
      setLoadingType('extraction');
      setLoadingProgress(10);
      setLoadingMessage("Extracting Job Description Details...");

      const headers = {};
      if (apiKey) headers["x-groq-key"] = apiKey;
      const token = session?.access_token || localStorage.getItem('access_token');
      if (token) headers["Authorization"] = `Bearer ${token}`;

      let analyzedJob;
      try {
        const jobRes = await fetch(`${apiUrl}/api/v1/jobs/extract`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers
          },
          body: JSON.stringify({
            jd_text: activeResult.extractedText,
            url: currentUrl,
            page_title: activeResult.title || currentTitle,
            page_company: activeResult.company || ""
          })
        });
        if (!jobRes.ok) throw new Error("V1 extract route returned error or not found");
        analyzedJob = await jobRes.json();
      } catch (err) {
        const jobResFallback = await fetch(`${apiUrl}/api/analyze-job`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers
          },
          body: JSON.stringify({
            jd_text: activeResult.extractedText,
            url: currentUrl,
            page_title: activeResult.title || currentTitle,
            page_company: activeResult.company || ""
          })
        });
        if (!jobResFallback.ok) {
          const errData = await jobResFallback.json().catch(() => ({ detail: jobResFallback.statusText }));
          throw new Error("Job analysis error: " + (errData.detail || "Request failed"));
        }
        analyzedJob = await jobResFallback.json();
      }

      // Step 12: Render the UI
      console.log("Rendering UI");
      const isValidText = (str) => typeof str === 'string' && str.trim() !== '' && str.trim().toLowerCase() !== 'not available' && str.trim().toLowerCase() !== 'n/a' && str.trim().toLowerCase() !== 'unspecified';
      const details = analyzedJob?.normalized_content || analyzedJob || {};
      const finalTitle = isValidText(analyzedJob?.job_title) ? analyzedJob.job_title : (isValidText(details.title) ? details.title : (isValidText(analyzedJob?.title) ? analyzedJob.title : (isValidText(activeResult.title) ? activeResult.title : 'Software Engineer')));
      const finalCompany = isValidText(analyzedJob?.company_name) ? analyzedJob.company_name : (isValidText(details.company) ? details.company : (isValidText(analyzedJob?.company) ? analyzedJob.company : (isValidText(activeResult.company) ? activeResult.company : 'Target Company')));

      const isRelated = analyzedJob?.is_job_related !== false && analyzedJob?.normalized_content?.is_job_related !== false;
      if (!isRelated) {
        setJobAnalysis(null);
        setLoadingProgress(0);
        setJobDetectionStatus("ready");
        setLastAnalyzedUrl(currentUrl);
        setLastAnalyzedTitle(finalTitle !== 'Software Engineer' ? finalTitle : (activeResult.title || currentTitle));
        setLastAnalyzedCompany(finalCompany !== 'Target Company' ? finalCompany : (activeResult.company || ""));
        setLastAnalyzedText(activeResult.extractedText || "");
        console.log("Extraction Complete (Not a job posting by backend check - navigating to No Job Found flow)");
        console.log("==================================================");
        navigate('/no-job-detected');
        return;
      }

      setJobAnalysis(analyzedJob);
      if (isValidText(finalCompany)) setCompanyName(finalCompany);
      if (isValidText(finalTitle)) setJobTitle(finalTitle);

      setLoadingProgress(0);
      setJobDetectionStatus("ready");
      console.log("Extraction Complete");
      console.log("==================================================");

    } catch (error) {
      console.error("Fresh session extraction error:", error);
      setApiError(null);
      setJobAnalysis(null);
      setLoadingProgress(0);
      setJobDetectionStatus("ready");
      setLastAnalyzedUrl(currentUrl);
      setLastAnalyzedTitle(activeResult.title || currentTitle);
      setLastAnalyzedCompany(activeResult.company || "");
      setLastAnalyzedText(activeResult.extractedText || "");
      navigate('/no-job-detected');
    }
  };

  // Perform Resume Parsing (Step 4)
  const handleParseResume = async () => {
    if (!resumeFile && !parsedResume) {
      alert("Please select a resume file to parse.");
      return;
    }

    if (parsedResume && !resumeFile) {
      navigate('/resume-review');
      return;
    }

    setApiError(null);
    navigate('/resume-parse');
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
      const token = session?.access_token;
      const headers = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (apiKey) headers["x-groq-key"] = apiKey;

      const formData = new FormData();
      formData.append("file", resumeFile);

      const parseRes = await fetch(`${apiUrl}/api/v1/resumes/upload`, {
        method: "POST",
        headers,
        body: formData
      });

      if (!parseRes.ok) {
        throw new Error("Resume parse error: " + (await parseRes.json()).detail);
      }
      const resumeRecord = await parseRes.json();
      await fetchResumesList();
      const currentResume = {
        ...(resumeRecord.parsed_content || resumeRecord),
        id: resumeRecord.id,
        file_name: resumeRecord.file_name,
        file_size: resumeRecord.file_size,
        file_type: resumeRecord.file_type,
        created_at: resumeRecord.created_at
      };
      setParsedResume(currentResume);

      if (isExtension) {
        chrome.storage.local.set({ parsedResume: currentResume });
      }

      clearInterval(progressInterval);
      setLoadingProgress(100);
      setLoadingMessage("Parsing Complete!");
      setTimeout(() => {
        navigate('/resume-review');
      }, 300);

    } catch (error) {
      clearInterval(progressInterval);
      console.error(error);
      setApiError(error.message || "Failed to parse resume.");
      navigate('/resume-detect');
    }
  };

  // Perform full Gap analysis (ATS Compare) & Pre-Tailoring merge (Step 7)
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
      // Lazy parse if resume experience is empty and raw_text is present
      if (parsedResume.id && (!parsedResume.experience || parsedResume.experience.length === 0) && parsedResume.raw_text) {
        setLoadingMessage("Parsing Resume with AI for Tailoring...");
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

        setLoadingMessage("AI Parsing Complete! Starting Gap Analysis...");
        setLoadingProgress(35);
      }

      const headers = {};
      if (apiKey) headers["x-groq-key"] = apiKey;

      const compareRes = await fetch(`${apiUrl}/api/compare`, {
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

      if (!compareRes.ok) {
        throw new Error("Comparison error: " + (await compareRes.json()).detail);
      }

      const compResult = await compareRes.json();
      setComparison(compResult);

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
      lastAnalyzedTitle, setLastAnalyzedTitle,
      lastAnalyzedCompany, setLastAnalyzedCompany,
      lastAnalyzedText, setLastAnalyzedText,
      submitManualJobEntry,
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
      isExtension,
      loadingResume,
      hasRedirectedOnStartup,
      setHasRedirectedOnStartup,
      resumesList, setResumesList,
      fetchResumesList,
      handleDeleteResume,
      handleScanPage,
      handleExtractJob,
      handleFreshSessionExtraction,
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
