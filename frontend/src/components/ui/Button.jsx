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
  const baseStyles = "inline-flex min-w-0 items-center justify-center gap-2 font-semibold transition-colors duration-150 focus:outline-none disabled:opacity-50 disabled:pointer-events-none rounded-[9px]";
  
  const variants = {
    primary: "bg-[#5B5CE2] text-white hover:bg-[#4B4CCD]",
    secondary: "bg-[#F2F4F7] text-[#344054] hover:bg-[#E4E7EC] dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700",
    ghost: "text-[#667085] hover:bg-[#F2F4F7] hover:text-[#111827] dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white",
    danger: "bg-red-50 text-[#D92D20] hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400",
    outline: "border border-[#E4E7EC] dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-[#F6F7F9] dark:hover:bg-zinc-800 text-[#344054] dark:text-zinc-100"
  };

  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base"
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : null}
      {children}
    </button>
  );
}
