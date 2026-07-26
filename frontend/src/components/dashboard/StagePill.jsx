import React from 'react';
import { twMerge } from 'tailwind-merge';

const STAGE_CONFIG = {
  'Ready To Apply': { bg: 'bg-tf-surface-2', text: 'text-tf-text-secondary', border: 'border-tf-border' },
  'Applied': { bg: 'bg-tf-accent/10', text: 'text-tf-accent', border: 'border-tf-accent/20' },
  'Assessment': { bg: 'bg-tf-warning/10', text: 'text-tf-warning', border: 'border-tf-warning/20' },
  'Recruiter': { bg: 'bg-tf-accent/10', text: 'text-tf-accent', border: 'border-tf-accent/20' },
  'Interview': { bg: 'bg-tf-warning/10', text: 'text-tf-warning', border: 'border-tf-warning/20' },
  'Final Round': { bg: 'bg-tf-warning/10', text: 'text-tf-warning', border: 'border-tf-warning/20' },
  'Offer': { bg: 'bg-tf-success/10', text: 'text-tf-success', border: 'border-tf-success/20' },
  'Accepted': { bg: 'bg-tf-success/10', text: 'text-tf-success', border: 'border-tf-success/20' },
  'Rejected': { bg: 'bg-tf-danger/10', text: 'text-tf-danger', border: 'border-tf-danger/20' },
  'Archived': { bg: 'bg-tf-surface-2', text: 'text-tf-text-tertiary', border: 'border-tf-border' }
};

export function StagePill({ stage, className }) {
  const config = STAGE_CONFIG[stage] || { bg: 'bg-tf-surface-2', text: 'text-tf-text-secondary', border: 'border-tf-border' };

  return (
    <span
      className={twMerge(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0 transition-colors",
        config.bg,
        config.text,
        config.border,
        className
      )}
    >
      {stage || 'Unknown'}
    </span>
  );
}
