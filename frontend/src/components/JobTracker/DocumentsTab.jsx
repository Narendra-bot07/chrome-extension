import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, Wand2, Download, Eye, RefreshCw, Trash2, 
  ExternalLink, AlertCircle, CheckCircle2, Clock, Plus, X, Edit3
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import TailorRender from '../Resume/TailorRender';
import { CoverLetterRender } from '../CoverLetterRender';

export function DocumentsTab({ application, onUpdateDocumentStatus }) {
  const navigate = useNavigate();
  const {
    tailoredResume,
    coverLetter,
    parsedResume,
    handleGenerateCoverLetter
  } = useApp();

  const [previewModalType, setPreviewModalType] = useState(null); // null | 'resume' | 'coverletter'

  if (!application) return null;

  const resumeReady = application.resume_status === 'ready' || Boolean(application.resume_version) || Boolean(tailoredResume);
  const coverLetterReady = application.cover_letter_status === 'ready'
    || Boolean(application.cover_letter_version)
    || Boolean(application.cover_letter_snapshot && Object.keys(application.cover_letter_snapshot).length)
    || Boolean(coverLetter);
  const isStale = application.resume_status === 'stale' || application.cover_letter_status === 'stale';

  const handleOpenStudio = async (docType) => {
    if (docType === 'resume') {
      navigate('/resume-review');
    } else {
      const storedJob = application.organized_jd && Object.keys(application.organized_jd).length
        ? application.organized_jd
        : application.job_description
          ? {
              job_description: application.job_description,
              description: application.job_description,
              job_title: application.job_title,
              company_name: application.company_name,
              location: application.location,
              job_url: application.job_url
            }
          : null;
      const storedResume = application.resume_snapshot && Object.keys(application.resume_snapshot).length
        ? application.resume_snapshot
        : tailoredResume || parsedResume;

      await handleGenerateCoverLetter({}, [], {
        applicationId: application.id,
        resume: storedResume,
        job: storedJob
      });
    }
  };

  const displayResume = tailoredResume || parsedResume || {
    personal_info: {
      name: application.candidate?.name || 'Candidate Name',
      email: application.candidate?.email || 'email@example.com',
      phone: application.candidate?.phone || '+1 (555) 000-0000',
      location: application.location || 'Remote'
    },
    summary: 'Experienced professional with a strong track record of technical delivery.',
    experience: [
      {
        title: application.job_title || 'Software Engineer',
        company: application.company_name || 'Target Company',
        dates: '2023 - Present',
        bullets: ['Led cross-functional initiatives and built scalable cloud backend services.']
      }
    ]
  };

  const coverLetterContext = {
    candidate: application.candidate || { name: 'Candidate Name' },
    job: { title: application.job_title, company: application.company_name },
    recipient: { name: 'Hiring Manager' }
  };

  const activeCoverLetterText = coverLetter || application.cover_letter_snapshot || application.cover_letter_content || (
    `Dear Hiring Manager,\n\nI am writing to express my strong interest in the ${application.job_title || 'Target Role'} position at ${application.company_name || 'Company'}. With my background in technology and proven track record, I am confident I can make an immediate contribution to your team.\n\nThank you for considering my application.\n\nSincerely,\nCandidate Name`
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
                <span className="font-bold text-zinc-900 dark:text-zinc-200 truncate max-w-[200px]">
                  {application.company_name ? `${application.company_name}_Resume.pdf` : 'Tailored_Resume.pdf'}
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
              onClick={() => navigate('/download')}
              className="p-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700 shadow-xs"
              title="Download Resume PDF"
            >
              <Download size={15} />
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
                  onClick={() => navigate('/cover-letter')}
                  className="p-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700 shadow-xs"
                  title="Download Cover Letter PDF"
                >
                  <Download size={15} />
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
                onClick={() => navigate(previewModalType === 'resume' ? '/download' : '/cover-letter')}
                className="px-3 py-1.5 bg-[#00bda5] hover:bg-[#00a38e] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer border-none"
              >
                <Download size={13} />
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
                <TailorRender resume={displayResume} />
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
