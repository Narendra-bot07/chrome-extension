import React from 'react';
import { Upload, FileText, Calendar, HardDrive, Trash2, ArrowRight } from 'lucide-react';

function ResumeDetectionView({
  parsedResume,
  resumeFile,
  setResumeFile,
  onClearResume,
  dragActive,
  setDragActive,
  uploadProgress,
  onContinue,
  loading
}) {
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setResumeFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setResumeFile(e.target.files[0]);
    }
  };

  // Retrieve metadata from resume file or database record
  const fileSize = resumeFile 
    ? `${(resumeFile.size / 1024).toFixed(1)} KB` 
    : parsedResume?.file_size 
      ? `${(parsedResume.file_size / 1024).toFixed(1)} KB` 
      : "142.4 KB";
      
  const modifiedDate = resumeFile 
    ? new Date(resumeFile.lastModified).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : parsedResume?.created_at
      ? new Date(parsedResume.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
      : new Date().toLocaleDateString(undefined, { dateStyle: 'medium' });

  return (
    <div className="space-y-4 flex-1 flex flex-col justify-between select-none text-slate-650 dark:text-slate-350 font-sans">
      
      {/* Title */}
      <div className="space-y-1">
        <h2 className="text-lg font-black tracking-tight text-slate-800 dark:text-slate-100">Resume Source</h2>
        <p className="text-xs text-slate-500">Provide the resume document to match against the target job requirements.</p>
      </div>

      <div className="flex-1 flex flex-col justify-center my-2">
        {parsedResume ? (
          /* CASE 1: Resume Exists */
          <div className="space-y-4 animate-fadeIn">
            <div className="p-4 bg-white border border-slate-200 dark:bg-[#0f0f11] dark:border-slate-900 rounded-2xl space-y-4 shadow-3xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand flex-shrink-0">
                  <FileText size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[8px] font-black text-brand uppercase tracking-widest block">Resume Detected</span>
                  <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                    {parsedResume.file_name || `${parsedResume.personal_info?.name || 'Resume'}_Parsed.pdf`}
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-850 my-2" />

              {/* File Specs */}
              <div className="grid grid-cols-2 gap-3 text-[10px] leading-relaxed text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} className="text-slate-400" />
                  <span>Modified: {modifiedDate}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <HardDrive size={12} className="text-slate-400" />
                  <span>Size: {fileSize}</span>
                </div>
              </div>

              {/* Short Preview Box */}
              {parsedResume.summary && (
                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-850 rounded-xl text-[9px] leading-relaxed italic text-slate-500 dark:text-slate-400">
                  "{parsedResume.summary.slice(0, 140)}..."
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-400 text-center font-medium">Use this resume for tailoring, or upload a different one below.</p>
          </div>
        ) : (
          /* CASE 2: No Resume Found (Uploader) */
          <div className="space-y-4 animate-fadeIn">
            <div 
              className={`border border-dashed p-8 rounded-2xl flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-200 ${
                dragActive 
                  ? 'border-brand bg-brand/5 shadow-premium-glow' 
                  : 'border-slate-200 dark:border-slate-900 hover:border-slate-350 dark:hover:border-slate-850 bg-white dark:bg-[#0f0f11]/30 hover:bg-slate-50 dark:hover:bg-[#0f0f11]/60 shadow-3xs'
              }`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => document.getElementById('resume-source-file-comp').click()}
            >
              <input 
                id="resume-source-file-comp"
                type="file" 
                className="hidden" 
                accept=".pdf,.docx,.txt"
                onChange={handleFileChange}
              />
              
              <div className="w-11 h-11 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 shadow-3xs">
                <Upload size={18} />
              </div>

              <div className="text-center space-y-1">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  {resumeFile ? resumeFile.name : "Upload your resume"}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">Drag & drop PDF, DOCX, or TXT here</p>
              </div>

              {/* Upload Progress Bar */}
              {uploadProgress > 0 && (
                <div className="w-full max-w-[200px] space-y-1.5 pt-2">
                  <div className="w-full h-1 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-800">
                    <div 
                      className="h-full bg-brand rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-[8px] text-brand font-black uppercase text-center tracking-wider">{uploadProgress}% Uploaded</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action Footer Bar */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-900 mt-auto flex gap-3 bg-transparent flex-shrink-0">
        {parsedResume && (
          <button 
            type="button"
            onClick={onClearResume}
            disabled={loading}
            className="flex-1 py-3 border border-slate-250 dark:border-slate-850 text-rose-500 dark:text-rose-450 hover:bg-rose-500/5 hover:border-rose-300 font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-1.5 shadow-3xs cursor-pointer"
          >
            <Trash2 size={13} />
            Replace
          </button>
        )}
        
        <button 
          type="button"
          onClick={onContinue}
          disabled={!parsedResume && !resumeFile}
          className="flex-2 py-3 bg-brand hover:bg-brand-hover disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-900 dark:disabled:text-slate-600 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-1.5 shadow-md hover:shadow-indigo-900/40 cursor-pointer"
        >
          {parsedResume ? "Use Current Resume" : "Parse Uploaded File"}
          <ArrowRight size={13} />
        </button>
      </div>

    </div>
  );
}

export default ResumeDetectionView;
