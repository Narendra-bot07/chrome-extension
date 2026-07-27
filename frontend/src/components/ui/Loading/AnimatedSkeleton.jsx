import React from 'react';
import { motion } from 'framer-motion';

export function AnimatedSkeleton({ 
  variant = 'text', 
  width, 
  height, 
  staggerIndex = 0, 
  className = '', 
  ...props 
}) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'heading':
        return 'h-7 w-2/5 rounded-lg';
      case 'title':
        return 'h-5 w-3/4 rounded-md';
      case 'text':
        return 'h-4 w-full rounded-md';
      case 'subtitle':
        return 'h-3.5 w-1/2 rounded-md';
      case 'avatar':
        return 'w-10 h-10 rounded-full shrink-0';
      case 'button':
        return 'h-9 w-24 rounded-xl';
      case 'card':
        return 'h-32 w-full rounded-2xl';
      case 'table-row':
        return 'h-12 w-full rounded-xl';
      default:
        return 'h-4 w-full rounded-md';
    }
  };

  const styleProps = {};
  if (width) styleProps.width = width;
  if (height) styleProps.height = height;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        duration: 0.2, 
        delay: staggerIndex * 0.05, 
        ease: 'easeOut' 
      }}
      className={`tf-skeleton ${getVariantStyles()} ${className}`}
      style={{ ...styleProps, ...props.style }}
      {...props}
    />
  );
}

export default AnimatedSkeleton;
