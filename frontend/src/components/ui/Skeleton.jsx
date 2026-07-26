import React from 'react';

export function Skeleton({ className = '', ...props }) {
  return (
    <div 
      className={`tf-skeleton rounded-sm ${className}`} 
      {...props} 
    />
  );
}
