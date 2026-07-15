import React, { useRef, useEffect, useState } from 'react';
import { ZoomIn, ZoomOut, Expand, Shrink, Printer, Download } from 'lucide-react';
import { getTemplateComponent } from '../../templates';

export default function ResumePreview({ resumeData, selectedTemplate, sectionOrder }: { resumeData: any, selectedTemplate: string, sectionOrder?: string[] }) {
  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFitPage, setIsFitPage] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const containerRef = useRef(null);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 2.5));
    setIsFitPage(false);
  };
  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.4));
    setIsFitPage(false);
  };
  
  const handleFitWidth = () => {
    if (containerRef.current) {
      const width = containerRef.current.clientWidth - 80;
      setZoom(width / 816);
      setIsFitPage(false);
    }
  };

  const handleFitPage = () => {
    if (containerRef.current) {
      const height = containerRef.current.clientHeight - 80;
      setZoom(height / 1056);
      setIsFitPage(true);
    }
  };

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      const res = await fetch('http://localhost:8000/api/download-pdf?company_name=Company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: resumeData,
          template_name: selectedTemplate || 'ModernProATS'
        })
      });

      if (!res.ok) throw new Error('Failed to generate PDF');
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Resume.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF.');
    } finally {
      setIsDownloading(false);
    }
  };
  
  useEffect(() => {
    handleFitWidth();
    window.addEventListener('resize', handleFitWidth);
    return () => window.removeEventListener('resize', handleFitWidth);
  }, []);

  useEffect(() => {
    setTimeout(() => {
      if (isFitPage) handleFitPage();
      else handleFitWidth();
    }, 50);
  }, [isFullscreen]);

  if (!resumeData) return <div className="p-8 text-center text-gray-500">No data available</div>;

  const TemplateComponent = getTemplateComponent(selectedTemplate);

  const containerClasses = isFullscreen
    ? "fixed inset-0 z-[100] flex flex-col bg-[#f3f4f6] overflow-hidden"
    : "flex flex-col h-full bg-[#f3f4f6] overflow-hidden relative";

  const pillClass = "bg-white border border-zinc-200/80 shadow-sm rounded-lg flex items-center p-1 text-sm text-zinc-700 h-10";
  const btnClass = "hover:bg-zinc-100 rounded-md px-2.5 py-1.5 transition-colors flex items-center gap-1.5 font-medium disabled:opacity-50";

  return (
    <div className={containerClasses}>
      
      {/* Floating Toolbar */}
      <div className="absolute top-4 left-0 right-0 z-20 flex justify-center px-4 pointer-events-none">
        <div className="flex flex-wrap justify-center gap-3 pointer-events-auto">
          
          {/* Zoom Group */}
          <div className={pillClass}>
            <span className="px-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden sm:block">Zoom</span>
            <div className="w-px h-4 bg-zinc-200 mx-1 hidden sm:block"></div>
            <button onClick={handleZoomOut} className="p-1.5 hover:bg-zinc-100 rounded-md transition-colors" title="Zoom Out">
              <ZoomOut size={16} />
            </button>
            <span className="text-xs font-bold text-zinc-700 w-12 text-center select-none">
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={handleZoomIn} className="p-1.5 hover:bg-zinc-100 rounded-md transition-colors" title="Zoom In">
              <ZoomIn size={16} />
            </button>
          </div>

          {/* Fit Group */}
          <div className={pillClass}>
            <button onClick={handleFitWidth} className={`px-3 py-1.5 rounded-md transition-colors font-medium text-xs ${!isFitPage ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'hover:bg-zinc-100'}`}>
              Fit Width
            </button>
            <button onClick={handleFitPage} className={`px-3 py-1.5 rounded-md transition-colors font-medium text-xs ${isFitPage ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'hover:bg-zinc-100'}`}>
              Fit Page
            </button>
          </div>

          {/* Actions */}
          <div className={`${pillClass} hidden md:flex`}>
            <button onClick={() => setIsFullscreen(!isFullscreen)} className={btnClass}>
              {isFullscreen ? <Shrink size={14} /> : <Expand size={14} />} 
              <span className="text-xs">Fullscreen</span>
            </button>
            <div className="w-px h-4 bg-zinc-200 mx-1"></div>
            <button className={btnClass} onClick={() => window.print()}>
              <Printer size={14} />
              <span className="text-xs">Print</span>
            </button>
            <div className="w-px h-4 bg-zinc-200 mx-1"></div>
            <button className={btnClass} onClick={handleDownload} disabled={isDownloading}>
              <Download size={14} />
              <span className="text-xs">{isDownloading ? '...' : 'Download'}</span>
            </button>
          </div>

        </div>
      </div>
      
      {/* Resume Container */}
      <div className="flex-1 overflow-auto custom-scrollbar p-6 pt-20 flex justify-center" ref={containerRef}>
        <div className="origin-top flex justify-center transition-transform duration-200 ease-out" style={{ transform: `scale(${zoom})` }}>
          <div id="resume-print-container" className="shadow-2xl bg-white ring-1 ring-zinc-200/50" style={{ width: '8.5in' }}>
            <TemplateComponent resume={resumeData} sectionOrder={sectionOrder} />
          </div>
        </div>
      </div>
    </div>
  );
}
