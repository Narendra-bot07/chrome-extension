import React, { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getTemplateComponent } from '../../templates';
import { isSeniorProfile, compressResumeData } from '../../utils/resumeCompression';

export default function PrintLayout() {
  const [originalResumeData, setOriginalResumeData] = useState(null);
  const [activeResumeData, setActiveResumeData] = useState(null);
  const [compressionLevel, setCompressionLevel] = useState(0);
  const [fittingComplete, setFittingComplete] = useState(false);
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const templateName = searchParams.get('template') || 'ProfessionalATS';
  const containerRef = useRef(null);

  // 1. Ingestion
  useEffect(() => {
    const handleDataReady = () => {
      if (window.__INJECTED_RESUME_DATA__) {
        setOriginalResumeData(window.__INJECTED_RESUME_DATA__);
        setActiveResumeData(window.__INJECTED_RESUME_DATA__);
        setCompressionLevel(0);
        setFittingComplete(false);
      }
    };
    
    if (window.__INJECTED_RESUME_DATA__) {
      handleDataReady();
    }
    window.addEventListener('resumeDataReady', handleDataReady);
    return () => window.removeEventListener('resumeDataReady', handleDataReady);
  }, []);

  // 3. Scale HTML root font size dynamically based on compressionLevel
  useEffect(() => {
    // Map compression levels 0-5 to root font sizes in px
    const fontSizes = [16, 14.5, 13.5, 12, 11, 10];
    const size = fontSizes[compressionLevel] || 16;
    
    // Apply to html and body elements so rem/em units scale down correctly
    document.documentElement.style.fontSize = `${size}px`;
    document.body.style.fontSize = `${size}px`;
    
    return () => {
      document.documentElement.style.fontSize = '';
      document.body.style.fontSize = '';
    };
  }, [compressionLevel]);

  // 2. Intelligent Auto-Fit Engine
  useEffect(() => {
    if (!activeResumeData || !containerRef.current || fittingComplete) return;

    // Give DOM a tiny moment to render the current compression level
    const timer = setTimeout(() => {
      const el = containerRef.current.firstElementChild;
      if (!el) return;

      // Determine page format and dimensions dynamically
      const format = searchParams.get('format') || 'letter';
      const isA4 = format.toLowerCase() === 'a4';
      
      const targetWidth = isA4 ? '8.27in' : '8.5in';
      const targetMinHeight = isA4 ? '11.69in' : '11in';
      const MAX_HEIGHT = isA4 ? 1115 : 1045; // A4 has 1122px max, Letter has 1056px max at 96 DPI
      
      // Force matching size constraints onto the template container
      el.style.width = targetWidth;
      el.style.minHeight = 'auto';
      el.style.height = 'auto'; // Allow height to grow naturally!

      const currentHeight = el.scrollHeight;

      if (currentHeight <= MAX_HEIGHT) {
        // Fits perfectly!
        setFittingComplete(true);
      } else {
        // Overflowing! Check if we should compress further
        if (compressionLevel < 5) {
          // Try next compression level
          const nextLevel = compressionLevel + 1;
          setCompressionLevel(nextLevel);
          // Preserve the complete data model; only CSS density changes.
          setActiveResumeData(compressResumeData(originalResumeData, nextLevel));
        } else {
          // The one-page target was exhausted. Keep the real page width and
          // allow Chromium to paginate the complete resume onto page 2+.
          // For a two-page document, choose a real section boundary that
          // balances both pages and prevents a tiny orphaned continuation.
          if (currentHeight <= MAX_HEIGHT * 2) {
            const resumeLayout = (el as HTMLElement).dataset.resumeLayout
              || (el.querySelector('[data-resume-layout]') as HTMLElement | null)?.dataset.resumeLayout
              || 'single-column';
            const sections = resumeLayout === 'single-column'
              ? Array.from(el.querySelectorAll('[data-section]')) as HTMLElement[]
              : [];
            const candidates = sections
              .map(section => ({ section, offset: section.offsetTop }))
              .filter(({ offset }) => offset > 0 && offset <= MAX_HEIGHT && currentHeight - offset <= MAX_HEIGHT);
            if (candidates.length > 0) {
              const balancedTarget = currentHeight / 2;
              const selected = candidates.reduce((best, candidate) =>
                Math.abs(candidate.offset - balancedTarget) < Math.abs(best.offset - balancedTarget)
                  ? candidate
                  : best
              );
              selected.section.style.breakBefore = 'page';
              selected.section.style.pageBreakBefore = 'always';
              selected.section.dataset.compositionBreak = 'balanced-page-2';
            }
          }
          setFittingComplete(true);
        }
      }
    }, 150); // Small delay to let fonts and DOM settle

    return () => clearTimeout(timer);
  }, [activeResumeData, compressionLevel, fittingComplete, originalResumeData]);

  if (!activeResumeData) {
    return <div style={{ padding: '20px' }}>Waiting for data injection...</div>;
  }

  const TemplateComponent = getTemplateComponent(templateName);

  return (
    <div 
      id="resume-print-container"
      className={`print-compression-level-${compressionLevel}`}
      style={{ margin: 0, padding: 0, background: 'white', minHeight: '100vh', width: '100%', display: 'flex', justifyContent: 'center' }} 
      ref={containerRef}
    >
      <TemplateComponent 
        resume={activeResumeData} 
        layoutLevel={activeResumeData.layout_level !== undefined
          ? activeResumeData.layout_level
          : Math.max(0, 5 - compressionLevel)}
      />
      {/* Invisible div to signal Playwright that Auto-Fit is done */}
      {fittingComplete && <div id="resume-print-ready" style={{ display: 'none' }}></div>}
    </div>
  );
}
