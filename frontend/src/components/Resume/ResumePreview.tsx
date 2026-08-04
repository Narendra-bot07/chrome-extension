import React, { useRef, useEffect, useState, useLayoutEffect, useMemo } from 'react';
import {
  Eye, ZoomIn, ZoomOut, Expand, Shrink, Printer, Download,
  Wand2, RotateCcw, ChevronUp, ChevronDown, FileText, AlertTriangle, RefreshCw, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toRenderableResume } from '../../utils/renderableResume';
import { getTemplateComponent } from '../../templates';
import { createCompositionPlan } from '../../utils/resumeComposition';
import { getApiUrl } from '../../config/apiConfig';

type ZoomMode = 'fit_width' | 'fit_page' | 'actual_size';
type PagePreference = 'auto' | 'prefer_one_page' | 'prefer_two_pages';

interface ResumePreviewProps {
  resumeData: any;
  selectedTemplate: string;
  sectionOrder?: string[];
  apiUrl?: string;
  resumeVersionId?: string;
  companyName?: string;
  onCompositionChange?: (plan: any) => void;
  interactiveLayoutMode?: boolean;
  layoutLevel?: number;
  onClose?: () => void;
  onDownloadArtifact?: (artifact: {
    downloadUrl: string;
    filename: string;
    compositionPlan: any;
  }) => Promise<unknown>;
}

export default function ResumePreview({
  resumeData,
  selectedTemplate,
  sectionOrder,
  apiUrl = getApiUrl(),
  resumeVersionId,
  companyName = 'Company',
  onCompositionChange,
  interactiveLayoutMode = false,
  layoutLevel,
  onClose,
  onDownloadArtifact
}: ResumePreviewProps) {
  const navigate = useNavigate();
  const handleClose = onClose || (() => navigate(-1));
  // 1. Zoom and Viewport States
  const [zoomMode, setZoomMode] = useState<ZoomMode>(() => {
    return (localStorage.getItem('preview_zoom_mode') as ZoomMode) || 'fit_width';
  });
  const [zoom, setZoom] = useState<number>(1.0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [activePage, setActivePage] = useState<number>(1);

  // 2. Page Preference Control State
  const [pagePreference, setPagePreference] = useState<PagePreference>(() => {
    const saved = localStorage.getItem(`page_pref_${resumeVersionId || 'current'}`);
    return (saved as PagePreference) || 'auto';
  });

  // 3. Artifact & Rendering States
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [compositionPlan, setCompositionPlan] = useState<any>(null);
  const [renderHash, setRenderHash] = useState<string>('');
  const [measurementHash, setMeasurementHash] = useState<string>('');
  const [artifactFilename, setArtifactFilename] = useState<string>('');
  const [pageCount, setPageCount] = useState<number>(1);
  const [loadingPdf, setLoadingPdf] = useState<boolean>(false);
  const [showLiveLayout, setShowLiveLayout] = useState<boolean>(interactiveLayoutMode);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // 4. Status Messages
  const [statusMessage, setStatusMessage] = useState<string>('Auto selected a clean one-page layout.');
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollWrapperRef = useRef<HTMLDivElement>(null);
  const renderRequestIdRef = useRef(0);
  const adaptiveComposition = useMemo(
    () => createCompositionPlan(resumeData, selectedTemplate || 'ExecutiveATS'),
    [resumeData, selectedTemplate]
  );
  const exactFinalResume = useMemo(() => {
    const canonical = toRenderableResume(resumeData);
    if (!canonical) return null;
    const resolvedLevel = Number.isFinite(Number(layoutLevel))
      ? Number(layoutLevel)
      : Number(adaptiveComposition?.layoutLevel ?? canonical.layout_level ?? 6);
    return {
      ...canonical,
      section_order: sectionOrder || canonical.section_order || adaptiveComposition?.sectionOrder,
      layout_level: resolvedLevel,
      // This is a starting density, not a command to freeze a guessed layout.
      // The print renderer must measure the actual occupied content and may
      // safely expand/compact presentation without changing resume data.
      layout_locked: false
    };
  }, [resumeData, layoutLevel, sectionOrder, adaptiveComposition?.layoutLevel, adaptiveComposition?.sectionOrder]);

  // Touch Pinch-to-Zoom Gesture Handlers
  const touchStartDistRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(zoom);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      initialZoomRef.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartDistRef.current !== null) {
      if (e.cancelable) e.preventDefault();
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = currentDist / touchStartDistRef.current;
      const nextZoom = Math.max(0.35, Math.min(2.5, initialZoomRef.current * scale));
      setZoom(nextZoom);
      setZoomMode('actual_size');
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      touchStartDistRef.current = null;
    }
  };

  // Trackpad & Ctrl-Wheel Pinch-To-Zoom Event Listener
  useEffect(() => {
    const wrapper = scrollWrapperRef.current;
    if (!wrapper) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.003;
        setZoom(prev => Math.max(0.35, Math.min(2.5, prev + delta)));
        setZoomMode('actual_size');
      }
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    return () => wrapper.removeEventListener('wheel', handleWheel);
  }, []);

  // Persist Page Preference per version
  useEffect(() => {
    localStorage.setItem(`page_pref_${resumeVersionId || 'current'}`, pagePreference);
  }, [pagePreference, resumeVersionId]);

  // Persist Zoom Mode
  useEffect(() => {
    localStorage.setItem('preview_zoom_mode', zoomMode);
  }, [zoomMode]);

  // Recalculate Zoom based on Mode and Container Width
  const calculateZoom = () => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    const resumeWidthPx = 816; // 8.5in at 96 DPI
    const resumeHeightPx = 1056; // 11in at 96 DPI

    if (zoomMode === 'fit_width') {
      const padding = 48;
      const targetZoom = Math.max(0.4, Math.min(2.0, (containerWidth - padding) / resumeWidthPx));
      setZoom(targetZoom);
    } else if (zoomMode === 'fit_page') {
      const padding = 80;
      const targetZoom = Math.max(0.35, Math.min(1.8, (containerHeight - padding) / (resumeHeightPx * pageCount)));
      setZoom(targetZoom);
    } else if (zoomMode === 'actual_size') {
      setZoom(1.0);
    }
  };

  // ResizeObserver for Container Layout Changes
  useLayoutEffect(() => {
    calculateZoom();
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      calculateZoom();
    });
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [zoomMode, pageCount, isFullscreen]);

  // Unified Single PDF Artifact Recomposition Pipeline
  const fetchUnifiedPdfArtifact = async (
    pref: PagePreference = pagePreference,
    signal?: AbortSignal
  ) => {
    if (!exactFinalResume) return;
    const requestId = ++renderRequestIdRef.current;
    try {
      setLoadingPdf(true);
      setStatusMessage(interactiveLayoutMode ? 'Live layout preview' : 'Recomposing resume…');
      setWarningMessage(null);

      const res = await fetch(`${apiUrl}/api/render-unified-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: exactFinalResume,
          original_resume: exactFinalResume,
          template_name: selectedTemplate || 'ExecutiveATS',
          page_preference: pref,
          company_name: companyName
        }),
        signal
      });

      if (!res.ok) {
        const failure = await res.json().catch(() => ({}));
        throw new Error(
          typeof failure.detail === 'string'
            ? failure.detail
            : `Rendering failed with status ${res.status}`
        );
      }

      const data = await res.json();
      if (requestId !== renderRequestIdRef.current) return;
      if (data.success && data.pdf_base64) {
        const byteCharacters = atob(data.pdf_base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);

        if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
        setPdfBlob(blob);
        setPdfBlobUrl(blobUrl);
        setCompositionPlan(data.composition_plan);
        setRenderHash(data.render_hash || '');
        setMeasurementHash(data.measurement_hash || '');
        setArtifactFilename(data.filename || '');
        const pCount = data.page_count || 1;
        setPageCount(pCount);

        setStatusMessage(data.status_message || data.composition_plan?.status_message || 'Resume recomposed.');
        if (data.composition_plan?.status === 'ONE_PAGE_UNSAFE') {
          setWarningMessage('This resume cannot fit safely on one page without compromising readability.');
        }

        if (onCompositionChange) {
          onCompositionChange(data.composition_plan);
        }
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.warn('Backend PDF recomposition fallback triggered', err);
    } finally {
      if (requestId === renderRequestIdRef.current) setLoadingPdf(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    if (interactiveLayoutMode) {
      setShowLiveLayout(true);
      setStatusMessage('Live layout preview');
    }
    // Each firing launches a full server-side Chromium process (~3.5-5s
    // cold) serialized behind a process-wide render lock shared by every
    // user's PDF renders -- and the AbortController below only cancels the
    // frontend fetch, not the backend's already-launched Playwright work, so
    // a burst of edits (normal during active section drag-reordering) queued
    // multiple full renders that all still ran to completion even though
    // only the last one's result was ever used. 650ms was nowhere near long
    // enough to coalesce a realistic edit burst into one render; this was
    // very likely the single largest contributor to the pipeline feeling
    // slow "between steps" during review/editing.
    const timer = window.setTimeout(
      () => fetchUnifiedPdfArtifact(pagePreference, controller.signal),
      interactiveLayoutMode ? 2000 : 0
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [exactFinalResume, selectedTemplate, pagePreference, companyName]);

  // Scroll Active Page Indicator
  const handleScroll = () => {
    if (!scrollWrapperRef.current || pageCount === 1) return;
    const scrollTop = scrollWrapperRef.current.scrollTop;
    const pageHeight = 1056 * zoom;
    const currentPage = scrollTop >= pageHeight * 0.4 ? 2 : 1;
    setActivePage(currentPage);
  };

  const scrollToPage = (page: number) => {
    if (!scrollWrapperRef.current) return;
    const pageHeight = 1056 * zoom;
    scrollWrapperRef.current.scrollTo({
      top: (page - 1) * (pageHeight + 24),
      behavior: 'smooth'
    });
  };

  // Download Exact Displayed PDF Artifact
  const handleDownload = async () => {
    try {
      setIsDownloading(true);

      if (pdfBlob && pdfBlobUrl && renderHash) {
        const rawName = resumeData?.personal_info?.name || 'User';
        const cleanUser = rawName.replace(/\s+/g, '_');
        const cleanCompany = String(companyName || 'Company').replace(/\s+/g, '_');
        const filename = artifactFilename || `${cleanUser}_${cleanCompany}_Resume.pdf`;

        if (onDownloadArtifact) {
          await onDownloadArtifact({
            blob: pdfBlob,
            url: pdfBlobUrl,
            filename,
            renderHash,
            compositionPlan
          });
          return;
        }

        const a = document.createElement('a');
        a.href = pdfBlobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      throw new Error('The validated preview artifact is not ready yet.');
    } catch (err) {
      console.error(err);
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('tailr4u-toast', { detail: { message: 'Failed to download PDF.', type: 'error', title: 'Download Error' } }));
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const containerClasses = isFullscreen
    ? "fixed inset-0 z-[100] flex flex-col bg-zinc-900 text-zinc-100 overflow-hidden"
    : "flex flex-col h-full bg-[#f4f5f7] dark:bg-zinc-950 overflow-hidden relative";

  const pillClass = "bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm rounded-xl flex items-center p-1 text-sm text-zinc-700 dark:text-zinc-300 h-10";
  const btnClass = "hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg px-2.5 py-1.5 transition-colors flex items-center gap-1.5 font-medium disabled:opacity-50 text-xs cursor-pointer";
  const LiveTemplateComponent = getTemplateComponent(selectedTemplate);
  const previewLayoutLevel = Number(
    compositionPlan?.compactness_level
      ?? compositionPlan?.layout_level
      ?? exactFinalResume?.layout_level
      ?? 6
  );
  // exactFinalResume.section_order reflects the user's live drag instantly --
  // it's a plain useMemo over resumeData/sectionOrder, no backend round trip
  // involved. compositionPlan.section_order only exists after a SUCCESSFUL
  // /api/render-unified-pdf response, and previously took priority here: once
  // set, it permanently shadowed every later drag until the next backend
  // round trip completed, so a reorder appeared to do nothing until that
  // fetch resolved -- and never took effect at all whenever the backend
  // request failed or timed out (compositionPlan is never cleared on error).
  // The user's explicit reorder must always win immediately; the backend
  // plan is only a fallback for before any live resume data exists.
  const previewSectionOrder = exactFinalResume?.section_order
    || compositionPlan?.section_order
    || adaptiveComposition?.sectionOrder;

  return (
    <div className={containerClasses} ref={containerRef}>
      
      {/* 1. TOP TOOLBAR CONTROL BAR */}
      <div className="border-b border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 z-30 shadow-xs">
        
        {/* Left: Preview Title & Segmented Page Preference Control */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
            <Eye size={15} className="text-zinc-600 dark:text-zinc-400" />
            <span className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Preview</span>
          </div>

          {/* Segmented Control: [ Auto ] [ 1 Page ] [ 2 Pages ] */}
          <div className="bg-zinc-100 dark:bg-zinc-800/80 p-1 rounded-xl flex items-center gap-1 border border-zinc-200/60 dark:border-zinc-700/50">
            <button
              onClick={() => {
                setPagePreference('auto');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                pagePreference === 'auto'
                  ? 'bg-[#00bda5] text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
              title="Auto: Adaptive layout engine decides page count"
            >
              Auto
            </button>
            <button
              onClick={() => {
                setPagePreference('prefer_one_page');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                pagePreference === 'prefer_one_page'
                  ? 'bg-[#00bda5] text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
              title="1 Page: Optimizes layout to fit on single page cleanly"
            >
              1 Page
            </button>
            <button
              onClick={() => {
                setPagePreference('prefer_two_pages');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                pagePreference === 'prefer_two_pages'
                  ? 'bg-[#00bda5] text-white shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
              title="2 Pages: Balances content across two pages"
            >
              2 Pages
            </button>
          </div>

          {/* Status Feedback Badge */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-800 rounded-lg text-xs text-zinc-600 dark:text-zinc-400 font-semibold">
            <span className={`w-2 h-2 rounded-full ${pageCount === 1 ? 'bg-emerald-500 animate-pulse' : 'bg-indigo-500'}`} />
            <span>{statusMessage}</span>
          </div>
        </div>

        {/* Center: Zoom Controls & Fit Modes */}
        <div className="flex items-center gap-2">
          
          {/* Fit Modes */}
          <div className={pillClass}>
            <button
              onClick={() => {
                setZoomMode('fit_width');
                calculateZoom();
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                zoomMode === 'fit_width' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              Fit Width
            </button>
            <button
              onClick={() => {
                setZoomMode('fit_page');
                calculateZoom();
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                zoomMode === 'fit_page' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              Fit Page
            </button>
            <button
              onClick={() => {
                setZoomMode('actual_size');
                setZoom(1.0);
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer hidden sm:block ${
                zoomMode === 'actual_size' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 ring-1 ring-indigo-200 dark:ring-indigo-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              100%
            </button>
          </div>

          {/* Stepper Zoom Buttons */}
          <div className={pillClass}>
            <button
              onClick={() => {
                setZoom(prev => Math.max(0.4, prev - 0.15));
                setZoomMode('actual_size');
              }}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut size={15} />
            </button>
            <span className="text-xs font-extrabold text-zinc-700 dark:text-zinc-300 w-12 text-center select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => {
                setZoom(prev => Math.min(2.5, prev + 0.15));
                setZoomMode('actual_size');
              }}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn size={15} />
            </button>
          </div>

          {/* Reset & Fullscreen */}
          <div className={pillClass}>
            <button
              onClick={() => {
                setZoomMode('fit_width');
                calculateZoom();
              }}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="Reset Zoom to Fit Width"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
            >
              {isFullscreen ? <Shrink size={15} /> : <Expand size={15} />}
            </button>
          </div>

        </div>

        {/* Right: Actions (Print & Download PDF) */}
        <div className="flex items-center gap-2">
          <button className={btnClass} onClick={() => pdfBlobUrl && window.open(pdfBlobUrl, '_blank')} disabled={!pdfBlobUrl || loadingPdf}>
            <Printer size={14} />
            <span className="hidden sm:inline">Print</span>
          </button>

          <button
            className={`${btnClass} text-white bg-[#00bda5] hover:bg-[#00a894] px-4 py-2 font-black shadow-sm disabled:opacity-50`}
            onClick={handleDownload}
            disabled={isDownloading || loadingPdf || !pdfBlob || !renderHash}
          >
            <Download size={15} />
            <span>{isDownloading ? 'Downloading...' : loadingPdf ? 'Optimizing...' : 'Download PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700 shadow-2xs flex items-center justify-center shrink-0 ml-1"
            title="Close Preview"
            aria-label="Close Preview"
          >
            <X size={16} />
          </button>
        </div>

      </div>

      {/* 2. WARNING ALERT BANNER IF 1-PAGE OPTIMIZATION CANNOT SAFELY FIT */}
      {warningMessage && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 px-4 py-2.5 flex items-center justify-between gap-3 text-amber-800 dark:text-amber-300 text-xs font-semibold shrink-0 z-20">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span>{warningMessage}</span>
          </div>
          <button
            onClick={() => setPagePreference('auto')}
            className="text-amber-700 dark:text-amber-300 font-extrabold cursor-pointer"
          >
            Switch to Auto
          </button>
          <button onClick={() => setPagePreference('prefer_two_pages')} className="text-amber-700 dark:text-amber-300 font-extrabold cursor-pointer">Use 2 Pages</button>
          <button onClick={() => setWarningMessage(null)} className="text-amber-700 dark:text-amber-300 font-extrabold cursor-pointer">Use Best One-Page Attempt</button>
        </div>
      )}

      {/* 3. CANVAS CONTAINER & SCROLL AREA */}
      <div
        className="flex-1 overflow-auto custom-scrollbar p-6 flex flex-col items-center relative touch-none"
        ref={scrollWrapperRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        
        {/* Loading Overlay during Recomposition */}
        {loadingPdf && !interactiveLayoutMode && (
          <div className="absolute inset-0 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xs z-40 flex flex-col items-center justify-center gap-3">
            <RefreshCw size={28} className="animate-spin text-[#00bda5]" />
            <span className="text-sm font-extrabold text-zinc-800 dark:text-zinc-200">
              Recomposing resume…
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Measuring fonts, margins, and section boundaries
            </span>
          </div>
        )}

        {/* The exact immutable PDF artifact used by Download. */}
        <div
          className="origin-top flex flex-col items-center transition-transform duration-200 ease-out space-y-6"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
        >
          <div
            id="resume-print-container"
            className="resume-document-light shadow-2xl bg-white ring-1 ring-zinc-200/70 rounded-sm overflow-hidden text-zinc-900"
            style={{ width: '8.5in', minHeight: pageCount === 2 ? '22.5in' : '11in' }}
          >
            {interactiveLayoutMode ? (
              <div className="resume-document-light w-full bg-white">
                <LiveTemplateComponent
                  resume={exactFinalResume}
                  sectionOrder={previewSectionOrder}
                  layoutLevel={previewLayoutLevel}
                />
              </div>
            ) : pdfBlobUrl ? (
              <iframe
                src={`${pdfBlobUrl}#toolbar=0&navpanes=0&view=FitH`}
                title="Final resume PDF preview"
                className="w-full border-0 bg-white"
                style={{ height: pageCount === 2 ? '23.38in' : '11.69in' }}
              />
            ) : null}
          </div>
        </div>

      </div>

      {/* 4. FOOTER PAGINATION BADGE & NAVIGATION CONTROLS */}
      <div className="border-t border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-4 py-2 flex items-center justify-between shrink-0 z-30">
        
        {/* Active Page Indicator */}
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-zinc-500 dark:text-zinc-400" />
          <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
            {pageCount === 1 ? 'Page 1 of 1' : `Page ${activePage} of ${pageCount}`}
          </span>
        </div>

        {/* Page Nav Buttons if 2 Pages */}
        {pageCount === 2 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => scrollToPage(1)}
              disabled={activePage === 1}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer font-bold"
            >
              <ChevronUp size={14} /> Page 1
            </button>
            <button
              onClick={() => scrollToPage(2)}
              disabled={activePage === 2}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-xs text-zinc-700 dark:text-zinc-300 disabled:opacity-40 flex items-center gap-1 cursor-pointer font-bold"
            >
              Page 2 <ChevronDown size={14} />
            </button>
          </div>
        )}

        {/* Status indicator right */}
        <div className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
          Canvas Preview = Downloaded File
        </div>

      </div>

    </div>
  );
}
