import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';

const FLOW_STEPS = [
  { path: '/resume-detect', label: 'Resume' },
  { path: '/resume-review', label: 'Verify' },
  { path: '/tailor', label: 'Job' },
  { path: '/tailor-config', label: 'Configure' },
  { path: '/tailor-progress', label: 'Tailor' },
  { path: '/review-changes', label: 'Review' },
  { path: '/templates', label: 'Style' },
  { path: '/download', label: 'Export' },
];

export function FlowStepper() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  const isFlowRoute = FLOW_STEPS.some((step) => step.path === currentPath) || currentPath === '/resume-parse';
  if (!isFlowRoute) return null;

  const getCurrentIndex = () => {
    if (currentPath === '/resume-parse') return 0;
    const idx = FLOW_STEPS.findIndex((s) => s.path === currentPath);
    return idx >= 0 ? idx : 0;
  };

  const currentIndex = getCurrentIndex();

  return (
    <div className="w-full h-[56px] border-b border-tf-border bg-tf-surface flex items-center justify-center px-4 sm:px-8 flex-shrink-0 select-none">
      <div className="max-w-[1200px] w-full flex items-center justify-between overflow-x-auto no-scrollbar gap-2 py-2">
        {FLOW_STEPS.map((step, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;

          return (
            <div 
              key={step.path}
              onClick={() => {
                if (isCompleted) {
                  navigate(step.path);
                }
              }}
              className={`flex items-center gap-2 cursor-pointer transition-colors shrink-0 ${
                isCurrent 
                  ? 'text-tf-accent font-semibold' 
                  : isCompleted 
                  ? 'text-tf-text hover:text-tf-accent font-medium' 
                  : 'text-tf-text-tertiary cursor-default font-normal'
              }`}
            >
              <div 
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-medium transition-colors ${
                  isCompleted 
                    ? 'bg-tf-accent/15 text-tf-accent' 
                    : isCurrent 
                    ? 'bg-tf-accent text-tf-accent-fg' 
                    : 'bg-tf-surface-2 text-tf-text-tertiary border border-tf-border'
                }`}
              >
                {isCompleted ? <Check size={12} strokeWidth={2.5} /> : idx + 1}
              </div>
              <span className="text-xs tracking-tight whitespace-nowrap">
                {step.label}
              </span>
              {idx < FLOW_STEPS.length - 1 && (
                <div className={`w-4 sm:w-8 h-[1px] mx-1 ${isCompleted ? 'bg-tf-accent/30' : 'bg-tf-border'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
