import React, { useState, useMemo } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';

function ResumeReviewView({
  parsedResume,
  suggestions,
  onUpdateSuggestionStatus,
  onAcceptAll,
  onRejectAll,
  onGenerateResume,
  onBack,
  loading
}) {
  const { darkMode, apiUrl, apiKey, jobAnalysis, setReviewSuggestions, comparison } = useApp();
  const [activeEditSection, setActiveEditSection] = useState(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [refining, setRefining] = useState(false);

  const handleRefineSection = async (sectionType) => {
    if (!customPrompt.trim()) return;
    setRefining(true);
    try {
      const targetSuggestions = suggestions.filter(s => s.sectionType === sectionType);
      
      let sectionData;
      if (sectionType === 'summary') {
        const summarySuggest = targetSuggestions[0];
        sectionData = {
          original: parsedResume.summary || "",
          current_suggested: summarySuggest ? summarySuggest.suggested : (parsedResume.summary || "")
        };
      } else if (sectionType === 'skills') {
        sectionData = targetSuggestions.map(s => s.skillName);
      } else {
        sectionData = targetSuggestions.map(s => s.suggested);
      }

      const headers = {};
      if (apiKey) headers["x-groq-key"] = apiKey;

      const res = await fetch(`${apiUrl}/api/refine-section`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          section_type: sectionType,
          section_data: sectionData,
          prompt: customPrompt,
          job: jobAnalysis
        })
      });

      if (!res.ok) {
        throw new Error("Section refinement failed on backend.");
      }

      const data = await res.json();
      const refined = data.refined;

      if (sectionType === 'summary') {
        const updated = suggestions.map(s => {
          if (s.sectionType === 'summary') {
            return { ...s, suggested: refined, status: 'pending' };
          }
          return s;
        });
        setReviewSuggestions(updated);
      } else if (sectionType === 'skills') {
        const updated = suggestions.map(s => {
          if (s.sectionType === 'skills') {
            const idx = targetSuggestions.findIndex(ts => ts.id === s.id);
            if (idx !== -1 && refined[idx]) {
              return { ...s, skillName: refined[idx], suggested: refined[idx], status: 'pending' };
            }
          }
          return s;
        });
        setReviewSuggestions(updated);
      } else {
        const updated = suggestions.map(s => {
          if (s.sectionType === sectionType) {
            const idx = targetSuggestions.findIndex(ts => ts.id === s.id);
            if (idx !== -1 && refined[idx]) {
              return { ...s, suggested: refined[idx], status: 'pending' };
            }
          }
          return s;
        });
        setReviewSuggestions(updated);
      }

      setActiveEditSection(null);
      setCustomPrompt("");
    } catch (e) {
      console.error(e);
      alert("Error refining section: " + e.message);
    } finally {
      setRefining(false);
    }
  };

  const renderRefinePanel = (sectionType) => {
    return (
      <div className="p-4 bg-emerald-550/[0.04] dark:bg-emerald-950/10 border border-emerald-500/20 dark:border-emerald-900/30 rounded-xl space-y-3 mt-3 select-none text-left font-sans">
        <div className="flex justify-between items-center text-[#00bda5] dark:text-emerald-400">
          <div className="flex items-center gap-1.5 font-sans font-black text-[10px] uppercase tracking-wider">
            <Sparkles size={12} />
            <span>Edit with AI</span>
          </div>
          <button 
            onClick={() => setActiveEditSection(null)}
            className="text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-200 cursor-pointer border-none bg-transparent p-0 flex items-center justify-center"
          >
            <span className="text-sm font-bold">×</span>
          </button>
        </div>
        
        <input
          type="text"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder={`Describe how you want this ${sectionType} refined...`}
          className="w-full text-[11px] px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-300 focus:outline-hidden focus:border-[#00bda5] font-sans"
        />
        
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {[
              "Tighten each bullet to one line",
              "Stronger action verbs",
              "Lead with the most job-relevant work"
            ].map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCustomPrompt(preset)}
                className="px-2.5 py-1 bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 text-zinc-650 dark:text-zinc-350 hover:bg-zinc-50 hover:text-zinc-850 dark:hover:bg-zinc-850 dark:hover:text-white rounded-full text-[9px] font-semibold cursor-pointer transition"
              >
                {preset}
              </button>
            ))}
          </div>
          
          <button
            onClick={() => handleRefineSection(sectionType)}
            disabled={refining}
            className="px-4 py-1.5 bg-[#00bda5] hover:bg-[#00a894] disabled:bg-zinc-300 disabled:dark:bg-zinc-800 text-white rounded-lg text-[9px] font-extrabold uppercase tracking-wider transition cursor-pointer border-none flex items-center gap-1 shadow-xs ml-auto"
          >
            {refining ? "Refining..." : "Edit with AI"}
          </button>
        </div>
      </div>
    );
  };

  // Statistics
  const stats = useMemo(() => {
    const total = suggestions.length;
    const accepted = suggestions.filter(s => s.status === 'accepted').length;
    const pending = suggestions.filter(s => s.status === 'pending').length;
    const rejected = suggestions.filter(s => s.status === 'rejected').length;
    const reviewed = accepted + rejected;
    const progressPercent = total > 0 ? Math.round((reviewed / total) * 100) : 0;
    return { total, accepted, pending, rejected, reviewed, progressPercent };
  }, [suggestions]);

  // Render a modified element inline: Original on top, Suggested below
  const renderInlineDiff = (sectionType, originalText, itemIndex, bulletIndex) => {
    const change = suggestions.find(
      s => s.sectionType === sectionType && 
           s.itemIndex === itemIndex && 
           s.bulletIndex === bulletIndex
    );

    if (!change) return <span>{originalText}</span>;

    const isPending = change.status === 'pending';

    return (
      <span className="inline">
        {isPending ? (
          <span className="inline-flex items-center flex-wrap gap-1 mx-1 align-middle">
            <span className="text-rose-500 line-through bg-rose-50/50 dark:bg-rose-950/20 px-1 py-0.5 rounded select-all font-normal">
              {change.original}
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 px-1 py-0.5 rounded font-bold select-all">
              {change.suggested}
            </span>
            <span className="inline-flex gap-1 select-none">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateSuggestionStatus(change.id, 'accepted');
                }}
                className="px-2 py-0.5 bg-[#00bda5] hover:bg-[#00a894] text-white rounded font-extrabold text-[9px] transition cursor-pointer border-none"
              >
                Accept
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateSuggestionStatus(change.id, 'rejected');
                }}
                className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded font-extrabold text-[9px] transition cursor-pointer border-none"
              >
                Reject
              </button>
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 mx-1 align-middle">
            <span className={change.status === 'accepted' ? 'text-zinc-900 dark:text-zinc-150 font-medium bg-emerald-50/30 dark:bg-emerald-900/10 px-1 rounded' : 'text-zinc-400 dark:text-zinc-650 line-through px-1'}>
              {change.status === 'accepted' ? change.suggested : change.original}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateSuggestionStatus(change.id, 'pending');
              }}
              className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 rounded font-extrabold text-[8px] uppercase tracking-wider transition cursor-pointer border-none"
            >
              Undo
            </button>
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col justify-between h-full bg-zinc-50 dark:bg-zinc-950 select-text font-sans">
      {/* Floating Status & Progress Header Bar */}
      <div className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-950/80 border-b border-zinc-200/60 dark:border-zinc-850 p-4 select-none flex-shrink-0 flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-widest">Document Review</span>
            <span className="text-[9px] bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-450 px-2 py-0.5 rounded-full font-bold">
              {stats.reviewed}/{stats.total} Edits
            </span>
          </div>
          {/* Visual Progress Bar */}
          <div className="flex items-center gap-2">
            <div className="w-24 h-1 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#00bda5] rounded-full transition-all duration-500"
                style={{ width: `${stats.progressPercent}%` }}
              />
            </div>
            <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500">{stats.progressPercent}% Completed</span>
          </div>
        </div>

        {/* ATS Match Score */}
        {comparison && (
          <div className="hidden xs:flex items-center gap-2 border-l border-zinc-200/60 dark:border-zinc-800 pl-3 mr-auto select-none">
            <div className="text-left">
              <p className="text-[7px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest leading-none">ATS Score</p>
              <p className="text-[11px] font-black text-[#00bda5] dark:text-[#00bda5] leading-none mt-1">
                {comparison.ats_score_before}% → {comparison.ats_score_after}%
              </p>
            </div>
          </div>
        )}

        {/* Bulk Controls */}
        <div className="flex gap-1.5">
          <button
            onClick={onAcceptAll}
            className="px-3 py-1.5 bg-[#00bda5] hover:bg-[#00a894] text-white text-[9px] font-bold rounded-lg transition-all cursor-pointer border-none"
          >
            Accept All
          </button>
          <button
            onClick={onRejectAll}
            className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 text-zinc-650 dark:text-zinc-350 text-[9px] font-bold rounded-lg transition-all cursor-pointer border-none"
          >
            Reject All
          </button>
          <button
            onClick={() => {
              suggestions.forEach(s => onUpdateSuggestionStatus(s.id, 'pending'));
            }}
            className="p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition active:scale-95 cursor-pointer flex items-center justify-center"
            title="Reset All Changes"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Main Spacing & LaTeX-Style Resume Paper Container */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin max-h-[500px]">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200/80 dark:border-zinc-850 space-y-5 text-zinc-850 dark:text-zinc-200 font-serif leading-relaxed max-w-full relative shadow-xs">
          
          {/* Header Info */}
          <div className="text-center space-y-1.5 pb-4 border-b border-zinc-100 dark:border-zinc-850 font-sans select-none">
            <h1 className="text-base font-extrabold text-zinc-950 dark:text-white tracking-tight leading-none">
              {parsedResume.personal_info?.name || 'Your Name'}
            </h1>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold">
              {parsedResume.personal_info?.email} | {parsedResume.personal_info?.phone} | {parsedResume.personal_info?.location}
            </p>
          </div>

          {/* Professional Summary */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center border-b border-zinc-150 dark:border-zinc-850 pb-1">
              <h2 className="text-[10px] font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-widest font-sans">
                Professional Summary
              </h2>
              <button
                onClick={() => {
                  setActiveEditSection(activeEditSection === 'summary' ? null : 'summary');
                  setCustomPrompt('');
                }}
                className="flex items-center gap-1 text-[8px] bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 text-[#00bda5] px-2 py-0.5 rounded font-extrabold uppercase tracking-wider transition cursor-pointer border-none"
              >
                <Sparkles size={8} /> Edit with AI
              </button>
            </div>
            <div className="text-[11px] leading-relaxed text-justify text-zinc-600 dark:text-zinc-350">
              {renderInlineDiff('summary', parsedResume.summary, 0, 0)}
            </div>
            {activeEditSection === 'summary' && renderRefinePanel('summary')}
          </div>

          {/* Work Experience */}
          {parsedResume.experience?.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-zinc-150 dark:border-zinc-850 pb-1">
                <h2 className="text-[10px] font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-widest font-sans">
                  Work Experience
                </h2>
                <button
                  onClick={() => {
                    setActiveEditSection(activeEditSection === 'experience' ? null : 'experience');
                    setCustomPrompt('');
                  }}
                  className="flex items-center gap-1 text-[8px] bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 text-[#00bda5] px-2 py-0.5 rounded font-extrabold uppercase tracking-wider transition cursor-pointer border-none"
                >
                  <Sparkles size={8} /> Edit with AI
                </button>
              </div>
              {activeEditSection === 'experience' && renderRefinePanel('experience')}
              {parsedResume.experience.map((exp, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between font-extrabold text-[11px] text-zinc-850 dark:text-zinc-200 font-sans">
                    <span>{exp.role} — {exp.company}</span>
                    <span className="font-bold text-zinc-400 dark:text-zinc-500">{exp.start_date} - {exp.end_date}</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-2">
                    {exp.description?.map((bullet, bIdx) => (
                      <li key={bIdx} className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-350">
                        {renderInlineDiff('experience', bullet, idx, bIdx)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Projects */}
          {parsedResume.projects?.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-zinc-150 dark:border-zinc-850 pb-1">
                <h2 className="text-[10px] font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-widest font-sans">
                  Projects
                </h2>
                <button
                  onClick={() => {
                    setActiveEditSection(activeEditSection === 'projects' ? null : 'projects');
                    setCustomPrompt('');
                  }}
                  className="flex items-center gap-1 text-[8px] bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 text-[#00bda5] px-2 py-0.5 rounded font-extrabold uppercase tracking-wider transition cursor-pointer border-none"
                >
                  <Sparkles size={8} /> Edit with AI
                </button>
              </div>
              {activeEditSection === 'projects' && renderRefinePanel('projects')}
              {parsedResume.projects.map((proj, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between font-extrabold text-[11px] text-zinc-850 dark:text-zinc-200 font-sans">
                    <span>{proj.name}</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-2">
                    {proj.description?.map((bullet, bIdx) => (
                      <li key={bIdx} className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-350">
                        {renderInlineDiff('projects', bullet, idx, bIdx)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Skills */}
          {parsedResume.skills?.length > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between items-center border-b border-zinc-150 dark:border-zinc-850 pb-1">
                <h2 className="text-[10px] font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-widest font-sans">
                  Skills
                </h2>
                <button
                  onClick={() => {
                    setActiveEditSection(activeEditSection === 'skills' ? null : 'skills');
                    setCustomPrompt('');
                  }}
                  className="flex items-center gap-1 text-[8px] bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 text-[#00bda5] px-2 py-0.5 rounded font-extrabold uppercase tracking-wider transition cursor-pointer border-none"
                >
                  <Sparkles size={8} /> Edit with AI
                </button>
              </div>
              {activeEditSection === 'skills' && renderRefinePanel('skills')}
              <div className="flex flex-wrap gap-1.5 leading-relaxed text-[11px] font-sans text-zinc-650 dark:text-zinc-350">
                {parsedResume.skills.join(', ')}
                
                {/* Inline suggested skills additions */}
                {suggestions.filter(s => s.sectionType === 'skills').map(s => {
                  if (s.status === 'rejected') return null;
                  const isPending = s.status === 'pending';
                  return (
                    <span 
                      key={s.id} 
                      className={`px-2 py-0.5 rounded-lg border text-[9px] font-bold flex items-center gap-1.5 transition-all ${
                        isPending 
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400' 
                          : 'bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      + {s.skillName}
                      {isPending && (
                        <span className="flex items-center gap-1 border-l border-emerald-200/40 pl-1.5 ml-1 select-none">
                          <span 
                            className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer font-extrabold"
                            onClick={() => onUpdateSuggestionStatus(s.id, 'accepted')}
                            title="Accept Skill"
                          >
                            ✓
                          </span>
                          <span 
                            className="text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-350 cursor-pointer font-extrabold"
                            onClick={() => onUpdateSuggestionStatus(s.id, 'rejected')}
                            title="Reject Skill"
                          >
                            ✕
                          </span>
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="py-4 px-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex gap-3 flex-shrink-0 select-none">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="flex-1 py-3 border border-zinc-250 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400 font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
        >
          Back
        </button>
        
        <button
          type="button"
          onClick={onGenerateResume}
          disabled={loading}
          className="flex-2 py-3 bg-[#00bda5] hover:bg-[#00a894] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-95"
        >
          <Sparkles size={13} />
          Generate Resume
        </button>
      </div>
    </div>
  );
}

export default ResumeReviewView;
