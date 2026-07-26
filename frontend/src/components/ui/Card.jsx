import React from 'react';

export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div 
      className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[14px] transition-colors duration-150 ${hover ? 'hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return <div className={`p-5 pb-4 border-b border-zinc-100 dark:border-zinc-800/50 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }) {
  return <h3 className={`text-base font-semibold tracking-[-0.01em] text-zinc-900 dark:text-zinc-50 ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }) {
  return <p className={`text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 ${className}`}>{children}</p>;
}

export function CardContent({ children, className = '' }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }) {
  return <div className={`p-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/50 flex items-center ${className}`}>{children}</div>;
}
