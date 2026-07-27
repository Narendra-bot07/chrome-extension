import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { CoverLetterRender } from '../components/CoverLetterRender';

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
    line_height: 1.65,
    paragraph_spacing: 18,
    page_margin: 20,
    paper_size: 'A4',
    theme_color: '#1d4ed8'
  };

  const tpl = settings.selected_template || data.template_name || 'classic_ats';
  const paper = settings.paper_size === 'Letter'
    ? { width: '215.9mm', minHeight: '279.4mm', css: 'Letter' }
    : { width: '210mm', minHeight: '297mm', css: 'A4' };

  const activeCoverLetter = data.generated_cover_letter || data.cover_letter || data;

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
          box-sizing: border-box;
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
        className="cover-letter-page bg-white"
        style={{
          width: paper.width,
          minHeight: paper.minHeight
        }}
      >
        <CoverLetterRender
          coverLetter={activeCoverLetter}
          context={data.context}
          templateKey={tpl}
          settings={settings}
          className="shadow-none border-none p-12 md:p-14"
        />
      </main>
    </>
  );
}
