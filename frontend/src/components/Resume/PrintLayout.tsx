import React, { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { getTemplateComponent } from '../../templates';
import { isSeniorProfile, compressResumeData } from '../../utils/resumeCompression';
import {
  A4_PAGE,
  buildMeasuredCompositionPlan,
  measureResumeElement,
  waitForRenderableFonts
} from '../../utils/finalCompositionPlan';

export default function PrintLayout() {
  const [originalResumeData, setOriginalResumeData] = useState(null);
  const [activeResumeData, setActiveResumeData] = useState(null);
  const [compressionLevel, setCompressionLevel] = useState(0);
  const [fitLayoutLevel, setFitLayoutLevel] = useState(6);
  const [fittingComplete, setFittingComplete] = useState(false);
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const templateName = searchParams.get('template') || 'ProfessionalATS';
  const containerRef = useRef(null);
  const blockedExpansionLevelRef = useRef<number | null>(null);

  // 1. Ingestion
  useEffect(() => {
    const handleDataReady = () => {
      if (window.__INJECTED_RESUME_DATA__) {
        setOriginalResumeData(window.__INJECTED_RESUME_DATA__);
        setActiveResumeData(window.__INJECTED_RESUME_DATA__);
        setCompressionLevel(0);
        setFitLayoutLevel(Math.max(
          0,
          Math.min(20, Number(window.__INJECTED_RESUME_DATA__?.layout_level ?? 6))
        ));
        blockedExpansionLevelRef.current = null;
        setFittingComplete(false);
      }
    };
    
    if (window.__INJECTED_RESUME_DATA__) {
      handleDataReady();
    }
    window.addEventListener('resumeDataReady', handleDataReady);
    // Signal that this lazy route has mounted and installed its ingestion
    // listener. Playwright waits for this before dispatching the payload.
    window.__PDF_RENDERER_ACCEPTING_DATA__ = true;
    window.dispatchEvent(new Event('pdfRendererReady'));
    return () => {
      window.__PDF_RENDERER_ACCEPTING_DATA__ = false;
      window.removeEventListener('resumeDataReady', handleDataReady);
    };
  }, []);

  // Typography has exactly one owner: TailorRender's layoutLevel. Applying a
  // second root-font scale here made rem-based labels/dates shrink while
  // pixel-based body text stayed unchanged, producing an uneven PDF that did
  // not match the live preview.
  useEffect(() => {
    document.documentElement.style.fontSize = '16px';
    document.body.style.fontSize = '16px';
    return () => {
      document.documentElement.style.fontSize = '';
      document.body.style.fontSize = '';
    };
  }, []);

  // 2. Intelligent Auto-Fit Engine
  useEffect(() => {
    if (!activeResumeData || !containerRef.current || fittingComplete) return;
    // Give DOM a tiny moment to render the current compression level
    const timer = setTimeout(async () => {
      const el = containerRef.current.firstElementChild;
      if (!el) return;
      await waitForRenderableFonts(document);

      // Determine page format and dimensions dynamically
      const format = searchParams.get('format') || 'letter';
      const isA4 = format.toLowerCase() === 'a4';
      
      const targetWidth = isA4 ? '8.27in' : '8.5in';
      // Keep a small physical-print safety boundary. Chromium rounds fonts and
      // line boxes differently during PDF pagination; fitting to the exact
      // paper edge can clip the final education/certification row.
      const MAX_HEIGHT = isA4 ? 1100 : 1035;
      const TARGET_MIN_HEIGHT = MAX_HEIGHT * 0.88;
      
      // Force matching size constraints onto the template container
      el.style.width = targetWidth;
      el.style.minHeight = 'auto';
      el.style.height = 'auto'; // Allow height to grow naturally!

      const currentMeasurement = measureResumeElement(el);
      const currentHeight = currentMeasurement.contentHeight;
      const occupiedHeight = currentMeasurement.occupiedContentHeight || currentHeight;
      const composition = originalResumeData?._composition || {};
      const configuredCompression = Math.min(
        3,
        Math.max(0, Number(composition.maximum_compression_level ?? 3))
      );
      // Text-length estimates may recommend two pages, but they must never
      // prevent the real renderer from exhausting safe one-page compaction.
      const maxCompression = originalResumeData?._page_preference === 'two'
        ? Math.min(1, configuredCompression)
        : configuredCompression;
      const measuredLayoutLevel = fitLayoutLevel;

      if (currentHeight <= MAX_HEIGHT) {
        // Expand a genuinely under-filled page using presentation-only density
        // changes. Stop at the last safe level if the next expansion overflows.
        const nextLevel = fitLayoutLevel + 1;
        const blockedLevel = blockedExpansionLevelRef.current;
        if (
          occupiedHeight < TARGET_MIN_HEIGHT
          && fitLayoutLevel < 20
          && (blockedLevel === null || nextLevel < blockedLevel)
        ) {
          setFitLayoutLevel(nextLevel);
          return;
        }
        // Fits perfectly!
        const measurement = currentMeasurement;
        const finalPlan = buildMeasuredCompositionPlan({
          ...measurement,
          pageSize: isA4 ? A4_PAGE : {
            ...A4_PAGE, size: 'Letter', widthPx: 816, heightPx: 1056
          },
          layoutLevel: measuredLayoutLevel,
          templateName,
          preference: originalResumeData?._page_preference || 'auto',
          measurementFlags: measurement,
          optimizationActions: Array.from(
            { length: compressionLevel },
            (_, index) => ['remove_empty_spacing', 'reduce_section_spacing', 'reduce_bullet_spacing'][index]
              || `safe_compression_${index + 1}`
          )
        });
        window.__FINAL_COMPOSITION_PLAN__ = finalPlan;
        const plannedBreak = finalPlan.page_breaks[0];
        if (plannedBreak) {
          const breakNode = el.querySelector(`[data-section="${plannedBreak}"]`) as HTMLElement | null;
          if (breakNode) {
            breakNode.style.breakBefore = 'page';
            breakNode.style.pageBreakBefore = 'always';
            breakNode.dataset.compositionBreak = 'final-plan';
          }
        }
        setFittingComplete(true);
      } else {
        if (fitLayoutLevel > 0) {
          blockedExpansionLevelRef.current = fitLayoutLevel;
          setFitLayoutLevel(level => Math.max(0, level - 1));
          return;
        }
        // Overflowing! Check if we should compress further
        if (compressionLevel < maxCompression) {
          // Try next compression level
          const nextLevel = compressionLevel + 1;
          setCompressionLevel(nextLevel);
          // Preserve the complete data model; only CSS density changes.
          setActiveResumeData(compressResumeData(originalResumeData, nextLevel));
        } else {
          // The one-page target was exhausted. Keep the real page width and
          // allow Chromium to paginate the complete resume onto page 2+.
          const measurement = measureResumeElement(el);
          const finalPlan = buildMeasuredCompositionPlan({
            ...measurement,
            pageSize: isA4 ? A4_PAGE : {
              ...A4_PAGE, size: 'Letter', widthPx: 816, heightPx: 1056
            },
            layoutLevel: measuredLayoutLevel,
            templateName,
            preference: originalResumeData?._page_preference || 'auto',
            measurementFlags: measurement,
            optimizationActions: Array.from(
              { length: compressionLevel },
              (_, index) => ['remove_empty_spacing', 'reduce_section_spacing', 'reduce_bullet_spacing'][index]
                || `safe_compression_${index + 1}`
            )
          });
          // This content already exceeds one physical page. Adding a CSS
          // break here can stack with Chromium's natural fragmentation and
          // create a spurious third page. The measured boundary remains in
          // the plan, while Chromium paginates the complete content naturally.
          window.__FINAL_COMPOSITION_PLAN__ = finalPlan;
          setFittingComplete(true);
        }
      }
    }, 25); // Coalesce DOM updates without adding 150ms per fit iteration.

    return () => clearTimeout(timer);
  }, [activeResumeData, compressionLevel, fitLayoutLevel, fittingComplete, originalResumeData]);

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
        layoutLevel={fitLayoutLevel}
        isExporting={true}
      />
      {/* Invisible div to signal Playwright that Auto-Fit is done */}
      {fittingComplete && <div
        id="resume-print-ready"
        data-composition-plan-hash={window.__FINAL_COMPOSITION_PLAN__?.composition_plan_hash || ''}
        style={{ display: 'none' }}
      ></div>}
    </div>
  );
}
