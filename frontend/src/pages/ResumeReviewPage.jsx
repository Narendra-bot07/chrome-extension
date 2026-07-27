import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import ResumeEditorView from '../components/Resume/ResumeEditorView';
import TailorRender from '../components/Resume/TailorRender';
import { useNavigate } from 'react-router-dom';
import { createCompositionPlan } from '../utils/resumeComposition';
import { AlertTriangle, CheckCircle2, ShieldCheck, ZoomIn, ZoomOut } from 'lucide-react';

function ResumeReviewPage() {
  const navigate = useNavigate();
  const { parsedResume, setParsedResume, setResumeFile, jobAnalysis, loading, selectedTemplate } = useApp();
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const currentResume = useRef(parsedResume);
  const [, forceHistoryRefresh] = useState(0);
  const [zoom, setZoom] = useState(0.70);

  useEffect(() => {
    currentResume.current = parsedResume;
  }, [parsedResume]);

  const composition = useMemo(
    () => createCompositionPlan(parsedResume, selectedTemplate || 'ExecutiveATS'),
    [parsedResume, selectedTemplate]
  );

  const updateResume = nextValue => {
    const next = typeof nextValue === 'function' ? nextValue(currentResume.current) : nextValue;
    if (!next || next === currentResume.current) return;
    undoStack.current.push(structuredClone(currentResume.current));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    currentResume.current = next;
    setParsedResume(next);
    forceHistoryRefresh(value => value + 1);
  };

  const undo = () => {
    if (!undoStack.current.length) return;
    redoStack.current.push(structuredClone(currentResume.current));
    const previous = undoStack.current.pop();
    currentResume.current = previous;
    setParsedResume(previous);
    forceHistoryRefresh(value => value + 1);
  };

  const redo = () => {
    if (!redoStack.current.length) return;
    undoStack.current.push(structuredClone(currentResume.current));
    const next = redoStack.current.pop();
    currentResume.current = next;
    setParsedResume(next);
    forceHistoryRefresh(value => value + 1);
  };

  useEffect(() => {
    const handleShortcut = event => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const handleZoomIn = () => setZoom(prev => Math.min(1.2, +(prev + 0.1).toFixed(2)));
  const handleZoomOut = () => setZoom(prev => Math.max(0.4, +(prev - 0.1).toFixed(2)));
  const handleResetZoom = () => setZoom(0.70);

  if (loading) {
    return (
      <div className="p-4 md:p-5 w-full h-[calc(100vh-80px)] flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center min-h-[500px] h-full w-full bg-zinc-950 text-zinc-300 gap-3 rounded-2xl border border-zinc-800">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#00bda5]/20 border-t-[#00bda5]" />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Loading Resume Data...</span>
        </div>
      </div>
    );
  }

  if (!parsedResume) {
    return (
      <div className="p-4 md:p-5 w-full h-[calc(100vh-80px)] flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center min-h-[500px] h-full w-full bg-zinc-950 text-zinc-300 gap-4 p-6 text-center rounded-2xl border border-zinc-800">
          <div className="text-base font-extrabold text-zinc-100">No Resume Data Found</div>
          <p className="text-xs text-zinc-400 max-w-sm">Please select or upload a resume to review and edit content.</p>
          <button
            onClick={() => navigate('/resume-detect')}
            className="px-4 py-2.5 bg-[#00bda5] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-[#00a894] transition cursor-pointer shadow-sm"
          >
            Select or Upload Resume
          </button>
        </div>
      </div>
    );
  }

  const handleLooksGood = () => {
    if (jobAnalysis) {
      navigate('/tailor-config');
    } else {
      navigate('/tailor');
    }
  };

  const quality = composition?.quality;

  return (
    <div className="p-4 md:p-5 w-full h-[calc(100vh-80px)] flex-1 flex flex-col min-h-0 overflow-hidden select-none">
      <div className="flex-1 flex min-h-0 h-full w-full bg-zinc-950 overflow-hidden relative rounded-2xl border border-zinc-800 shadow-2xl grid grid-cols-1 xl:grid-cols-[minmax(420px,0.85fr)_minmax(580px,1.15fr)]">
        <ResumeEditorView
          parsedResume={parsedResume}
          setParsedResume={updateResume}
          onUndo={undo}
          onRedo={redo}
          canUndo={undoStack.current.length > 0}
          canRedo={redoStack.current.length > 0}
          quality={quality}
          onLooksGood={handleLooksGood}
          onUploadDifferent={() => {
            setResumeFile(null);
            setParsedResume(null);
            navigate('/resume-detect');
          }}
          loading={loading}
        />

        <aside className="hidden xl:flex min-w-0 flex-col h-full overflow-hidden border-l border-zinc-800 bg-zinc-950">
          <div className="h-14 px-5 flex items-center justify-between border-b border-white/10 text-white shrink-0 bg-zinc-900/60 backdrop-blur">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] font-black text-zinc-400">Live Document</div>
              <div className="text-xs font-extrabold text-zinc-200">Professional composition preview</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 border-r border-white/10 pr-3">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.4}
                  title="Zoom Out"
                  className="p-1 rounded bg-white/10 hover:bg-white/20 text-zinc-300 disabled:opacity-30 cursor-pointer transition"
                >
                  <ZoomOut size={13} />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  title="Reset Zoom (70%)"
                  className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-mono font-bold text-zinc-300 cursor-pointer transition"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoom >= 1.2}
                  title="Zoom In"
                  className="p-1 rounded bg-white/10 hover:bg-white/20 text-zinc-300 disabled:opacity-30 cursor-pointer transition"
                >
                  <ZoomIn size={13} />
                </button>
              </div>

              <div className="flex items-center gap-2 text-[10px] font-bold">
                <span className="px-2 py-1 rounded-full bg-white/10 text-zinc-300">{quality?.metrics?.estimatedPages || 1} page estimate</span>
                <span className={`px-2 py-1 rounded-full ${quality?.status === 'needs-attention' ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                  {quality?.score || 0}/100
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto p-6 flex justify-center bg-[#1a1b1e] custom-scrollbar">
              <div
                className="origin-top transition-transform duration-200 ease-out"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
              >
                <div className="w-[816px] shadow-2xl bg-white rounded-sm overflow-hidden text-zinc-900">
                  {composition && (
                    <TailorRender
                      resume={composition.resume}
                      templateName={composition.templateName}
                      sectionOrder={composition.sectionOrder}
                      layoutLevel={composition.layoutLevel}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="w-[230px] shrink-0 border-l border-white/10 bg-zinc-900/90 p-4 overflow-y-auto custom-scrollbar text-white">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck size={15} className="text-emerald-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-300">Live quality</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  ['Sections', quality?.metrics?.sectionCount || 0],
                  ['Bullets', quality?.metrics?.bulletCount || 0],
                  ['Metrics', quality?.metrics?.quantifiedBulletCount || 0],
                  ['Links', quality?.metrics?.linkCount || 0]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-white/5 border border-white/10 p-2.5">
                    <div className="text-lg font-black">{value}</div>
                    <div className="text-[8px] uppercase tracking-wider text-zinc-400 font-bold">{label}</div>
                  </div>
                ))}
              </div>
              {[...(quality?.issues || []), ...(quality?.warnings || [])].map(item => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => document.querySelector(`[data-editor-section="${item.section}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className="w-full text-left mb-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 p-3 cursor-pointer transition"
                >
                  <div className="flex gap-2">
                    {quality?.issues?.includes(item)
                      ? <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                      : <CheckCircle2 size={13} className="text-sky-400 shrink-0 mt-0.5" />}
                    <span className="text-[10px] leading-relaxed text-zinc-300 font-medium">{item.message}</span>
                  </div>
                </button>
              ))}
              {!quality?.issues?.length && !quality?.warnings?.length && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-[10px] text-emerald-300 flex gap-2">
                  <CheckCircle2 size={13} className="shrink-0" /> Document quality checks passed.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default ResumeReviewPage;
