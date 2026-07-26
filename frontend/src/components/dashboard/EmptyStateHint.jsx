import React from 'react';
import { ArrowRight } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export function EmptyStateHint({ message, actionLabel, onAction, className }) {
  return (
    <div className={twMerge("flex items-center gap-1.5 text-xs text-tf-text-tertiary font-normal", className)}>
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAction();
          }}
          className="inline-flex items-center gap-0.5 text-tf-accent font-medium hover:underline cursor-pointer"
        >
          <span>{actionLabel}</span>
          <ArrowRight size={12} />
        </button>
      )}
    </div>
  );
}
