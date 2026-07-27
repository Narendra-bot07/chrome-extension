import React from 'react';
import { Check, Sparkles, ShieldCheck, ArrowRight, RefreshCw, FileText, CalendarDays, Clock3, History, Eye, Star, X, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { InlineAIThinking, SkeletonCard } from './ui/Loading';

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

const formatDate = (value) => {
  if (!value) return 'Never';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatSize = (bytes) => {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function ResumeTailoringConfigView({
  selectedSections,
  onToggleSection,
  tailoringIntensity,
  onSelectIntensity,
  onStartTailoring,
  onBack,
  loading,
  activeResume,
  resumesList = [],
  onChangeResume,
  onChooseResume,
  onUploadResume,
  validationMessage
}) {
  const { isExtension, apiUrl, session } = useApp();
  const selectedCount = selectedSections.length;
  const activeIntensity = intensityOptions.find(opt => opt.id === tailoringIntensity) || intensityOptions[1];
  const [loadingStep, setLoadingStep] = React.useState(0);
  const [resumeModalOpen, setResumeModalOpen] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState('');
  const [previewName, setPreviewName] = React.useState('');
  const hasActiveResume = Boolean(activeResume?.id);

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

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePreview = async (resume) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token || !resume?.id) return;
    const res = await fetch(`${apiUrl}/api/v1/resumes/${resume.id}/preview`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const blob = await res.blob();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewName(resume.file_name || 'Resume');
    setPreviewUrl(URL.createObjectURL(blob));
  };

  const handleSelectResume = async (resume) => {
    await onChangeResume?.(resume.id);
    setResumeModalOpen(false);
  };

  return (
    <div className={`flex-1 flex flex-col justify-between select-none relative text-zinc-650 dark:text-zinc-350 font-sans mx-auto w-full ${
      isExtension ? 'max-w-lg h-full' : 'max-w-4xl py-2'
    }`}>
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-tf-surface/95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in-up">
          <div className="w-full max-w-sm space-y-4">
            <InlineAIThinking 
              stages={loadingMessages} 
              className="shadow-sm" 
            />
            <div className="space-y-3">
              <SkeletonCard numRows={2} />
              <SkeletonCard numRows={2} />
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

        <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-[#00bda5]/10 text-[#00bda5] flex items-center justify-center">
                <FileText size={17} />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Using Resume</p>
                <p className="text-sm font-black text-zinc-950 dark:text-white truncate max-w-[250px]">
                  {hasActiveResume ? activeResume.file_name || 'Active resume' : 'No active resume selected'}
                </p>
              </div>
            </div>
            {hasActiveResume && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 text-[10px] font-black">
                <Check size={12} /> Active
              </span>
            )}
          </div>

          {hasActiveResume ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1.5"><CalendarDays size={12} /> Uploaded {formatDate(activeResume.created_at)}</span>
                <span className="inline-flex items-center gap-1.5"><Clock3 size={12} /> Last used {formatDate(activeResume.last_used_at)}</span>
                <span className="inline-flex items-center gap-1.5"><History size={12} /> Used {activeResume.times_used || activeResume.tailor_count || 0} times</span>
                <span className="inline-flex items-center gap-1.5"><FileText size={12} /> {formatSize(activeResume.file_size)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => handlePreview(activeResume)} className="py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-extrabold flex items-center justify-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <Eye size={14} /> Preview
                </button>
                <button type="button" onClick={() => setResumeModalOpen(true)} className="py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-extrabold flex items-center justify-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <RefreshCw size={14} /> Change Resume
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">No active resume selected. Choose or upload a resume before tailoring.</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={onChooseResume} className="py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-extrabold flex items-center justify-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <Star size={14} /> Choose Resume
                </button>
                <button type="button" onClick={onUploadResume} className="py-2 rounded-xl bg-[#00bda5] text-white text-xs font-extrabold flex items-center justify-center gap-2 hover:bg-[#00a894]">
                  <Upload size={14} /> Upload Resume
                </button>
              </div>
            </div>
          )}
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
          disabled={loading || selectedSections.length === 0 || !hasActiveResume}
          className="flex-2 py-3 bg-[#00bda5] hover:bg-[#00a894] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 border-none"
        >
          <Sparkles size={13} />
          Start Tailoring
          <ArrowRight size={13} />
        </button>
      </div>

      {resumeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-5">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-zinc-950 dark:text-white">Change active resume</h3>
                <p className="text-xs text-zinc-500">Select the resume that should power tailoring.</p>
              </div>
              <button type="button" onClick={() => setResumeModalOpen(false)} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2">
              {resumesList.map((resume) => {
                const isActive = resume.id === activeResume?.id || resume.is_active;
                return (
                  <button key={resume.id} type="button" onClick={() => handleSelectResume(resume)} className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                    isActive ? 'bg-[#00bda5]/10 text-zinc-950 dark:text-white' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}>
                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${isActive ? 'border-[#00bda5] bg-[#00bda5]' : 'border-zinc-300 dark:border-zinc-700'}`}>
                      {isActive && <Check size={10} className="text-white" />}
                    </span>
                    <FileText size={16} className="text-zinc-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black truncate">{resume.file_name || 'Resume.pdf'}</p>
                      <p className="text-[11px] text-zinc-500">Uploaded {formatDate(resume.created_at)} · Used {resume.times_used || resume.tailor_count || 0} times</p>
                    </div>
                    <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); handlePreview(resume); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); handlePreview(resume); } }} className="p-2 rounded-lg hover:bg-white dark:hover:bg-zinc-800 text-zinc-500">
                      <Eye size={15} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-5xl h-[88vh] bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} className="text-zinc-400" />
                <span className="text-sm font-black truncate">{previewName}</span>
              </div>
              <button type="button" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(''); setPreviewName(''); }} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-900">
                <X size={18} />
              </button>
            </div>
            <iframe title="Resume Preview" src={previewUrl} className="flex-1 w-full bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}

export default ResumeTailoringConfigView;
