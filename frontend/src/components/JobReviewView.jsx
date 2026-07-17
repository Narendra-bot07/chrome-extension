import React, { useState } from 'react';
import { 
  Heart,
  FilePenLine,
  RefreshCw
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

const isNotAvailable = (val) => {
  if (!val) return true;
  if (Array.isArray(val)) {
    return val.length === 0 || (val.length === 1 && typeof val[0] === 'string' && val[0].trim().toLowerCase() === 'not available');
  }
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    return lower === 'not available' || lower === 'n/a' || lower === 'none' || lower === 'unspecified' || lower === '';
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

function JobReviewView({
  jobAnalysis,
  handleReExtract,
  loading
}) {
  const navigate = useNavigate();
  const { user, parsedResume, isExtension, jobTitle, companyName } = useApp();
  const [applied, setApplied] = useState(false);
  const [favourite, setFavourite] = useState(false);

  // Extract initials for the user profile circle
  const getInitials = () => {
    if (user?.metadata?.full_name) {
      return user.metadata.full_name.charAt(0).toUpperCase();
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return 'D';
  };

  const openInFullTab = (path) => {
    if (isExtension && typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime?.getURL) {
      chrome.tabs.create({ url: chrome.runtime.getURL(`index.html#${path}`) });
    } else {
      navigate(path);
    }
  };

  const handleResumeTailor = () => {
    if (!parsedResume) {
      openInFullTab('/resume-detect');
    } else {
      openInFullTab('/tailor-config');
    }
  };

  const handleCoverLetterGenerate = () => {
    if (!parsedResume) {
      openInFullTab('/resume-detect');
    } else {
      openInFullTab('/cover-letter');
    }
  };

  // Normalize data from normalized_content if nested (from API V1 or DB)
  const details = jobAnalysis?.normalized_content || jobAnalysis || {};
  
  const title = getValidString(jobAnalysis?.job_title, details?.title, jobAnalysis?.title, jobTitle, 'Software Engineer');
  const company = getValidString(jobAnalysis?.company_name, details?.company, jobAnalysis?.company, companyName, 'Target Company');
  const location = !isNotAvailable(details.location) ? details.location : (!isNotAvailable(jobAnalysis?.location) ? jobAnalysis.location : null);
  const salary = !isNotAvailable(details.salary) ? details.salary : (!isNotAvailable(jobAnalysis?.salary) ? jobAnalysis.salary : null);
  const jobType = !isNotAvailable(details.job_type) ? details.job_type : (!isNotAvailable(jobAnalysis?.job_type) ? jobAnalysis.job_type : (!isNotAvailable(jobAnalysis?.keywords) && jobAnalysis.keywords.includes('Full-time') ? 'Full-time' : null));
  const workMode = !isNotAvailable(details.work_mode) ? details.work_mode : (!isNotAvailable(jobAnalysis?.work_mode) ? jobAnalysis.work_mode : null);
  const experienceRequired = !isNotAvailable(details.experience_required) ? details.experience_required : (!isNotAvailable(jobAnalysis?.experience_required) ? jobAnalysis.experience_required : null);
  const seniority = !isNotAvailable(details.seniority) ? details.seniority : (!isNotAvailable(jobAnalysis?.seniority) ? jobAnalysis.seniority : null);

  const highlightsList = !isNotAvailable(details.highlights) 
    ? (Array.isArray(details.highlights) ? details.highlights : [details.highlights])
    : (!isNotAvailable(jobAnalysis?.highlights) ? (Array.isArray(jobAnalysis.highlights) ? jobAnalysis.highlights : [jobAnalysis.highlights]) : []);

  const responsibilitiesList = !isNotAvailable(details.responsibilities)
    ? (Array.isArray(details.responsibilities) ? details.responsibilities : [details.responsibilities])
    : (!isNotAvailable(jobAnalysis?.responsibilities) ? (Array.isArray(jobAnalysis.responsibilities) ? jobAnalysis.responsibilities : [jobAnalysis.responsibilities]) : []);

  const qualificationsList = !isNotAvailable(details.qualifications)
    ? (Array.isArray(details.qualifications) ? details.qualifications : [details.qualifications])
    : (!isNotAvailable(jobAnalysis?.qualifications) ? (Array.isArray(jobAnalysis.qualifications) ? jobAnalysis.qualifications : [jobAnalysis.qualifications]) : []);

  const skillsCategories = details.skills_categories || jobAnalysis?.skills_categories || {};
  const requiredSkills = !isNotAvailable(details.required_skills) ? (Array.isArray(details.required_skills) ? details.required_skills : [details.required_skills]) : (!isNotAvailable(jobAnalysis?.required_skills) ? (Array.isArray(jobAnalysis.required_skills) ? jobAnalysis.required_skills : [jobAnalysis.required_skills]) : []);
  const preferredSkills = !isNotAvailable(details.preferred_skills) ? (Array.isArray(details.preferred_skills) ? details.preferred_skills : [details.preferred_skills]) : (!isNotAvailable(jobAnalysis?.preferred_skills) ? (Array.isArray(jobAnalysis.preferred_skills) ? jobAnalysis.preferred_skills : [jobAnalysis.preferred_skills]) : []);

  const allSkills = [
    ...requiredSkills,
    ...preferredSkills
  ].filter(skill => skill && skill.toLowerCase() !== 'not available');

  const atsKeywordsList = !isNotAvailable(jobAnalysis?.ats_keywords) ? (Array.isArray(jobAnalysis.ats_keywords) ? jobAnalysis.ats_keywords : [jobAnalysis.ats_keywords]) : (!isNotAvailable(details.ats_keywords) ? (Array.isArray(details.ats_keywords) ? details.ats_keywords : [details.ats_keywords]) : []);

  return (
    <div className={`flex-1 flex flex-col justify-between select-none text-zinc-700 dark:text-zinc-300 font-sans mx-auto w-full ${
      isExtension ? 'max-w-md h-full' : 'max-w-4xl py-2'
    }`}>
      
      {/* 2. Body Content */}
      <div className={`flex-1 space-y-6 py-4 ${
        isExtension ? 'overflow-y-auto scrollbar-thin max-h-[460px] pr-1.5' : 'w-full'
      }`}>
        
        {/* Title and Company Subtitle */}
        <div>
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-50 leading-tight">
            {title}
          </h2>
          <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-1">
            {company}
          </p>
        </div>

        {/* Gray badges list (Location, Salary, Job Type, Work Mode, Experience, Seniority) */}
        <div className="flex flex-wrap gap-1.5 text-xs">
          {location && (
            <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 rounded-full font-bold border border-zinc-200/60 dark:border-zinc-800">
              📍 {location}
            </span>
          )}
          {salary && (
            <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-full font-bold border border-emerald-200/60 dark:border-emerald-800">
              💰 {salary}
            </span>
          )}
          {jobType && (
            <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 rounded-full font-bold border border-zinc-200/60 dark:border-zinc-800">
              💼 {jobType}
            </span>
          )}
          {workMode && (
            <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded-full font-bold border border-indigo-200/60 dark:border-indigo-800">
              🏢 {workMode}
            </span>
          )}
          {experienceRequired && (
            <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-full font-bold border border-amber-200/60 dark:border-amber-800">
              ⏳ Exp: {experienceRequired}
            </span>
          )}
          {seniority && (
            <span className="px-2.5 py-1 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 rounded-full font-bold border border-purple-200/60 dark:border-purple-800">
              🏷️ {seniority}
            </span>
          )}
        </div>

        {/* Key Highlights */}
        {highlightsList.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <span>🌟 Key Highlights</span>
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
                          className="text-xs bg-zinc-100 dark:bg-zinc-900 text-zinc-655 dark:text-zinc-400 px-3 py-1 rounded-lg border border-zinc-200/50 dark:border-zinc-800/80 font-bold"
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
        {atsKeywordsList.length > 0 && (
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
