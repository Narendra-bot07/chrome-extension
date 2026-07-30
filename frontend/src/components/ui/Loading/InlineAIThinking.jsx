import React from 'react';
import { motion } from 'framer-motion';
import { Wand2, Bot } from 'lucide-react';
import { LoadingStage } from './LoadingStage';

export function InlineAIThinking({
  statusText = 'tailr4u is thinking...',
  stages = null,
  isStreaming = false,
  streamText = '',
  className = ''
}) {
  return (
    <div className={`p-4 rounded-2xl bg-tf-surface-2/70 border border-tf-border/60 flex flex-col gap-3 backdrop-blur-xs select-none ${className}`}>
      {/* Activity Indicator + Status Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-tf-accent/15 text-tf-accent border border-tf-accent/25 flex items-center justify-center shrink-0">
          <motion.div
            animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          >
            <Wand2 size={15} />
          </motion.div>
        </div>

        {stages ? (
          <LoadingStage stages={stages} className="flex-1" />
        ) : (
          <div className="flex items-center gap-2 text-xs font-semibold text-tf-text-secondary overflow-hidden">
            <span className="w-2 h-2 rounded-full bg-tf-accent animate-pulse shrink-0" />
            <span className="truncate">{statusText}</span>
          </div>
        )}
      </div>

      {/* Streaming or Placeholder Skeleton Response */}
      {isStreaming && streamText ? (
        <div className="text-xs text-tf-text leading-relaxed font-sans pt-1 border-t border-tf-border/40">
          {streamText}
          <span className="inline-block w-1.5 h-3 bg-tf-accent ml-0.5 animate-pulse align-middle" />
        </div>
      ) : (
        <div className="space-y-2 pt-1 border-t border-tf-border/40">
          <motion.div 
            initial={{ opacity: 0.5 }}
            animate={{ opacity: [0.5, 0.85, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
            className="tf-skeleton h-3.5 w-full rounded-md"
          />
          <motion.div 
            initial={{ opacity: 0.5 }}
            animate={{ opacity: [0.5, 0.85, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut', delay: 0.2 }}
            className="tf-skeleton h-3.5 w-4/5 rounded-md"
          />
        </div>
      )}
    </div>
  );
}

export default InlineAIThinking;
