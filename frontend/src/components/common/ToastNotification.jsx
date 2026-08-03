import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export function ToastNotification({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => {
      onDismiss?.();
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const { type = 'info', message, title } = toast;

  const iconMap = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />,
    info: <Info className="w-5 h-5 text-indigo-500 shrink-0" />
  };

  const badgeBgMap = {
    success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300',
    error: 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300',
    warning: 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300',
    info: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-300'
  };

  return (
    <div className="fixed top-5 right-5 z-[99999] pointer-events-none max-w-md w-full px-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={toast.id || message}
          initial={{ opacity: 0, y: -24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border backdrop-blur-xl shadow-2xl bg-white/95 dark:bg-zinc-900/95 text-zinc-900 dark:text-zinc-100 ${badgeBgMap[type] || badgeBgMap.info}`}
        >
          {iconMap[type] || iconMap.info}

          <div className="flex-1 min-w-0 pt-0.5">
            {title && <h4 className="text-xs font-black uppercase tracking-wider mb-0.5">{title}</h4>}
            <p className="text-xs font-semibold leading-relaxed break-words">{message}</p>
          </div>

          <button
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
