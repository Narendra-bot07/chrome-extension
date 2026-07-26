import React from 'react';

export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div 
      className={`bg-tf-surface border border-tf-border rounded-lg shadow-sm transition-colors duration-150 ${hover ? 'hover:border-tf-border-strong hover:bg-tf-surface-2' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return <div className={`p-5 pb-4 border-b border-tf-border ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }) {
  return <h3 className={`text-base font-semibold tracking-tight text-tf-text ${className}`}>{children}</h3>;
}

export function CardDescription({ children, className = '' }) {
  return <p className={`text-sm text-tf-text-secondary mt-1 ${className}`}>{children}</p>;
}

export function CardContent({ children, className = '' }) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }) {
  return <div className={`p-5 pt-4 border-t border-tf-border flex items-center ${className}`}>{children}</div>;
}
