import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '../Button';

export function FadeSwap({
  isLoading = false,
  skeleton = null,
  children,
  minDisplayTime = 350,
  error = null,
  onRetry = null,
  onGoBack = null,
  className = ''
}) {
  const [showSkeleton, setShowSkeleton] = useState(isLoading);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (isLoading) {
      startTimeRef.current = Date.now();
      setShowSkeleton(true);
    } else {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, minDisplayTime - elapsed);

      const timer = setTimeout(() => {
        setShowSkeleton(false);
      }, remaining);

      return () => clearTimeout(timer);
    }
  }, [isLoading, minDisplayTime]);

  return (
    <div className={`relative w-full ${className}`}>
      <AnimatePresence mode="wait">
        {error ? (
          <motion.div
            key="error-state"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="p-6 rounded-2xl bg-tf-surface border border-tf-border/80 flex flex-col items-center justify-center text-center space-y-3 shadow-xs"
          >
            <div className="w-10 h-10 rounded-xl bg-tf-danger/10 text-tf-danger flex items-center justify-center border border-tf-danger/20">
              <AlertTriangle size={20} />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-sm font-bold text-tf-text">We couldn't load this section</h3>
              <p className="text-xs text-tf-text-secondary">
                {typeof error === 'string' ? error : error.message || 'An unexpected error occurred while loading content.'}
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              {onRetry && (
                <Button variant="secondary" size="sm" onClick={onRetry} className="gap-1.5 text-xs">
                  <RefreshCw size={14} />
                  Retry
                </Button>
              )}
              {onGoBack && (
                <Button variant="ghost" size="sm" onClick={onGoBack} className="gap-1.5 text-xs">
                  <ArrowLeft size={14} />
                  Go back
                </Button>
              )}
            </div>
          </motion.div>
        ) : showSkeleton ? (
          <motion.div
            key="skeleton-state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeInOut' }}
            className="w-full"
          >
            {skeleton}
          </motion.div>
        ) : (
          <motion.div
            key="content-state"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="w-full"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default FadeSwap;
