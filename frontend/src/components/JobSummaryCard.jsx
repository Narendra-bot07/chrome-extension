import React from 'react';
import { collectJobSkills, formatSalary } from '../services/jdExtractionFlow';
import { Heart, RefreshCw, Sparkles, FileText } from 'lucide-react';

function JobSummaryCard({
  jobAnalysis,
  jobTitle,
  companyName,
  setStep,
  handleGenerateCoverLetter,
  handleScanPage
}) {
  const INVALID_TITLE_NOISE = /^(?:people you can reach out to|about the job|about the company|job description|responsibilities|qualifications|requirements|minimum qualifications|preferred qualifications|similar jobs|recommended jobs|explore options|meet the hiring team|your profile and resume|privacy policy|terms of use|apply|easy apply|save|share|follow|show more|see more|search results|jobs for you|0 notifications|skip navigation|sign in|log in|target company)$/i;

  const details = jobAnalysis?.analysis || jobAnalysis?.normalized_content || jobAnalysis || {};

  const displayTitle = [details?.title, details?.job_title, jobAnalysis?.title, jobAnalysis?.job_title, jobTitle]
    .find((str) => str && typeof str === 'string' && !INVALID_TITLE_NOISE.test(str.trim())) || 'Job Title';

  const displayCompany = [details?.company, details?.company_name, jobAnalysis?.company, jobAnalysis?.company_name, companyName]
    .find((str) => str && typeof str === 'string' && !INVALID_TITLE_NOISE.test(str.trim()) && str.trim().toLowerCase() !== displayTitle.toLowerCase()) || 'Company';
  const displaySkills = collectJobSkills(details).explicit;

  React.useEffect(() => {
    console.log('[ApplyFlow:Trace 08] Final JobSummaryCard render values', {
      title: displayTitle,
      company: displayCompany,
      location: jobAnalysis?.location,
      jobType: jobAnalysis?.job_type,
      salary: jobAnalysis?.salary,
      skillsCount: displaySkills.length
    });
  }, [displayTitle, displayCompany, jobAnalysis]);

  return (
    <div className="flex-1 flex flex-col justify-between h-full select-text text-slate-600 dark:text-slate-350">
      {/* Scrollable Job Details Section */}
      <div className="space-y-5 pr-1.5 scrollbar-thin overflow-y-auto max-h-[440px] pb-4">
        {/* Title, Company and Badges (Direct Page Background, No Card Border) */}
        <div className="space-y-2.5">
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 leading-tight">
            {displayTitle}
          </h2>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {displayCompany}
          </p>
          
          <div className="flex flex-wrap gap-1.5 pt-1">
            {jobAnalysis.location && (
              <span className="text-[10px] font-semibold bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-slate-500 dark:text-slate-400 px-3 py-0.5 rounded-full">
                {jobAnalysis.location}
              </span>
            )}
            {jobAnalysis.salary && (
              <span className="text-[10px] font-semibold bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-slate-500 dark:text-slate-400 px-3 py-0.5 rounded-full">
                {formatSalary(jobAnalysis.salary)}
              </span>
            )}
            {jobAnalysis.job_type && (
              <span className="text-[10px] font-semibold bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-slate-500 dark:text-slate-400 px-3 py-0.5 rounded-full">
                {jobAnalysis.job_type}
              </span>
            )}
          </div>
        </div>

        {/* Thin Divider Line */}
        <div className="border-b border-slate-100 dark:border-slate-900 my-4" />

        {/* Key Highlights */}
        {jobAnalysis.highlights?.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-wide font-sans">Key Highlights</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {jobAnalysis.highlights.map((hl, idx) => (
                <li key={idx}>{hl}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Skills (Clean Tags, No Card Border) */}
        {displaySkills.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-wide font-sans">Skills</h3>
            <div className="flex flex-wrap gap-2 pt-0.5">
              {displaySkills.map((skill, idx) => (
                <span 
                  key={idx}
                  className="text-[10px] font-semibold bg-white border border-slate-200 dark:bg-[#0f0f11] dark:border-slate-900 text-slate-600 dark:text-slate-400 px-3 py-1 rounded-full shadow-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Qualifications */}
        {jobAnalysis.qualifications?.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-wide font-sans">Qualifications</h3>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {jobAnalysis.qualifications.map((q, idx) => (
                <li key={idx}>{q}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Fixed Footer Operations Section */}
      <div className="border-t border-slate-200 dark:border-slate-900 pt-4 mt-auto space-y-3 bg-transparent flex-shrink-0">

        {/* Main Resume & Cover Letter CTA Buttons */}
        <div className="flex gap-3">
          <button 
            type="button"
            onClick={() => setStep('dashboard')}
            className="flex-1 py-3 bg-brand hover:bg-brand-hover text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all duration-150 shadow-md flex items-center justify-center gap-2 cursor-pointer hover:shadow-indigo-900/40"
          >
            <Sparkles size={14} className="fill-white/10" />
            Resume
          </button>
          <button 
            type="button"
            onClick={handleGenerateCoverLetter}
            className="flex-1 py-3 bg-brand hover:bg-brand-hover text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all duration-150 shadow-md flex items-center justify-center gap-2 cursor-pointer hover:shadow-indigo-900/40"
          >
            <FileText size={14} />
            Cover Letter
          </button>
        </div>

        {/* Reload Job Details Button */}
        <button 
          type="button"
          onClick={() => handleScanPage(true)}
          className="w-full py-2.5 border border-slate-250 dark:border-slate-850 text-slate-550 dark:text-slate-400 font-extrabold text-[11px] uppercase tracking-wider rounded-xl hover:bg-white dark:hover:bg-slate-900 hover:text-slate-700 dark:hover:text-slate-200 transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
        >
          <RefreshCw size={12} />
          Reload Job Details
        </button>
      </div>
    </div>
  );
}

export default JobSummaryCard;
