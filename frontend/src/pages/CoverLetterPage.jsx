import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import CoverLetterView from '../components/CoverLetterView';
import { useNavigate } from 'react-router-dom';

function CoverLetterPage() {
  const navigate = useNavigate();
  const {
    coverLetter,
    coverLetterContext,
    coverLetterStrategy,
    generatedCoverLetter,
    coverLetterReview,
    coverLetterEditHistory,
    coverLetterEditStreaming,
    companyName,
    apiUrl,
    handleCopyToClipboard,
    handleDownloadCoverLetterPDF,
    loading,
    handleGenerateCoverLetter,
    handleBuildCoverLetterStrategy,
    handleGenerateFirstCoverLetterDraft,
    handleEditCoverLetter,
    handleUndoCoverLetterEdit,
    handleRestoreCoverLetterEdit
  } = useApp();
  const [contextAnswers, setContextAnswers] = useState({});
  const [skippedQuestions, setSkippedQuestions] = useState([]);
  const [editPrompt, setEditPrompt] = useState('');
  const [presentationSettings, setPresentationSettings] = useState({
    selected_template: 'classic_ats',
    font: 'Arial',
    theme_color: '#1d4ed8',
    font_size: 11,
    paragraph_spacing: 12,
    line_height: 1.5,
    page_margin: 20,
    paper_size: 'A4',
    page_mode: 'auto',
    spacing_profile: 'balanced',
    margin_profile: 'standard'
  });
  const [coverLetterPdfUrl, setCoverLetterPdfUrl] = useState('');
  const [coverLetterPdfBlob, setCoverLetterPdfBlob] = useState(null);
  const [coverLetterPageCount, setCoverLetterPageCount] = useState(0);
  const [coverLetterRenderError, setCoverLetterRenderError] = useState('');
  const [coverLetterRendering, setCoverLetterRendering] = useState(false);

  useEffect(() => {
    if (!generatedCoverLetter || !coverLetterContext || !coverLetterReview) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCoverLetterRendering(true);
      setCoverLetterRenderError('');
      try {
        const response = await fetch(`${apiUrl}/api/cover-letter/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            context: coverLetterContext,
            generated_cover_letter: generatedCoverLetter,
            settings: presentationSettings
          })
        });
        if (!response.ok) {
          const failure = await response.json().catch(() => ({}));
          throw new Error(failure.detail || 'Cover letter preview failed.');
        }
        const blob = await response.blob();
        const nextUrl = URL.createObjectURL(blob);
        setCoverLetterPdfUrl(previous => {
          if (previous) URL.revokeObjectURL(previous);
          return nextUrl;
        });
        setCoverLetterPdfBlob(blob);
        setCoverLetterPageCount(Number(response.headers.get('X-Cover-Letter-Pages') || 1));
      } catch (error) {
        if (error.name !== 'AbortError') {
          setCoverLetterRenderError(error.message);
          setCoverLetterPdfBlob(null);
        }
      } finally {
        if (!controller.signal.aborted) setCoverLetterRendering(false);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    apiUrl,
    coverLetterContext,
    coverLetterReview,
    generatedCoverLetter,
    presentationSettings
  ]);

  useEffect(() => () => {
    if (coverLetterPdfUrl) URL.revokeObjectURL(coverLetterPdfUrl);
  }, [coverLetterPdfUrl]);

  const updatePresentation = (key, value) => {
    setPresentationSettings(previous => ({ ...previous, [key]: value }));
  };

  const downloadRenderedCoverLetter = () => {
    if (!coverLetterPdfBlob || !coverLetterPdfUrl) return;
    const candidate = coverLetterContext?.candidate?.name || 'Candidate';
    const company = coverLetterContext?.job?.company || 'Company';
    const clean = value => String(value).replace(/[^A-Za-z0-9_-]+/g, '_');
    const link = document.createElement('a');
    link.href = coverLetterPdfUrl;
    link.download = `${clean(candidate)}_${clean(company)}_Cover_Letter.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (generatedCoverLetter) {
    return (
      <div className="grid flex-1 min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900">{generatedCoverLetter.title}</h2>
              {coverLetterReview ? (
                <p className="mt-1 text-xs font-bold text-emerald-700">
                  ✓ Review Complete · {coverLetterReview.issues_fixed.length
                    ? `${coverLetterReview.issues_fixed.length} Improvements Applied`
                    : 'No Issues'}
                </p>
              ) : (
                <p className="mt-1 text-xs font-bold text-amber-700">Review pending</p>
              )}
            </div>
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600">
              {generatedCoverLetter.word_count} words · {generatedCoverLetter.paragraph_count} paragraphs
            </div>
          </div>
          {coverLetterReview && (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-900">
              <b>Recruiter review: {coverLetterReview.review_score}/100.</b>{' '}
              {coverLetterReview.review_summary}
            </div>
          )}
          {coverLetterReview && (
            <>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {[
                  ['classic_ats', 'Classic ATS', 'Maximum compatibility'],
                  ['modern_corporate', 'Modern Corporate', 'Enterprise blue accent'],
                  ['executive_professional', 'Executive Professional', 'Premium formal layout']
                ].map(([value, label, description]) => (
                  <button type="button" key={value}
                    onClick={() => updatePresentation('selected_template', value)}
                    className={`rounded-xl border p-3 text-left ${
                      presentationSettings.selected_template === value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 bg-white'
                    }`}>
                    <div className="text-xs font-black text-slate-800">{label}</div>
                    <div className="mt-1 text-[10px] text-slate-500">{description}</div>
                  </button>
                ))}
              </div>
              <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
                <label className="text-[10px] font-bold text-slate-600">
                  Font
                  <select value={presentationSettings.font}
                    onChange={event => updatePresentation('font', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs">
                    {['Arial', 'Calibri', 'Georgia', 'Times New Roman'].map(font => (
                      <option key={font}>{font}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] font-bold text-slate-600">
                  Page mode
                  <select value={presentationSettings.page_mode}
                    onChange={event => updatePresentation('page_mode', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs">
                    <option value="auto">Auto</option>
                    <option value="force_one_page">Force one page</option>
                    <option value="allow_two_pages">Allow two pages</option>
                  </select>
                </label>
                <label className="text-[10px] font-bold text-slate-600">
                  Paper
                  <select value={presentationSettings.paper_size}
                    onChange={event => updatePresentation('paper_size', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs">
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                  </select>
                </label>
                <label className="text-[10px] font-bold text-slate-600">
                  Accent
                  <input type="color" value={presentationSettings.theme_color}
                    onChange={event => updatePresentation('theme_color', event.target.value)}
                    className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white p-1" />
                </label>
                <label className="text-[10px] font-bold text-slate-600">
                  Font size: {presentationSettings.font_size}pt
                  <input type="range" min="9" max="13" step="0.5"
                    value={presentationSettings.font_size}
                    onChange={event => updatePresentation('font_size', Number(event.target.value))}
                    className="mt-2 w-full" />
                </label>
                <label className="text-[10px] font-bold text-slate-600">
                  Paragraph spacing: {presentationSettings.paragraph_spacing}px
                  <input type="range" min="6" max="24" step="1"
                    value={presentationSettings.paragraph_spacing}
                    onChange={event => updatePresentation('paragraph_spacing', Number(event.target.value))}
                    className="mt-2 w-full" />
                </label>
                <label className="text-[10px] font-bold text-slate-600">
                  Line height: {presentationSettings.line_height}
                  <input type="range" min="1.25" max="1.8" step="0.05"
                    value={presentationSettings.line_height}
                    onChange={event => updatePresentation('line_height', Number(event.target.value))}
                    className="mt-2 w-full" />
                </label>
                <label className="text-[10px] font-bold text-slate-600">
                  Margins: {presentationSettings.page_margin}mm
                  <input type="range" min="12" max="32" step="1"
                    value={presentationSettings.page_margin}
                    onChange={event => updatePresentation('page_margin', Number(event.target.value))}
                    className="mt-2 w-full" />
                </label>
              </div>
              {coverLetterRenderError && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                  {coverLetterRenderError}
                  {presentationSettings.page_mode === 'force_one_page' && (
                    <button type="button"
                      onClick={() => updatePresentation('page_mode', 'auto')}
                      className="ml-2 border-0 bg-transparent p-0 font-black underline">
                      Switch to AUTO
                    </button>
                  )}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs font-bold text-slate-600">
                  {coverLetterRendering
                    ? 'Rendering exact PDF preview…'
                    : coverLetterPageCount
                      ? `${coverLetterPageCount}-page PDF preview`
                      : 'Preparing preview'}
                </div>
                <button type="button" onClick={downloadRenderedCoverLetter}
                  disabled={!coverLetterPdfBlob || coverLetterRendering}
                  className="rounded-xl border-0 bg-emerald-700 px-4 py-2 text-xs font-extrabold uppercase text-white disabled:opacity-50">
                  Download this exact PDF
                </button>
              </div>
              {coverLetterPdfUrl && !coverLetterRenderError && (
                <iframe title="Exact cover letter PDF preview"
                  src={coverLetterPdfUrl}
                  className="mt-3 h-[760px] w-full rounded-xl border border-slate-300 bg-slate-100" />
              )}
            </>
          )}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-[10px] font-black uppercase text-slate-400">Evidence used</div>
              <ul className="mt-2 space-y-2 text-xs text-slate-700">
                {(generatedCoverLetter.selected_evidence || []).map(item => (
                  <li key={item.evidence_id}><b>{item.source_section}</b> — {item.reason}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-[10px] font-black uppercase text-slate-400">Generation metadata</div>
              <div className="mt-2 text-xs text-slate-700">
                <b>Keywords:</b> {(generatedCoverLetter.used_keywords || []).join(', ') || 'None'}
              </div>
            </div>
          </div>
        </div>
        <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900">AI Editor</h3>
              <p className="mt-1 text-[10px] text-slate-500">Edits only the requested portions.</p>
            </div>
            <button type="button"
              onClick={handleUndoCoverLetterEdit}
              disabled={!coverLetterEditHistory.length || coverLetterEditStreaming}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-40">
              Undo
            </button>
          </div>
          <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
            {!coverLetterEditHistory.length && (
              <div className="rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
                Try “Make it shorter”, “Improve paragraph 2”, or “Emphasize Databricks”.
              </div>
            )}
            {coverLetterEditHistory.map((edit, index) => (
              <button type="button" key={edit.edit_id}
                onClick={() => handleRestoreCoverLetterEdit(edit.edit_id)}
                className={`w-full rounded-xl border border-slate-200 bg-white p-3 text-left ${edit.undone ? 'opacity-60' : ''}`}>
                <div className="text-[10px] font-black text-indigo-700">Edit {index + 1}</div>
                <div className="mt-1 text-xs font-bold text-slate-700">{edit.user_prompt}</div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {edit.undone ? 'Undone · Click to restore' : edit.review_summary}
                </div>
              </button>
            ))}
          </div>
          <form className="mt-4"
            onSubmit={async event => {
              event.preventDefault();
              if (await handleEditCoverLetter(editPrompt)) setEditPrompt('');
            }}>
            <textarea value={editPrompt}
              onChange={event => setEditPrompt(event.target.value)}
              disabled={coverLetterEditStreaming}
              placeholder="Tell AI what to change…"
              className="h-24 w-full resize-none rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-indigo-500" />
            <button type="submit"
              disabled={!editPrompt.trim() || coverLetterEditStreaming}
              className="mt-2 w-full rounded-xl border-0 bg-indigo-700 px-4 py-3 text-xs font-extrabold uppercase text-white disabled:opacity-50">
              {coverLetterEditStreaming ? 'Applying edit…' : 'Apply targeted edit'}
            </button>
          </form>
        </aside>
      </div>
    );
  }

  if (coverLetterStrategy) {
    return (
      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-black text-slate-900">Cover Letter Generation Strategy</h2>
        <p className="mt-1 text-xs text-slate-500">
          Writing plan prepared. No cover letter prose has been generated.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4 text-xs">
            <div><b>Tone:</b> {coverLetterStrategy.tone}</div>
            <div><b>Target:</b> {coverLetterStrategy.target_word_count} words</div>
            <div><b>Opening:</b> {coverLetterStrategy.opening_approach.replaceAll('_', ' ')}</div>
            <div><b>Greeting:</b> {coverLetterStrategy.greeting}</div>
            <div className="mt-2"><b>Narrative:</b> {coverLetterStrategy.narrative}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-[10px] font-black uppercase text-slate-400">Evidence priority</div>
            <ol className="mt-2 space-y-2 text-xs">
              {coverLetterStrategy.selected_evidence.map(item => (
                <li key={item.evidence_id}>
                  <b>{item.priority}. {item.source_section}</b> — {item.reason}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <div className="text-[10px] font-black uppercase text-slate-400">Paragraph plan</div>
          <div className="mt-2 space-y-2">
            {coverLetterStrategy.paragraph_plan.map(item => (
              <div key={item.paragraph} className="text-xs">
                <b>{item.paragraph}. {item.purpose.replaceAll('_', ' ')}</b>
                <span className="text-slate-500"> — {item.key_points.join(' ')}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 text-xs font-bold text-emerald-700">
          Status: {coverLetterStrategy.strategy_status.replaceAll('_', ' ')}
        </div>
        {coverLetterStrategy.ready_for_generation && (
          <button type="button"
            onClick={handleGenerateFirstCoverLetterDraft}
            disabled={loading}
            className="mt-5 rounded-xl border-0 bg-indigo-700 px-6 py-3 text-xs font-extrabold uppercase text-white shadow-md hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? 'Generating First Draft…' : 'Generate First Draft'}
          </button>
        )}
      </div>
    );
  }

  if (coverLetterContext) {
    return (
      <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-black text-slate-900">Cover Letter Context</h2>
        <p className="mt-1 text-xs text-slate-500">
          Context collected for {coverLetterContext.job?.title || 'the selected role'} at {coverLetterContext.job?.company || 'the selected company'}. No letter has been generated.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-[10px] font-black uppercase text-slate-400">Evidence-backed strengths</div>
            <ul className="mt-2 space-y-2 text-xs text-slate-700">
              {(coverLetterContext.selected_evidence || []).map(item => (
                <li key={`${item.source_section}-${item.source_entry_id}`}>
                  <span className="font-bold">{item.source_section}:</span> {item.exact_factual_evidence}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-[10px] font-black uppercase text-slate-400">Questions before strategy</div>
            <div className="mt-2 space-y-3">
              {(coverLetterContext.questions || []).map(question => (
                <div key={question.id} className="text-xs text-slate-700">
                  <div className="font-bold">{question.prompt}</div>
                  {question.kind === 'choice' ? (
                    <select value={contextAnswers[question.id] || ''}
                      onChange={event => setContextAnswers(previous => ({
                        ...previous, [question.id]: event.target.value
                      }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs">
                      <option value="">Select…</option>
                      {question.options.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input value={contextAnswers[question.id] || ''}
                      onChange={event => setContextAnswers(previous => ({
                        ...previous, [question.id]: event.target.value
                      }))}
                      className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs"
                      placeholder={question.required ? 'Required' : 'Optional'} />
                  )}
                  {!question.required && (
                    <button type="button"
                      onClick={() => setSkippedQuestions(previous =>
                        previous.includes(question.id)
                          ? previous.filter(id => id !== question.id)
                          : [...previous, question.id]
                      )}
                      className="mt-1 border-0 bg-transparent p-0 text-[10px] font-bold text-slate-400">
                      {skippedQuestions.includes(question.id) ? 'Skipped ✓' : 'Skip this question'}
                    </button>
                  )}
                </div>
              ))}
              {!coverLetterContext.questions?.length && (
                <div className="text-xs font-bold text-emerald-700">Context is ready for future cover-letter generation.</div>
              )}
            </div>
            {!!coverLetterContext.questions?.length && (
              <button type="button"
                onClick={() => handleGenerateCoverLetter(contextAnswers, skippedQuestions)}
                className="mt-5 rounded-xl border-0 bg-indigo-700 px-5 py-3 text-xs font-extrabold uppercase text-white">
                Save answers and validate context
              </button>
            )}
          </div>
        </div>
        <div className="mt-5 text-xs font-bold text-slate-600">
          Status: {coverLetterContext.status.replaceAll('_', ' ')}
        </div>
        {coverLetterContext.ready_for_generation && (
          <button type="button"
            onClick={handleBuildCoverLetterStrategy}
            className="mt-5 rounded-xl border-0 bg-emerald-700 px-6 py-3 text-xs font-extrabold uppercase text-white shadow-md hover:bg-emerald-800">
            Build Generation Strategy
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-[#0f0f11] text-slate-500 rounded-2xl border border-slate-200 dark:border-slate-900 shadow-3xs">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-500/20 border-t-indigo-500 mb-4" />
        <p className="text-xs font-black uppercase tracking-wider animate-pulse">Drafting tailored cover letter...</p>
        <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Calling Groq AI models</p>
      </div>
    );
  }

  if (!coverLetter) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-[#0f0f11] text-slate-500 rounded-2xl border border-slate-200 dark:border-slate-900 shadow-3xs text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center text-indigo-500">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19v-8.93a2 2 0 01.89-1.664l8-5.333a2 2 0 012.22 0l8 5.333A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76" />
          </svg>
        </div>
        <div className="space-y-1.5 max-w-sm">
          <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Tailor Your Cover Letter</h3>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed font-bold">
            Draft a custom, professional cover letter matching your selected resume directly to the target job description.
          </p>
        </div>
        <button
          onClick={handleGenerateCoverLetter}
          className="py-3 px-6 bg-brand hover:bg-brand-hover text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition shadow-md hover:shadow-indigo-900/30 cursor-pointer border-none"
        >
          Draft Cover Letter
        </button>
      </div>
    );
  }

  return (
    <CoverLetterView
      coverLetter={coverLetter}
      companyName={companyName}
      handleCopyToClipboard={handleCopyToClipboard}
      handleDownloadCoverLetterPDF={handleDownloadCoverLetterPDF}
      setStep={() => navigate('/tailor')}
    />
  );
}

export default CoverLetterPage;
