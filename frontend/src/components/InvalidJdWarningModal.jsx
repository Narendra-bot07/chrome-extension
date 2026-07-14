import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

function InvalidJdWarningModal({ isOpen, onClose, onPasteManually }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-5 select-none font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-[#0c0c0e] border border-slate-200 dark:border-slate-850 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-premium"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-550 flex-shrink-0">
            <AlertCircle size={18} />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">Invalid Job Details</h3>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Scanned page is not a job posting</p>
          </div>
        </div>

        <p className="text-[10.5px] leading-relaxed text-slate-550 dark:text-slate-400">
          The content on this page does not appear to contain job requirements or recruitment details. Please navigate to a job posting (e.g., on LinkedIn, Indeed, or Greenhouse) and try again, or paste the text manually.
        </p>

        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={onPasteManually}
            className="flex-1 py-2.5 border border-slate-200 dark:border-slate-850 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 font-bold text-[10px] uppercase tracking-wider rounded-xl transition cursor-pointer"
          >
            Paste Manually
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold text-[10px] uppercase tracking-wider rounded-xl transition shadow-md cursor-pointer"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default InvalidJdWarningModal;
