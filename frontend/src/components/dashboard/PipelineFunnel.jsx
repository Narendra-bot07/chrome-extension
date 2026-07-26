import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { StagePill } from './StagePill';

export function PipelineFunnel({ stages }) {
  if (!stages || stages.length === 0) return null;

  // Find biggest drop-off stage (highest conversion loss)
  let maxDropIdx = -1;
  let maxDropDiff = 0;

  for (let i = 1; i < stages.length - 2; i++) { // exclude terminal
    const prev = stages[i - 1].count;
    const curr = stages[i].count;
    const drop = prev - curr;
    if (drop > maxDropDiff && prev > 0) {
      maxDropDiff = drop;
      maxDropIdx = i;
    }
  }

  return (
    <div className="space-y-3">
      {stages.map(({ stage, count, percent, label }, idx) => {
        const isBiggestDrop = idx === maxDropIdx;
        
        return (
          <div key={stage} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <StagePill stage={stage} />
                {isBiggestDrop && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-tf-warning/10 text-tf-warning border border-tf-warning/20">
                    <AlertCircle size={10} />
                    <span>Biggest drop-off</span>
                  </span>
                )}
              </div>
              <span className="font-semibold text-tf-text tabular-nums">
                {count} <span className="text-tf-text-tertiary font-normal">({percent}% {label})</span>
              </span>
            </div>

            <div className="h-2.5 w-full bg-tf-surface-2 rounded-full overflow-hidden border border-tf-border/50">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
                transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                className={`h-full rounded-full ${
                  stage === 'Rejected'
                    ? 'bg-tf-danger'
                    : stage === 'Archived'
                    ? 'bg-tf-text-tertiary'
                    : stage === 'Accepted' || stage === 'Offer'
                    ? 'bg-tf-success'
                    : 'bg-tf-accent'
                }`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
