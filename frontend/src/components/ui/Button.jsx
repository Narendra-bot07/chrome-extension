import React from 'react';
import { motion } from 'framer-motion';
import { buttonMotion } from '../../utils/motion';

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  isLoading = false,
  disabled = false,
  ...props 
}) {
  const baseStyles = "tf-button inline-flex min-w-0 items-center justify-center gap-2 font-semibold focus-visible:outline-2 focus-visible:outline-tf-accent focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none rounded-lg cursor-pointer select-none";
  
  const variants = {
    primary: "bg-tf-accent text-tf-accent-fg hover:bg-tf-accent-hover border border-transparent shadow-2xs hover:shadow-xs",
    secondary: "bg-tf-surface text-tf-text hover:bg-tf-surface-2 border border-tf-border shadow-2xs hover:shadow-xs",
    ghost: "bg-transparent text-tf-text-secondary hover:bg-tf-surface-2 hover:text-tf-text border border-transparent",
    danger: "bg-tf-danger/10 text-tf-danger hover:bg-tf-danger/20 border border-transparent",
    outline: "bg-tf-surface text-tf-text hover:bg-tf-surface-2 border border-tf-border shadow-2xs"
  };

  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-9 px-3.5 text-sm",
    lg: "h-10 px-4 text-sm"
  };

  const isInteractive = !disabled && !isLoading;

  return (
    <motion.button
      whileHover={isInteractive ? buttonMotion.whileHover.whileHover : undefined}
      whileTap={isInteractive ? buttonMotion.whileTap.whileTap : undefined}
      className={`${baseStyles} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="tf-button__loading" aria-hidden="true"><i /><i /><i /></span>
      ) : null}
      {children}
    </motion.button>
  );
}

export default Button;
