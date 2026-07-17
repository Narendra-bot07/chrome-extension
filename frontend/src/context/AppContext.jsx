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

  // Load configs & saved resume
  useEffect(() => {
    if (isExtension) {
      chrome.storage.local.get(['groqApiKey', 'apiUrl', 'parsedResume', 'tailoredResume', 'selectedTemplate', 'jobAnalysis', 'jobText', 'companyName', 'jobTitle'], (result) => {
        if (result.groqApiKey) setApiKey(result.groqApiKey);
        if (result.apiUrl) setApiUrl(result.apiUrl);
        if (result.parsedResume) setParsedResume(result.parsedResume);
        if (result.tailoredResume) setTailoredResume(result.tailoredResume);
        if (result.selectedTemplate) setSelectedTemplate(result.selectedTemplate);
        if (result.jobAnalysis) setJobAnalysis(result.jobAnalysis);
        if (result.jobText) setJobText(result.jobText);
        if (result.companyName) setCompanyName(result.companyName);
        if (result.jobTitle) setJobTitle(result.jobTitle);
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

  // Save/Remove job analysis context storage so full browser tabs open cleanly with extracted job
  useEffect(() => {
    if (jobAnalysis) {
      if (isExtension) {
        chrome.storage.local.set({ jobAnalysis, jobText, companyName, jobTitle });
      } else {
        localStorage.setItem('job_analysis', JSON.stringify(jobAnalysis));
        if (jobText) localStorage.setItem('job_text', jobText);
        if (companyName) localStorage.setItem('company_name', companyName);
        if (jobTitle) localStorage.setItem('job_title', jobTitle);
      }
    } else {
      if (isExtension) {
        chrome.storage.local.remove(['jobAnalysis', 'jobText', 'companyName', 'jobTitle']);
      } else {
        localStorage.removeItem('job_analysis');
        localStorage.removeItem('job_text');
        localStorage.removeItem('company_name');
        localStorage.removeItem('job_title');
      }
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
          body: JSON.stringify({ jd_text: jobText })
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
