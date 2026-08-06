import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import ResumeEditorView from '../components/Resume/ResumeEditorView';
import TailorRender from '../components/Resume/TailorRender';
import { useNavigate } from 'react-router-dom';
import { 
  Download, X, Eye, ZoomIn, ZoomOut, Maximize, RotateCcw, 
  Move, Printer, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { compressResumeData } from '../utils/resumeCompression';
import { toRenderableResume } from '../utils/renderableResume';
import { createCompositionPlan } from '../utils/resumeComposition';
import { TEMPLATE_CONFIGS } from '../templates/templates_config';
import ResumePreview from '../components/Resume/ResumePreview';

class DownloadPageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[DownloadPage ErrorBoundary]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[600px] h-[calc(100vh-140px)] w-full bg-zinc-950 text-zinc-300 gap-4 p-8 text-center rounded-2xl border border-zinc-800 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 text-xl font-bold mb-2">
            ⚠️
          </div>
          <h2 className="text-base font-extrabold text-zinc-100">Unable to Render Preview Studio</h2>
          <p className="text-xs text-zinc-400 max-w-md leading-relaxed">
            {this.state.error?.message || "An unexpected error occurred while preparing the resume composition layout."}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2.5 bg-[#00bda5] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-[#00a894] transition cursor-pointer shadow-sm"
            >
              Retry Preview
            </button>
            <button
              onClick={() => window.location.hash = '#/templates'}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-extrabold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer"
            >
              Choose Template
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function DownloadPage({ onClose }) {
  const navigate = useNavigate();
  const {
    companyName,
    updateFinalizedWorkflowResume,
    parsedResume,
    tailoredResume,
    setTailoredResume,
    workflowResume,
    selectedTemplate,
    comparison,
    liveATS,
    handleDownloadFinalPDF,
    loading,
    customFileName,
    setCustomFileName
  } = useApp();

  // updateFinalizedWorkflowResume only persists into the workflow-recovery
  // slot (`finalizedTailoredResume`), a DIFFERENT state than what actually
  // drives this page's preview (`sourceResume` below reads tailoredResume /
  // workflowResume / parsedResume, never finalizedTailoredResume). Layout
  // edits made in ResumeEditorView (section drag-reorder, column moves) were
  // saved correctly but invisible in the preview because of that mismatch.
  // Keep the existing persistence call, but also sync the live tailoredResume
  // state so the preview actually reflects the edit.
  const updateActiveResumeLayout = useCallback((updater) => {
    const baseResume = tailoredResume || workflowResume || parsedResume;
    if (!baseResume) return null;
    const nextResume = typeof updater === 'function'
      ? updater(structuredClone(baseResume))
      : updater;
    const canonical = toRenderableResume(nextResume);
    if (!canonical) return null;

    // The editor expects a React-style synchronous setter. Update the state
    // driving the right-hand preview before doing any recovery/cloud write.
    setTailoredResume(canonical);
    updateFinalizedWorkflowResume(canonical).catch(error => {
      console.warn('[RESUME-LAYOUT] Live layout applied; deferred persistence failed.', error);
    });
    return canonical;
  }, [tailoredResume, workflowResume, parsedResume, updateFinalizedWorkflowResume, setTailoredResume]);

  const sourceResume = useMemo(() => {
    try {
      const raw = tailoredResume || workflowResume || parsedResume;
      return raw ? toRenderableResume(raw) : null;
    } catch (err) {
      console.warn("Failed to convert to renderable resume:", err);
      return null;
    }
  }, [tailoredResume, workflowResume, parsedResume]);

  const composition = useMemo(() => {
    try {
      return sourceResume ? createCompositionPlan(sourceResume, selectedTemplate || 'ExecutiveATS') : null;
    } catch (err) {
      console.warn("Failed to create composition plan:", err);
      return null;
    }
  }, [sourceResume, selectedTemplate]);

  // Content is immutable at this stage. Composition may suggest presentation
  // metadata, but it must never replace the finalized workflow document.
  const activeResume = sourceResume || null;

  // Initialize output file name on mount
  useEffect(() => {
    if (!customFileName && activeResume) {
      const rawName = activeResume.personal_info?.name || 'User';
      const cleanUser = rawName.replace(/\s+/g, '_');
      const cleanCompany = (companyName || 'Company').replace(/\s+/g, '_');
      setCustomFileName(`${cleanUser}_${cleanCompany}_Resume.pdf`);
    }
  }, [activeResume, companyName, customFileName]);

  // Typesetting Optimization Solver States
  const [layoutLevel, setLayoutLevel] = useState(composition?.layoutLevel ?? 6);
  const [solving, setSolving] = useState(true);
  const [lastStabilizedHeight, setLastStabilizedHeight] = useState(1056);

  // Canvas Pan & Zoom States
  const [zoom, setZoom] = useState(0.8);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);

  // Refs for tracking sizes
  const canvasRef = useRef(null);
  const contentRef = useRef(null);
  const outerWrapperRef = useRef(null);

  // Reset solver on template change or resume selection change
  useEffect(() => {
    if (sourceResume) {
      setLayoutLevel(composition?.layoutLevel ?? 6);
      setSolving(true);
    }
  }, [selectedTemplate, sourceResume?.id, sourceResume?.personal_info?.name]);

  // Typesetting Optimization loop
  useEffect(() => {
    if (!solving || !contentRef.current || !activeResume) return;

    const timer = setTimeout(() => {
      const el = contentRef.current;
      if (!el) return;
      const rootRect = el.getBoundingClientRect();
      const descendantBottom = Array.from(el.querySelectorAll('*')).reduce((bottom, node) => {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return bottom;
        return Math.max(bottom, node.getBoundingClientRect().bottom - rootRect.top);
      }, 0);
      const height = Math.max(el.scrollHeight, rootRect.height, descendantBottom);
      const MAX_HEIGHT = 1035; // Letter preview with a safe PDF rounding boundary
      const MIN_HEIGHT = 900;

      console.log(`[Typesetter Solver] level=${layoutLevel}, height=${height}px`);

      if (height > MAX_HEIGHT) {
        if (layoutLevel > 0) {
          setLayoutLevel(prev => prev - 1);
        } else {
          setLastStabilizedHeight(height);
          setSolving(false);
        }
      } else if (height < MIN_HEIGHT && layoutLevel < 10) {
        setLayoutLevel(prev => prev + 1);
      } else {
        setLastStabilizedHeight(height);
        setSolving(false);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [layoutLevel, solving, activeResume, selectedTemplate]);

  // Fit Width helper
  const handleFitWidth = () => {
    if (!outerWrapperRef.current) return;
    const containerWidth = outerWrapperRef.current.clientWidth;
    const targetScale = (containerWidth - 60) / 816;
    setZoom(Math.max(0.3, Math.min(2.5, targetScale)));
    setPanOffset({ x: 0, y: 0 });
  };

  // Fit Page helper
  const handleFitPage = () => {
    if (!outerWrapperRef.current) return;
    const containerHeight = outerWrapperRef.current.clientHeight;
    const targetScale = (containerHeight - 60) / lastStabilizedHeight;
    setZoom(Math.max(0.3, Math.min(2.5, targetScale)));
    setPanOffset({ x: 0, y: 0 });
  };

  // Auto-fit page to container once layout solver stabilizes or mounts
  useEffect(() => {
    if (!solving && lastStabilizedHeight && outerWrapperRef.current) {
      const timer = setTimeout(() => {
        handleFitPage();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [solving, lastStabilizedHeight]);

  // Reset View helper
  const handleResetView = () => {
    setZoom(0.8);
    setPanOffset({ x: 0, y: 0 });
  };

  // Mouse drag-to-pan handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    setIsPanning(true);
    setPanStart({
      x: e.clientX - panOffset.x,
      y: e.clientY - panOffset.y
    });
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;
    e.preventDefault();
    e.stopPropagation();
    setPanOffset({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Ctrl + Mouse Wheel Zoom implementation
  useEffect(() => {
    const el = outerWrapperRef.current;
    if (!el) return;

    const preventDefaultScroll = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.0015;
        setZoom(prev => Math.max(0.3, Math.min(2.5, prev + delta)));
      }
    };

    el.addEventListener('wheel', preventDefaultScroll, { passive: false });
    return () => el.removeEventListener('wheel', preventDefaultScroll);
  }, []);

  // Keyboard Shortcuts for Zooming
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoom(prev => Math.min(2.5, prev + 0.1));
      } else if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        setZoom(prev => Math.max(0.3, prev - 0.1));
      } else if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        handleResetView();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lastStabilizedHeight]);

  const handleTriggerPrint = () => {
    window.print();
  };

  const handleFinalLooksGood = async () => {
    if (composition?.quality?.issues?.length) {
      const messages = composition.quality.issues.map(issue => `• ${issue.message}`).join('\n');
      alert(`Export blocked until critical resume issues are resolved:\n\n${messages}`);
      return;
    }
    const syncResult = await handleDownloadFinalPDF(layoutLevel);
    if (syncResult?.id) {
      const completion = {
        syncedApplication: syncResult,
        tailoredResume: activeResume,
        companyName,
        atsScore: comparison?.ats_score_after ?? comparison?.ats_score_before
          ?? liveATS?.current_ats ?? liveATS?.estimated_ats ?? syncResult?.ats_score
      };
      sessionStorage.setItem('tailr4u_export_completion', JSON.stringify(completion));
      navigate('/export-success', { state: completion });
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-5 w-full h-[calc(100vh-80px)] flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center min-h-[500px] h-full w-full bg-zinc-950 text-zinc-300 gap-3 rounded-2xl border border-zinc-800">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#00bda5]/20 border-t-[#00bda5]" />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Loading Final Resume Studio...</span>
        </div>
      </div>
    );
  }

  if (!activeResume) {
    return (
      <div className="p-4 md:p-5 w-full h-[calc(100vh-80px)] flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center min-h-[500px] h-full w-full bg-zinc-950 text-zinc-300 gap-4 p-6 text-center rounded-2xl border border-zinc-800">
          <div className="text-base font-extrabold text-zinc-100">No Active Resume Loaded</div>
          <p className="text-xs text-zinc-400 max-w-sm">Please select or parse a resume first before building final composition.</p>
          <button
            onClick={() => navigate('/templates')}
            className="px-4 py-2.5 bg-[#00bda5] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-[#00a894] transition cursor-pointer shadow-sm"
          >
            Select Template
          </button>
        </div>
      </div>
    );
  }

  const pruneLevel = Math.max(0, 5 - Math.floor(layoutLevel / 2));
  const compressedResume = compressResumeData(activeResume, pruneLevel);

  const selectedLayout = (TEMPLATE_CONFIGS[selectedTemplate] || TEMPLATE_CONFIGS?.ExecutiveATS || {})?.layout || '';
  const editorIsSplit = ['sidebar', 'two-column', 'marissa'].includes(selectedLayout);

  return (
    <div className="p-4 md:p-5 w-full h-[calc(100vh-80px)] flex-1 flex flex-col min-h-0 overflow-hidden select-none">
      <div className="flex-1 flex min-h-0 h-full w-full bg-zinc-950 overflow-hidden relative rounded-2xl border border-zinc-800 shadow-2xl">
      {/* LEFT SIDE: Editor Panel */}
      <div className={`${editorIsSplit ? 'w-[48%] min-w-[500px]' : 'w-[42%] min-w-[380px]'} border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-full bg-white shrink-0 z-10 shadow-lg`}>
        <div className="p-4 bg-white border-b border-zinc-200 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-black text-zinc-950 uppercase tracking-tight">
                Adjust Tailored Details
              </h1>
              <p className="text-[9px] text-zinc-400 font-bold uppercase mt-0.5">
                Modify details & drag sections on the left
              </p>
            </div>
            <button
              onClick={onClose || (() => navigate(-1))}
              className="flex items-center gap-1.5 text-[9px] border border-zinc-250 hover:border-zinc-350 text-zinc-550 hover:text-zinc-800 hover:bg-zinc-50 px-2.5 py-1.5 rounded-lg font-extrabold uppercase tracking-wider bg-white transition active:scale-95 shadow-2xs cursor-pointer"
            >
              ← Back
            </button>
          </div>
          
          {/* Output Filename Customizer Input */}
          <div className="mt-3.5 pt-3 border-t border-zinc-100 flex items-center gap-2 select-none">
            <span className="text-[8px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest shrink-0">File Name:</span>
            <input
              type="text"
              value={customFileName || ''}
              onChange={(e) => setCustomFileName(e.target.value)}
              placeholder="e.g. Narendra_Bandi_Resume.pdf"
              className="flex-1 text-[10px] px-2.5 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800 focus:outline-hidden focus:border-[#00bda5] font-semibold"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ResumeEditorView
            parsedResume={activeResume}
            setParsedResume={updateActiveResumeLayout}
            onLooksGood={handleFinalLooksGood}
            onUploadDifferent={() => navigate('/templates')}
            loading={loading}
            reorderOnly={true}
            hidePrimaryAction={true}
            onPreview={() => {
              setZoomLevel(1.0);
              setShowZoomModal(true);
            }}
            resumeId={parsedResume?.id}
          />
        </div>
      </div>

      {/* RIGHT SIDE: Unified Resume Composition Preview Workspace (58% width) */}
      <div className="flex-1 flex flex-col h-full relative min-w-0 bg-zinc-950">
        <ResumePreview
          resumeData={activeResume}
          selectedTemplate={selectedTemplate || 'ExecutiveATS'}
          resumeVersionId={parsedResume?.id}
          companyName={companyName || 'Company'}
          interactiveLayoutMode={true}
          layoutLevel={layoutLevel}
          onClose={onClose || (() => navigate(-1))}
          onDownloadArtifact={async (artifact) => {
            const syncResult = await handleDownloadFinalPDF(layoutLevel, {
              usePrepared: true,
              preparedArtifact: artifact
            });
            if (syncResult?.id) {
              const completion = {
                syncedApplication: syncResult,
                tailoredResume: activeResume,
                companyName,
                atsScore: comparison?.ats_score_after ?? comparison?.ats_score_before
                  ?? liveATS?.current_ats ?? liveATS?.estimated_ats ?? syncResult?.ats_score
              };
              sessionStorage.setItem('tailr4u_export_completion', JSON.stringify(completion));
              navigate('/export-success', { state: completion });
            }
          }}
        />

        {/* Compile Loading Glassmorphic Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 z-30 animate-fade-in">
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-2xl animate-scale-in">
              <div className="relative flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-indigo-500/20 border-t-indigo-500" />
                <Download className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-400 animate-pulse" size={18} />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-white">Compiling PDF</h4>
                <p className="text-[10px] text-zinc-400 font-bold leading-relaxed">
                  Executing typesetting optimization & building metadata. Please wait...
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full-Screen Zoom Preview Modal */}
      {showZoomModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex flex-col animate-fade-in">
          <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between shrink-0 text-white shadow-md">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400">Interactive Preview</h3>
              <p className="text-[9px] text-zinc-400 font-bold uppercase mt-0.5">Scroll to check layout fit and details</p>
            </div>
            
            <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
              <button 
                onClick={() => setZoomLevel(prev => Math.max(0.4, prev - 0.1))}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer border-none bg-transparent"
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              
              <span className="text-[10px] font-black text-zinc-300 w-12 text-center select-none uppercase tracking-wider">
                {Math.round(zoomLevel * 100)}%
              </span>
              
              <button 
                onClick={() => setZoomLevel(prev => Math.min(2.0, prev + 0.1))}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer border-none bg-transparent"
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>

              <div className="w-px h-4 bg-zinc-800 mx-1" />

              <button 
                onClick={() => setZoomLevel(1.0)}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer border-none bg-transparent"
                title="Reset Zoom"
              >
                <Maximize size={14} />
              </button>
            </div>

            <button 
              onClick={() => setShowZoomModal(false)}
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition border-none bg-transparent cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="flex-1 bg-zinc-950 overflow-auto flex justify-center items-start p-8 custom-scrollbar">
            <div 
              className="relative shrink-0 transition-all duration-150"
              style={{ width: `${816 * zoomLevel}px`, height: `${lastStabilizedHeight * zoomLevel}px` }}
            >
              <div 
                className="absolute top-0 left-0 w-[816px] origin-top-left shadow-2xl bg-white rounded-sm"
                style={{ 
                  width: '816px', 
                  height: `${lastStabilizedHeight}px`,
                  transform: `scale(${zoomLevel})`
                }}
              >
                <TailorRender
                  resume={compressedResume}
                  templateName={selectedTemplate || 'ExecutiveATS'}
                  layoutLevel={layoutLevel}
                  isExporting
                />
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
    </div>
  );
}

export default function SafeDownloadPage(props) {
  return (
    <DownloadPageErrorBoundary>
      <DownloadPage {...props} />
    </DownloadPageErrorBoundary>
  );
}
