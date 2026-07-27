import React, { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const Input = forwardRef(({ className = '', error, helper, label, icon: Icon, ...props }, ref) => {
  return (
    <div className="relative w-full">
      {label && (
        <label className="block text-[13px] font-medium text-tf-text mb-1.5 transition-colors">
          {label}
        </label>
      )}
      <div className="relative w-full">
        {Icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon className="h-4 w-4 text-tf-text-tertiary transition-colors" />
          </div>
        )}
        <input
          ref={ref}
          className={`w-full flex h-9 rounded-md border bg-tf-surface px-3 py-1.5 text-sm text-tf-text placeholder:text-tf-text-tertiary focus:outline-none focus:ring-3 focus:ring-tf-accent/15 focus:border-tf-accent disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 ${
            error 
              ? 'border-tf-danger focus:ring-tf-danger/15 focus:border-tf-danger' 
              : 'border-tf-border hover:border-tf-border-strong'
          } ${Icon ? 'pl-9' : ''} ${className}`}
          {...props}
        />
      </div>
      <AnimatePresence mode="wait">
        {error ? (
          <motion.p
            key="error-msg"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="mt-1 text-xs text-tf-danger font-normal"
          >
            {error}
          </motion.p>
        ) : helper ? (
          <p key="helper-msg" className="mt-1 text-xs text-tf-text-tertiary font-normal">{helper}</p>
        ) : null}
      </AnimatePresence>
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
