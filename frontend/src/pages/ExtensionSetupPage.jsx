import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, FileText, LockKeyhole, LogIn, Zap, UserRoundCheck, Upload, X, RefreshCw, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { useApp } from '../context/AppContext';
import './ExtensionSetupPage.css';

export default function ExtensionSetupPage() {
  const navigate = useNavigate();
  const {
    user,
    parsedResume,
    resumesList,
    loadingAuth,
    loadingResume,
    handleParseResume,
    loadingProgress,
    loadingMessage
  } = useApp();

  const signedIn = Boolean(user);
  const hasResume = signedIn && (Boolean(parsedResume) || (Array.isArray(resumesList) && resumesList.length > 0));

  const [showModal, setShowModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!loadingAuth && !loadingResume && signedIn && hasResume) {
      navigate('/tailor', { replace: true });
    }
  }, [signedIn, hasResume, loadingAuth, loadingResume, navigate]);

  // Global Drag & Drop handling
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (signedIn && !hasResume) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (!signedIn || hasResume) return;

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      const file = files[0];
      setSelectedFile(file);
      setShowModal(true);
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const handleStartUpload = async (fileToUpload = selectedFile) => {
    if (!fileToUpload) return;
    setIsUploading(true);
    setUploadError(null);

    try {
      const res = await handleParseResume(fileToUpload);
      if (res && !res.cancelled) {
        setIsUploading(false);
        setShowModal(false);
        setSelectedFile(null);
        navigate('/tailor', { replace: true });
      } else {
        setIsUploading(false);
      }
    } catch (err) {
      setIsUploading(false);
      setUploadError(err.message || 'Upload failed. Please try again.');
    }
  };

  return (
    <main
      className="extension-setup relative min-h-screen"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Global Dropzone Visual Overlay when dragging a file over page */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-[#00bda5]/20 backdrop-blur-sm border-4 border-dashed border-[#00bda5] flex flex-col items-center justify-center text-center p-6 transition-all select-none">
          <div className="w-16 h-16 rounded-2xl bg-[#00bda5] text-white flex items-center justify-center shadow-xl mb-4 animate-bounce">
            <Upload size={32} />
          </div>
          <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">Drop your resume here</h2>
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 mt-1">Supports PDF, DOCX, DOC, and TXT files</p>
        </div>
      )}

      <section className="extension-setup-card">
        <div className="extension-setup-brand"><BrandLogo size={42} /></div>
        <span className="extension-setup-kicker"><Zap size={14} /> Extension setup</span>
        <h1>Complete two steps to start tailoring.</h1>
        <p>We need a secure account and one source resume before we can review the job open in your browser.</p>

        <div className="extension-setup-steps">
          {/* Step 1 */}
          <article className={signedIn ? 'complete' : 'required'}>
            <span className="extension-step-icon">{signedIn ? <Check size={20} /> : <LockKeyhole size={20} />}</span>
            <div>
              <small>Step 1</small>
              <h2>{signedIn ? 'Account connected' : 'Sign in to your account'}</h2>
              <p>{signedIn ? user?.email : 'Securely connect your tailr4u workspace.'}</p>
            </div>
            {signedIn
              ? <span className="extension-step-status">Ready</span>
              : <button type="button" onClick={() => navigate('/login?redirect=%2Fextension-setup')}>Sign in <LogIn size={16} /></button>}
          </article>

          {/* Step 2 */}
          <article
            className={hasResume ? 'complete' : signedIn ? 'required cursor-pointer' : 'locked'}
            onClick={() => {
              if (signedIn && !hasResume) {
                setShowModal(true);
              }
            }}
          >
            <span className="extension-step-icon">{hasResume ? <Check size={20} /> : <FileText size={20} />}</span>
            <div>
              <small>Step 2</small>
              <h2>{hasResume ? 'Resume available' : 'Add your source resume'}</h2>
              <p>{hasResume ? 'Your resume is ready for job matching.' : signedIn ? 'Upload at least one resume to continue.' : 'Sign in to your account first.'}</p>
            </div>
            {hasResume ? (
              <span className="extension-step-status">Ready</span>
            ) : signedIn ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowModal(true);
                }}
              >
                Add resume <ArrowRight size={16} />
              </button>
            ) : (
              <span className="extension-step-locked">Sign in first</span>
            )}
          </article>
        </div>

        <div className="extension-setup-footer">
          <UserRoundCheck size={17} />
          <span>Once both steps are ready, the extension opens JD extraction automatically.</span>
        </div>
      </section>

      {/* UPLOAD RESUME MODAL / POPUP */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl relative select-none"
            >
              {/* Close Button */}
              <button
                type="button"
                disabled={isUploading}
                onClick={() => {
                  setShowModal(false);
                  setSelectedFile(null);
                  setUploadError(null);
                }}
                className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-full transition cursor-pointer"
              >
                <X size={18} />
              </button>

              {/* Modal Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl bg-[#00bda5]/10 text-[#00bda5] flex items-center justify-center shrink-0">
                  <Upload size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white leading-tight">Upload Source Resume</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">PDF, DOCX, DOC, or TXT format</p>
                </div>
              </div>

              {/* File Dropzone Area */}
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf,.docx,.doc,.txt"
                className="hidden"
                onChange={handleFileChange}
              />

              <div
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                  selectedFile
                    ? 'border-[#00bda5] bg-[#00bda5]/5'
                    : 'border-zinc-300 dark:border-zinc-700 hover:border-[#00bda5] hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                }`}
              >
                {selectedFile ? (
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-12 h-12 rounded-xl bg-[#00bda5] text-white flex items-center justify-center shadow-md">
                      <FileText size={24} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-zinc-900 dark:text-white truncate max-w-[240px]">{selectedFile.name}</p>
                      <p className="text-[10px] text-zinc-500 font-medium">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <span className="text-[10px] font-semibold text-[#00bda5] hover:underline cursor-pointer">
                      Click to choose a different file
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center">
                      <Upload size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        Drag & drop resume here, or <span className="text-[#00bda5] underline">browse</span>
                      </p>
                      <p className="text-[10px] text-zinc-400 mt-1">Supports files up to 10 MB</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Progress Indicator when uploading */}
              {isUploading && (
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-[#00bda5] flex items-center gap-1.5">
                      <RefreshCw size={12} className="animate-spin" />
                      {loadingMessage || 'Uploading & parsing resume...'}
                    </span>
                    <span className="text-zinc-500">{loadingProgress || 50}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#00bda5] transition-all duration-300 rounded-full shadow-[0_0_8px_#00bda5]"
                      style={{ width: `${loadingProgress || 50}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error Message */}
              {uploadError && (
                <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-2 text-rose-600 dark:text-rose-400 text-xs">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Modal Action Buttons */}
              <div className="mt-6 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => {
                    setShowModal(false);
                    setSelectedFile(null);
                    setUploadError(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={!selectedFile || isUploading}
                  onClick={() => handleStartUpload()}
                  className={`px-5 py-2.5 rounded-xl text-xs font-extrabold text-white transition flex items-center gap-2 cursor-pointer shadow-md ${
                    !selectedFile || isUploading
                      ? 'bg-zinc-300 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      : 'bg-[#00bda5] hover:bg-[#00a894] active:scale-95'
                  }`}
                >
                  {isUploading ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Parsing...</span>
                    </>
                  ) : (
                    <>
                      <span>Upload Resume</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
