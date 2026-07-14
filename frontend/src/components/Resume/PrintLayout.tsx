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

  // 2. Intelligent Auto-Fit Engine
  useEffect(() => {
    if (!activeResumeData || !containerRef.current || fittingComplete) return;

    // Give DOM a tiny moment to render the current compression level
    const timer = setTimeout(() => {
      const el = containerRef.current.firstElementChild;
      if (!el) return;

      const currentHeight = el.scrollHeight;
      // 1045px is approximately 11 inches at 96 DPI minus a small margin
      const MAX_HEIGHT = 1045; 

      if (currentHeight <= MAX_HEIGHT) {
        // Fits perfectly!
        setFittingComplete(true);
      } else {
        // Overflowing! Check if we should compress further
        const isSenior = isSeniorProfile(originalResumeData);
        
        if (isSenior) {
          // Senior profiles are allowed to span 2 pages, stop fitting
          setFittingComplete(true);
        } else if (compressionLevel < 5) {
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
          let currentWidth = 8.5;
          el.style.width = `${currentWidth}in`;
          let hInches = el.scrollHeight / 96;
          const targetRatio = 1.38; // Safe A4 margin
          
          while (hInches / currentWidth > targetRatio && currentWidth < 13) {
             currentWidth += 0.1;
             el.style.width = `${currentWidth}in`;
             hInches = el.scrollHeight / 96;
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
      className={`print-compression-level-${compressionLevel}`}
      style={{ margin: 0, padding: 0, background: 'white', minHeight: '100vh', width: '100%', display: 'flex', justifyContent: 'center' }} 
      ref={containerRef}
    >
      <TemplateComponent resume={activeResumeData} />
      {/* Invisible div to signal Playwright that Auto-Fit is done */}
      {fittingComplete && <div id="resume-print-ready" style={{ display: 'none' }}></div>}
    </div>
  );
}
