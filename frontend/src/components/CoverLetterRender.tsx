import React from 'react';

interface CoverLetterRenderProps {
  coverLetter?: any;
  context?: {
    candidate?: {
      name?: string;
      email?: string;
      phone?: string;
      location?: string;
    };
    job?: {
      title?: string;
      company?: string;
    };
    recipient?: {
      name?: string;
      title?: string;
    };
  };
  templateName?: string;
  templateKey?: string;
  settings?: {
    theme_color?: string;
    font?: string;
    font_size?: number;
    line_height?: number;
    paragraph_spacing?: number;
  };
  className?: string;
}

function formatCoverLetterParagraphs(text: any): string[] {
  if (!text) return [];
  if (Array.isArray(text)) return text.map(p => String(p).trim()).filter(Boolean);

  let str = String(text).trim();

  // Strip leading salutation if embedded
  str = str.replace(/^(Dear\s+[^,\n]+,|\bTo Whom It May Concern,|\bDear\s+Hiring\s+(Manager|Team),)\s*/i, '');

  // Strip trailing signoff if embedded
  str = str.replace(/\s*(Sincerely,|Best regards,|Warm regards,|Regards,|Thank you,)\s*[^\n]*$/i, '');

  const normalized = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  let chunks = normalized.split(/\n\s*\n/);
  if (chunks.length <= 1 && normalized.includes('\n')) {
    chunks = normalized.split('\n');
  }

  return chunks
    .map(p => p.trim())
    .filter(p => {
      if (!p) return false;
      if (/^(Dear|To Whom|Hiring Manager)/i.test(p) && p.length < 40) return false;
      if (/^(Sincerely|Regards|Best regards|Warm regards|Thank you)/i.test(p) && p.length < 50) return false;
      return true;
    });
}

export function CoverLetterRender({
  coverLetter,
  context,
  templateName,
  templateKey,
  settings = {},
  className = ''
}: CoverLetterRenderProps) {
  if (!coverLetter) return null;

  const activeTemplate = templateKey || templateName || 'classic_ats';

  const candidate = context?.candidate || coverLetter.candidate || {};
  const job = context?.job || coverLetter.job || {};
  const recipientObj = context?.recipient || coverLetter.recipient || {};

  const name = candidate.name || coverLetter.applicant_name || coverLetter.name || 'Candidate Name';
  const email = candidate.email || coverLetter.email || '';
  const phone = candidate.phone || coverLetter.phone || '';
  const location = candidate.location || coverLetter.location || '';
  const contactParts = [email, phone, location].filter(Boolean);

  const company = job.company || coverLetter.company_name || coverLetter.company || 'Hiring Company';
  const recipient = recipientObj.name || coverLetter.recipient_name || coverLetter.recipient || 'Hiring Manager';
  const salutation = coverLetter.salutation || 'Dear Hiring Manager,';
  const date = coverLetter.date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const signoff = coverLetter.signoff || 'Sincerely,';

  const rawText = typeof coverLetter === 'string'
    ? coverLetter
    : (coverLetter?.content || coverLetter?.body || '');

  let bodyText = rawText || '';
  if (salutation && bodyText.includes(salutation)) {
    bodyText = bodyText.split(salutation)[1] || bodyText;
  }
  if (signoff && bodyText.includes(signoff)) {
    bodyText = bodyText.split(signoff)[0] || bodyText;
  }

  const paragraphs = formatCoverLetterParagraphs(bodyText);

  const themeColor = settings.theme_color || (activeTemplate === 'modern_corporate' ? '#1d4ed8' : '#0f172a');
  const fontFamily = settings.font || (activeTemplate === 'executive_professional' ? 'Georgia, serif' : 'Inter, sans-serif');
  const fontSize = settings.font_size ? `${settings.font_size}pt` : '10.5pt';
  const lineHeight = settings.line_height || 1.65;
  const paragraphGap = settings.paragraph_spacing ? `${settings.paragraph_spacing}px` : '18px';

  // TEMPLATE 1: CLASSIC ATS
  if (activeTemplate === 'classic_ats') {
    return (
      <div
        className={`w-full bg-white text-zinc-900 p-10 md:p-14 space-y-6 select-text text-left shadow-lg border border-zinc-200 rounded-sm ${className}`}
        style={{ fontFamily, fontSize, lineHeight }}
      >
        {/* Header */}
        <div data-cover-letter-header="true" className="border-b border-zinc-900 pb-5 space-y-1.5 mb-6">
          <h1 className="text-2.5xl font-bold tracking-tight text-zinc-900 uppercase">{name}</h1>
          {contactParts.length > 0 && (
            <div className="text-xs text-zinc-600 space-x-2 font-medium">
              {contactParts.join('  ·  ')}
            </div>
          )}
        </div>

        {/* Date & Recipient */}
        <div className="space-y-2 my-6 text-xs">
          <div className="font-semibold text-zinc-500">{date}</div>
          <div className="font-bold text-zinc-900 leading-snug">
            <div>{recipient}</div>
            <div className="font-semibold text-zinc-600">{company}</div>
          </div>
        </div>

        {/* Salutation */}
        <div className="font-bold text-zinc-900 text-sm mt-6 mb-5">{salutation}</div>

        {/* Paragraphs */}
        <div data-cover-letter-content="true" className="space-y-5 my-6 w-full">
          {paragraphs.map((para, idx) => (
            <p key={idx} className="text-xs md:text-sm text-zinc-800 text-justify leading-relaxed font-normal" style={{ marginBottom: paragraphGap, lineHeight: 1.65 }}>
              {para}
            </p>
          ))}
        </div>

        {/* Signoff */}
        <div className="mt-10 pt-6 border-t border-zinc-150 space-y-4">
          <p className="text-xs font-semibold text-zinc-800">{signoff}</p>
          <p className="text-sm font-bold text-zinc-900 uppercase tracking-wide">{name}</p>
        </div>
      </div>
    );
  }

  // TEMPLATE 2: MODERN CORPORATE
  if (activeTemplate === 'modern_corporate') {
    return (
      <div
        className={`w-full bg-white text-zinc-900 p-10 md:p-14 space-y-6 select-text text-left shadow-lg border border-zinc-200 rounded-sm ${className}`}
        style={{ fontFamily, fontSize, lineHeight }}
      >
        {/* Modern Accent Header */}
        <div data-cover-letter-header="true" className="flex items-start justify-between border-b-2 pb-6 mb-7" style={{ borderColor: themeColor }}>
          <div className="space-y-1.5">
            <h1 className="text-2.5xl font-black text-zinc-900 uppercase" style={{ color: themeColor }}>
              {name}
            </h1>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
              Application for {job.title || 'Target Role'}
            </p>
          </div>
          {contactParts.length > 0 && (
            <div className="text-xs font-semibold text-zinc-600 text-right space-y-1">
              {contactParts.map((part, idx) => (
                <div key={idx}>{part}</div>
              ))}
            </div>
          )}
        </div>

        {/* Date & Recipient Grid */}
        <div className="flex justify-between items-start my-6 text-xs">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider block">Recipient</span>
            <div className="font-bold text-zinc-900">{recipient}</div>
            <div className="font-semibold text-zinc-600">{company}</div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider block">Date</span>
            <div className="font-semibold text-zinc-700">{date}</div>
          </div>
        </div>

        {/* Salutation */}
        <div className="font-bold text-zinc-900 text-sm mt-6 mb-5">{salutation}</div>

        {/* Paragraphs */}
        <div data-cover-letter-content="true" className="space-y-5 my-6 w-full">
          {paragraphs.map((para, idx) => (
            <p key={idx} className="text-xs md:text-sm text-zinc-800 text-justify leading-relaxed font-normal" style={{ marginBottom: paragraphGap, lineHeight: 1.65 }}>
              {para}
            </p>
          ))}
        </div>

        {/* Signoff */}
        <div className="mt-10 pt-6 space-y-4 border-t border-zinc-150">
          <p className="text-xs font-semibold text-zinc-800">{signoff}</p>
          <p className="text-sm font-bold text-zinc-900 uppercase tracking-wide" style={{ color: themeColor }}>{name}</p>
        </div>
      </div>
    );
  }

  // TEMPLATE 3: EXECUTIVE PROFESSIONAL
  return (
    <div
      className={`w-full bg-white text-zinc-900 p-10 md:p-14 space-y-6 select-text text-left font-serif shadow-lg border border-zinc-200 rounded-sm ${className}`}
      style={{ fontFamily: 'Georgia, serif', fontSize, lineHeight }}
    >
      {/* Executive Header */}
      <div data-cover-letter-header="true" className="text-center border-b border-zinc-300 pb-6 mb-7 space-y-2">
        <h1 className="text-2.5xl font-bold tracking-widest text-zinc-900 uppercase">{name}</h1>
        {contactParts.length > 0 && (
          <div className="text-xs text-zinc-600 space-x-3 font-sans uppercase tracking-wider font-semibold">
            {contactParts.join('   |   ')}
          </div>
        )}
      </div>

      {/* Date & Recipient */}
      <div className="space-y-3 my-6 font-sans text-xs">
        <div className="text-zinc-600 italic">{date}</div>
        <div className="font-bold text-zinc-900">
          <div>{recipient}</div>
          <div className="font-normal text-zinc-600">{company}</div>
        </div>
      </div>

      {/* Salutation */}
      <div className="font-bold text-zinc-900 text-sm mt-6 mb-5">{salutation}</div>

      {/* Paragraphs */}
      <div data-cover-letter-content="true" className="space-y-5 my-6 w-full">
        {paragraphs.map((para, idx) => (
          <p key={idx} className="text-xs md:text-sm text-zinc-800 text-justify leading-relaxed font-normal" style={{ marginBottom: paragraphGap, lineHeight: 1.65 }}>
            {para}
          </p>
        ))}
      </div>

      {/* Signoff */}
      <div className="mt-10 pt-6 space-y-4 font-sans border-t border-zinc-150">
        <p className="text-xs font-semibold text-zinc-800">{signoff}</p>
        <p className="text-sm font-bold text-zinc-900 uppercase tracking-wider">{name}</p>
      </div>
    </div>
  );
}

export default CoverLetterRender;
