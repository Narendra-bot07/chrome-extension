import React from 'react';
import { Check, Sparkles, ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';

const sectionOptions = [
  { id: 'summary', title: 'Summary' },
  { id: 'skills', title: 'Skills' },
  { id: 'experience', title: 'Work Experience' },
  { id: 'projects', title: 'Projects' },
  { id: 'education', title: 'Education' },
  { id: 'certifications', title: 'Certifications' },
  { id: 'achievements', title: 'Achievements' }
];

const intensityOptions = [
  {
    id: 'minimal',
    title: 'Minimal',
    description: 'Preserves your writing style. Focuses on small keyword inserts for basic ATS matches.',
    recommendation: 'Best for small tweaks.'
  },
  {
    id: 'balanced',
    title: 'Balanced',
    description: 'Improves wording, optimizes ATS keywords, and aligns experience structure while keeping your tone.',
    recommendation: 'Recommended for most users.'
  },
  {
    id: 'aggressive',
    title: 'Aggressive',
    description: 'Completely rewrites sections to maximize ATS scoring and impact language while preserving factual history.',
    recommendation: 'Best for highly competitive roles.'
  }
];

const loadingMessages = [
  "Preparing Resume...",
  "Analyzing Resume Sections...",
  "Matching Resume with Job Description...",
  "Optimizing Selected Sections...",
  "Generating Tailored Resume...",
  "Please wait while your resume is being tailored."
];

function ResumeTailoringConfigView({
  selectedSections,
  onToggleSection,
  tailoringIntensity,
  onSelectIntensity,
  onStartTailoring,
  onBack,
  loading,
  validationMessage
}) {
  const { isExtension } = useApp();
  const selectedCount = selectedSections.length;
  const activeIntensity = intensityOptions.find(opt => opt.id === tailoringIntensity) || intensityOptions[1];
  const [loadingStep, setLoadingStep] = React.useState(0);

  React.useEffect(() => {
    let interval;
    if (loading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => {
          if (prev < loadingMessages.length - 1) {
            return prev + 1;
          }
          return prev;
        });
      }, 1200);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  return (
    <div className={`flex-1 flex flex-col justify-between select-none relative text-zinc-650 dark:text-zinc-350 font-sans mx-auto w-full ${
      isExtension ? 'max-w-lg h-full' : 'max-w-4xl py-2'
    }`}>
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white dark:bg-zinc-950/98 backdrop-blur-xs z-50 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
          <div className="w-12 h-12 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center relative mb-5">
            <RefreshCw className="text-[#00bda5] animate-spin" size={18} />
          </div>
          <div className="space-y-3 max-w-[280px]">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-950 dark:text-zinc-50">
              Tailoring Resume
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium min-h-[2.5rem] leading-relaxed">
              {loadingMessages[loadingStep]}
            </p>
            <div className="w-44 h-1 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden border border-zinc-200/50 dark:border-zinc-800 mx-auto mt-2">
              <div 
                className="h-full bg-[#00bda5] transition-all duration-500 rounded-full"
                style={{ width: `${((loadingStep + 1) / loadingMessages.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5 pr-1.5 scrollbar-thin overflow-y-auto max-h-[500px] pb-4">
        {/* Title */}
        <div className="space-y-1">
          <h2 className="text-lg font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50">Configure Tailoring</h2>
          <p className="text-xs text-zinc-400">Fine-tune how AI optimizes your resume details.</p>
        </div>

        {/* Section 1: Choose Sections (Interactive Pills Grid) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block">Choose Sections</span>
            <span className="text-[9px] font-bold text-zinc-500">{selectedCount} selected</span>
          </div>

          <div className="flex flex-wrap gap-2 p-3.5 bg-white border border-zinc-200/60 dark:bg-zinc-900/30 dark:border-zinc-850 rounded-xl">
            {sectionOptions.map((section) => {
              const isActive = selectedSections.includes(section.id);
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onToggleSection(section.id)}
                  disabled={loading}
                  className={`text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-all duration-150 flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'border-[#00bda5] bg-[#00bda5] text-white'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:border-zinc-350 dark:hover:border-zinc-700 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
                >
                  {isActive && <Check size={10} className="stroke-[3]" />}
                  {section.title}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Tailoring Intensity (Segmented Selector) */}
        <div className="space-y-2.5">
          <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block font-sans">Optimization Level</span>
          
          {/* Segmented Controller Tab Bar */}
          <div className="bg-zinc-100 dark:bg-zinc-900/60 p-1 border border-zinc-200/60 dark:border-zinc-855 rounded-xl grid grid-cols-3 gap-1">
            {intensityOptions.map((option) => {
              const isSelected = tailoringIntensity === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectIntensity(option.id)}
                  disabled={loading}
                  className={`py-1.5 text-[10px] font-bold rounded-lg text-center transition-all duration-150 cursor-pointer border-none ${
                    isSelected
                      ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50 border border-zinc-200 dark:border-zinc-800'
                      : 'text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-305 bg-transparent'
                  }`}
                >
                  {option.title}
                </button>
              );
            })}
          </div>

          {/* Active Level Description Card */}
          <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200/60 dark:border-zinc-850 rounded-xl text-[10px] leading-relaxed space-y-1">
            <p className="font-bold text-zinc-800 dark:text-zinc-200">{activeIntensity.title} Optimization</p>
            <p className="text-zinc-500 dark:text-zinc-400 leading-normal">{activeIntensity.description}</p>
            <p className="text-[9.5px] font-extrabold text-[#00bda5] pt-0.5">{activeIntensity.recommendation}</p>
          </div>
        </div>

        {/* Section 3: AI Processing Summary */}
        <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-850 bg-white dark:bg-zinc-900/30 p-3.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-[#00bda5]" />
            <span className="text-[9px] font-black text-zinc-450 dark:text-zinc-500 uppercase tracking-widest block font-sans">Summary of Action</span>
          </div>
          <div className="text-[10px] leading-relaxed text-zinc-550 dark:text-zinc-450 space-y-2">
            <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-850 pb-1.5">
              <span className="font-medium text-zinc-400 dark:text-zinc-500">Selected Sections:</span>
              <span className="font-bold text-zinc-700 dark:text-zinc-300">{selectedCount} sections</span>
            </div>
            <div className="flex justify-between border-b border-zinc-100 dark:border-zinc-850 pb-1.5">
              <span className="font-medium text-zinc-400 dark:text-zinc-500">Tailoring Mode:</span>
              <span className="font-extrabold text-[#00bda5] capitalize">{tailoringIntensity}</span>
            </div>
            <p className="text-[9.5px] text-zinc-400 dark:text-zinc-500 italic">
              AI optimizations rewrite existing experiences to align with target keywords. No factual history will be fabricated.
            </p>
          </div>
        </div>

        {validationMessage && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20 px-3 py-2 text-[10px] font-bold text-amber-700 dark:text-amber-550 leading-relaxed">
            {validationMessage}
          </div>
        )}
      </div>

      {/* Footer Navigation Buttons */}
      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 mt-auto flex gap-3 bg-transparent flex-shrink-0">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="flex-1 py-3 border border-zinc-250 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400 font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition flex items-center justify-center gap-2 cursor-pointer border-zinc-200 dark:border-zinc-800"
        >
          <RefreshCw size={13} />
          Back
        </button>
        <button
          type="button"
          onClick={onStartTailoring}
          disabled={loading || selectedSections.length === 0}
          className="flex-2 py-3 bg-[#00bda5] hover:bg-[#00a894] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 border-none"
        >
          <Sparkles size={13} />
          Start Tailoring
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

export default ResumeTailoringConfigView;
