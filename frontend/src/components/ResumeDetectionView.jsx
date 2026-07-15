import React, { useState } from 'react';
import { Upload, FileText, Calendar, HardDrive, Trash2, ArrowRight, Eye, X } from 'lucide-react';
import TailorRender from './Resume/TailorRender';

function ResumeDetectionView({
  parsedResume,
  resumesList = [],
  onDeleteResume,
  resumeFile,
  setResumeFile,
  onSelect,
  dragActive,
  setDragActive,
  uploadProgress,
  loading
}) {
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewResume, setPreviewResume] = useState(null);

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

  return (
    <div className="space-y-4 flex-1 flex flex-col justify-between select-none text-slate-650 dark:text-slate-350 font-sans">
      
      {/* Title */}
      <div className="space-y-1">
        <h2 className="text-lg font-black tracking-tight text-slate-800 dark:text-slate-100">Resume Source</h2>
        <p className="text-xs text-slate-500">Provide the resume document to match against the target job requirements.</p>
      </div>

      {/* Resumes List Scroll Container */}
      <div className="flex-1 flex flex-col justify-start my-2 space-y-4 overflow-y-auto max-h-[380px] pr-1 custom-scrollbar">
        {resumesList && resumesList.length > 0 ? (
          <div className="space-y-2">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Select Active Resume</span>
            {resumesList.map((res) => {
              const isActive = parsedResume && parsedResume.id === res.id;
              const fileSz = res.file_size 
                ? `${(res.file_size / 1024).toFixed(1)} KB` 
                : "Unknown Size";
              const modDate = res.created_at
                ? new Date(res.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
                : "Recently";

              const handleSelectResume = () => {
                if (parsedResume && parsedResume.id !== res.id) {
                  const confirmChange = window.confirm(
                    `Are you sure you want to change your active resume from "${parsedResume.file_name || 'Current'}" to "${res.file_name}"?`
                  );
                  if (!confirmChange) return;
                }

                const selected = {
                  ...(res.parsed_content || res),
                  id: res.id,
                  file_name: res.file_name,
                  file_size: res.file_size,
                  file_type: res.file_type,
                  created_at: res.created_at
                };
                onSelect(selected);
              };

              return (
                <div 
                  key={res.id}
                  onClick={handleSelectResume}
                  className={`p-3.5 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                    isActive 
                      ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-sm' 
                      : 'border-slate-200 dark:border-slate-900 bg-white dark:bg-[#0f0f11] hover:border-slate-350 dark:hover:border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isActive 
                        ? 'bg-indigo-500/10 text-indigo-500' 
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-400'
                    }`}>
                      <FileText size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-extrabold truncate ${
                        isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-750 dark:text-slate-300'
                      }`}>
                        {res.file_name || "Resume_Document.pdf"}
                      </p>
                      <p className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider">
                        {modDate} • {fileSz}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    {isActive ? (
                      <span className="py-1 px-2.5 bg-emerald-500/10 text-emerald-500 rounded-lg text-[9px] font-black uppercase tracking-wider select-none">
                        Active
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectResume();
                        }}
                        className="py-1 px-2.5 bg-slate-100 dark:bg-slate-900 hover:bg-indigo-600 dark:hover:bg-indigo-605 hover:text-white text-slate-600 dark:text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer border-none transition"
                      >
                        Select
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const selected = {
                          ...(res.parsed_content || res),
                          id: res.id,
                          file_name: res.file_name,
                          file_size: res.file_size,
                          file_type: res.file_type,
                          created_at: res.created_at
                        };
                        setPreviewResume(selected);
                        setShowPreviewModal(true);
                      }}
                      className="p-1.5 hover:bg-indigo-500/10 text-slate-450 hover:text-indigo-500 rounded-lg transition border-none bg-transparent cursor-pointer flex-shrink-0"
                      title="Preview Resume"
                    >
                      <Eye size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Are you sure you want to delete ${res.file_name}?`)) {
                          onDeleteResume(res.id);
                        }
                      }}
                      className="p-1.5 hover:bg-rose-500/10 text-slate-450 hover:text-rose-500 rounded-lg transition border-none bg-transparent cursor-pointer flex-shrink-0"
                      title="Delete Resume"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-[10px] text-slate-450 uppercase font-black tracking-widest bg-slate-50 dark:bg-slate-950/40 border border-dashed border-slate-200 dark:border-slate-900 rounded-2xl">
            No resumes uploaded yet
          </div>
        )}
      </div>

      {/* Upload Zone to append new Resumes */}
      <div className="pt-2">
        <div 
          className={`border border-dashed p-4 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-200 ${
            dragActive 
              ? 'border-brand bg-brand/5 shadow-premium-glow' 
              : 'border-slate-200 dark:border-slate-900 hover:border-slate-350 dark:hover:border-slate-805 bg-slate-50/50 dark:bg-[#0f0f11]/10 hover:bg-slate-50 dark:hover:bg-[#0f0f11]/30 shadow-3xs'
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
          
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-350">
            <Upload size={14} className="text-slate-400" />
            <span>{resumeFile ? `Selected: ${resumeFile.name}` : "Upload new resume"}</span>
          </div>

          {/* Upload Progress Bar */}
          {uploadProgress > 0 && (
            <div className="w-full max-w-[200px] space-y-1.5 pt-1">
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

      {/* Fullscreen Zoom Preview Modal inside Resume Source Page */}
      {showPreviewModal && previewResume && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex flex-col animate-fade-in text-white">
          <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between shrink-0 shadow-md">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400">Resume Preview</h3>
              <p className="text-[9px] text-zinc-450 font-bold uppercase mt-0.5">{previewResume.file_name || 'Resume Document'}</p>
            </div>
            
            <button 
              onClick={() => {
                setShowPreviewModal(false);
                setPreviewResume(null);
              }}
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition border-none bg-transparent cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="flex-1 bg-zinc-950 overflow-auto flex justify-center items-start p-8 custom-scrollbar">
            <div className="bg-white shadow-2xl rounded-sm p-8 text-zinc-900 w-[816px] min-h-[1056px] select-text">
              {/* If the resume is not parsed yet, show a clean raw text layout */}
              {(!previewResume.experience || previewResume.experience.length === 0) ? (
                <div className="font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap break-words p-4 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4 pb-2 border-b border-slate-200/60">
                    Raw Document Text Extraction (Unparsed)
                  </div>
                  {previewResume.raw_text || "No text extracted from this resume."}
                </div>
              ) : (
                <TailorRender 
                  resume={previewResume} 
                  templateName="ExecutiveATS" 
                  layoutLevel={5}
                />
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default ResumeDetectionView;
