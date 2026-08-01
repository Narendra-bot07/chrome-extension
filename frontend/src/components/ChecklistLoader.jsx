import React from 'react';
import { Check, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

function ChecklistLoader({ title, progress = 0, message, checklistItems = [] }) {
  return (
    <div className="min-h-[calc(100vh-64px)] w-full bg-slate-50/50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 select-none font-sans">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col items-center text-center space-y-5">
        
        {/* Animated Brand Spinner Box */}
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-[#00bda5]/10 border border-[#00bda5]/20 flex items-center justify-center text-[#00bda5] shadow-sm">
            <Loader2 className="w-6 h-6 animate-spin tf-loader-spinner" />
          </div>
        </div>

        {/* Title & Message */}
        <div className="space-y-1 w-full">
          <h3 className="text-base font-extrabold tracking-tight text-zinc-900 dark:text-white">
            {title}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium min-h-[1.25rem] flex items-center justify-center">
            {message || "Processing..."}
          </p>
        </div>

        {/* Glowing Progress Bar */}
        <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden relative shadow-inner">
          <motion.div
            className="h-full bg-[#00bda5] rounded-full shadow-[0_0_10px_#00bda5] transition-all duration-300"
            initial={{ width: "5%" }}
            animate={{ width: `${Math.max(5, Math.min(100, progress))}%` }}
          />
        </div>

        {/* Stable Checklist Container */}
        <div className="w-full bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/70 dark:border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 text-left">
          {checklistItems.map((item, idx) => {
            const isDone = progress >= item.progressThreshold;
            const isPending = !isDone && (idx === 0 || progress >= (checklistItems[idx - 1]?.progressThreshold || 0));

            return (
              <div
                key={item.label || idx}
                className="flex items-center gap-3 py-0.5 min-h-[24px]"
              >
                {/* Status Indicator Icon */}
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    isDone
                      ? 'bg-[#00bda5] text-white shadow-xs'
                      : isPending
                      ? 'bg-[#00bda5]/15 border-2 border-[#00bda5] text-[#00bda5]'
                      : 'bg-zinc-100 dark:bg-zinc-800 border border-zinc-300/80 dark:border-zinc-700 text-transparent'
                  }`}
                >
                  {isDone ? (
                    <Check size={12} strokeWidth={3} />
                  ) : isPending ? (
                    <Loader2 size={11} className="animate-spin text-[#00bda5]" />
                  ) : null}
                </div>

                {/* Item Label */}
                <span
                  className={`text-xs transition-colors ${
                    isDone
                      ? 'text-zinc-800 dark:text-zinc-200 font-semibold'
                      : isPending
                      ? 'text-[#00bda5] font-extrabold'
                      : 'text-zinc-400 dark:text-zinc-500 font-medium'
                  }`}
                >
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

export default ChecklistLoader;
