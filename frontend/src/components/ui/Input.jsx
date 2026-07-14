import React, { forwardRef } from 'react';

export const Input = forwardRef(({ className = '', error, icon: Icon, ...props }, ref) => {
  return (
    <div className="relative w-full">
      {Icon && (
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Icon className="h-5 w-5 text-zinc-400" />
        </div>
      )}
      <input
        ref={ref}
        className={`w-full flex h-10 rounded-lg border bg-transparent px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${
          error 
            ? 'border-red-500 focus-visible:ring-red-500' 
            : 'border-zinc-300 dark:border-zinc-700 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600'
        } ${Icon ? 'pl-10' : ''} ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1.5 text-[13px] text-red-500 font-medium">{error}</p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export const Label = ({ children, className = '', required, ...props }) => {
  return (
    <label className={`block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5 ${className}`} {...props}>
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
};
