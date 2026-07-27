import React from 'react';
import { AnimatedSkeleton } from './AnimatedSkeleton';

export function SkeletonText({ lines = 3, gap = 'gap-2.5', className = '' }) {
  return (
    <div className={`flex flex-col ${gap} ${className}`}>
      {Array.from({ length: lines }).map((_, idx) => (
        <AnimatedSkeleton 
          key={idx} 
          variant="text" 
          staggerIndex={idx}
          className={idx === lines - 1 && lines > 1 ? 'w-4/5' : 'w-full'}
        />
      ))}
    </div>
  );
}

export function SkeletonHeading({ className = '' }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <AnimatedSkeleton variant="heading" staggerIndex={0} />
      <AnimatedSkeleton variant="subtitle" staggerIndex={1} />
    </div>
  );
}

export function SkeletonCard({ hasHeader = true, numRows = 3, className = '' }) {
  return (
    <div className={`p-5 rounded-2xl bg-tf-surface border border-tf-border flex flex-col gap-4 shadow-xs ${className}`}>
      {hasHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AnimatedSkeleton variant="avatar" staggerIndex={0} />
            <div className="flex flex-col gap-1.5">
              <AnimatedSkeleton variant="title" width={140} staggerIndex={1} />
              <AnimatedSkeleton variant="subtitle" width={90} staggerIndex={2} />
            </div>
          </div>
          <AnimatedSkeleton variant="button" width={70} height={28} staggerIndex={2} />
        </div>
      )}
      <SkeletonText lines={numRows} />
    </div>
  );
}

export function SkeletonTable({ rows = 4, cols = 4, className = '' }) {
  return (
    <div className={`w-full rounded-2xl bg-tf-surface border border-tf-border overflow-hidden p-4 space-y-3 ${className}`}>
      {/* Header Row */}
      <div className="flex items-center gap-4 pb-3 border-b border-tf-border">
        {Array.from({ length: cols }).map((_, cIdx) => (
          <AnimatedSkeleton key={cIdx} variant="title" height={16} staggerIndex={cIdx} className="flex-1" />
        ))}
      </div>
      {/* Table Rows */}
      {Array.from({ length: rows }).map((_, rIdx) => (
        <div key={rIdx} className="flex items-center gap-4 py-2">
          {Array.from({ length: cols }).map((_, cIdx) => (
            <AnimatedSkeleton key={cIdx} variant="text" height={14} staggerIndex={rIdx * cols + cIdx} className="flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 'md', className = '' }) {
  const sizeMap = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20'
  };
  return <AnimatedSkeleton variant="avatar" className={`${sizeMap[size] || 'w-10 h-10'} ${className}`} />;
}

export function SkeletonButton({ size = 'md', className = '' }) {
  const sizeMap = {
    sm: 'h-7 w-20',
    md: 'h-9 w-24',
    lg: 'h-11 w-32'
  };
  return <AnimatedSkeleton variant="button" className={`${sizeMap[size] || 'h-9 w-24'} ${className}`} />;
}
