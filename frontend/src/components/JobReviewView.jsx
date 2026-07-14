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
    return val.length === 0 || (val.length === 1 && val[0].toLowerCase() === 'not available');
  }
  return val.toLowerCase() === 'not available' || val.trim() === '';
};

function JobReviewView({
  jobAnalysis,
  handleReExtract,
  loading
}) {
  const navigate = useNavigate();
  const { user, parsedResume, isExtension } = useApp();
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

  const handleResumeTailor = () => {
    if (!parsedResume) {
      navigate('/resume-detect');
    } else {
      navigate('/tailor-config');
    }
  };

  const handleCoverLetterGenerate = () => {
    if (!parsedResume) {
      navigate('/resume-detect');
    } else {
      navigate('/cover-letter');
    }
  };

  const highlightsList = !isNotAvailable(jobAnalysis.highlights) 
    ? jobAnalysis.highlights 
    : (!isNotAvailable(jobAnalysis.responsibilities) ? jobAnalysis.responsibilities.slice(0, 4) : []);

  const allSkills = [
    ...(Array.isArray(jobAnalysis.required_skills) ? jobAnalysis.required_skills : []),
    ...(Array.isArray(jobAnalysis.preferred_skills) ? jobAnalysis.preferred_skills : [])
  ].filter(skill => skill && skill.toLowerCase() !== 'not available');

  const qualificationsList = Array.isArray(jobAnalysis.qualifications) ? jobAnalysis.qualifications : [];

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
            {jobAnalysis.title || 'Software Engineer'}
          </h2>
          <p className="text-sm font-bold text-zinc-500 dark:text-zinc-400 mt-1">
            {jobAnalysis.company || 'Company'}
          </p>
        </div>

        {/* Gray badges list */}
        <div className="flex flex-wrap gap-2 text-xs">
          {jobAnalysis.location && (
            <span className="px-3 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 rounded-full font-bold">
              {jobAnalysis.location}
            </span>
          )}
          {jobAnalysis.salary && (
            <span className="px-3 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 rounded-full font-bold">
              {jobAnalysis.salary}
            </span>
          )}
          {jobAnalysis.job_type && (
            <span className="px-3 py-1 bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 rounded-full font-bold">
              {jobAnalysis.job_type}
            </span>
          )}
        </div>

        {/* Key Highlights */}
        {highlightsList.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Key Highlights</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-semibold">
              {highlightsList.map((highlight, idx) => (
                <li key={idx}>{highlight}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Skills */}
        {jobAnalysis.skills_categories && Object.keys(jobAnalysis.skills_categories).length > 0 ? (
          <div className="space-y-3 text-left">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100">Skills</h3>
            <div className="space-y-3.5 p-4 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200/50 dark:border-zinc-850 rounded-2xl">
              {Object.entries(jobAnalysis.skills_categories).map(([category, items]) => {
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

      </div>

      {/* 3. Bottom controls and actions footer */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 flex flex-col gap-3 mt-auto bg-transparent flex-shrink-0">
        
        {/* Applied & Favorite Checkboxes */}
        <div className="flex justify-center items-center gap-6">
          <label className="flex items-center gap-2 text-xs font-bold text-zinc-600 dark:text-zinc-400 cursor-pointer p-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition">
            <input 
              type="checkbox" 
              checked={applied} 
              onChange={(e) => setApplied(e.target.checked)}
              className="accent-[#00bda5] w-3.5 h-3.5"
            />
            <span>Applied</span>
          </label>
          <button 
            onClick={() => setFavourite(!favourite)}
            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition cursor-pointer ${
              favourite ? 'text-red-500 border-red-200 dark:border-red-900/40 bg-red-50/30' : 'text-zinc-600 dark:text-zinc-400'
            }`}
          >
            <Heart size={14} className={favourite ? 'fill-red-500 text-red-500' : 'text-zinc-400'} />
            <span>Favourite</span>
          </button>
        </div>

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
