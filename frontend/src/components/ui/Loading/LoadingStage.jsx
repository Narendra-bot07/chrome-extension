import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const DEFAULT_STAGES = [
  'Loading your workspace...',
  'Fetching profile information...',
  'Preparing resume intelligence...',
  'Analyzing job description...',
  'Generating preview...',
  'Finalizing document...'
];

export function LoadingStage({ 
  stages = DEFAULT_STAGES, 
  interval = 2200, 
  className = '',
  textClassName = 'text-xs font-semibold text-tf-text-secondary' 
}) {
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    if (!stages || stages.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % stages.length);
    }, interval);

    return () => clearInterval(timer);
  }, [stages, interval]);

  const currentMessage = stages[currentIdx] || stages[0] || 'Processing...';

  return (
    <div className={`flex items-center gap-2 overflow-hidden select-none ${className}`}>
      <span className="w-2 h-2 rounded-full bg-tf-accent animate-pulse shrink-0" />
      <div className="relative h-5 overflow-hidden flex-1">
        <AnimatePresence mode="wait">
          <motion.span
            key={currentMessage}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className={`block truncate ${textClassName}`}
          >
            {currentMessage}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default LoadingStage;
