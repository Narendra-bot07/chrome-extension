import React, { useState, useEffect, useRef } from 'react';
import { Check, CheckCircle2, AlertCircle, X, Lock } from 'lucide-react';

const PIPELINE_STAGES = [
  { id: 'Saved', label: 'SAVED', colorDot: 'bg-zinc-400' },
  { id: 'Preparing', label: 'PREPARING', colorDot: 'bg-blue-400' },
  { id: 'Ready To Apply', label: 'READY TO APPLY', colorDot: 'bg-blue-500' },
  { id: 'Applied', label: 'APPLIED', colorDot: 'bg-indigo-500' },
  { id: 'Assessment', label: 'ASSESSMENT', colorDot: 'bg-purple-500' },
  { id: 'Recruiter Contact', label: 'RECRUITER CONTACT', colorDot: 'bg-pink-500' },
  { id: 'Interview', label: 'INTERVIEW', colorDot: 'bg-amber-500' },
  { id: 'Final Round', label: 'FINAL ROUND', colorDot: 'bg-blue-500' },
  { id: 'Offer', label: 'OFFER RECEIVED', colorDot: 'bg-emerald-500' }
];

const TERMINAL_STAGES = [
  { id: 'Accepted', label: 'ACCEPTED', colorDot: 'bg-emerald-500' },
  { id: 'Rejected', label: 'REJECTED', colorDot: 'bg-rose-500' },
  { id: 'Archived', label: 'ARCHIVED', colorDot: 'bg-zinc-500' }
];

export function WorkflowTab({ application, onUpdateStage }) {
  if (!application) return null;

  const currentStage = application.current_stage || 'Ready To Apply';
  const currentStageIndex = PIPELINE_STAGES.findIndex(s => s.id === currentStage);
  const isTerminalStage = TERMINAL_STAGES.some(s => s.id === currentStage);

  const [dragged, setDragged] = useState(false);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  // Refs for Centering
  const scrollContainerRef = useRef(null);
  const activeCardRef = useRef(null);

  // Stage Popup Modal state
  const [popupStage, setPopupStage] = useState(null);
  const [popupNote, setPopupNote] = useState('');
  const [popupDate, setPopupDate] = useState('');

  // Auto-Center Active Stage or Board Center on Load/Update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeCardRef.current && scrollContainerRef.current) {
        activeCardRef.current.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'center'
        });
      } else if (scrollContainerRef.current) {
        const scrollWidth = scrollContainerRef.current.scrollWidth;
        const clientWidth = scrollContainerRef.current.clientWidth;
        scrollContainerRef.current.scrollLeft = (scrollWidth - clientWidth) / 2;
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [currentStage, application?.id]);

  // Drag Handlers
  const handleDragStart = (e) => {
    if (isTerminalStage) {
      e.preventDefault();
      return;
    }
    setDragged(true);
    e.dataTransfer.setData('text/plain', application.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDragged(false);
    setDragOverStage(null);
  };

  const handleDragOver = (e, stageId) => {
    if (isTerminalStage) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverStage !== stageId) {
      setDragOverStage(stageId);
    }
  };

  const handleDragLeave = (e, stageId) => {
    e.preventDefault();
    if (dragOverStage === stageId) {
      setDragOverStage(null);
    }
  };

  const handleDrop = async (e, stageObj) => {
    e.preventDefault();
    setDragged(false);
    setDragOverStage(null);

    if (isTerminalStage) {
      setToastMessage(`Application is locked in final state (${currentStage}).`);
      setTimeout(() => setToastMessage(''), 3500);
      return;
    }

    if (stageObj && stageObj.id !== currentStage) {
      setPopupStage(stageObj);
      setPopupNote('');
      setPopupDate('');
    }
  };

  const handleOpenStagePopup = (stageObj) => {
    if (isTerminalStage) {
      setToastMessage(`Application is locked in final state (${currentStage}).`);
      setTimeout(() => setToastMessage(''), 3500);
      return;
    }
    if (stageObj.id === currentStage) return;
    setPopupStage(stageObj);
    setPopupNote('');
    setPopupDate('');
  };

  const handleConfirmStageMove = async (e) => {
    e.preventDefault();
    if (!popupStage) return;

    try {
      await onUpdateStage(application.id, popupStage.id, popupNote, popupDate);
      setToastMessage(`Moved application to ${popupStage.label}`);
      setPopupStage(null);
      setTimeout(() => setToastMessage(''), 3000);
    } catch (err) {
      console.error("Failed to update stage:", err);
    }
  };

  const matchScore = Math.round(application.resume_match_score || application.match_score || 60);
  const atsScore = Math.round(application.ats_score || 70);

  const calculateDaysInStage = (dateStr) => {
    if (!dateStr) return '1';
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    return days <= 0 ? '1' : `${days}`;
  };

  return (
    <div className="w-full h-full min-h-[420px] flex flex-col items-center justify-center overflow-hidden select-none py-2 relative">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold rounded-xl flex items-center gap-2 animate-fade-in max-w-md shadow-xs mb-2 z-20">
          <AlertCircle size={15} className="text-amber-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* HORIZONTALLY SCROLLABLE PIPELINE CONTAINER (PERFECTLY COMPACT & CENTERED) */}
      <div 
        ref={scrollContainerRef}
        className="w-full h-full overflow-x-auto custom-scrollbar overflow-y-hidden flex items-center justify-start py-8 px-6"
      >
        <div className="min-w-[1150px] relative flex items-center my-auto py-6">
          
          {/* Central Connecting Timeline Line running behind stage cards */}
          <div className="absolute left-4 right-[200px] top-1/2 -translate-y-1/2 h-[1.5px] bg-zinc-200 dark:bg-zinc-800 z-0" />

          {/* Branching SVG Lines to Terminal Nodes */}
          <svg className="absolute right-0 top-0 w-[200px] h-full pointer-events-none z-0" overflow="visible">
            <path d="M 0 50% L 35 50% L 35 18% L 50 18%" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-200 dark:text-zinc-800" />
            <path d="M 0 50% L 50 50%" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-200 dark:text-zinc-800" />
            <path d="M 0 50% L 35 50% L 35 82% L 50 82%" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-200 dark:text-zinc-800" />
          </svg>

          {/* STAGE NODES FLOW */}
          <div className="flex items-center gap-5 z-10">
            {PIPELINE_STAGES.map((stage, idx) => {
              const isCurrent = currentStage === stage.id;
              const isCompleted = isTerminalStage || (currentStageIndex >= 0 && currentStageIndex > idx);
              const isOver = dragOverStage === stage.id;

              return (
                <div
                  key={stage.id}
                  ref={isCurrent ? activeCardRef : null}
                  onDragOver={(e) => handleDragOver(e, stage.id)}
                  onDragLeave={(e) => handleDragLeave(e, stage.id)}
                  onDrop={(e) => handleDrop(e, stage)}
                  className={`w-44 shrink-0 transition-all duration-200 ${
                    isCurrent
                      ? 'ring-2 ring-teal-400 dark:ring-teal-500 rounded-2xl bg-white dark:bg-zinc-900 shadow-md p-1 scale-105'
                      : isCompleted
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 p-2.5 shadow-xs'
                      : 'bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 p-2.5 shadow-xs hover:border-zinc-300'
                  } ${isOver ? 'border-2 border-dashed border-teal-500 bg-teal-50/50 dark:bg-teal-950/30' : ''}`}
                >
                  {/* Stage Header */}
                  <div className="flex items-center justify-between mb-1.5 p-0.5 border-b border-zinc-100 dark:border-zinc-800/80 pb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-2 h-2 rounded-full ${isCompleted ? 'bg-emerald-500' : stage.colorDot} shrink-0`} />
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200 truncate">
                        {stage.label}
                      </span>
                    </div>

                    {isCompleted && !isCurrent && (
                      <span className="px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-extrabold text-[8px] flex items-center gap-0.5 shrink-0">
                        <Check size={9} /> DONE
                      </span>
                    )}
                  </div>

                  {/* Content inside Stage */}
                  {isCurrent ? (
                    <div
                      draggable={!isTerminalStage}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      className={`p-2.5 bg-zinc-50/80 dark:bg-zinc-950 rounded-xl border border-zinc-200/80 dark:border-zinc-800 space-y-1.5 ${
                        isTerminalStage ? 'cursor-default' : 'cursor-grab active:cursor-grabbing hover:shadow-xs'
                      } transition-shadow`}
                    >
                      <div className="font-extrabold text-[11px] text-zinc-900 dark:text-white truncate">
                        {application.job_title || 'Software Position'}
                      </div>
                      <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 truncate">
                        {application.company_name || 'Target Company'}
                      </div>

                      <div className="grid grid-cols-3 gap-1 pt-1.5 text-[8.5px] text-zinc-500 dark:text-zinc-400 border-t border-zinc-200/60 dark:border-zinc-800">
                        <div>
                          <span className="block font-semibold">Match:</span>
                          <strong className="text-teal-600 dark:text-teal-400 font-bold">{matchScore}%</strong>
                        </div>
                        <div>
                          <span className="block font-semibold">ATS:</span>
                          <strong className="text-emerald-600 dark:text-emerald-400 font-bold">{atsScore}/100</strong>
                        </div>
                        <div>
                          <span className="block font-semibold">Days:</span>
                          <strong className="text-zinc-700 dark:text-zinc-300 font-bold">{calculateDaysInStage(application.updated_at)}</strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => handleOpenStagePopup(stage)}
                      className={`py-4 rounded-xl border border-dashed text-center transition-all ${
                        isTerminalStage
                          ? 'border-zinc-200 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700 bg-zinc-50/20 cursor-not-allowed'
                          : isCompleted
                          ? 'bg-emerald-50/30 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 cursor-pointer'
                          : isOver
                          ? 'border-teal-500 text-teal-600 bg-teal-50/60 dark:bg-teal-950/40 font-bold cursor-pointer'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 hover:bg-zinc-50/50 cursor-pointer'
                      }`}
                    >
                      <span className={`text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full ${
                        isTerminalStage
                          ? 'bg-zinc-100/60 dark:bg-zinc-800/40 text-zinc-400 border border-zinc-200 dark:border-zinc-800'
                          : isCompleted
                          ? 'bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700'
                      }`}>
                        {isTerminalStage ? 'LOCKED' : isOver ? 'RELEASE TO DROP' : isCompleted ? 'STAGE COMPLETED' : 'DROP HERE'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* BRANCHING TERMINAL STAGES STACKED ON RIGHT */}
          <div className="ml-10 flex flex-col space-y-2.5 w-44 shrink-0 z-10">
            {TERMINAL_STAGES.map((ts) => {
              const isCurrent = currentStage === ts.id;
              const isOver = dragOverStage === ts.id;

              return (
                <div
                  key={ts.id}
                  ref={isCurrent ? activeCardRef : null}
                  onDragOver={(e) => handleDragOver(e, ts.id)}
                  onDragLeave={(e) => handleDragLeave(e, ts.id)}
                  onDrop={(e) => handleDrop(e, ts)}
                  className={`bg-white dark:bg-zinc-900 rounded-2xl border p-2.5 transition-all duration-200 shadow-xs ${
                    isCurrent
                      ? 'ring-2 ring-teal-400 dark:ring-teal-500 border-teal-400 scale-105'
                      : 'border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300'
                  } ${isOver ? 'border-2 border-dashed border-teal-500 bg-teal-50/60 dark:bg-teal-950/40' : ''}`}
                >
                  {/* Terminal Header */}
                  <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${ts.colorDot} shrink-0`} />
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                        {ts.label}
                      </span>
                    </div>

                    {isCurrent && (
                      <span className="px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 font-extrabold text-[8px] flex items-center gap-0.5">
                        <Lock size={9} /> FINAL
                      </span>
                    )}
                  </div>

                  {isCurrent ? (
                    <div
                      draggable={false}
                      className="p-2.5 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-1 cursor-default"
                    >
                      <div className="font-extrabold text-[11px] text-zinc-900 dark:text-white truncate">
                        {application.job_title}
                      </div>
                      <div className="text-[9.5px] text-zinc-500 truncate">
                        {application.company_name}
                      </div>
                      <div className="text-[8.5px] font-bold text-teal-600 dark:text-teal-400 pt-0.5">
                        Status: {ts.label} (Locked)
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => handleOpenStagePopup(ts)}
                      className={`py-2.5 rounded-xl border border-dashed text-center transition-all ${
                        isTerminalStage
                          ? 'border-zinc-200 dark:border-zinc-800 text-zinc-300 dark:text-zinc-700 bg-zinc-50/20 cursor-not-allowed'
                          : isOver
                          ? 'border-teal-500 text-teal-600 bg-teal-50 dark:bg-teal-950/40 font-bold cursor-pointer'
                          : 'border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 cursor-pointer'
                      }`}
                    >
                      <span className="text-[8.5px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400">
                        {isTerminalStage ? 'LOCKED' : isOver ? 'RELEASE TO DROP' : 'DROP HERE'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>

      {/* STAGE OPTIONS POP-UP MODAL */}
      {popupStage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <form onSubmit={handleConfirmStageMove} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl text-zinc-900 dark:text-zinc-100">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${popupStage.colorDot || 'bg-teal-500'}`} />
                <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Stage Options: {popupStage.label}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPopupStage(null)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-3 text-xs">
              <p className="text-zinc-600 dark:text-zinc-400">
                Moving <strong className="text-zinc-900 dark:text-white font-bold">{application.job_title}</strong> at <strong className="text-zinc-900 dark:text-white font-bold">{application.company_name}</strong> to <strong className="text-teal-600 dark:text-teal-400 font-bold">{popupStage.label}</strong>.
              </p>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                  Stage Notes / Next Action Details (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder={`Add details for ${popupStage.label} (e.g. interview date, recruiter feedback, salary offer)...`}
                  value={popupNote}
                  onChange={(e) => setPopupNote(e.target.value)}
                  className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500 text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                  Follow-up / Event Date (Optional)
                </label>
                <input
                  type="date"
                  value={popupDate}
                  onChange={(e) => setPopupDate(e.target.value)}
                  className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500 text-xs"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setPopupStage(null)}
                className="px-3.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#00bda5] hover:bg-[#00a38e] text-white font-bold text-xs rounded-xl cursor-pointer border-none shadow-xs"
              >
                Confirm Move to {popupStage.label}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

export default WorkflowTab;
