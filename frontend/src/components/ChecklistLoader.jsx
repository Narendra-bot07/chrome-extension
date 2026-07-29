import React from 'react';
import { Check, Circle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AnimatedProgress, MotionList, useTailr4uReducedMotion
} from '../motion/MotionSystem';

function ChecklistLoader({ title, progress, message, checklistItems }) {
  const reducedMotion = useTailr4uReducedMotion();
  return (
    <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-12 select-none font-sans max-w-sm mx-auto">
      <div className="w-9 h-9 rounded-md bg-tf-surface border border-tf-border shadow-sm flex items-center justify-center">
        <motion.svg
          className="h-4 w-4 text-tf-accent shrink-0"
          animate={reducedMotion ? { opacity: [0.55, 1, 0.55] } : { rotate: 360 }}
          transition={reducedMotion
            ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.9, repeat: Infinity, ease: 'linear' }}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </motion.svg>
      </div>

      <div className="text-center space-y-1">
        <h3 className="text-sm font-semibold tracking-tight text-tf-text">{title}</h3>
        <p className="text-xs text-tf-text-secondary font-normal h-4 leading-none">{message}</p>
      </div>

      <AnimatedProgress value={progress} className="w-48 h-1 bg-tf-surface-2 border border-tf-border rounded-full" barClassName="bg-tf-accent rounded-full" />

      <MotionList className="w-full bg-tf-surface border border-tf-border rounded-lg p-4 space-y-2.5 text-xs text-tf-text-secondary shadow-sm">
        {checklistItems.map((item, idx) => {
          const isDone = progress >= item.progressThreshold;
          const isPending = progress < item.progressThreshold && (idx === 0 || progress >= checklistItems[idx - 1].progressThreshold);
          return (
            <motion.div
              layout
              key={item.label || idx}
              animate={isPending && !reducedMotion ? { x: [0, 2, 0] } : { x: 0 }}
              transition={isPending && !reducedMotion
                ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }
                : { duration: 0.2 }}
              className="flex items-center gap-2.5 font-medium"
            >
              <motion.span
                animate={isPending && !reducedMotion
                  ? { scale: [1, 1.12, 1], boxShadow: ['0 0 0 0 rgba(59,130,246,0)', '0 0 0 5px rgba(59,130,246,.12)', '0 0 0 0 rgba(59,130,246,0)'] }
                  : { scale: 1, boxShadow: '0 0 0 0 rgba(59,130,246,0)' }}
                transition={isPending && !reducedMotion
                  ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' }
                  : { duration: 0.2 }}
                className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                isDone ? 'bg-tf-accent/15 text-tf-accent' : isPending ? 'bg-tf-surface-2 border border-tf-accent text-tf-accent' : 'bg-tf-surface-2 border border-tf-border text-tf-text-tertiary'
              }`}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={isDone ? 'done' : 'pending'} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                    {isDone ? <Check size={10} strokeWidth={2.5} /> : <Circle size={6} />}
                  </motion.span>
                </AnimatePresence>
              </motion.span>
              <span className={isDone ? 'line-through text-tf-text-tertiary' : isPending ? 'text-tf-text font-semibold' : 'text-tf-text-secondary'}>{item.label}</span>
            </motion.div>
          );
        })}
      </MotionList>
    </div>
  );
}

export default ChecklistLoader;
