import React from 'react';
import { AnimatedSkeleton } from './Loading/AnimatedSkeleton';

export function Skeleton({ className = '', ...props }) {
  return (
    <AnimatedSkeleton 
      className={className} 
      {...props} 
    />
  );
}

export default Skeleton;
