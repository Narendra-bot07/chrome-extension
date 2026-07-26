import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt'];

export function validateResumeFile(file) {
  if (!file) return { valid: false, error: 'No file provided' };
  
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Only PDF, DOCX, and TXT files are supported (received ${ext || 'unknown'})` };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds 10MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)` };
  }

  return { valid: true };
}

export function ResumeDropzoneOverlay({ onDropFiles, children }) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragError, setDragError] = useState(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    let dragCounter = 0;

    const handleDragEnter = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
        setAnnouncement("Drop zone active. Release resume files to upload.");
      }
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter === 0) {
        setIsDragging(false);
        setDragError(null);
      }
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      setIsDragging(false);

      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length === 0) return;

      // Validate files
      const validFiles = [];
      const errors = [];

      files.forEach((file) => {
        const check = validateResumeFile(file);
        if (check.valid) {
          validFiles.push(file);
        } else {
          errors.push(`${file.name}: ${check.error}`);
        }
      });

      if (errors.length > 0) {
        setDragError(errors.join(' | '));
        setAnnouncement(`Upload warning: ${errors.join(' | ')}`);
        setTimeout(() => setDragError(null), 6000);
      }

      if (validFiles.length > 0) {
        setAnnouncement(`Uploading ${validFiles.length} file(s)...`);
        onDropFiles(validFiles);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [onDropFiles]);

  return (
    <div className="relative w-full">
      {/* Screen Reader ARIA Live Region */}
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      {/* Validation Error Toast */}
      {dragError && (
        <div className="mb-4 p-3 bg-tf-danger/10 border border-tf-danger/30 rounded-xl text-tf-danger text-xs font-semibold flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{dragError}</span>
        </div>
      )}

      {children}

      {/* Drag & Drop Full-Panel Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed inset-0 z-50 p-8 bg-tf-bg/85 backdrop-blur-md flex flex-col items-center justify-center pointer-events-none select-none"
          >
            <div className="w-full max-w-xl p-12 rounded-2xl border-2 border-dashed border-tf-accent bg-tf-surface shadow-2xl flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-tf-accent/10 border border-tf-accent/20 flex items-center justify-center text-tf-accent animate-bounce">
                <Upload size={32} strokeWidth={2} />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-tf-text">Drop resume to upload</h3>
                <p className="text-xs text-tf-text-secondary">
                  Supports PDF and DOCX files up to 10MB
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
