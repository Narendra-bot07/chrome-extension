import React, { forwardRef } from 'react';

export const Input = forwardRef(({ className = '', error, helper, label, icon: Icon, ...props }, ref) => {
  return (
    <div className="relative w-full">
      {label && (
        <label className="block text-[13px] font-medium text-tf-text mb-1.5">
          {label}
        </label>
      )}
      <div className="relative w-full">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon className="h-4 w-4 text-tf-text-tertiary" />
          </div>
        )}
        <input
          ref={ref}
          className={`w-full flex h-9 rounded-md border bg-tf-surface px-3 py-1.5 text-sm text-tf-text placeholder:text-tf-text-tertiary focus:outline-none focus:ring-3 focus:ring-tf-accent/15 focus:border-tf-accent disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${
            error 
              ? 'border-tf-danger' 
              : 'border-tf-border hover:border-tf-border-strong'
          } ${Icon ? 'pl-9' : ''} ${className}`}
          {...props}
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs text-tf-danger font-normal">{error}</p>
      ) : helper ? (
        <p className="mt-1 text-xs text-tf-text-tertiary font-normal">{helper}</p>
      ) : null}
    </div>
  );
});

Input.displayName = 'Input';

export const Label = ({ children, className = '', required, ...props }) => {
  return (
    <label className={`block text-[13px] font-medium text-tf-text mb-1.5 ${className}`} {...props}>
      {children}
      {required && <span className="text-tf-danger ml-0.5">*</span>}
    </label>
  );
};
