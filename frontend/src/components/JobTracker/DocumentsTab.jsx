import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Wand2, Download, Eye, RefreshCw, Trash2,
  ExternalLink, AlertCircle, CheckCircle2, Clock, Plus, X, Edit3
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getApiUrl } from '../../config/apiConfig';
import TailorRender from '../Resume/TailorRender';
import { CoverLetterRender } from '../CoverLetterRender';

export function DocumentsTab({ application, onUpdateDocumentStatus }) {
  const navigate = useNavigate();
  const {
    tailoredResume,
    workflowResume,
    coverLetter,
    parsedResume,
    jobAnalysis,
    lastAnalyzedUrl,
    handleGenerateCoverLetter,
    setJobAnalysis,
    session
  } = useApp();

  const [previewModalType, setPreviewModalType] = useState(null); // null | 'resume' | 'coverletter'
  const [downloadingType, setDownloadingType] = useState(null);

  if (!application) return null;

  // JobTrackerPage now fetches the full application record (organized_jd,
  // resume_snapshot, cover_letter_snapshot, etc. -- all omitted from the
  // lightweight board list) once per opened application and passes it down
  // as `application` to every workspace tab, this one included. No separate
  // fetch needed here anymore.
  const applicationDetails = application;

  const authHeaders = () => (session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {});

  const downloadBlobAsFile = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const base64ToPdfBlob = (base64) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
  };

  const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  // Fire-and-forget: the user already has their download by the time this
  // runs, so this must never block or fail the download itself -- it only
  // saves the *next* click a round trip through Playwright by caching the
  // rendered PDF in Supabase Storage. Still non-blocking, but a single
  // network blip previously meant that PDF silently never made it to
  // storage at all (nothing retried it, nothing surfaced it beyond a
  // console.warn nobody but a developer would ever see) until the user
  // happened to download the exact same document again. One retry after a
  // short delay covers the common transient case without making the
  // "fire-and-forget" tradeoff blocking.
  const persistGeneratedPdf = (kind, base64, attempt = 1) => {
    fetch(`${getApiUrl()}/api/v1/applications/${application.id}/${kind}-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ pdf_base64: base64 })
    }).catch(err => {
      console.warn(`Failed to persist ${kind} PDF for reuse (attempt ${attempt})`, err);
      if (attempt < 2) {
        setTimeout(() => persistGeneratedPdf(kind, base64, attempt + 1), 3000);
      }
    });
  };

  // A failed download used to navigate away to the standalone Resume/Cover
  // Letter Studio pages as a "fallback" -- but those pages render from
  // AppContext's global tailoredResume/parsedResume/coverLetter state, which
  // has no relationship to whichever OTHER application's document a Job
  // Tracker download was actually for. That redirect just stranded the user
  // on an unrelated, usually-empty "nothing generated yet" screen with no
  // indication anything had gone wrong. Surface a toast and stay put instead
  // -- the Job Tracker is exactly where the retry button already is.
  const notifyDownloadError = (message) => {
    window.dispatchEvent(new CustomEvent('tailr4u-toast', {
      detail: { message, type: 'error', title: 'Download failed' }
    }));
  };

  // Storage-first: a resume/cover letter that hasn't changed since it was
  // last rendered doesn't need a fresh Playwright render (45-75s observed in
  // production) on every single download click -- check for an
  // already-rendered copy in Supabase Storage before ever regenerating.
  const handleDownloadResume = async () => {
    try {
      setDownloadingType('resume');

      // A finalized in-memory workflow is newer than any previously cached
      // application PDF. Render it once and overwrite the stored artifact.
      try {
        if (currentTailoredResume) throw new Error('active-tailored-resume');
        const stored = await fetch(`${getApiUrl()}/api/v1/applications/${application.id}/resume-pdf`, {
          headers: authHeaders()
        });
        if (stored.ok) {
          downloadBlobAsFile(await stored.blob(), resumeFileName);
          return;
        }
      } catch (storageErr) {
        if (storageErr?.message !== 'active-tailored-resume') {
          console.warn('Stored resume PDF check failed, rendering fresh', storageErr);
        }
      }

      const response = await fetch(`${getApiUrl()}/api/render-unified-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: displayResume,
          original_resume: displayResume,
          template_name: application.template || 'ExecutiveATS',
          page_preference: 'auto',
          company_name: companyName
        })
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.detail || `PDF generation failed with status ${response.status}`);
      }
      const data = await response.json();
      if (!data.pdf_base64) throw new Error('No PDF base64 payload returned');

      downloadBlobAsFile(base64ToPdfBlob(data.pdf_base64), data.filename || resumeFileName);
      persistGeneratedPdf('resume', data.pdf_base64);
    } catch (err) {
      console.error('Resume download failed:', err);
      notifyDownloadError(err.message || 'Could not download the tailored resume. Please try again.');
    } finally {
      setDownloadingType(null);
    }
  };

  const handleDownloadCoverLetter = async () => {
    try {
      setDownloadingType('coverletter');
      const filename = `${(application.company_name || 'CoverLetter').replace(/\s+/g, '_')}_CoverLetter.pdf`;

      try {
        const stored = await fetch(`${getApiUrl()}/api/v1/applications/${application.id}/cover-letter-pdf`, {
          headers: authHeaders()
        });
        if (stored.ok) {
          downloadBlobAsFile(await stored.blob(), filename);
          return;
        }
      } catch (storageErr) {
        console.warn('Stored cover letter PDF check failed, rendering fresh', storageErr);
      }

      // Previously downloaded the raw snapshot text as a .txt file -- a
      // cover letter is meant to be submitted as a formatted PDF alongside
      // the resume, not plain text. Render it the same way the standalone
      // Cover Letter Studio does (POST /api/download-cover-letter-pdf).
      const text = typeof activeCoverLetterText === 'string' ? activeCoverLetterText : JSON.stringify(activeCoverLetterText);
      const response = await fetch(`${getApiUrl()}/api/download-cover-letter-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cover_letter: text,
          company_name: application.company_name || '',
          job_title: application.job_title || '',
          recipient_name: 'Hiring Manager'
        })
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.detail || `Cover letter PDF generation failed with status ${response.status}`);
      }
      const blob = await response.blob();
      downloadBlobAsFile(blob, filename);
      persistGeneratedPdf('cover-letter', await blobToBase64(blob));
    } catch (err) {
      console.error('Cover letter download failed:', err);
      notifyDownloadError(err.message || 'Could not download the cover letter. Please try again.');
    } finally {
      setDownloadingType(null);
    }
  };

  const resumeReady = application.resume_status === 'ready' || Boolean(application.resume_version) || Boolean(tailoredResume);
  const coverLetterReady = application.cover_letter_status === 'ready'
    || Boolean(application.cover_letter_version)
    || Boolean(application.cover_letter_snapshot && Object.keys(application.cover_letter_snapshot).length)
    || Boolean(coverLetter);
  const isStale = application.resume_status === 'stale' || application.cover_letter_status === 'stale';

  const handleOpenStudio = async (docType) => {
    const storedJob = (applicationDetails.organized_jd && Object.keys(applicationDetails.organized_jd).length)
      ? applicationDetails.organized_jd
      : {
          job_description: applicationDetails.job_description || '',
          description: applicationDetails.job_description || '',
          job_title: application.job_title || 'Target Role',
          company_name: application.company_name || 'Hiring Company',
          location: application.location || 'Remote',
          job_url: application.job_url || ''
        };
    const storedResume = currentTailoredResume
      || ((applicationDetails.resume_snapshot && Object.keys(applicationDetails.resume_snapshot).length)
        ? applicationDetails.resume_snapshot
        : parsedResume);

    if (storedJob) {
      setJobAnalysis(storedJob);
    }

    if (docType === 'resume') {
      navigate('/resume-review');
    } else {
      // handleGenerateCoverLetter already navigates to /cover-letter on success
      // and returns undefined (without navigating) when it bails out early on
      // missing resume/JD — don't force navigation past a validation warning.
      await handleGenerateCoverLetter({}, [], {
        applicationId: application.id,
        application: application,
        resume: storedResume,
        job: storedJob
      });
    }
  };

  const normalizedApplicationUrl = String(application.job_url || '').replace(/\/+$/, '').toLowerCase();
  const normalizedActiveUrl = String(lastAnalyzedUrl || jobAnalysis?.job_url || '').replace(/\/+$/, '').toLowerCase();
  const activeTitle = String(jobAnalysis?.job_title || jobAnalysis?.title || '').trim().toLowerCase();
  const activeCompany = String(jobAnalysis?.company_name || jobAnalysis?.company || '').trim().toLowerCase();
  const applicationTitle = String(application.job_title || '').trim().toLowerCase();
  const applicationCompany = String(application.company_name || '').trim().toLowerCase();
  const activeJobMatchesApplication = Boolean(
    normalizedApplicationUrl && normalizedActiveUrl && normalizedApplicationUrl === normalizedActiveUrl
  ) || Boolean(
    activeTitle && activeCompany && applicationTitle && applicationCompany
    && activeTitle === applicationTitle
    && activeCompany === applicationCompany
  );
  // tailoredResume (AppContext, in-memory) is a GLOBAL, unscoped value --
  // restored from chrome.storage.local/localStorage on every mount with no
  // job-identity check, and re-broadcast to every open tab/panel via
  // chrome.storage.onChanged whenever ANY tab tailors a resume for ANY job.
  // workflowResume is the one value here that's actually verified against
  // the current job (resumeWorkflow.jobFingerprint === currentJobFingerprint,
  // see AppContext.jsx). Falling back to the raw tailoredResume when
  // workflowResume is (correctly) null was exactly how a resume tailored for
  // a *different* job earlier in the session leaked into this preview --
  // applicationDetails.tailored_resume/resume_snapshot below (this
  // application's own persisted, backend-sourced record) is the correct
  // fallback, not another job's in-memory leftovers.
  const currentTailoredResume = activeJobMatchesApplication ? workflowResume : null;

  const displayResume = currentTailoredResume
    || applicationDetails.tailored_resume
    || ((applicationDetails.resume_snapshot && Object.keys(applicationDetails.resume_snapshot).length)
      ? applicationDetails.resume_snapshot
      : null)
    || parsedResume
    || {
        personal_info: {
          name: application.candidate?.name || '',
          email: application.candidate?.email || '',
          phone: application.candidate?.phone || '',
          location: application.location || ''
        },
        summary: '',
        experience: application.job_title ? [
          {
            title: application.job_title,
            company: application.company_name || '',
            dates: '',
            bullets: []
          }
        ] : []
      };

  const rawCandidateName = displayResume?.personal_info?.name
    || displayResume?.personal_info?.full_name
    || application.candidate?.name
    || parsedResume?.personal_info?.name
    || '';

  const companyName = application.company_name || '';

  const resumeFileName = rawCandidateName.trim()
    ? (companyName.trim() ? `${rawCandidateName.trim().replace(/\s+/g, '_')}_${companyName.trim().replace(/\s+/g, '_')}_Resume.pdf` : `${rawCandidateName.trim().replace(/\s+/g, '_')}_Resume.pdf`)
    : (companyName.trim() ? `${companyName.trim().replace(/\s+/g, '_')}_Resume.pdf` : 'Tailored_Resume.pdf');

  const coverLetterContext = {
    candidate: application.candidate || { name: rawCandidateName || 'Candidate Name' },
    job: { title: application.job_title, company: application.company_name },
    recipient: { name: 'Hiring Manager' }
  };

  // coverLetter (AppContext, in-memory) only reflects the letter just
  // generated THIS session -- and, unlike workflowResume above, carries no
  // job-identity/fingerprint check at all. activeJobMatchesApplication alone
  // isn't a strong enough guard for it: that check can be true (title+company
  // match, or the global jobAnalysis happening to still point at this job)
  // while coverLetter itself is a stale value restored from a previous
  // mount/tab that was never invalidated for this specific job switch --
  // which is exactly how a real-but-wrong letter showed under the right
  // header before. The persisted per-application snapshot is the only source
  // guaranteed to belong to THIS application; fall to the generic template,
  // not another job's real letter, when neither snapshot field is populated.
  const activeCoverLetterText = applicationDetails.cover_letter_snapshot
    || applicationDetails.cover_letter_content
    || (
    `Dear Hiring Manager,\n\nI am writing to express my strong interest in the ${application.job_title || 'Target Role'} position at ${application.company_name || 'Company'}. With my background in technology and proven track record, I am confident I can make an immediate contribution to your team.\n\nThank you for considering my application.\n\nSincerely,\n${rawCandidateName || 'Candidate Name'}`
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      
      {/* Stale Document Warning Banner if JD/Resume updated */}
      {isStale && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between gap-4 animate-fade-in shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <h4 className="font-bold text-zinc-900 dark:text-white">Stale Document Detected</h4>
              <p className="text-amber-700 dark:text-amber-300/80 mt-0.5">
                This cover letter or tailored resume was created from an older version of your base profile.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleOpenStudio('resume')}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl text-xs cursor-pointer border-none shrink-0 shadow-xs"
          >
            Regenerate
          </button>
        </div>
      )}

      {/* DOCUMENT CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        
        {/* 1. TAILORED RESUME CARD */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-4 relative flex flex-col justify-between shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800 flex items-center justify-center">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-zinc-900 dark:text-white">Tailored Resume</h3>
                  <span className={`text-[11px] font-bold ${resumeReady ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                    {resumeReady ? 'Ready for Submission' : 'Pending Tailoring'}
                  </span>
                </div>
              </div>
            </div>

            {/* Document Details */}
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-xs space-y-1.5 text-zinc-700 dark:text-zinc-300">
              <div className="flex justify-between">
                <span className="text-zinc-500 font-semibold">File Name:</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-200 truncate max-w-[200px]" title={resumeFileName}>
                  {resumeFileName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-semibold">Length:</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-200">1 Page (A4 Optimized)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-semibold">Version:</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-200">{application.resume_version || 'v1.0'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-semibold">ATS Score:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{application.ats_score || 70}/100</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <button
              onClick={() => setPreviewModalType('resume')}
              className="flex-1 py-2 bg-[#00bda5] hover:bg-[#00a38e] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Eye size={14} />
              Preview Document
            </button>
            <button
              onClick={handleDownloadResume}
              disabled={downloadingType === 'resume'}
              className="p-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700 shadow-xs disabled:opacity-50"
              title="Download Resume PDF"
            >
              {downloadingType === 'resume' ? <RefreshCw size={15} className="animate-spin text-[#00bda5]" /> : <Download size={15} />}
            </button>
          </div>
        </div>

        {/* 2. COVER LETTER CARD */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-4 relative flex flex-col justify-between shadow-xs">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 border border-teal-200 dark:bg-teal-950/30 dark:text-teal-400 dark:border-teal-800 flex items-center justify-center">
                  <Wand2 size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-zinc-900 dark:text-white">Cover Letter</h3>
                  <span className={`text-[11px] font-bold ${coverLetterReady ? 'text-teal-700 dark:text-teal-400' : 'text-zinc-500'}`}>
                    {coverLetterReady ? 'Generated & Ready' : 'Not Created'}
                  </span>
                </div>
              </div>
            </div>

            {/* Document Details */}
            {coverLetterReady ? (
              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-xs space-y-1.5 text-zinc-700 dark:text-zinc-300">
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-semibold">File Name:</span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-200 truncate max-w-[200px]">
                    {application.company_name ? `${application.company_name}_CoverLetter.pdf` : 'CoverLetter.pdf'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-semibold">Format:</span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-200">Classic ATS Layout</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500 font-semibold">Target Company:</span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-200">{application.company_name || 'Hiring Company'}</span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border border-dashed border-zinc-200 dark:border-zinc-800 text-center space-y-2">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  No cover letter generated for this application yet.
                </p>
                <p className="text-[11px] text-zinc-400">
                  Adding a targeted cover letter boosts interview callbacks by 35%.
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            {coverLetterReady ? (
              <>
                <button
                  onClick={() => setPreviewModalType('coverletter')}
                  className="flex-1 py-2 bg-[#00bda5] hover:bg-[#00a38e] text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Eye size={14} />
                  Preview Document
                </button>
                <button
                  onClick={() => handleOpenStudio('coverletter')}
                  className="px-3 py-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-xs rounded-xl flex items-center gap-1 transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700 shadow-xs"
                  title="Open Cover Letter Studio"
                >
                  <Edit3 size={14} />
                  Studio
                </button>
                <button
                  onClick={handleDownloadCoverLetter}
                  disabled={downloadingType === 'coverletter'}
                  className="p-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700 shadow-xs disabled:opacity-50"
                  title="Download Cover Letter Document"
                >
                  {downloadingType === 'coverletter' ? <RefreshCw size={15} className="animate-spin text-[#00bda5]" /> : <Download size={15} />}
                </button>
              </>
            ) : (
              <button
                onClick={() => handleOpenStudio('coverletter')}
                className="w-full py-2.5 bg-[#00bda5] hover:bg-[#00a38e] text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs"
              >
                <Plus size={15} />
                Generate Cover Letter
              </button>
            )}
          </div>
        </div>

      </div>

      {/* FULL-SCREEN DOCUMENT PREVIEW MODAL */}
      {previewModalType && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex flex-col animate-fade-in">
          {/* Header */}
          <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-3.5 flex items-center justify-between shrink-0 text-zinc-900 dark:text-white">
            <div className="flex items-center gap-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-teal-600 dark:text-teal-400">
                {previewModalType === 'resume' ? 'Tailored Resume Preview' : 'Cover Letter Preview'}
              </h3>
              <span className="text-xs text-zinc-500 font-semibold">
                {application.job_title} — {application.company_name}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleOpenStudio(previewModalType)}
                className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-800 dark:text-zinc-200 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer border border-zinc-200 dark:border-zinc-700"
              >
                <Edit3 size={13} />
                Open in Studio
              </button>
              <button
                onClick={previewModalType === 'resume' ? handleDownloadResume : handleDownloadCoverLetter}
                disabled={downloadingType === (previewModalType === 'resume' ? 'resume' : 'coverletter')}
                className="px-3 py-1.5 bg-[#00bda5] hover:bg-[#00a38e] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer border-none disabled:opacity-50"
              >
                {downloadingType === (previewModalType === 'resume' ? 'resume' : 'coverletter')
                  ? <RefreshCw size={13} className="animate-spin" />
                  : <Download size={13} />}
                Download PDF
              </button>
              <button
                onClick={() => setPreviewModalType(null)}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Document Canvas Workspace */}
          <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 overflow-auto p-8 flex justify-center items-start custom-scrollbar">
            <div className="w-[816px] min-h-[1056px] bg-white shadow-2xl rounded-sm p-10 md:p-14 text-zinc-900">
              {previewModalType === 'resume' ? (
                <TailorRender resume={displayResume} templateName={application.template || 'ExecutiveATS'} isExporting />
              ) : (
                <CoverLetterRender
                  coverLetter={activeCoverLetterText}
                  context={coverLetterContext}
                  templateKey="classic_ats"
                />
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default DocumentsTab;
