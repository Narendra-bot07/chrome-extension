import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function ScorePill({ score, label, maxScore = 100, className }) {
  if (score == null || isNaN(Number(score))) {
    return (
      <span className={twMerge("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-normal text-tf-text-tertiary bg-tf-surface-2 border border-tf-border", className)}>
        —
      </span>
    );
  }

  const numericScore = Math.round(Number(score));
  const normalized = (numericScore / maxScore) * 100;

  let colorClasses = "bg-tf-warning/10 text-tf-warning border-tf-warning/20";
  if (normalized >= 75) {
    colorClasses = "bg-tf-success/10 text-tf-success border-tf-success/20";
  } else if (normalized >= 50) {
    colorClasses = "bg-tf-accent/10 text-tf-accent border-tf-accent/20";
  }

  return (
    <span
      className={twMerge(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums border shrink-0 transition-colors",
        colorClasses,
        className
      )}
    >
      {label && <span className="text-[10px] uppercase tracking-wider font-medium opacity-75">{label}</span>}
      <span>{maxScore === 100 && !label ? `${numericScore}%` : `${numericScore}${maxScore === 100 ? '' : `/${maxScore}`}`}</span>
    </span>
  );
}
