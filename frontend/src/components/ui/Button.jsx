import React from 'react';

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  isLoading = false,
  disabled = false,
  ...props 
}) {
  const baseStyles = "inline-flex min-w-0 items-center justify-center gap-2 font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-tf-accent focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none rounded-md cursor-pointer select-none";
  
  const variants = {
    primary: "bg-tf-accent text-tf-accent-fg hover:bg-tf-accent-hover border border-transparent",
    secondary: "bg-tf-surface text-tf-text hover:bg-tf-surface-2 border border-tf-border",
    ghost: "bg-transparent text-tf-text-secondary hover:bg-tf-surface-2 hover:text-tf-text border border-transparent",
    danger: "bg-tf-danger/10 text-tf-danger hover:bg-tf-danger/20 border border-transparent",
    outline: "bg-tf-surface text-tf-text hover:bg-tf-surface-2 border border-tf-border"
  };

  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-9 px-3.5 text-sm",
    lg: "h-10 px-4 text-sm"
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin h-3.5 w-3.5 text-current shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : null}
      {children}
    </button>
  );
}
