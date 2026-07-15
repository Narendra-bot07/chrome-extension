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
          // Apply data truncation if needed (levels 3+)
          setActiveResumeData(compressResumeData(originalResumeData, nextLevel));
        } else {
          // WE EXHAUSTED ALL TRUNCATION AND FONTS, BUT IT STILL OVERFLOWS!
          // Fallback: Aspect ratio width expansion.
          // By dynamically widening the container, text wraps less and height shrinks.
          // Playwright's native scale-to-fit-width handles the actual scaling.
          let currentWidth = isA4 ? 8.27 : 8.5;
          el.style.width = `${currentWidth}in`;
          let hInches = el.scrollHeight / 96;
          const targetRatio = isA4 ? 1.41 : 1.29; // Aspect ratios for target page format
          
          while (hInches / currentWidth > targetRatio && currentWidth < 13) {
             currentWidth += 0.1;
             el.style.width = `${currentWidth}in`;
             hInches = el.scrollHeight / 96;
          }
          
          // Force height to grow naturally
          el.style.height = 'auto';
          el.style.minHeight = 'auto';
          
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
        layoutLevel={activeResumeData.layout_level !== undefined ? activeResumeData.layout_level : 5}
      />
      {/* Invisible div to signal Playwright that Auto-Fit is done */}
      {fittingComplete && <div id="resume-print-ready" style={{ display: 'none' }}></div>}
    </div>
  );
}
