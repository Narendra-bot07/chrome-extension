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

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-slate-400 font-sans text-xs">
        Loading cover letter printable layout...
      </div>
    );
  }

  return (
    <div 
      id="resume-print-container"
      className="bg-white text-zinc-900 font-serif leading-relaxed text-[11.5px] select-text box-border"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '24mm 20mm',
        margin: '0 auto',
      }}
    >
      {/* Sender Header / Branding */}
      <div className="mb-10 border-b pb-6 border-zinc-200">
        <h1 className="text-xl font-black tracking-tight text-zinc-900 font-sans uppercase">
          {data.recipient_name === "Hiring Manager" ? "Applicant" : data.recipient_name}
        </h1>
        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1 font-sans">
          Tailored Cover Letter
        </p>
      </div>

      {/* Date */}
      <p className="text-right text-[10px] text-zinc-500 font-sans italic mb-8">
        {data.date}
      </p>

      {/* Recipient Details */}
      <div className="mb-8 font-sans text-[11px] text-zinc-800 space-y-0.5">
        <p className="font-extrabold text-zinc-500 uppercase tracking-wider text-[9px] mb-1">To:</p>
        <p className="font-extrabold text-zinc-950">{data.recipient_name}</p>
        <p className="font-semibold">{data.company_name}</p>
      </div>

      {/* Salutation */}
      <p className="font-bold text-[11.5px] text-zinc-900 mb-5 font-sans">
        {data.salutation}
      </p>

      {/* Body Paragraphs */}
      <div className="space-y-4 text-justify leading-relaxed text-zinc-800 font-serif">
        {data.body.split('\n\n').map((para, idx) => (
          <p key={idx}>{para}</p>
        ))}
      </div>

      {/* Signoff */}
      <div className="mt-10 pt-6 border-t border-zinc-150">
        <p className="whitespace-pre-line text-[11px] text-zinc-700 font-sans italic leading-relaxed">
          {data.signoff}
        </p>
      </div>
    </div>
  );
}
