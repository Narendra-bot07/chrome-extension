import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';

const templateStyles = {
  classic_ats: {
    border: 'none',
    nameSize: 22,
    nameWeight: 700,
    headerGap: 18,
    textAlign: 'left'
  },
  modern_corporate: {
    border: '2px solid var(--accent)',
    nameSize: 26,
    nameWeight: 800,
    headerGap: 22,
    textAlign: 'left'
  },
  executive_professional: {
    border: '1px solid var(--accent)',
    nameSize: 28,
    nameWeight: 600,
    headerGap: 26,
    textAlign: 'left'
  }
};

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

  const isPhaseSix = Boolean(data.generated_cover_letter);
  if (!isPhaseSix) {
    return (
      <main id="resume-print-container" style={{ width: '210mm', minHeight: '297mm', padding: '24mm 20mm', fontFamily: 'Georgia, serif' }}>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, lineHeight: 1.55 }}>
          {[data.date, data.recipient_name, data.company_name, data.salutation, data.body, data.signoff]
            .filter(Boolean).join('\n\n')}
        </div>
      </main>
    );
  }

  const settings = data.settings;
  const candidate = data.context?.candidate || {};
  const style = templateStyles[settings.selected_template] || templateStyles.classic_ats;
  const paper = settings.paper_size === 'Letter'
    ? { width: '215.9mm', minHeight: '279.4mm', css: 'Letter' }
    : { width: '210mm', minHeight: '297mm', css: 'A4' };
  const contact = [
    candidate.email,
    candidate.phone,
    candidate.location,
    candidate.linkedin,
    candidate.portfolio
  ].filter(Boolean);

  return (
    <>
      <style>{`
        :root { --accent: ${settings.theme_color}; }
        @page { size: ${paper.css}; margin: 0; }
        html, body, #root { margin: 0; padding: 0; background: white; }
      `}</style>
      <main id="resume-print-container"
        style={{
          width: paper.width,
          minHeight: paper.minHeight,
          padding: `${settings.page_margin}mm`,
          boxSizing: 'border-box',
          color: '#18181b',
          background: '#fff',
          fontFamily: `${settings.font}, Arial, sans-serif`,
          fontSize: `${settings.font_size}pt`,
          lineHeight: settings.line_height,
          '--accent': settings.theme_color
        }}>
        {(candidate.name || contact.length > 0) && (
          <header style={{
            borderBottom: style.border,
            paddingBottom: style.border === 'none' ? 0 : 10,
            marginBottom: style.headerGap
          }}>
            {candidate.name && (
              <div style={{
                fontSize: style.nameSize,
                fontWeight: style.nameWeight,
                letterSpacing: settings.selected_template === 'executive_professional' ? 0.4 : 0
              }}>
                {candidate.name}
              </div>
            )}
            {contact.length > 0 && (
              <div style={{ marginTop: 5, fontSize: '8.5pt', color: '#52525b' }}>
                {contact.join('  ·  ')}
              </div>
            )}
          </header>
        )}
        <section style={{
          whiteSpace: 'pre-wrap',
          textAlign: style.textAlign,
          overflowWrap: 'anywhere'
        }}>
          {data.generated_cover_letter.content.split(/\n\s*\n/).map((block, index, blocks) => (
            <div key={index} style={{
              marginBottom: index === blocks.length - 1 ? 0 : settings.paragraph_spacing,
              breakInside: 'avoid'
            }}>
              {block}
            </div>
          ))}
        </section>
      </main>
    </>
  );
}
