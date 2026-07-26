import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

export default function PrintCoverLetterLayout() {
  const { coverLetter: contextCoverLetter } = useApp();
  const [data, setData] = useState(null);

  useEffect(() => {
    const handleDataReady = () => {
      if (window.__INJECTED_COVER_LETTER_DATA__) {
        setData(window.__INJECTED_COVER_LETTER_DATA__);
      }
    };
    if (window.__INJECTED_COVER_LETTER_DATA__) {
      setData(window.__INJECTED_COVER_LETTER_DATA__);
    } else if (contextCoverLetter) {
      setData(contextCoverLetter);
    }
    window.addEventListener('coverLetterDataReady', handleDataReady);
    return () => window.removeEventListener('coverLetterDataReady', handleDataReady);
  }, [contextCoverLetter]);

  if (!data) return <div className="min-h-screen bg-white" />;

  const settings = data.settings || {
    selected_template: 'classic_ats',
    font: 'Arial',
    font_size: 11,
    line_height: 1.45,
    paragraph_spacing: 10,
    page_margin: 20,
    paper_size: 'A4',
    theme_color: '#1d4ed8'
  };
  const plan = data.composition_plan || null;

  const tpl = settings.selected_template || 'classic_ats';
  const candidate = data.context?.candidate || {};
  const job = data.context?.job || {};
  const recipient = data.context?.recipient || {};

  const name = candidate.name || 'Candidate Name';
  const contactParts = [candidate.email, candidate.phone, candidate.location].filter(Boolean);

  const paper = settings.paper_size === 'Letter'
    ? { width: '215.9mm', minHeight: '279.4mm', css: 'Letter' }
    : { width: '210mm', minHeight: '297mm', css: 'A4' };

  const rawContent = data.generated_cover_letter?.content || data.body || data.content || '';
  const paragraphs = String(rawContent).split(/\n\s*\n/).filter(p => p.trim());

  const themeColor = settings.theme_color || '#1d4ed8';
  const fontSizePt = plan?.typography?.body_font_pt || settings.font_size || 11;
  const nameFontPt = plan?.typography?.name_font_pt || 20;
  const lineHeight = plan?.typography?.line_height || settings.line_height || 1.4;
  const paragraphGap = plan?.spacing?.paragraph_gap_px || settings.paragraph_spacing || 8;
  const headerBottom = plan?.spacing?.header_bottom_px || 12;
  const margins = plan?.margins || {
    top_mm: settings.page_margin || 20,
    right_mm: settings.page_margin || 20,
    bottom_mm: settings.page_margin || 20,
    left_mm: settings.page_margin || 20
  };
  const pagePadding = `${margins.top_mm}mm ${margins.right_mm}mm ${margins.bottom_mm}mm ${margins.left_mm}mm`;
  const contentWidth = `${plan?.content_width_percent || 100}%`;
  const fontFamily = plan?.typography?.font_family || settings.font || 'Arial';

  // TEMPLATE 1: CLASSIC ATS (B&W, left-aligned, thin divider, conservative)
  if (tpl === 'classic_ats') {
    return (
      <>
        <style>{`
          @page { size: ${paper.css}; margin: 0; }
          html, body, #root { margin: 0; padding: 0; background: white; }
          .cover-letter-page {
            width: ${paper.width};
            min-height: ${paper.minHeight};
            max-width: none;
            margin: 0;
            transform: none !important;
            zoom: 1 !important;
          }
          .cover-letter-content {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            transform: none !important;
            zoom: 1 !important;
          }
          @media print {
            html, body, #root {
              width: ${paper.width};
              min-height: ${paper.minHeight};
            }
          }
        `}</style>
        <main
          id="resume-print-container"
          className="cover-letter-page"
          style={{
            width: paper.width,
            minHeight: paper.minHeight,
            padding: pagePadding,
            boxSizing: 'border-box',
            color: '#111827',
            background: '#ffffff',
            fontFamily: `${fontFamily}, sans-serif`,
            fontSize: `${fontSizePt}pt`,
            lineHeight
          }}
        >
          {/* Header */}
          <header data-cover-letter-header="true" style={{ borderBottom: '0.8px solid #111827', paddingBottom: '12px', marginBottom: `${headerBottom}px` }}>
            <div style={{ fontSize: `${nameFontPt}pt`, fontWeight: 800, textTransform: 'uppercase', tracking: '-0.02em', color: '#111827' }}>
              {name}
            </div>
            {contactParts.length > 0 && (
              <div style={{ marginTop: '4px', fontSize: '9pt', color: '#4b5563', fontWeight: 500 }}>
                {contactParts.join('  ·  ')}
              </div>
            )}
          </header>

          {/* Paragraphs */}
          <section className="cover-letter-content" data-cover-letter-content="true" style={{ width: contentWidth, maxWidth: 'none', textAlign: 'left', overflowWrap: 'anywhere', transform: 'none', zoom: 1 }}>
            {paragraphs.map((para, index) => (
              <div
                key={index}
                style={{
                  marginBottom: `${paragraphGap}px`,
                  breakInside: 'avoid'
                }}
              >
                {para}
              </div>
            ))}
          </section>
        </main>
      </>
    );
  }

  // TEMPLATE 2: MODERN CORPORATE (Sans-serif, blue accent, compact contact, 2px divider)
  if (tpl === 'modern_corporate') {
    return (
      <>
        <style>{`
          @page { size: ${paper.css}; margin: 0; }
          html, body, #root { margin: 0; padding: 0; background: white; }
          .cover-letter-page { width: ${paper.width}; min-height: ${paper.minHeight}; max-width: none; margin: 0; transform: none !important; zoom: 1 !important; }
          .cover-letter-content { width: 100% !important; max-width: none !important; margin: 0 !important; transform: none !important; zoom: 1 !important; }
          @media print { html, body, #root { width: ${paper.width}; min-height: ${paper.minHeight}; } }
        `}</style>
        <main
          id="resume-print-container"
          className="cover-letter-page"
          style={{
            width: paper.width,
            minHeight: paper.minHeight,
            padding: pagePadding,
            boxSizing: 'border-box',
            color: '#0f172a',
            background: '#ffffff',
            fontFamily: `${fontFamily}, Arial, sans-serif`,
            fontSize: `${fontSizePt}pt`,
            lineHeight
          }}
        >
          {/* Accent Header */}
          <header data-cover-letter-header="true" style={{ borderBottom: `2px solid ${themeColor}`, paddingBottom: '14px', marginBottom: `${headerBottom}px` }}>
            <div style={{ fontSize: `${nameFontPt}pt`, fontWeight: 900, color: themeColor, letterSpacing: '-0.02em' }}>
              {name}
            </div>
            {contactParts.length > 0 && (
              <div style={{ marginTop: '6px', fontSize: '8.5pt', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {contactParts.join('   |   ')}
              </div>
            )}
          </header>

          {/* Paragraphs */}
          <section className="cover-letter-content" data-cover-letter-content="true" style={{ width: contentWidth, maxWidth: 'none', textAlign: 'left', overflowWrap: 'anywhere', transform: 'none', zoom: 1 }}>
            {paragraphs.map((para, index) => (
              <div
                key={index}
                style={{
                  marginBottom: `${paragraphGap}px`,
                  breakInside: 'avoid'
                }}
              >
                {para}
              </div>
            ))}
          </section>
        </main>
      </>
    );
  }

  // TEMPLATE 3: EXECUTIVE PROFESSIONAL (Serif, centered formal header, elegant hierarchy)
  return (
    <>
      <style>{`
        @page { size: ${paper.css}; margin: 0; }
        html, body, #root { margin: 0; padding: 0; background: white; }
        .cover-letter-page { width: ${paper.width}; min-height: ${paper.minHeight}; max-width: none; margin: 0; transform: none !important; zoom: 1 !important; }
        .cover-letter-content { width: 100% !important; max-width: none !important; margin: 0 !important; transform: none !important; zoom: 1 !important; }
        @media print { html, body, #root { width: ${paper.width}; min-height: ${paper.minHeight}; } }
      `}</style>
      <main
        id="resume-print-container"
        className="cover-letter-page"
        style={{
          width: paper.width,
          minHeight: paper.minHeight,
          padding: pagePadding,
          boxSizing: 'border-box',
          color: '#1c1917',
          background: '#ffffff',
          fontFamily: `${fontFamily}, 'Times New Roman', serif`,
          fontSize: `${fontSizePt}pt`,
          lineHeight
        }}
      >
        {/* Executive Header */}
        <header data-cover-letter-header="true" style={{ textAlign: 'center', borderBottom: '1px solid #d6d3d1', paddingBottom: '16px', marginBottom: `${headerBottom}px` }}>
          <div style={{ fontSize: `${nameFontPt}pt`, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#1c1917' }}>
            {name}
          </div>
          {contactParts.length > 0 && (
            <div style={{ marginTop: '8px', fontSize: '8.5pt', color: '#57534e', fontFamily: 'Arial, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              {contactParts.join('   |   ')}
            </div>
          )}
        </header>

        {/* Paragraphs */}
        <section className="cover-letter-content" data-cover-letter-content="true" style={{ width: contentWidth, maxWidth: 'none', textAlign: 'left', overflowWrap: 'anywhere', transform: 'none', zoom: 1 }}>
          {paragraphs.map((para, index) => (
            <div
              key={index}
              style={{
                marginBottom: `${paragraphGap}px`,
                breakInside: 'avoid'
              }}
            >
              {para}
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
