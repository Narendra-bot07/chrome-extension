import React from 'react';
import { motion } from 'framer-motion';
import { cardVariants } from '../../utils/motion';

export function Card({ children, className = '', hover = false, variant = 'information', animateEntrance = false, ...props }) {
  const Component = animateEntrance ? motion.div : 'div';
  const animationProps = animateEntrance ? {
    variants: cardVariants,
    initial: "initial",
    animate: "animate",
    exit: "exit"
  } : {};

  return (
    <Component 
      className={`tf-card tf-card--${variant} ${hover ? 'tf-card--interactive' : ''} ${className}`}
      {...animationProps}
      {...props}
    >
      {children}
    </Component>
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
