import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  CheckCircle2,
  Sparkles,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCcw,
  Undo2,
  Send,
  SlidersHorizontal,
  Layers,
  ChevronRight,
  ChevronDown,
  Check,
  RefreshCw,
  AlertCircle,
  X,
  Eye,
  StopCircle,
  ArrowLeft
} from 'lucide-react';

// Helper to format paragraphs cleanly
function formatParagraphs(text) {
  if (!text) return [];
  if (Array.isArray(text)) return text;
  return String(text).split('\n\n').filter(p => p.trim());
}

// -----------------------------------------------------------------------------
// VECTOR COVER LETTER RENDERER (Crisp 100% Vector DOM matching exact templates)
// -----------------------------------------------------------------------------
function CoverLetterVectorRender({ coverLetter, context, templateKey = 'classic_ats', settings = {} }) {
  if (!coverLetter) return null;

  const candidate = context?.candidate || {};
  const job = context?.job || {};

  const name = candidate.name || coverLetter.applicant_name || 'Candidate Name';
  const email = candidate.email || coverLetter.email || '';
  const phone = candidate.phone || coverLetter.phone || '';
  const location = candidate.location || coverLetter.location || '';

  const company = job.company || coverLetter.company_name || 'Hiring Company';
  const recipient = coverLetter.recipient_name || 'Hiring Manager';
  const salutation = coverLetter.salutation || 'Dear Hiring Manager,';
  const date = coverLetter.date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const signoff = coverLetter.signoff || 'Sincerely,';

  const rawText = typeof coverLetter === 'string'
    ? coverLetter
    : (coverLetter?.content || coverLetter?.body || (typeof generatedCoverLetter === 'object' ? generatedCoverLetter?.content : ''));

  // Extract body text excluding header/signoff if embedded
  let bodyText = rawText || '';
  if (salutation && bodyText.includes(salutation)) {
    bodyText = bodyText.split(salutation)[1] || bodyText;
  }
  if (signoff && bodyText.includes(signoff)) {
    bodyText = bodyText.split(signoff)[0] || bodyText;
  }

  const paragraphs = formatParagraphs(bodyText);

  const themeColor = settings.theme_color || (templateKey === 'modern_corporate' ? '#1d4ed8' : '#0f172a');
  const fontFamily = settings.font || (templateKey === 'executive_professional' ? 'Georgia, serif' : 'Inter, sans-serif');
  const fontSize = settings.font_size ? `${settings.font_size}pt` : '10.5pt';
  const lineHeight = settings.line_height || 1.5;
  const paragraphGap = settings.paragraph_spacing ? `${settings.paragraph_spacing}px` : '14px';

  // TEMPLATE 1: CLASSIC ATS (Clean, left-aligned, maximum parser compatibility)
  if (templateKey === 'classic_ats') {
    return (
      <div
        className="w-full bg-white text-zinc-900 p-12 space-y-6 select-text text-left"
        style={{ fontFamily, fontSize, lineHeight }}
      >
        {/* Header */}
        <div className="border-b border-zinc-900 pb-4 space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 uppercase">{name}</h1>
          <div className="text-[10px] text-zinc-600 space-x-2 font-medium">
            {email && <span>{email}</span>}
            {phone && <span>· {phone}</span>}
            {location && <span>· {location}</span>}
          </div>
        </div>

        {/* Date & Recipient */}
        <div className="space-y-3 pt-2">
          <div className="text-xs font-semibold text-zinc-600">{date}</div>
          <div className="text-xs font-bold text-zinc-800 leading-snug">
            <div>{recipient}</div>
            <div className="font-semibold text-zinc-600">{company}</div>
          </div>
        </div>

        {/* Salutation */}
        <div className="font-bold text-zinc-900 text-xs pt-1">{salutation}</div>

        {/* Paragraphs */}
        <div className="space-y-4">
          {paragraphs.map((para, idx) => (
            <p key={idx} className="text-xs text-zinc-800 text-justify leading-relaxed" style={{ marginBottom: paragraphGap }}>
              {para}
            </p>
          ))}
        </div>

        {/* Signoff */}
        <div className="pt-6 space-y-3">
          <p className="text-xs font-semibold text-zinc-800">{signoff}</p>
          <p className="text-xs font-bold text-zinc-900 uppercase">{name}</p>
        </div>
      </div>
    );
  }

  // TEMPLATE 2: MODERN CORPORATE (Subtle blue accent bar, modern header, clean divider)
  if (templateKey === 'modern_corporate') {
    return (
      <div
        className="w-full bg-white text-zinc-900 p-12 space-y-6 select-text text-left"
        style={{ fontFamily, fontSize, lineHeight }}
      >
        {/* Modern Accent Header */}
        <div className="flex items-start justify-between border-b-2 pb-5" style={{ borderColor: themeColor }}>
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-zinc-900" style={{ color: themeColor }}>
              {name}
            </h1>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
              Application for {job.title || 'Target Role'}
            </p>
          </div>
          <div className="text-[10px] font-semibold text-zinc-600 text-right space-y-0.5">
            {email && <div>{email}</div>}
            {phone && <div>{phone}</div>}
            {location && <div>{location}</div>}
          </div>
        </div>

        {/* Date & Recipient Grid */}
        <div className="flex justify-between items-start pt-2 text-xs">
          <div className="space-y-0.5">
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
        <div className="font-bold text-zinc-900 text-xs pt-2">{salutation}</div>

        {/* Paragraphs */}
        <div className="space-y-4">
          {paragraphs.map((para, idx) => (
            <p key={idx} className="text-xs text-zinc-800 text-justify leading-relaxed" style={{ marginBottom: paragraphGap }}>
              {para}
            </p>
          ))}
        </div>

        {/* Signoff */}
        <div className="pt-6 space-y-4 border-t border-zinc-100">
          <p className="text-xs font-semibold text-zinc-800">{signoff}</p>
          <p className="text-xs font-bold text-zinc-900" style={{ color: themeColor }}>{name}</p>
        </div>
      </div>
    );
  }

  // TEMPLATE 3: EXECUTIVE PROFESSIONAL (Refined typography, formal spacing, premium header)
  return (
    <div
      className="w-full bg-white text-zinc-900 p-12 space-y-6 select-text text-left font-serif"
      style={{ fontFamily: 'Georgia, serif', fontSize, lineHeight }}
    >
      {/* Executive Header */}
      <div className="text-center border-b border-zinc-300 pb-5 space-y-1.5">
        <h1 className="text-2xl font-bold tracking-widest text-zinc-900 uppercase">{name}</h1>
        <div className="text-[10px] text-zinc-600 space-x-3 font-sans uppercase tracking-wider font-semibold">
          {email && <span>{email}</span>}
          {phone && <span>| {phone}</span>}
          {location && <span>| {location}</span>}
        </div>
      </div>

      {/* Date & Recipient */}
      <div className="space-y-3 pt-2 font-sans">
        <div className="text-xs text-zinc-600 italic">{date}</div>
        <div className="text-xs font-bold text-zinc-900">
          <div>{recipient}</div>
          <div className="font-normal text-zinc-600">{company}</div>
        </div>
      </div>

      {/* Salutation */}
      <div className="font-bold text-zinc-900 text-xs pt-1">{salutation}</div>

      {/* Paragraphs */}
      <div className="space-y-4">
        {paragraphs.map((para, idx) => (
          <p key={idx} className="text-xs text-zinc-800 text-justify leading-relaxed" style={{ marginBottom: paragraphGap }}>
            {para}
          </p>
        ))}
      </div>

      {/* Signoff */}
      <div className="pt-8 space-y-4 font-sans">
        <p className="text-xs font-semibold text-zinc-800">{signoff}</p>
        <p className="text-xs font-bold text-zinc-900 uppercase tracking-wider">{name}</p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// MAIN COVER LETTER STUDIO PAGE
// -----------------------------------------------------------------------------
export default function CoverLetterPage() {
  const navigate = useNavigate();
  const {
    coverLetter,
    coverLetterContext,
    coverLetterStrategy,
    generatedCoverLetter,
    coverLetterReview,
    coverLetterEditHistory = [],
    coverLetterEditStreaming = false,
    companyName,
    apiUrl,
    handleDownloadCoverLetterPDF,
    loading,
    loadingProgress,
    loadingMessage,
    handleGenerateCoverLetter,
    handleBuildCoverLetterStrategy,
    handleGenerateFirstCoverLetterDraft,
    handleEditCoverLetter,
    handleUndoCoverLetterEdit,
    handleRestoreCoverLetterEdit
  } = useApp();

  // Essential Presentation Settings
  const [selectedTemplate, setSelectedTemplate] = useState('classic_ats'); // 'classic_ats' | 'modern_corporate' | 'executive_professional'
  const [pageSize, setPageSize] = useState('A4');
  const [density, setDensity] = useState('standard'); // 'compact' | 'standard' | 'spacious'
  const [themeColor, setThemeColor] = useState('#1d4ed8');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Advanced Layout Settings
  const [font, setFont] = useState('Inter');
  const [fontSize, setFontSize] = useState(10.5);
  const [lineHeight, setLineHeight] = useState(1.5);
  const [paragraphSpacing, setParagraphSpacing] = useState(14);
  const [pageMargin, setPageMargin] = useState(20);

  // Preview Workspace States
  const [zoom, setZoom] = useState(1.0);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState('');
  const [pdfBlob, setPdfBlob] = useState(null);
  const [isRenderingPdf, setIsRenderingPdf] = useState(false);
  const [renderError, setRenderError] = useState('');

  // AI Editor States
  const [editPrompt, setEditPrompt] = useState('');
  const [activeSectionScroll, setActiveSectionScroll] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const previewWrapperRef = useRef(null);

  // Derived settings payload for backend Playwright rendering
  const currentSettings = useMemo(() => {
    const spacingProfileMap = {
      compact: 'compact',
      standard: 'balanced',
      spacious: 'comfortable'
    };
    return {
      selected_template: selectedTemplate,
      paper_size: pageSize,
      font: font || 'Arial',
      font_size: fontSize,
      theme_color: themeColor,
      paragraph_spacing: paragraphSpacing,
      line_height: lineHeight,
      page_margin: pageMargin,
      page_mode: 'auto',
      spacing_profile: spacingProfileMap[density] || 'balanced',
      margin_profile: 'standard'
    };
  }, [selectedTemplate, pageSize, font, fontSize, themeColor, paragraphSpacing, lineHeight, pageMargin, density]);

  // Background PDF Parity Generator
  useEffect(() => {
    if (!generatedCoverLetter || !coverLetterContext) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsRenderingPdf(true);
      setRenderError('');
      try {
        const response = await fetch(`${apiUrl}/api/cover-letter/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            context: coverLetterContext,
            generated_cover_letter: generatedCoverLetter,
            settings: currentSettings
          })
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => ({}));
          const detail = failure.detail;
          throw new Error(
            typeof detail === 'string'
              ? detail
              : detail?.message
                ? `${detail.message}${
                    detail.issues?.length
                      ? ` Issues: ${detail.issues.join(', ')}`
                      : ''
                  }`
                : 'Cover letter PDF generation failed.'
          );
        }
        const blob = await response.blob();
        const nextUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(previous => {
          if (previous) URL.revokeObjectURL(previous);
          return nextUrl;
        });
        setPdfBlob(blob);
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.warn("Cover letter PDF render error:", error);
          setRenderError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) setIsRenderingPdf(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiUrl, coverLetterContext, generatedCoverLetter, currentSettings]);

  // Clean up blob URL on unmount
  useEffect(() => () => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
  }, [pdfBlobUrl]);

  // Fit Width helper
  const handleFitWidth = () => {
    if (!previewWrapperRef.current) return;
    const containerWidth = previewWrapperRef.current.clientWidth;
    const targetScale = (containerWidth - 60) / 816;
    setZoom(Math.max(0.4, Math.min(1.8, targetScale)));
  };

  // Auto-fit width on mount
  useEffect(() => {
    handleFitWidth();
  }, []);

  // Download exact verified PDF
  const handleDownloadExactPDF = () => {
    if (!pdfBlobUrl && !pdfBlob) return;
    const candidate = coverLetterContext?.candidate?.name || 'Candidate';
    const company = coverLetterContext?.job?.company || 'Company';
    const clean = value => String(value).replace(/[^A-Za-z0-9_-]+/g, '_');
    const link = document.createElement('a');
    link.href = pdfBlobUrl;
    link.download = `${clean(candidate)}_${clean(company)}_Cover_Letter.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Submit AI Edit prompt
  const handleAIEditSubmit = async (e) => {
    e.preventDefault();
    if (!editPrompt.trim() || coverLetterEditStreaming) return;
    const promptToSend = editPrompt;
    setEditPrompt('');
    await handleEditCoverLetter(promptToSend);
  };

  // Quick prompt chip selection
  const handleApplyQuickPrompt = (promptText) => {
    setEditPrompt(promptText);
  };

  // If letter not yet generated, render drafting pipeline step
  if (!generatedCoverLetter) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white text-zinc-900 rounded-2xl border border-zinc-200 shadow-sm max-w-3xl mx-auto my-8 text-center space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-[#00bda5]/10 border border-[#00bda5]/30 flex items-center justify-center text-[#00bda5] mx-auto">
          <FileText size={28} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-zinc-900 tracking-tight">Generate Tailored Cover Letter</h2>
          <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
            Craft a personalized, high-converting cover letter aligned to your active resume and the target position.
          </p>
        </div>

        {loading ? (
          <div className="w-full max-w-md bg-zinc-50 border border-zinc-200 p-6 rounded-2xl space-y-3 text-center shadow-xs">
            <div className="flex items-center justify-center gap-2 text-xs font-black text-zinc-800 uppercase tracking-wider">
              <RefreshCw size={16} className="animate-spin text-[#00bda5]" />
              <span>{loadingMessage || "Drafting custom cover letter prose..."}</span>
            </div>
            <div className="w-full h-2 bg-zinc-200 rounded-full overflow-hidden">
              <div className="h-full bg-[#00bda5] transition-all duration-300" style={{ width: `${loadingProgress || 35}%` }} />
            </div>
            <span className="text-[10px] text-zinc-400 font-bold block">{loadingProgress || 35}% complete</span>
          </div>
        ) : (
          <button
            onClick={() => handleGenerateFirstCoverLetterDraft && handleGenerateFirstCoverLetterDraft()}
            className="px-6 py-3 bg-[#00bda5] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-[#00a894] transition cursor-pointer shadow-lg shadow-[#00bda5]/20"
          >
            Draft Cover Letter Now
          </button>
        )}
      </div>
    );
  }

  const activeContent = generatedCoverLetter.content || coverLetter || {};

  return (
    <div className="flex-1 flex min-h-[750px] h-[calc(100vh-140px)] w-full bg-zinc-900 overflow-hidden relative rounded-2xl border border-zinc-800 shadow-2xl">
      
      {/* LEFT PANEL (38% WIDTH): STRUCTURE, TEMPLATES, CONTROLS & AI CHAT */}
      <div className="w-[38%] min-w-[420px] max-w-[500px] border-r border-zinc-200 bg-white flex flex-col h-full shrink-0 z-10 shadow-lg">
        
        {/* Top Header */}
        <div className="p-4 border-b border-zinc-200 flex items-center justify-between shrink-0 bg-zinc-50">
          <div>
            <h2 className="text-sm font-black text-zinc-900 uppercase tracking-tight flex items-center gap-2">
              <FileText size={16} className="text-[#00bda5]" />
              Cover Letter Studio
            </h2>
            <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">Customize template & edit with AI</p>
          </div>

          <button
            onClick={() => navigate('/templates')}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-zinc-300 text-zinc-700 font-extrabold text-[10px] uppercase tracking-wider rounded-lg hover:bg-zinc-100 transition cursor-pointer"
          >
            <ArrowLeft size={12} /> Back
          </button>
        </div>

        {/* Scrollable Controls & AI Editor Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
          
          {/* COMPACT REVIEW STATUS BADGE */}
          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <div className="text-xs font-bold text-emerald-900">
                Review Passed
                {coverLetterReview?.issues_fixed?.length ? (
                  <span className="text-[10px] font-semibold text-emerald-700 block">
                    {coverLetterReview.issues_fixed.length} Improvements Applied
                  </span>
                ) : null}
              </div>
            </div>
            {coverLetterReview && (
              <button
                onClick={() => setShowReviewModal(true)}
                className="px-2.5 py-1 bg-white border border-emerald-300 text-emerald-800 text-[10px] font-bold rounded-lg hover:bg-emerald-100 transition cursor-pointer"
              >
                View Details
              </button>
            )}
          </div>

          {/* TEMPLATE SELECTION (3 Visual Thumbnails) */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block">
              1. Choose Template
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'classic_ats', label: 'Classic ATS', tag: 'B&W Standard' },
                { id: 'modern_corporate', label: 'Modern Corporate', tag: 'Blue Accent' },
                { id: 'executive_professional', label: 'Executive', tag: 'Serif Formal' }
              ].map(tpl => {
                const isSelected = selectedTemplate === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    onClick={() => setSelectedTemplate(tpl.id)}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer relative ${
                      isSelected
                        ? 'bg-[#00bda5]/10 border-[#00bda5] text-[#00bda5] shadow-xs'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100'
                    }`}
                  >
                    {/* Mini Visual Preview Graphic */}
                    <div className={`w-full h-12 rounded-lg border mb-2 p-1.5 flex flex-col justify-between ${
                      isSelected ? 'bg-white border-[#00bda5]/40' : 'bg-white border-zinc-200'
                    }`}>
                      <div className="w-full flex items-center justify-between">
                        <div className={`h-1.5 rounded-full ${tpl.id === 'modern_corporate' ? 'bg-blue-600 w-1/2' : 'bg-zinc-800 w-1/3'}`} />
                        <div className="h-1 w-1/4 bg-zinc-300 rounded-full" />
                      </div>
                      <div className="space-y-1">
                        <div className="h-1 w-full bg-zinc-200 rounded-full" />
                        <div className="h-1 w-4/5 bg-zinc-200 rounded-full" />
                      </div>
                    </div>

                    <div className="text-xs font-black truncate">{tpl.label}</div>
                    <div className="text-[9px] font-semibold text-zinc-400 truncate">{tpl.tag}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ESSENTIAL CUSTOMIZATION CONTROLS */}
          <div className="space-y-3 bg-zinc-50 border border-zinc-200 p-3.5 rounded-xl">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block">
              2. Essential Options
            </label>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* Paper Size */}
              <div>
                <span className="text-[10px] font-bold text-zinc-600 block mb-1">Paper Size</span>
                <div className="flex rounded-lg border border-zinc-300 bg-white p-0.5">
                  {['A4', 'Letter'].map(sz => (
                    <button
                      key={sz}
                      onClick={() => setPageSize(sz)}
                      className={`flex-1 py-1 text-[11px] font-extrabold rounded-md transition cursor-pointer border-none ${
                        pageSize === sz ? 'bg-[#00bda5] text-white' : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {/* Layout Density */}
              <div>
                <span className="text-[10px] font-bold text-zinc-600 block mb-1">Spacing Density</span>
                <select
                  value={density}
                  onChange={(e) => setDensity(e.target.value)}
                  className="w-full p-1.5 bg-white border border-zinc-300 rounded-lg text-xs font-bold text-zinc-800 focus:outline-none cursor-pointer"
                >
                  <option value="compact">Compact</option>
                  <option value="standard">Standard</option>
                  <option value="spacious">Spacious</option>
                </select>
              </div>
            </div>

            {/* Accent Color (where supported) */}
            {selectedTemplate === 'modern_corporate' && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] font-bold text-zinc-600">Accent Theme Color</span>
                <input
                  type="color"
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  className="w-8 h-7 bg-transparent border-none cursor-pointer rounded"
                />
              </div>
            )}

            {/* Collapsible Advanced Layout Toggle */}
            <div className="pt-2 border-t border-zinc-200">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer border-none bg-transparent"
              >
                <SlidersHorizontal size={12} />
                {showAdvanced ? 'Hide Advanced Layout' : 'Advanced Layout (Fonts, Margins, Spacing)'}
                {showAdvanced ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            </div>

            {/* ADVANCED LAYOUT CONTROLS (COLLAPSED BY DEFAULT) */}
            {showAdvanced && (
              <div className="space-y-3 pt-2 text-xs border-t border-zinc-200/80 animate-fade-in">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 block mb-1">Font</span>
                    <select
                      value={font}
                      onChange={(e) => setFont(e.target.value)}
                      className="w-full p-1 bg-white border border-zinc-300 rounded text-xs"
                    >
                      <option value="Inter">Inter (Sans)</option>
                      <option value="Arial">Arial</option>
                      <option value="Calibri">Calibri</option>
                      <option value="Georgia">Georgia (Serif)</option>
                      <option value="Times New Roman">Times New Roman</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 block mb-1">Font Size: {fontSize}pt</span>
                    <input
                      type="range"
                      min="9"
                      max="12.5"
                      step="0.5"
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 block mb-1">Line Height: {lineHeight}</span>
                    <input
                      type="range"
                      min="1.25"
                      max="1.7"
                      step="0.05"
                      value={lineHeight}
                      onChange={(e) => setLineHeight(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 block mb-1">Paragraph Gap: {paragraphSpacing}px</span>
                    <input
                      type="range"
                      min="8"
                      max="22"
                      step="1"
                      value={paragraphSpacing}
                      onChange={(e) => setParagraphSpacing(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* INTEGRATED AI CHAT EDITOR */}
          <div className="space-y-3 bg-indigo-50/60 border border-indigo-200 p-4 rounded-xl">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="text-indigo-600" />
                3. AI Editor Studio
              </label>

              {coverLetterEditHistory.length > 0 && (
                <button
                  onClick={handleUndoCoverLetterEdit}
                  disabled={coverLetterEditStreaming}
                  className="px-2 py-1 bg-white border border-indigo-200 text-indigo-700 text-[10px] font-extrabold rounded-lg hover:bg-white transition cursor-pointer flex items-center gap-1 disabled:opacity-40"
                >
                  <Undo2 size={11} /> Undo
                </button>
              )}
            </div>

            {/* Quick Prompt Action Chips */}
            <div className="flex flex-wrap gap-1.5">
              {[
                "Make it shorter",
                "Make opening stronger",
                "Focus on internship",
                "Rewrite paragraph 3",
                "Use formal tone"
              ].map(chip => (
                <button
                  key={chip}
                  onClick={() => handleApplyQuickPrompt(chip)}
                  className="px-2.5 py-1 bg-white hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-[10px] font-bold rounded-full transition cursor-pointer shadow-2xs"
                >
                  + {chip}
                </button>
              ))}
            </div>

            {/* Streaming Indicator */}
            {coverLetterEditStreaming && (
              <div className="p-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold flex items-center justify-between animate-pulse">
                <span className="flex items-center gap-2">
                  <RefreshCw size={13} className="animate-spin" /> Rewriting paragraph & updating preview...
                </span>
              </div>
            )}

            {/* AI Prompt Input Form */}
            <form onSubmit={handleAIEditSubmit} className="space-y-2">
              <textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                disabled={coverLetterEditStreaming}
                placeholder="Tell AI how to improve this cover letter (e.g. 'Make paragraph 2 more impactful')..."
                className="w-full h-20 p-3 bg-white border border-indigo-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-600 font-medium resize-none shadow-2xs"
              />
              <button
                type="submit"
                disabled={!editPrompt.trim() || coverLetterEditStreaming}
                className="w-full py-2.5 bg-indigo-600 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-indigo-700 transition cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Send size={13} /> Apply AI Edit
              </button>
            </form>

          </div>

          {/* COVER LETTER STRUCTURE NAVIGATION */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider block">
              Document Structure
            </label>
            <div className="grid grid-cols-2 gap-1.5 text-xs font-bold text-zinc-700">
              {[
                "Header Info",
                "Recipient Details",
                "Greeting / Salutation",
                "Opening Paragraph",
                "Main Evidence",
                "Company Alignment",
                "Closing & Call to Action",
                "Sign-off & Signature"
              ].map((sec, idx) => (
                <div key={idx} className="p-2 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center gap-2 hover:bg-zinc-100 transition cursor-pointer">
                  <span className="w-4 h-4 rounded bg-zinc-200 text-zinc-700 text-[10px] font-black flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="truncate text-[11px]">{sec}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* RIGHT PANEL (62% WIDTH): LARGE EXACT PREVIEW WORKSPACE */}
      <div className="flex-1 flex flex-col h-full relative min-w-0 bg-zinc-950">
        
        {/* CUSTOM PREVIEW CONTROLS TOOLBAR */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-3 flex items-center justify-between shrink-0 text-white shadow-md z-20">
          
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1 rounded-lg">
              <CheckCircle2 size={13} /> Exact PDF Preview
            </span>
            {isRenderingPdf && (
              <span className="text-[10px] font-bold text-zinc-400 animate-pulse">
                Applying template…
              </span>
            )}
          </div>

          {/* Zoom Controls Toolbar */}
          <div className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
            <button
              onClick={() => setZoom(prev => Math.max(0.4, prev - 0.1))}
              className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer border-none bg-transparent"
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>

            <span className="text-[10px] font-black text-zinc-300 w-12 text-center select-none uppercase tracking-wider">
              {Math.round(zoom * 100)}%
            </span>

            <button
              onClick={() => setZoom(prev => Math.min(1.8, prev + 0.1))}
              className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer border-none bg-transparent"
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>

            <div className="w-px h-4 bg-zinc-800 mx-1" />

            <button
              onClick={handleFitWidth}
              className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-200 text-[10px] font-extrabold transition cursor-pointer border-none"
            >
              Fit Width
            </button>

            <button
              onClick={() => setShowFullscreen(true)}
              className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition cursor-pointer border-none bg-transparent"
              title="Fullscreen"
            >
              <Maximize size={14} />
            </button>
          </div>

          {/* Download Exact PDF Button */}
          <button
            onClick={handleDownloadExactPDF}
            disabled={isRenderingPdf || coverLetterEditStreaming}
            className="flex items-center gap-2 px-5 py-2 bg-[#00bda5] text-white font-black text-xs uppercase tracking-wider rounded-xl hover:bg-[#00a894] active:scale-95 transition cursor-pointer shadow-lg shadow-[#00bda5]/20 disabled:opacity-50"
          >
            <Download size={15} />
            Download PDF
          </button>
        </div>

        {/* SCALED PREVIEW CANVAS WORKSPACE */}
        <div
          ref={previewWrapperRef}
          className="flex-1 bg-zinc-950 overflow-auto flex justify-center items-start p-8 custom-scrollbar relative"
        >
          
          {/* Exact PDF Canvas Document (LIVE PREVIEW = DOWNLOADED PDF) */}
          <div
            className="origin-top transition-transform duration-200 ease-out shadow-2xl bg-white rounded-sm relative overflow-hidden"
            style={{
              width: '816px',
              height: '1056px',
              transform: `scale(${zoom})`,
              transformOrigin: 'top center'
            }}
          >
            {isRenderingPdf && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-xs z-30 flex flex-col items-center justify-center gap-2">
                <RefreshCw size={24} className="animate-spin text-[#00bda5]" />
                <span className="text-xs font-bold text-zinc-800">Applying template…</span>
              </div>
            )}

            {pdfBlobUrl ? (
              <iframe
                title="Exact Cover Letter PDF Artifact Preview"
                src={`${pdfBlobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                className="w-full h-full border-none pointer-events-auto"
              />
            ) : (
              <CoverLetterVectorRender
                coverLetter={activeContent}
                context={coverLetterContext}
                templateKey={selectedTemplate}
                settings={currentSettings}
              />
            )}
          </div>

        </div>

      </div>

      {/* FULLSCREEN PREVIEW MODAL */}
      {showFullscreen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xs z-50 flex flex-col animate-fade-in">
          <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between shrink-0 text-white">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#00bda5]">Full View Preview Studio</h3>
            <button onClick={() => setShowFullscreen(false)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white cursor-pointer">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 bg-zinc-950 overflow-auto p-8 flex justify-center items-start">
            <div className="w-[816px] min-h-[1056px] bg-white shadow-2xl rounded-sm p-12 text-zinc-900">
              <CoverLetterVectorRender
                coverLetter={activeContent}
                context={coverLetterContext}
                templateKey={selectedTemplate}
                settings={currentSettings}
              />
            </div>
          </div>
        </div>
      )}

      {/* REVIEW DETAILS MODAL */}
      {showReviewModal && coverLetterReview && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 p-6 rounded-2xl max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-zinc-900">Review Breakdown</h3>
              <button onClick={() => setShowReviewModal(false)} className="text-zinc-400 hover:text-zinc-700">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900">
                <b>Recruiter Review Summary:</b> {coverLetterReview.review_summary}
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-zinc-500 block mb-1">Improvements Applied:</span>
                <ul className="space-y-1 list-disc pl-4 text-zinc-700">
                  {coverLetterReview.issues_fixed.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
