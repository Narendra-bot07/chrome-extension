import React from 'react';
import { SkeletonHeading, SkeletonCard, SkeletonTable, SkeletonText } from './SkeletonComponents';
import { AnimatedSkeleton } from './AnimatedSkeleton';
import { LoadingStage } from './LoadingStage';

export function PageLoadingState({ 
  type = 'dashboard', 
  stages = null, 
  statusText = 'Loading TailorFlow AI...',
  className = '' 
}) {
  const renderDashboardSkeleton = () => (
    <div className="flex-1 flex flex-col gap-6 max-w-7xl mx-auto w-full pb-12">
      {/* Header & Status */}
      <div className="flex flex-col gap-2">
        <SkeletonHeading />
        {stages && <LoadingStage stages={stages} className="mt-1" />}
      </div>

      {/* 4 Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="p-5 rounded-2xl bg-tf-surface border border-tf-border flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
              <div className="space-y-2 w-full">
                <AnimatedSkeleton variant="subtitle" width={80} staggerIndex={idx} />
                <AnimatedSkeleton variant="heading" width={60} height={28} staggerIndex={idx + 1} />
              </div>
              <AnimatedSkeleton variant="avatar" width={36} height={36} staggerIndex={idx} />
            </div>
            <AnimatedSkeleton variant="text" width={110} height={12} staggerIndex={idx + 2} />
          </div>
        ))}
      </div>

      {/* 5 Job Pipeline Stages */}
      <div className="p-5 rounded-2xl bg-tf-surface border border-tf-border space-y-4">
        <div className="flex justify-between items-center">
          <AnimatedSkeleton variant="title" width={140} />
          <AnimatedSkeleton variant="button" width={90} height={28} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-tf-surface-2/60 border border-tf-border space-y-3">
              <div className="flex justify-between items-center">
                <AnimatedSkeleton variant="title" width={70} height={16} staggerIndex={idx} />
                <AnimatedSkeleton variant="text" width={24} height={16} staggerIndex={idx} />
              </div>
              <SkeletonText lines={2} gap="gap-2" />
            </div>
          ))}
        </div>
      </div>

      {/* 2 Grid Columns: Trends + Applications */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-5 rounded-2xl bg-tf-surface border border-tf-border space-y-4 h-72">
          <div className="flex justify-between items-center">
            <AnimatedSkeleton variant="title" width={160} />
            <AnimatedSkeleton variant="button" width={100} height={28} />
          </div>
          <AnimatedSkeleton variant="card" height={180} />
        </div>
        <div className="p-5 rounded-2xl bg-tf-surface border border-tf-border space-y-4 h-72">
          <AnimatedSkeleton variant="title" width={120} />
          <SkeletonText lines={4} />
        </div>
      </div>
    </div>
  );

  const renderResumeSkeleton = () => (
    <div className="flex-1 flex flex-col gap-6 max-w-5xl mx-auto w-full pb-12">
      <SkeletonHeading />
      <div className="p-8 rounded-2xl bg-tf-surface border border-tf-border space-y-6">
        {/* Candidate Header */}
        <div className="flex flex-col items-center gap-3 text-center border-b border-tf-border pb-6">
          <AnimatedSkeleton variant="heading" width={220} height={32} />
          <AnimatedSkeleton variant="title" width={160} height={16} />
          <div className="flex items-center gap-4 pt-1">
            <AnimatedSkeleton variant="text" width={100} height={12} />
            <AnimatedSkeleton variant="text" width={100} height={12} />
            <AnimatedSkeleton variant="text" width={100} height={12} />
          </div>
        </div>
        {/* Sections */}
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="space-y-3">
              <AnimatedSkeleton variant="title" width={130} height={20} staggerIndex={idx} />
              <SkeletonText lines={3} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderJobTrackerSkeleton = () => (
    <div className="flex-1 flex flex-col gap-6 max-w-7xl mx-auto w-full pb-12">
      <div className="flex justify-between items-center">
        <SkeletonHeading />
        <AnimatedSkeleton variant="button" width={120} height={36} />
      </div>
      <SkeletonTable rows={6} cols={5} />
    </div>
  );

  const renderGenericSkeleton = () => (
    <div className="flex-1 flex flex-col gap-6 max-w-5xl mx-auto w-full pb-12">
      <SkeletonHeading />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SkeletonCard numRows={4} />
        <SkeletonCard numRows={4} />
      </div>
    </div>
  );

  const renderContent = () => {
    switch (type) {
      case 'dashboard':
        return renderDashboardSkeleton();
      case 'resume':
        return renderResumeSkeleton();
      case 'job-tracker':
        return renderJobTrackerSkeleton();
      default:
        return renderGenericSkeleton();
    }
  };

  return (
    <div className={`w-full ${className}`}>
      {renderContent()}
    </div>
  );
}

export default PageLoadingState;
