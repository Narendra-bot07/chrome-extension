import React from 'react';

export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div 
      className={`bg-white dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm transition-all duration-300 ${hover ? 'hover:border-zinc-300 dark:hover:border-zinc-700 hover:-translate-y-1 hover:shadow-md dark:hover:shadow-premium-dark' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return <div className={`p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800/50 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }) {
  return <h3 className={`text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }) {
  return <p className={`text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 ${className}`}>{children}</p>;
}

export function CardContent({ children, className = '' }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }) {
  return <div className={`p-6 pt-4 border-t border-zinc-100 dark:border-zinc-800/50 flex items-center ${className}`}>{children}</div>;
}
