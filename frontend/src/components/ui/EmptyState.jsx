import React from 'react';
import { Button } from './Button';

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  primaryAction, 
  secondaryAction,
  className = '' 
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center p-8 py-12 rounded-xl border border-tf-border bg-tf-surface ${className}`}>
      {Icon && (
        <div className="mb-4 text-tf-text-tertiary">
          <Icon className="w-10 h-10 stroke-[1.5]" />
        </div>
      )}
      <div className="max-w-[320px] mx-auto">
        <h2 className="text-lg font-semibold tracking-tight text-tf-text mb-1">
          {title}
        </h2>
        <p className="text-sm text-tf-text-secondary leading-normal mb-6">
          {description}
        </p>
      </div>
      
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center justify-center gap-2">
          {secondaryAction && (
            <Button variant="secondary" size="md" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
          {primaryAction && (
            <Button variant="primary" size="md" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

