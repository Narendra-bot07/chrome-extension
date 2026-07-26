import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import SuccessView from '../components/SuccessView';
import ResumeEditorView from '../components/Resume/ResumeEditorView';
import TailorRender from '../components/Resume/TailorRender';
import { useNavigate } from 'react-router-dom';
import { 
  Download, X, Eye, ZoomIn, ZoomOut, Maximize, RotateCcw, 
  Sparkles, Move, Printer, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { compressResumeData } from '../utils/resumeCompression';
import { toRenderableResume } from '../utils/renderableResume';
import { createCompositionPlan } from '../utils/resumeComposition';
import { TEMPLATE_CONFIGS } from '../templates/templates_config';

function DownloadPage({ onClose }) {
  const navigate = useNavigate();
  const {
    companyName,
    tailoredResume,
    setTailoredResume,
    parsedResume,
    selectedTemplate,
    handleDownloadFinalPDF,
    loading,
    customFileName,
    setCustomFileName
  } = useApp();

  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const sourceResume = useMemo(
    () => toRenderableResume(tailoredResume || parsedResume),
    [tailoredResume, parsedResume]
  );
  const composition = useMemo(
    () => createCompositionPlan(sourceResume, selectedTemplate || 'ExecutiveATS'),
    [sourceResume, selectedTemplate]
  );
  const activeResume = composition?.resume || null;

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

  // Reset solver on resume data or template change
  useEffect(() => {
    if (activeResume) {
      setLayoutLevel(composition?.layoutLevel ?? 6);
      setSolving(true);
    }
  }, [activeResume, selectedTemplate, composition?.layoutLevel]);

  // Typesetting Optimization loop
  useEffect(() => {
    if (!solving || !contentRef.current || !activeResume) return;

    const timer = setTimeout(() => {
      const el = contentRef.current;
      const height = el.scrollHeight;
      const MAX_HEIGHT = 1056; // Strict A4 single page height
      const MIN_HEIGHT = 920;  // 90% space utilization target

      console.log(`[Typesetter Solver] level=${layoutLevel}, height=${height}px`);

      if (height > MAX_HEIGHT) {
        if (layoutLevel > 0) {
          setLayoutLevel(prev => prev - 1);
        } else {
          // Exhausted all scaling, stop
          setLastStabilizedHeight(height);
          setSolving(false);
        }
      } else if (height < MIN_HEIGHT && layoutLevel < 10) {
        // Underfill - expand spacing to occupy page better
        setLayoutLevel(prev => prev + 1);
      } else {
        // Fits perfectly in 90-95% range
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
      // Small timeout to ensure DOM container sizes are correctly painted
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
    // Only drag with left click or middle click
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
    // Pass chosen optimal layout level to AppContext fetch trigger
    const downloaded = await handleDownloadFinalPDF(layoutLevel);
    if (downloaded) setDownloadSuccess(true);
  };

  if (downloadSuccess) {
    return (
      <SuccessView
        companyName={companyName}
        tailoredResume={activeResume}
        onDownloadPDF={() => handleDownloadFinalPDF(layoutLevel)}
        onReset={() => {
          if (onClose) onClose();
          navigate('/job-tracker');
        }}
      />
    );
  }

  if (!activeResume) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500/20 border-t-indigo-500 mb-4" />
        <p className="text-xs font-bold uppercase tracking-wider animate-pulse">Loading resume...</p>
      </div>
    );
  }

  const pruneLevel = Math.max(0, 5 - Math.floor(layoutLevel / 2));
  const compressedResume = compressResumeData(activeResume, pruneLevel);

  const editorIsSplit = ['sidebar', 'two-column', 'marissa'].includes(
    (TEMPLATE_CONFIGS[selectedTemplate] || TEMPLATE_CONFIGS.ExecutiveATS).layout
  );

  return (
    <div className="flex-1 flex h-full bg-zinc-950 overflow-hidden relative">
      
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
              onClick={onClose || (() => navigate('/templates'))}
              className="flex items-center gap-1.5 text-[9px] border border-zinc-250 hover:border-zinc-350 text-zinc-550 hover:text-zinc-800 hover:bg-zinc-50 px-2.5 py-1.5 rounded-lg font-extrabold uppercase tracking-wider bg-white transition active:scale-95 shadow-2xs cursor-pointer"
            >
              ← Back to Templates
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
            setParsedResume={setTailoredResume}
            onLooksGood={handleFinalLooksGood}
            onUploadDifferent={() => navigate('/templates')}
            loading={loading}
            reorderOnly={true}
            onPreview={() => {
              setZoomLevel(1.0);
              setShowZoomModal(true);
            }}
            resumeId={parsedResume?.id}
          />
        </div>
      </div>

      {/* RIGHT SIDE: Redesigned Premium Dark Document Workspace (58% width) */}
      <div className="flex-1 flex flex-col h-full relative min-w-0">
        
        {/* Workspace Document Control Toolbar */}
        <div className="h-14 bg-zinc-900 border-b border-zinc-850 px-6 flex items-center justify-between text-zinc-300 shrink-0 z-20 shadow-md">
          
          {/* Left Side: Action Buttons */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                setZoomLevel(1.0); // Reset zoom to 100% on open
                setShowZoomModal(true);
              }}
              className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white border-none rounded-lg font-extrabold text-[10px] uppercase tracking-wider transition flex items-center gap-1 cursor-pointer shadow-md"
            >
              <Eye size={12} /> Preview
            </button>
            <button 
              onClick={handleTriggerPrint}
              className="p-1.5 bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/60 rounded-lg text-zinc-450 hover:text-white transition cursor-pointer border-none flex items-center justify-center"
              title="Browser Print Preview"
            >
              <Printer size={13} />
            </button>
            <button 
              onClick={() => {
                setZoomLevel(1.0); // Reset zoom to 100% on open
                setShowZoomModal(true);
              }}
              className="p-1.5 bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/60 rounded-lg text-zinc-450 hover:text-white transition cursor-pointer border-none flex items-center justify-center"
              title="Fullscreen Mode"
            >
              <Maximize size={13} />
            </button>
          </div>

          {/* Right Side: Zoom controls pill only */}
          <div className="flex items-center gap-1 bg-zinc-950/60 p-1.5 rounded-xl border border-zinc-800">
            <button 
              onClick={() => setZoom(prev => Math.max(0.3, prev - 0.1))}
              className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer border-none bg-transparent"
              title="Zoom Out (Ctrl+-)"
            >
              <ZoomOut size={13} />
            </button>
            <span className="text-[10px] font-black text-zinc-300 w-10 text-center select-none tracking-wider">
              {Math.round(zoom * 100)}%
            </span>
            <button 
              onClick={() => setZoom(prev => Math.min(2.5, prev + 0.1))}
              className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer border-none bg-transparent"
              title="Zoom In (Ctrl++)"
            >
              <ZoomIn size={13} />
            </button>

            <div className="w-px h-4 bg-zinc-800 mx-1" />

            <button 
              onClick={handleResetView}
              className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer border-none bg-transparent"
              title="Reset Zoom (Ctrl+0)"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>

        {/* Outer Workspace Canvas Viewport */}
        <div 
          ref={outerWrapperRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`flex-1 bg-zinc-950 overflow-hidden relative flex items-center justify-center p-6 select-none ${
            isPanning ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        >
          {/* Centered Paper A4 Container with soft shadows */}
          <div 
            ref={canvasRef}
            id="print-resume-canvas"
            className="bg-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] ring-1 ring-white/5 shrink-0 rounded-[4px] origin-center transition-all duration-75 relative overflow-hidden"
            style={{ 
              width: '816px', 
              height: `${lastStabilizedHeight}px`,
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`
            }}
          >
            <div ref={contentRef} className="w-[816px] pointer-events-none">
              <TailorRender 
                resume={compressedResume} 
                templateName={selectedTemplate || 'ExecutiveATS'} 
                layoutLevel={layoutLevel}
              />
            </div>
          </div>

          {/* Floating Move Prompt indicator */}
          <div className="absolute bottom-4 left-4 py-1.5 px-3 bg-zinc-900/80 border border-zinc-800 rounded-lg text-[9px] font-bold text-zinc-400 flex items-center gap-1.5 select-none pointer-events-none">
            <Move size={10} />
            <span>Drag to Pan | Ctrl + Scroll to Zoom</span>
          </div>

          {/* Page Navigation footer bar */}
          <div className="absolute bottom-4 right-4 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-xl flex items-center gap-3 text-zinc-300">
            <button className="text-zinc-500 cursor-not-allowed border-none bg-transparent"><ChevronLeft size={14} /></button>
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Page 1 of 1</span>
            <button className="text-zinc-500 cursor-not-allowed border-none bg-transparent"><ChevronRight size={14} /></button>
          </div>
        </div>

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
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full animate-pulse" style={{ width: '85%' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Full-Screen Zoom Preview Modal */}
      {showZoomModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex flex-col animate-fade-in">
          
          {/* Modal Header Control Bar */}
          <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between shrink-0 text-white shadow-md">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400">Interactive Preview</h3>
              <p className="text-[9px] text-zinc-400 font-bold uppercase mt-0.5">Scroll to check layout fit and details</p>
            </div>
            
            {/* Zoom Control Panel */}
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
          
          {/* Scrollable Viewport */}
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
                />
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}

export default DownloadPage;
