import React, { useState, useEffect, useRef } from 'react';
import { 
  Target, 
  Send, 
  ClipboardCheck, 
  UserCheck, 
  Calendar, 
  Trophy, 
  Handshake, 
  Check, 
  AlertCircle, 
  X, 
  Lock 
} from 'lucide-react';

const PIPELINE_STAGES = [
  { id: 'Ready To Apply', num: '01', label: 'READY TO APPLY', icon: Target },
  { id: 'Applied', num: '02', label: 'APPLIED', icon: Send },
  { id: 'Assessment', num: '03', label: 'ASSESSMENT', icon: ClipboardCheck },
  { id: 'Recruiter Contact', num: '04', label: 'RECRUITER CONTACT', icon: UserCheck },
  { id: 'Interview', num: '05', label: 'INTERVIEW', icon: Calendar },
  { id: 'Final Round', num: '06', label: 'FINAL ROUND', icon: Trophy },
  { id: 'Offer', num: '07', label: 'OFFER RECEIVED', icon: Handshake }
];

const TERMINAL_STAGES = [
  { id: 'Accepted', num: '08', label: 'ACCEPTED', colorDot: 'bg-emerald-500' },
  { id: 'Rejected', num: '09', label: 'REJECTED', colorDot: 'bg-rose-500' },
  { id: 'Archived', num: '10', label: 'ARCHIVED', colorDot: 'bg-zinc-500' }
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
  const [popupError, setPopupError] = useState('');
  const [isSavingStage, setIsSavingStage] = useState(false);

  // Auto-Center Active Stage or Board Center on Load/Update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeCardRef.current && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const activeCard = activeCardRef.current;
        const targetLeft = activeCard.offsetLeft
          - ((container.clientWidth - activeCard.offsetWidth) / 2);
        container.scrollTo({
          left: Math.max(0, targetLeft),
          behavior: 'smooth'
        });
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
      setPopupError('');
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
    setPopupError('');
  };

  const handleConfirmStageMove = async (e) => {
    e.preventDefault();
    if (!popupStage) return;

    setIsSavingStage(true);
    setPopupError('');
    try {
      await onUpdateStage(application.id, popupStage.id, popupNote, popupDate);
      setToastMessage(`Moved application to ${popupStage.label}`);
      setPopupStage(null);
      setTimeout(() => setToastMessage(''), 3000);
    } catch (err) {
      console.error("Failed to update stage:", err);
      setPopupError(err?.message || 'Could not save the stage details and reminder. Please try again.');
    } finally {
      setIsSavingStage(false);
    }
  };

  const matchScore = Math.round(application.resume_match_score || application.match_score || 60);
  const atsScore = Math.round(application.ats_score || 79);

  const calculateDaysInStage = (dateStr) => {
    if (!dateStr) return '01';
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const count = days <= 0 ? 1 : days;
    return count < 10 ? `0${count}` : `${count}`;
  };

  return (
    <div className="w-full h-full min-h-[440px] flex flex-col items-center justify-center overflow-hidden select-none py-3 relative">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold rounded-xl flex items-center gap-2 animate-fade-in max-w-md shadow-xs mb-2 z-20">
          <AlertCircle size={15} className="text-amber-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* SCROLLABLE FUTURISTIC PIPELINE BOARD */}
      <div 
        ref={scrollContainerRef}
        className="w-full overflow-x-auto custom-scrollbar overflow-y-hidden flex items-center justify-start py-8 px-6"
      >
        <div className="min-w-[1380px] relative flex items-center my-auto py-6">
          
          {/* Dashed Connecting Line behind stage cards */}
          <div className="absolute left-6 right-[220px] top-1/2 -translate-y-1/2 border-b-2 border-dashed border-zinc-200 dark:border-zinc-800 z-0" />

          {/* STAGE CARDS FLOW */}
          <div className="flex items-center gap-6 z-10">
            {PIPELINE_STAGES.map((stage, idx) => {
              const isCurrent = currentStage === stage.id;
              const isCompleted = isTerminalStage || (currentStageIndex >= 0 && currentStageIndex > idx);
              const isOver = dragOverStage === stage.id;
              const StageIcon = stage.icon;

              return (
                <div
                  key={stage.id}
                  ref={isCurrent ? activeCardRef : null}
                  onDragOver={(e) => handleDragOver(e, stage.id)}
                  onDragLeave={(e) => handleDragLeave(e, stage.id)}
                  onDrop={(e) => handleDrop(e, stage)}
                  onClick={() => handleOpenStagePopup(stage)}
                  draggable={isCurrent && !isTerminalStage}
                  onDragStart={isCurrent ? handleDragStart : undefined}
                  onDragEnd={isCurrent ? handleDragEnd : undefined}
                  className={`w-[185px] h-[270px] shrink-0 rounded-2xl p-4 flex flex-col justify-between relative transition-all duration-200 cursor-pointer ${
                    isCurrent
                      ? 'bg-white dark:bg-zinc-900 border-2 border-orange-500 shadow-[0_0_24px_rgba(249,115,22,0.3)] scale-105 z-20'
                      : isCompleted
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-300/80 dark:border-emerald-800/60 hover:border-emerald-400'
                      : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-xs'
                  } ${isOver ? 'border-2 border-dashed border-teal-500 bg-teal-50/60 dark:bg-teal-950/40' : ''}`}
                >
                  {/* Active Orange Indicator Arrow on Left Edge */}
                  {isCurrent && (
                    <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-0 h-0 border-y-[8px] border-y-transparent border-r-[10px] border-r-orange-500 drop-shadow-xs" />
                  )}

                  {/* Stage Card Header */}
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] font-black text-zinc-800 dark:text-zinc-200">
                        <span className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-orange-500 animate-pulse' : isCompleted ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                        <span>{stage.num}</span>
                      </div>

                      {isCompleted && !isCurrent && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-[8px] tracking-wider border border-emerald-500/20 flex items-center gap-0.5">
                          DONE
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-900 dark:text-zinc-100 truncate">
                      {stage.label}
                    </div>
                  </div>

                  {/* Card Main Body */}
                  {isCurrent ? (
                    <div className="my-auto space-y-1">
                      <div className="font-black text-[11px] uppercase tracking-tight text-zinc-900 dark:text-white line-clamp-2 leading-tight">
                        {application.job_title || 'SOFTWARE ENGINEER'}
                      </div>
                      <div className="text-[10px] font-extrabold uppercase text-orange-600 dark:text-orange-400 tracking-wider truncate">
                        {application.company_name || 'TARGET COMPANY'}
                      </div>
                    </div>
                  ) : (
                    <div className="my-auto flex flex-col items-center justify-center">
                      <div className={`w-14 h-14 rounded-full border flex items-center justify-center ${
                        isCompleted
                          ? 'border-emerald-400/40 dark:border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 text-zinc-300 dark:text-zinc-600'
                      }`}>
                        <StageIcon size={22} strokeWidth={1.8} />
                      </div>
                    </div>
                  )}

                  {/* Card Footer / Metrics */}
                  {isCurrent ? (
                    <div className="grid grid-cols-3 gap-1 pt-2 border-t border-zinc-200/80 dark:border-zinc-800 text-center">
                      <div>
                        <span className="block text-[7.5px] font-extrabold text-zinc-400 uppercase tracking-tight">MATCH</span>
                        <strong className="text-xs font-black text-orange-500">{matchScore}%</strong>
                      </div>
                      <div>
                        <span className="block text-[7.5px] font-extrabold text-zinc-400 uppercase tracking-tight">ATS SCORE</span>
                        <strong className="text-xs font-black text-orange-500">{atsScore}/100</strong>
                      </div>
                      <div>
                        <span className="block text-[7.5px] font-extrabold text-zinc-400 uppercase tracking-tight">DAYS IN STAGE</span>
                        <strong className="text-xs font-black text-orange-500">{calculateDaysInStage(application.updated_at)}</strong>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
                      <span className={`text-[8.5px] font-black uppercase tracking-widest ${
                        isCompleted
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-zinc-400 dark:text-zinc-500'
                      }`}>
                        {isCompleted ? 'STAGE COMPLETED' : 'DRAG & DROP HERE'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* BRANCHING TERMINAL STAGES STACKED ON RIGHT */}
          <div className="ml-8 flex flex-col space-y-3 w-44 shrink-0 z-10">
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
                  onClick={() => handleOpenStagePopup(ts)}
                  className={`bg-white dark:bg-zinc-900 rounded-2xl border p-3 transition-all duration-200 shadow-xs cursor-pointer ${
                    isCurrent
                      ? 'ring-2 ring-orange-500 border-orange-500 scale-105 z-20'
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
                    <div className="space-y-0.5">
                      <div className="font-black text-[10px] uppercase text-zinc-900 dark:text-white truncate">
                        {application.job_title}
                      </div>
                      <div className="text-[9px] font-bold text-orange-600 dark:text-orange-400">
                        LOCKED AT {ts.label}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-1">
                      <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">
                        {isTerminalStage ? 'LOCKED' : 'DROP HERE'}
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
                <span className={`w-3 h-3 rounded-full ${popupStage.colorDot || 'bg-orange-500'}`} />
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
                Moving <strong className="text-zinc-900 dark:text-white font-bold">{application.job_title}</strong> at <strong className="text-zinc-900 dark:text-white font-bold">{application.company_name}</strong> to <strong className="text-orange-500 font-bold">{popupStage.label}</strong>.
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
                  className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500 text-xs"
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
                  className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-500 text-xs"
                />
              </div>
              {popupError && (
                <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-600 dark:text-rose-300">
                  {popupError}
                </div>
              )}
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
                disabled={isSavingStage}
                className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60 text-white font-bold text-xs rounded-xl cursor-pointer border-none shadow-xs"
              >
                {isSavingStage ? 'Saving…' : `Confirm Move to ${popupStage.label}`}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

export default WorkflowTab;
