import React, { useState } from 'react';
import { Check, TrendingUp, ChevronDown, ChevronRight, Plus, Minus, ArrowRight } from 'lucide-react';
import { Button } from './ui/Button';

const getScoreBgColor = (score) => {
  if (score >= 80) return 'text-tf-success'; 
  if (score >= 60) return 'text-tf-warning'; 
  return 'text-tf-danger'; 
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
  const [expandedSections, setExpandedSections] = useState({
    skills: true,
    experience: true,
    summary: true
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const totalOptimizations = (comparison.missing_skills?.length || 0) + 
                             (comparison.bullet_suggestions?.length || 0) + 
                             (comparison.summary_suggestion ? 1 : 0);
                             
  const selectedOptimizations = selectedSkills.length + selectedRewrites.length + (acceptSummary ? 1 : 0);
  
  // Calculate projected score based on selections
  const projectedScore = Math.min(99, comparison.ats_score + Math.round((selectedOptimizations / (totalOptimizations || 1)) * (100 - comparison.ats_score) * 0.8));

  return (
    <div className="flex-1 flex flex-col justify-between select-none bg-tf-bg text-tf-text">
      <div className="space-y-6 overflow-y-auto max-h-[440px] pb-6">
        
        {/* 1. Hero Section: ATS Score & Progress */}
        <div className="p-5 border border-tf-border bg-tf-surface rounded-lg flex flex-col gap-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-xs font-medium text-tf-text-secondary">Match Rate</h3>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-semibold tracking-tight text-tf-text">{comparison.ats_score}%</span>
                {selectedOptimizations > 0 && (
                  <>
                    <ArrowRight className="w-4 h-4 text-tf-text-tertiary" />
                    <span className="text-3xl font-semibold tracking-tight text-tf-success">{projectedScore}%</span>
                  </>
                )}
              </div>
            </div>

          </div>
          
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
            <div className="flex justify-between items-center text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Optimization Progress</span>
              <span>{selectedOptimizations} of {totalOptimizations} selected</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 transition-all duration-500 ease-out" 
                style={{ width: `${totalOptimizations === 0 ? 0 : (selectedOptimizations / totalOptimizations) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* 2. Grouped Optimizations */}
        <div className="space-y-4">
          
          {/* A. Missing Skills */}
          {comparison.missing_skills?.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-[#0a0a0a]">
              <button 
                onClick={() => toggleSection('skills')}
                className="w-full px-5 py-4 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedSections.skills ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Keywords & Skills</span>
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-md">
                  {selectedSkills.length} / {comparison.missing_skills.length}
                </span>
              </button>
              
              {expandedSections.skills && (
                <div className="p-5 border-t border-slate-100 dark:border-slate-800/60">
                  <div className="flex flex-wrap gap-2">
                    {comparison.missing_skills.map((item, idx) => {
                      const isSelected = selectedSkills.includes(item.skill);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleToggleSkill(item.skill)}
                          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all duration-200 ${
                            isSelected 
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400' 
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-[#0a0a0a] dark:border-slate-800 dark:text-slate-400 dark:hover:border-slate-700'
                          }`}
                        >
                          {item.skill}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* B. Bulletpoint Suggestions (Diff Style) */}
          {comparison.bullet_suggestions?.length > 0 && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-[#0a0a0a]">
              <button 
                onClick={() => toggleSection('experience')}
                className="w-full px-5 py-4 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedSections.experience ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Experience Impacts</span>
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-md">
                  {selectedRewrites.length} / {comparison.bullet_suggestions.length}
                </span>
              </button>
              
              {expandedSections.experience && (
                <div className="p-5 border-t border-slate-100 dark:border-slate-800/60 space-y-4">
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
                        className={`group border rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ${
                          isChecked 
                            ? 'border-emerald-200 dark:border-emerald-500/30' 
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className={`px-4 py-3 border-b flex items-center justify-between ${
                          isChecked ? 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-500/5 dark:border-emerald-500/20' : 'bg-slate-50/50 border-slate-100 dark:bg-slate-900/20 dark:border-slate-800/60'
                        }`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                              isChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                            }`}>
                              <Check size={10} strokeWidth={3} className={isChecked ? 'opacity-100' : 'opacity-0'} />
                            </div>
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">{label}</span>
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/10">High Impact</span>
                        </div>
                        
                        <div className="text-[13px] leading-relaxed font-mono">
                          {/* Deleted Line */}
                          <div className={`px-4 py-3 flex gap-3 ${isChecked ? 'bg-red-50/50 dark:bg-red-950/20 text-slate-400 dark:text-slate-500 line-through' : 'bg-white dark:bg-[#0a0a0a] text-slate-600 dark:text-slate-400'}`}>
                            <Minus className="w-4 h-4 shrink-0 mt-0.5 text-red-400 dark:text-red-500/70" />
                            <p>{item.original_bullet}</p>
                          </div>
                          {/* Added Line */}
                          <div className={`px-4 py-3 flex gap-3 border-t ${isChecked ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100 border-emerald-100 dark:border-emerald-500/20' : 'bg-slate-50 dark:bg-slate-900/20 text-slate-800 dark:text-slate-300 border-slate-100 dark:border-slate-800/60'}`}>
                            <Plus className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                            <p>{item.suggested_bullet}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* C. Summary Suggestion */}
          {comparison.summary_suggestion && (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-[#0a0a0a]">
              <button 
                onClick={() => toggleSection('summary')}
                className="w-full px-5 py-4 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/20 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedSections.summary ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Executive Summary</span>
                </div>
                <span className="text-xs font-medium px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-md">
                  {acceptSummary ? '1' : '0'} / 1
                </span>
              </button>
              
              {expandedSections.summary && (
                <div className="p-5 border-t border-slate-100 dark:border-slate-800/60">
                  <div 
                    onClick={() => setAcceptSummary(!acceptSummary)}
                    className={`group border rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ${
                      acceptSummary 
                        ? 'border-emerald-200 dark:border-emerald-500/30' 
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className={`px-4 py-3 border-b flex items-center justify-between ${
                      acceptSummary ? 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-500/5 dark:border-emerald-500/20' : 'bg-slate-50/50 border-slate-100 dark:bg-slate-900/20 dark:border-slate-800/60'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${
                          acceptSummary ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                        }`}>
                          <Check size={10} strokeWidth={3} className={acceptSummary ? 'opacity-100' : 'opacity-0'} />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Professional Summary</span>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-500/10">Medium Impact</span>
                    </div>
                    
                    <div className="text-[13px] leading-relaxed font-mono">
                      <div className={`px-4 py-3 flex gap-3 ${acceptSummary ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100' : 'bg-white dark:bg-[#0a0a0a] text-slate-800 dark:text-slate-300'}`}>
                        <Plus className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                        <p>{comparison.summary_suggestion.suggested_summary}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* 3. Action Trigger */}
      <div className="pt-4 mt-auto flex gap-4 border-t border-slate-100 dark:border-slate-800/60 bg-transparent">
        <button 
          onClick={() => setStep('job-card')}
          className="py-2.5 px-5 font-medium text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900"
        >
          Back
        </button>
        <button 
          onClick={handleApplyChecklist}
          disabled={loading}
          className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white font-semibold text-sm rounded-xl transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
        >
          <TrendingUp size={16} />
          Generate Resume Preview
        </button>
      </div>
    </div>
  );
}

export default DashboardView;

