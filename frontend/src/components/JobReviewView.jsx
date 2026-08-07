import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { collectJobSkills, formatSalary, isMissingValueToken, cleanLocationValue } from '../services/jdExtractionFlow';
import { 
  Heart,
  FilePenLine,
  RefreshCw,
  Target,
  X,
  MapPin,
  DollarSign,
  Briefcase,
  Building2,
  Timer,
  Tag,
  Wand2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { fingerprintJD } from '../utils/jobPipelineSession';
import './JobReviewView.css';
import { calculateJDMatchScore } from '../utils/matchScore';
import { normalizeJobItems } from '../utils/jobText';

const isNotAvailable = (val) => {
  if (!val) return true;
  if (Array.isArray(val)) {
    return val.length === 0 || val.every((item) => typeof item === 'string' && isMissingValueToken(item));
  }
  if (typeof val === 'string') {
    return val.trim() === '' || isMissingValueToken(val);
  }
  return false;
};

const getValidString = (...candidates) => {
  for (const c of candidates) {
    if (c && typeof c === 'string' && !isNotAvailable(c)) {
      return c;
    }
  }
  return null;
};

const normalizeToken = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9+#.]/g, '').trim();
const normalizeWords = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').replace(/\s+/g, ' ').trim();

const humanizeToken = (value) => String(value || '')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const flattenResumeSkills = (resume) => {
  const out = [];
  const push = (value) => {
    if (!value) return;
    if (Array.isArray(value)) value.forEach(push);
    else if (typeof value === 'object') Object.values(value).forEach(push);
    else out.push(String(value));
  };
  push(resume?.skills);
  push(resume?.skills_categories);
  push(resume?.technical_skills);
  push(resume?.parsed_content?.skills);
  push(resume?.parsed_content?.skills_categories);
  return Array.from(new Set(out.flatMap((item) => [normalizeToken(item), normalizeWords(item)]).filter(Boolean)));
};

const calculateMatchScore = ({ resume, requiredSkills, preferredSkills, qualificationsList, responsibilitiesList }) => {
  const resumeSkills = flattenResumeSkills(resume);
  const explicitJdSkills = Array.from(new Set([
    ...requiredSkills,
    ...preferredSkills
  ].flatMap((skill) => [normalizeToken(skill), normalizeWords(skill)]).filter(Boolean)));

  const jdTextRaw = [...qualificationsList, ...responsibilitiesList].join(' ');
  const inferredSkillPatterns = [
    'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'go', 'rust', 'sql',
    'react', 'nodejs', 'node.js', 'spring', 'fastapi', 'django',
    'aws', 'azure', 'google cloud', 'gcp', 'cloud', 'docker', 'kubernetes',
    'linux', 'unix', 'machine learning', 'ml', 'ai', 'genai', 'llms', 'llm',
    'nlp', 'security', 'data structures', 'algorithms', 'distributed systems',
    'microservices', 'backend', 'frontend', 'api', 'apis'
  ];
  const inferredJdSkills = inferredSkillPatterns
    .filter((skill) => jdTextRaw.toLowerCase().includes(skill))
    .flatMap((skill) => [normalizeToken(skill), normalizeWords(skill)]);

  const jdSkills = Array.from(new Set([...explicitJdSkills, ...inferredJdSkills]))
    .filter((skill, index, all) => {
      const compact = normalizeToken(skill);
      return all.findIndex((other) => normalizeToken(other) === compact) === index;
    });

  const resumeText = JSON.stringify(resume || {}).toLowerCase();
  const compactResumeText = normalizeToken(resumeText);
  const spacedResumeText = normalizeWords(resumeText);
  const skillMatchesResume = (skill) => {
    const compact = normalizeToken(skill);
    const spaced = normalizeWords(skill);
    if (!compact && !spaced) return false;
    return resumeSkills.includes(compact) ||
      resumeSkills.includes(spaced) ||
      compactResumeText.includes(compact) ||
      spacedResumeText.includes(spaced);
  };
  const displaySkill = new Map();
  [...requiredSkills, ...preferredSkills, ...inferredSkillPatterns].forEach((skill) => {
    displaySkill.set(normalizeToken(skill), humanizeToken(skill));
    displaySkill.set(normalizeWords(skill), humanizeToken(skill));
  });
  const matchedSkills = jdSkills.filter((skill) => skillMatchesResume(skill));
  const missingSkills = jdSkills.filter((skill) => !skillMatchesResume(skill));

  const jdText = jdTextRaw.toLowerCase();
  const experienceMatch = jdText.match(/\b(\d{1,2})\+?\s+years?\s+of\s+experience\b/);
  const requiredYears = experienceMatch ? Number(experienceMatch[1]) : null;
  const resumeYears = (JSON.stringify(resume?.experience || resume?.parsed_content?.experience || []) || '')
    .match(/\b(19|20)\d{2}\b/g);
  const hasExperienceSignal = !requiredYears || (resumeYears && resumeYears.length >= 1);

  if (!resume || jdSkills.length === 0) {
    return {
      score: null,
      matchedSkills: [],
      missingSkills: [],
      requiredCount: jdSkills.length,
      matchedCount: 0,
      reason: !resume ? 'No active resume selected.' : 'No JD skills detected.'
    };
  }  const skillScore = Math.round((matchedSkills.length / jdSkills.length) * 75);
  const experienceScore = hasExperienceSignal ? 15 : 5;
  const structureScore = resume ? 10 : 0;
  const score = Math.max(0, Math.min(100, skillScore + experienceScore + structureScore));

  return {
    score,
    matchedSkills: matchedSkills.map((skill) => displaySkill.get(skill) || humanizeToken(skill)).slice(0, 8),
    missingSkills: missingSkills.map((skill) => displaySkill.get(skill) || humanizeToken(skill)).slice(0, 8),
    requiredCount: jdSkills.length,
    matchedCount: matchedSkills.length
  };
};

function JobReviewView({
  jobAnalysis,
  handleReExtract,
  loading
}) {
  const navigate = useNavigate();
  const {
    user,
    session,
    parsedResume,
    isExtension,
    jobTitle,
    companyName,
    jobText,
    lastAnalyzedUrl,
    jobDetectionMeta,
    jobAnalysis: currentJobAnalysis,
    comparison
  } = useApp();
  const [applied, setApplied] = useState(false);
  const [favourite, setFavourite] = useState(false);
  const [showMatchPopup, setShowMatchPopup] = useState(false);
  const [isMatchZoomed, setIsMatchZoomed] = useState(false);
  const matchBaselineRef = useRef({ pairKey: '', score: null });
  const prevScoreRef = useRef(null);

  const getInitials = () => {
    if (user?.metadata?.full_name) {
      return user.metadata.full_name.charAt(0).toUpperCase();
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return 'D';
  };

  const openWorkflowRoute = (path, panelPath = null) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    const canonicalJD = currentJobAnalysis || jobAnalysis;
    const jdFingerprint = canonicalJD ? fingerprintJD(canonicalJD) : '';

    if (token) localStorage.setItem('access_token', token);
    if (parsedResume) localStorage.setItem('parsed_resume', JSON.stringify(parsedResume));

    if (isExtension && typeof chrome !== 'undefined' && chrome.storage?.local) {
      const snapshot = {
        access_token: token,
        parsedResume: parsedResume,
        jobAnalysis: canonicalJD,
        jobText,
        companyName,
        jobTitle,
        comparison
      };
      chrome.storage.local.set(snapshot, () => {
        const openTab = () => {
          const workflowUrl = chrome.runtime.getURL(`index.html#${path}`);
          if (chrome.tabs?.create) {
            chrome.tabs.create({ url: workflowUrl });
          } else {
            window.open(workflowUrl, '_blank', 'noopener,noreferrer');
          }
        };
        if (chrome.storage?.session && canonicalJD) {
          chrome.storage.session.set({
            jobExtractionSession: {
              version: 1,
              canonicalJD,
              jobAnalysis: canonicalJD,
              jdFingerprint,
              fingerprint: jdFingerprint,
              jobText: jobText || canonicalJD.description || '',
              companyName: companyName || canonicalJD.company || canonicalJD.company_name || '',
              jobTitle: jobTitle || canonicalJD.title || canonicalJD.job_title || '',
              lastAnalyzedUrl: lastAnalyzedUrl || canonicalJD.source_url || '',
              jobDetectionMeta: jobDetectionMeta || null,
              comparison: comparison || null,
              comparisonResumeId: parsedResume?.id || parsedResume?.resume_id || null,
              createdAt: new Date().toISOString()
            }
          }, openTab);
        } else {
          openTab();
        }
      });
      if (panelPath) {
        navigate(panelPath);
      }
      return;
    }

    navigate(path);
  };

  const handleResumeTailor = () => {
    openWorkflowRoute(
      parsedResume ? '/tailor-config' : '/resume-detect',
      '/resume-detect'
    );
  };

  const handleCoverLetterGenerate = () => {
    openWorkflowRoute(
      parsedResume ? '/cover-letter' : '/resume-detect',
      '/resume-detect'
    );
  };

  const details = jobAnalysis?.normalized_content || jobAnalysis || {};
  const INVALID_TITLE_NOISE = /^(?:people you can reach out to|about the job|about the company|job description|responsibilities|qualifications|requirements|minimum qualifications|preferred qualifications|similar jobs|recommended jobs|explore options|meet the hiring team|your profile and resume|privacy policy|terms of use|apply|easy apply|save|share|follow|show more|see more|search results|jobs for you|0 notifications|skip navigation|sign in|log in|target company)$/i;

  const title = [jobAnalysis?.job_title, details?.title, jobAnalysis?.title, jobTitle]
    .find((str) => str && typeof str === 'string' && !isNotAvailable(str) && !INVALID_TITLE_NOISE.test(str.trim())) || null;

  const company = [jobAnalysis?.company_name, details?.company, jobAnalysis?.company, companyName]
    .find((str) => str && typeof str === 'string' && !isNotAvailable(str) && !INVALID_TITLE_NOISE.test(str.trim()) && str.trim().toLowerCase() !== (title || '').toLowerCase()) || null;

  const rawLocation = !isNotAvailable(details.location) ? details.location : (!isNotAvailable(jobAnalysis?.location) ? jobAnalysis.location : null);
  const location = rawLocation ? cleanLocationValue(rawLocation) : null;
  const salaryValue = !isNotAvailable(details.salary) ? details.salary : (!isNotAvailable(jobAnalysis?.salary) ? jobAnalysis.salary : null);
  const salary = formatSalary(salaryValue);
  const jobType = !isNotAvailable(details.job_type) ? details.job_type : (!isNotAvailable(jobAnalysis?.job_type) ? jobAnalysis.job_type : (!isNotAvailable(jobAnalysis?.keywords) && jobAnalysis.keywords.includes('Full-time') ? 'Full-time' : null));
  const workMode = !isNotAvailable(details.work_mode) ? details.work_mode : (!isNotAvailable(jobAnalysis?.work_mode) ? jobAnalysis.work_mode : null);
  const experienceRequired = !isNotAvailable(details.experience_required) ? details.experience_required : (!isNotAvailable(jobAnalysis?.experience_required) ? jobAnalysis.experience_required : null);
  const seniority = !isNotAvailable(details.seniority) ? details.seniority : (!isNotAvailable(jobAnalysis?.seniority) ? jobAnalysis.seniority : null);

  useEffect(() => {
    console.log('[tailr4u:Trace 07] Props passed into JobReviewView', {
      jobAnalysis,
      jobTitle,
      companyName
    });
    console.log('[tailr4u:Trace 08] Final component render values', {
      title,
      company,
      location,
      jobType,
      workMode
    });
  }, [jobAnalysis, jobTitle, companyName, title, company, location, jobType, workMode]);

  const highlightsList = normalizeJobItems(
    !isNotAvailable(details.highlights) ? details.highlights : jobAnalysis?.highlights
  );

  const responsibilitiesList = normalizeJobItems(
    !isNotAvailable(details.responsibilities) ? details.responsibilities : jobAnalysis?.responsibilities
  );

  const qualificationsList = normalizeJobItems(
    !isNotAvailable(details.qualifications)
      ? details.qualifications
      : (details.requirements || jobAnalysis?.qualifications || jobAnalysis?.requirements)
  );

  const normalizedSkills = collectJobSkills(details);
  const requiredSkills = normalizedSkills.explicit;
  const preferredSkills = normalizedSkills.suggested;
  const providedCategories = details.skills_categories || jobAnalysis?.skills_categories || {};
  const skillsCategories = Object.keys(providedCategories).length > 0
    ? providedCategories
    : {
        ...(requiredSkills.length > 0 ? { Explicit: requiredSkills } : {}),
        ...(preferredSkills.length > 0 ? { Suggested: preferredSkills } : {})
      };

  const allSkills = [
    ...requiredSkills,
    ...preferredSkills
  ].filter(skill => skill && skill.toLowerCase() !== 'not available');

  const atsKeywordsList = !isNotAvailable(jobAnalysis?.ats_keywords) ? (Array.isArray(jobAnalysis.ats_keywords) ? jobAnalysis.ats_keywords : [jobAnalysis.ats_keywords]) : (!isNotAvailable(details.ats_keywords) ? (Array.isArray(details.ats_keywords) ? details.ats_keywords : [details.ats_keywords]) : []);

  const matchResult = useMemo(() => calculateJDMatchScore(parsedResume, jobAnalysis), [parsedResume, jobAnalysis]);

  const displayScore = matchResult.score;

  const matchScore = useMemo(() => ({
    score: displayScore,
    matchedSkills: matchResult.matchedSkills,
    missingSkills: matchResult.missingSkills
  }), [displayScore, matchResult]);

  useEffect(() => {
    if (displayScore !== null && displayScore !== undefined) {
      if (prevScoreRef.current !== displayScore) {
        prevScoreRef.current = displayScore;
        setIsMatchZoomed(true);
        const timer = setTimeout(() => {
          setIsMatchZoomed(false);
        }, 1400);
        return () => clearTimeout(timer);
      }
    }
  }, [displayScore]);

  const triggerScoreZoom = () => {
    setIsMatchZoomed(true);
    setTimeout(() => {
      setIsMatchZoomed(false);
    }, 1400);
  };

  return (
    <div className={`flex-1 flex flex-col justify-between select-none text-zinc-700 dark:text-zinc-300 font-sans mx-auto w-full ${
      isExtension ? 'max-w-md h-full' : 'max-w-4xl py-2'
    }`}>
      
      {/* 2. Body Content */}
      <div className={`flex-1 space-y-6 py-4 ${
        isExtension ? 'overflow-y-auto scrollbar-thin max-h-[460px] pr-1.5' : 'w-full'
      }`}>
        
        {/* Title, Badges & Match Score Header Row */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800/60 pb-5">
          <div className="space-y-3 flex-1 min-w-0">
            <div>
              <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-50 leading-tight truncate">
                {title || 'Job Description'}
              </h2>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5 truncate">
                {company || 'Company'}
              </p>
            </div>

            {/* Badges list */}
            <div className="flex flex-wrap gap-1.5 text-xs">
              {location && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 rounded-full font-bold border border-zinc-200/60 dark:border-zinc-800">
                  <MapPin size={12} /> {location}
                </span>
              )}
              {salary && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-full font-bold border border-emerald-200/60 dark:border-emerald-800">
                  <DollarSign size={12} /> {salary}
                </span>
              )}
              {jobType && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 rounded-full font-bold border border-zinc-200/60 dark:border-zinc-800">
                  <Briefcase size={12} /> {jobType}
                </span>
              )}
              {workMode && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-full font-bold border border-indigo-200/60 dark:border-indigo-800">
                  <Building2 size={12} /> {workMode}
                </span>
              )}
              {experienceRequired && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-full font-bold border border-amber-200/60 dark:border-amber-800">
                  <Timer size={12} /> Exp: {experienceRequired}
                </span>
              )}
              {seniority && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 rounded-full font-bold border border-purple-200/60 dark:border-purple-800">
                  <Tag size={12} /> {seniority}
                </span>
              )}
            </div>
          </div>

          {/* Right Match Score Badge with Vertical Line Divider */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="w-[1px] h-16 bg-zinc-200/80 dark:bg-zinc-800 shrink-0" />
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              onClick={triggerScoreZoom}
              title="Click to replay match score animation"
              className="w-20 h-20 rounded-full bg-white dark:bg-zinc-900 border-2 border-[#00bda5] shadow-md flex flex-col items-center justify-center text-center p-1 shrink-0 cursor-pointer transition-shadow hover:shadow-lg group relative overflow-hidden"
            >
              <Target size={16} className="text-orange-500 mb-0.5 group-hover:rotate-12 transition-transform" />
              <span className="text-lg font-black text-blue-600 dark:text-blue-400 leading-none">
                {matchScore.score === null ? '--' : `${matchScore.score}%`}
              </span>
              <span className="text-[8px] font-black tracking-widest text-zinc-400 dark:text-zinc-500 uppercase mt-0.5">
                MATCH
              </span>
            </motion.button>
          </div>
        </div>

        {/* Zoom-In Backdrop Overlay when match score is animating */}
        <AnimatePresence>
          {isMatchZoomed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => setIsMatchZoomed(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex flex-col items-center justify-center pointer-events-auto cursor-pointer"
            >
              <motion.div
                initial={{ scale: 0.2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.2, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="bg-white dark:bg-zinc-900 border-4 border-teal-500 rounded-full p-8 shadow-2xl flex flex-col items-center justify-center text-center w-64 h-64 md:w-72 md:h-72 animate-pulse"
              >
                <div className="w-14 h-14 rounded-full bg-teal-500/10 text-teal-500 flex items-center justify-center mb-2">
                  <Target size={36} className="text-[#00bda5] animate-bounce" />
                </div>
                <span className="text-5xl md:text-6xl font-black text-teal-600 dark:text-teal-400 tracking-tight">
                  {matchScore.score === null ? '--' : `${matchScore.score}%`}
                </span>
                <span className="text-xs font-black tracking-widest text-zinc-400 dark:text-zinc-500 uppercase mt-2">
                  ATS MATCH SCORE
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Key Highlights */}
        {highlightsList.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <Wand2 size={14} /><span>Key Highlights</span>
            </h3>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-semibold">
              {highlightsList.map((highlight, idx) => (
                <li key={idx}>{highlight}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Skills */}
        {skillsCategories && Object.keys(skillsCategories).length > 0 ? (
          <div className="space-y-3 text-left">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Skills</h3>
            <div className="space-y-3.5 p-4 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200/50 dark:border-zinc-850 rounded-2xl">
              {Object.entries(skillsCategories).map(([category, items]) => {
                if (!items || items.length === 0) return null;
                return (
                  <div key={category} className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-450 dark:text-zinc-500 block">{category}:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((skill, idx) => (
                        <span 
                          key={idx}
                          className="text-xs bg-zinc-100 dark:bg-zinc-900 text-zinc-650 dark:text-zinc-400 px-3 py-1 rounded-lg border border-zinc-200/50 dark:border-zinc-800/80 font-bold"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          allSkills.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Skills</h3>
              <div className="flex flex-wrap gap-1.5">
                {allSkills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-zinc-100 dark:bg-zinc-900 text-zinc-650 dark:text-zinc-400 px-3 py-1 rounded-lg border border-zinc-200/50 dark:border-zinc-850/50 font-bold"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )
        )}

        {/* Qualifications */}
        {qualificationsList.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Qualifications</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-semibold">
              {qualificationsList.map((q, idx) => (
                <li key={idx}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Responsibilities */}
        {responsibilitiesList.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Responsibilities</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-semibold">
              {responsibilitiesList.map((r, idx) => (
                <li key={idx}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ATS Keywords */}
        {atsKeywordsList && atsKeywordsList.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">ATS Keywords</h3>
            <div className="flex flex-wrap gap-1.5">
              {atsKeywordsList.map((kw, idx) => (
                <span 
                  key={idx}
                  className="text-[11px] bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-md border border-indigo-200/50 dark:border-indigo-800/60 font-semibold"
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* 3. Bottom controls and actions footer */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 flex flex-col gap-3 mt-auto bg-transparent flex-shrink-0">
        
        {/* Resume & Cover Letter Buttons Row */}
        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={handleResumeTailor}
            className="py-3 bg-[#00bda5] hover:bg-[#00a894] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <FilePenLine size={14} />
            Resume
          </button>
          <button 
            onClick={handleCoverLetterGenerate}
            className="py-3 bg-[#00bda5] hover:bg-[#00a894] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <FilePenLine size={14} />
            Cover Letter
          </button>
        </div>

        {/* Reload Job Details Button */}
        <button 
          onClick={handleReExtract}
          disabled={loading}
          className="py-3 border border-zinc-250 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400 font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Reload Job Details
        </button>

      </div>
    </div>
  );
}

export default JobReviewView;
