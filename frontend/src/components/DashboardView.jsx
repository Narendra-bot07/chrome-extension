import React from 'react';
import { Check, TrendingUp } from 'lucide-react';

const getScoreBgColor = (score) => {
  if (score >= 80) return 'text-emerald-500'; 
  if (score >= 60) return 'text-amber-500'; 
  return 'text-rose-500'; 
};

function DashboardView({
  comparison,
  selectedSkills,
  handleToggleSkill,
  selectedRewrites,
  handleToggleRewrite,
  parsedResume,
  acceptSummary,
  setAcceptSummary,
  setStep,
  handleApplyChecklist,
  loading
}) {
  return (
    <div className="space-y-4 flex-1 flex flex-col justify-between select-none text-slate-600 dark:text-slate-350">
      <div className="space-y-4 pr-1.5 scrollbar-thin overflow-y-auto max-h-[440px] pb-4">
        
        {/* Match Score Display */}
        <div className="p-4 bg-white border border-slate-200 dark:bg-[#0f0f11] dark:border-slate-900 rounded-2xl flex items-center justify-between shadow-2xs">
          <div className="space-y-1">
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Initial Match Rate</p>
            <h2 className="text-3xl font-black tracking-tighter leading-none text-slate-800 dark:text-slate-100 flex items-baseline gap-1">
              {comparison.ats_score}%
              <span className="text-[9px] text-slate-500 font-bold tracking-normal uppercase">ATS Score</span>
            </h2>
          </div>
          {/* Visual Circle Meter */}
          <div className="relative w-11 h-11 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(0,0,0,0.03)" strokeWidth="3" />
              <circle 
                cx="22" 
                cy="22" 
                r="18" 
                fill="none" 
                className={getScoreBgColor(comparison.ats_score)}
                stroke="currentColor" 
                strokeWidth="3" 
                strokeDasharray={`${2 * Math.PI * 18}`}
                strokeDashoffset={`${2 * Math.PI * 18 * (1 - comparison.ats_score / 100)}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s ease-out' }}
              />
            </svg>
          </div>
        </div>

        {/* Checklist Revisions */}
        <div className="space-y-3">
          {/* Missing Skills Chips */}
          {comparison.missing_skills?.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest block">1. Add Missing Keywords</label>
              <div className="flex flex-wrap gap-1.5 p-3.5 bg-slate-50 dark:bg-[#0f0f11] border border-slate-200 dark:border-slate-900 rounded-2xl">
                {comparison.missing_skills.map((item, idx) => {
                  const isSelected = selectedSkills.includes(item.skill);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleToggleSkill(item.skill)}
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all duration-150 cursor-pointer ${
                        isSelected 
                          ? 'bg-brand/10 border-brand text-brand hover:bg-brand/20' 
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-850 text-slate-600 dark:text-slate-400 hover:border-slate-350 dark:hover:border-slate-800 hover:text-slate-800 dark:hover:text-slate-300 shadow-3xs'
                      }`}
                    >
                      {item.skill}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bulletpoint suggestions */}
          {comparison.bullet_suggestions?.length > 0 && (
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest block">2. Optimize Experiences</label>
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin">
                {comparison.bullet_suggestions.map((item, idx) => {
                  const isChecked = selectedRewrites.some(
                    r => r.section_type === item.section_type && 
                         r.item_index === item.item_index && 
                         r.bullet_index === item.bullet_index
                  );
                  
                  const label = item.section_type === 'experience' && parsedResume.experience[item.item_index]
                    ? parsedResume.experience[item.item_index].company
                    : (parsedResume.projects[item.item_index]?.name || 'Project');
 
                  return (
                    <div 
                      key={idx}
                      onClick={() => handleToggleRewrite(item)}
                      className={`p-3.5 bg-white dark:bg-[#0f0f11] border rounded-xl cursor-pointer transition-all duration-150 flex gap-3 hover:border-slate-350 dark:hover:border-slate-800 shadow-3xs ${
                        isChecked ? 'border-brand/40 bg-brand/5' : 'border-slate-200 dark:border-slate-900'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-100 ${
                        isChecked ? 'bg-brand border-brand text-white' : 'border-slate-350 dark:border-slate-800 bg-slate-50 dark:bg-slate-900'
                      }`}>
                        <Check size={10} className="stroke-[3]" />
                      </div>
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex justify-between items-center gap-2">
                          <p className="text-[9.5px] font-black text-slate-700 dark:text-slate-300 uppercase truncate">{label}</p>
                          <span className="text-[8.5px] font-bold text-emerald-500 dark:text-emerald-500 bg-emerald-550/10 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-md flex-shrink-0">+5% ATS</span>
                        </div>
                        <p className="text-[9.5px] text-slate-500 leading-normal line-clamp-2 italic">"{item.original_bullet}"</p>
                        <p className="text-[9.5px] text-slate-750 dark:text-slate-300 leading-normal font-semibold border-l border-brand/50 pl-2">"{item.suggested_bullet}"</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Summary suggestion */}
          {comparison.summary_suggestion && (
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest block">3. Executive Summary</label>
              <div 
                onClick={() => setAcceptSummary(!acceptSummary)}
                className={`p-3.5 bg-white dark:bg-[#0f0f11] border rounded-xl cursor-pointer transition-all duration-150 flex gap-3 hover:border-slate-350 dark:hover:border-slate-800 shadow-3xs ${
                  acceptSummary ? 'border-brand/40 bg-brand/5' : 'border-slate-200 dark:border-slate-900'
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-100 ${
                  acceptSummary ? 'bg-brand border-brand text-white' : 'border-slate-350 dark:border-slate-800 bg-slate-50 dark:bg-slate-900'
                }`}>
                  <Check size={10} className="stroke-[3]" />
                </div>
                <div className="space-y-1.5 flex-1">
                  <div className="flex justify-between items-center gap-2">
                    <p className="text-[9.5px] font-black text-slate-700 dark:text-slate-300 uppercase">Align Summary</p>
                    <span className="text-[8.5px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">+3% ATS</span>
                  </div>
                  <p className="text-[9.5px] text-slate-700 dark:text-slate-350 leading-normal pl-2 border-l border-brand/50 font-semibold">"{comparison.summary_suggestion.suggested_summary}"</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Trigger */}
      <div className="pt-4 mt-auto flex gap-3 border-t border-slate-200 dark:border-slate-900 bg-transparent">
        <button 
          onClick={() => setStep('job-card')}
          className="py-3 px-4 border border-slate-250 dark:border-slate-850 text-slate-550 dark:text-slate-400 font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-white dark:hover:bg-slate-900 hover:text-slate-700 dark:hover:text-slate-200 transition flex items-center justify-center shadow-sm cursor-pointer"
        >
          Back
        </button>
        <button 
          onClick={handleApplyChecklist}
          disabled={loading}
          className="flex-1 py-3 bg-brand hover:bg-brand-hover text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 shadow-md hover:shadow-indigo-900/40 cursor-pointer"
        >
          <TrendingUp size={13} />
          Generate Resume Preview
        </button>
      </div>
    </div>
  );
}

export default DashboardView;
