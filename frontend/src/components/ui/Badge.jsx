import React from 'react';

export function Badge({ 
  children, 
  variant = 'neutral', 
  className = '', 
  ...props 
}) {
  const baseStyles = "inline-flex items-center justify-center h-[22px] px-2 text-xs font-medium rounded-sm border transition-colors select-none";

  const variants = {
    neutral: "bg-tf-surface-2 text-tf-text-secondary border-tf-border",
    accent: "bg-tf-accent/10 text-tf-accent border-tf-accent/20",
    success: "bg-tf-success/10 text-tf-success border-tf-success/20",
    warning: "bg-tf-warning/10 text-tf-warning border-tf-warning/20",
    danger: "bg-tf-danger/10 text-tf-danger border-tf-danger/20",
  };

  return (
    <span 
      className={`${baseStyles} ${variants[variant] || variants.neutral} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
