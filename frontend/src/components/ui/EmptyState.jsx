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
    <div className={`flex flex-col items-center justify-center text-center p-8 py-16 rounded-2xl border border-zinc-200/60 dark:border-zinc-850 bg-white dark:bg-zinc-900/10 ${className}`}>
      {Icon && (
        <div className="w-12 h-12 mb-5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-150 dark:border-zinc-800 flex items-center justify-center">
          <Icon className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
        </div>
      )}
      <h3 className="text-sm font-black uppercase tracking-widest text-zinc-950 dark:text-zinc-50 mb-1.5 font-sans">
        {title}
      </h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mb-6 leading-relaxed font-medium">
        {description}
      </p>
      
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center gap-3">
          {secondaryAction && (
            <Button variant="outline" size="sm" onClick={secondaryAction.onClick} className="text-xs font-bold rounded-lg border-zinc-200 dark:border-zinc-800">
              {secondaryAction.label}
            </Button>
          )}
          {primaryAction && (
            <Button variant="primary" size="sm" onClick={primaryAction.onClick} className="text-xs font-bold rounded-lg bg-[#00bda5] text-white hover:bg-[#00a894] dark:bg-[#00bda5] dark:hover:bg-[#00a894]">
              {primaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
