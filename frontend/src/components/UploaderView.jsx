import React from 'react';
import { Sparkles, Layers, Building2, Briefcase } from 'lucide-react';

function UploaderView({
  jobText,
  setJobText,
  companyName,
  setCompanyName,
  jobTitle,
  setJobTitle,
  handleScanPage,
  handleAnalyzeAndMatch,
  loading,
  isExtension
}) {
  return (
    <div className={`space-y-5 flex-1 flex flex-col justify-between select-none font-sans text-zinc-650 dark:text-zinc-350 mx-auto w-full ${
      isExtension ? 'max-w-lg' : 'max-w-4xl py-2'
    }`}>
      <div className="space-y-5">
        
        {/* Title Block */}
        <div className="space-y-1">
          <h2 className="text-base font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50">
            Extract Job Details
          </h2>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-550 leading-relaxed font-bold">
            Scan or paste the target job description to match your qualifications against.
          </p>
        </div>

        {/* Input coordinates (Company & Title) */}
        <div className="space-y-2">
          <label className="text-[8.5px] font-black text-zinc-450 dark:text-zinc-550 uppercase tracking-widest block font-sans">
            Job Coordinates
          </label>
          <div className="grid grid-cols-2 gap-3.5">
            {/* Company Name Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-600">
                <Building2 size={13} />
              </div>
              <input 
                type="text" 
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-850 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-850 dark:text-zinc-100 focus:outline-none focus:border-[#00bda5] focus:ring-1 focus:ring-[#00bda5] placeholder-zinc-400 font-medium"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Company Name"
              />
            </div>

            {/* Role Title Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400 dark:text-zinc-600">
                <Briefcase size={13} />
              </div>
              <input 
                type="text" 
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-850 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-850 dark:text-zinc-100 focus:outline-none focus:border-[#00bda5] focus:ring-1 focus:ring-[#00bda5] placeholder-zinc-400 font-medium"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Job Title"
              />
            </div>
          </div>
        </div>

        {/* Job Description Textarea */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-[8.5px] font-black text-zinc-450 dark:text-zinc-550 uppercase tracking-widest block font-sans">
              Job Description
            </label>
            {isExtension && (
              <button 
                type="button"
                onClick={() => handleScanPage(true)}
                className="text-[8.5px] font-bold text-[#00bda5] hover:text-[#00a894] uppercase flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-850 px-2.5 py-1 rounded-lg transition cursor-pointer border-none"
              >
                <Layers size={10} /> Scan Page
              </button>
            )}
          </div>

          <div className="relative">
            <textarea 
              className={`w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-850 rounded-xl px-4 py-3 text-xs text-zinc-850 dark:text-zinc-200 focus:outline-none focus:border-[#00bda5] focus:ring-1 focus:ring-[#00bda5] placeholder-zinc-400 dark:placeholder-zinc-600 resize-none leading-relaxed scrollbar-thin transition-all font-medium ${
                isExtension ? 'min-h-[190px]' : 'min-h-[300px]'
              }`}
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              placeholder="Auto-scanning page content... Or paste job details manually here."
            />
            {jobText && (
              <span className="absolute bottom-3 right-4 text-[8px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-600 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800/80 px-2 py-0.5 rounded-md">
                {jobText.length} Chars
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Primary Trigger Button */}
      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 mt-auto">
        <button 
          type="button"
          onClick={handleAnalyzeAndMatch}
          disabled={!jobText}
          className="w-full py-3 bg-[#00bda5] hover:bg-[#00a894] disabled:bg-zinc-100 disabled:text-zinc-400 dark:disabled:bg-zinc-900 dark:disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 cursor-pointer border-none"
        >
          <Sparkles size={14} />
          Extract Job Description
        </button>
      </div>
    </div>
  );
}

export default UploaderView;
