import React from 'react';
import { Sparkles, X, ArrowRight, Zap, CheckCircle2, Lock } from 'lucide-react';

export function QuotaExceededModal({ isOpen, onClose, onUpgrade, message, usage }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl space-y-6">
        
        {/* Header with Close */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Zap size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-zinc-950 dark:text-white">Free Demo Limit Reached</h3>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mt-0.5">Upgrade required to continue</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Message */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-sm text-zinc-700 dark:text-zinc-300 space-y-2">
          <p className="font-semibold">
            {message || "You have reached the free demo limit (5 JD extractions, 1 Resume generation, 1 Cover letter generation)."}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Subscribe to a paid plan to instantly unlock higher limits, priority processing, and unlimited tailoring!
          </p>
        </div>

        {/* Demo Usage Checklist */}
        <div className="space-y-2">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-400">Free Demo Limits</div>
          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">JD Extractions</span>
              <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Lock size={12} /> 5 / 5 Used
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Tailored Resume Generations</span>
              <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Lock size={12} /> 1 / 1 Used
              </span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Cover Letter Generations</span>
              <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Lock size={12} /> 1 / 1 Used
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <button
            onClick={() => {
              onClose();
              if (onUpgrade) onUpgrade();
            }}
            className="w-full rounded-xl py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 active:from-indigo-800 text-white font-black text-sm shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <span>Upgrade to Paid Plan</span>
            <ArrowRight size={18} />
          </button>
          <button
            onClick={onClose}
            className="w-full rounded-xl py-2.5 text-xs font-bold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            Maybe Later
          </button>
        </div>

      </div>
    </div>
  );
}
