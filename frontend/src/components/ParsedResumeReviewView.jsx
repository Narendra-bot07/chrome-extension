import React from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { normalizePersonName } from '../utils/resumePresentation';

function ParsedResumeReviewView({
  parsedResume,
  onLooksGood,
  onUploadDifferent,
  loading
}) {
  return (
    <div className="flex-1 flex flex-col justify-between h-full select-none text-slate-650 dark:text-slate-350 font-sans">
      
      {/* Title */}
      <div className="space-y-1">
        <h2 className="text-lg font-black tracking-tight text-slate-800 dark:text-slate-100">Verify Resume Data</h2>
        <p className="text-xs text-slate-500">Confirm the AI parser correctly structured your profile details.</p>
      </div>

      {/* Details Scroll */}
      <div className="flex-1 my-4 space-y-3.5 pr-1.5 scrollbar-thin overflow-y-auto max-h-[350px]">
        {/* Contact info card */}
        <div className="p-3.5 bg-white border border-slate-200 dark:bg-[#0f0f11] dark:border-slate-900 rounded-2xl space-y-2 shadow-3xs">
          <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Contact Details</span>
          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {normalizePersonName(parsedResume.personal_info?.name) || 'Name Not Found'}
          </p>
          <div className="text-[10px] text-slate-500 space-y-1">
            <p>Email: {parsedResume.personal_info?.email || 'Not Available'}</p>
            <p>Phone: {parsedResume.personal_info?.phone || 'Not Available'}</p>
            <p>Location: {parsedResume.personal_info?.location || 'Not Available'}</p>
          </div>
        </div>

        {/* Summary */}
        {parsedResume.summary && (
          <div className="p-3.5 bg-white border border-slate-200 dark:bg-[#0f0f11] dark:border-slate-900 rounded-2xl space-y-1.5 shadow-3xs">
            <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Summary</span>
            <p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">
              {parsedResume.summary}
            </p>
          </div>
        )}

        {/* Skills */}
        {parsedResume.skills_categories && Object.keys(parsedResume.skills_categories).length > 0 ? (
          <div className="p-3.5 bg-white border border-slate-200 dark:bg-[#0f0f11] dark:border-slate-900 rounded-2xl space-y-3 shadow-3xs text-left">
            <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Skills</span>
            <div className="space-y-3">
              {Object.entries(parsedResume.skills_categories).map(([category, items]) => {
                if (!items || items.length === 0) return null;
                return (
                  <div key={category} className="space-y-1">
                    <span className="text-[10px] font-extrabold text-slate-700 dark:text-slate-350">{category}:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((skill, idx) => (
                        <span 
                          key={idx}
                          className="text-[9px] font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 text-slate-650 dark:text-slate-400 px-2.5 py-0.5 rounded-lg"
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
          parsedResume.skills?.length > 0 && (
            <div className="p-3.5 bg-white border border-slate-200 dark:bg-[#0f0f11] dark:border-slate-900 rounded-2xl space-y-1.5 shadow-3xs">
              <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Skills</span>
              <div className="flex flex-wrap gap-1.5">
                {parsedResume.skills.map((skill, idx) => (
                  <span 
                    key={idx}
                    className="text-[9px] font-bold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 text-slate-600 dark:text-slate-455 px-2.5 py-0.5 rounded-lg"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )
        )}

        {/* Work Experience */}
        {parsedResume.experience?.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest block">Work History</span>
            <div className="space-y-2">
              {parsedResume.experience.map((exp, idx) => (
                <div key={idx} className="p-3.5 bg-white border border-slate-200 dark:bg-[#0f0f11] dark:border-slate-900 rounded-2xl shadow-3xs text-[10px] space-y-1">
                  <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                    <span>{exp.role}</span>
                    <span className="text-slate-400">{exp.start_date} - {exp.end_date}</span>
                  </div>
                  <p className="text-[9px] font-semibold text-slate-550">{exp.company}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Projects */}
        {parsedResume.projects?.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[8px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest block">Projects</span>
            <div className="space-y-2">
              {parsedResume.projects.map((proj, idx) => (
                <div key={idx} className="p-3.5 bg-white border border-slate-200 dark:bg-[#0f0f11] dark:border-slate-900 rounded-2xl shadow-3xs text-[10px] space-y-1">
                  <div className="font-bold text-slate-800 dark:text-slate-200">{proj.name}</div>
                  <p className="text-[9px] text-slate-500">{proj.role}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions Bar */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-900 mt-auto flex gap-3 bg-transparent flex-shrink-0">
        <button 
          onClick={onUploadDifferent}
          disabled={loading}
          className="flex-1 py-3 border border-slate-250 dark:border-slate-850 text-slate-555 dark:text-slate-400 font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-slate-700 dark:hover:text-slate-200 transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={13} />
          Change Resume
        </button>
        <button 
          onClick={onLooksGood}
          disabled={loading}
          className="flex-2 py-3 bg-brand hover:bg-brand-hover text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-1.5 shadow-md hover:shadow-indigo-900/40 cursor-pointer"
        >
          <Check size={13} />
          Looks Good
        </button>
      </div>

    </div>
  );
}

export default ParsedResumeReviewView;
