import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export function CreditsRing({ remaining, used, isUnlimited, insights = [] }) {
  const total = isUnlimited ? 100 : (remaining + used) || 1;
  const percentage = isUnlimited ? 100 : Math.min(100, Math.round((used / total) * 100));

  const size = 120;
  const strokeWidth = 10;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col justify-between h-full space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-tf-text-tertiary">
          Credits & Plan
        </h3>
        <p className="text-xs text-tf-text-secondary font-normal mt-0.5">
          {isUnlimited ? 'Unlimited plan active' : 'Monthly allocation usage'}
        </p>
      </div>

      {/* Radial Donut Visualization */}
      <div className="flex items-center justify-center py-2 relative">
        <div className="relative flex items-center justify-center">
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background Track */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              stroke="var(--tf-surface-2)"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Progress Track */}
            <motion.circle
              cx={center}
              cy={center}
              r={radius}
              stroke="var(--tf-accent)"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
              strokeLinecap="round"
              fill="transparent"
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xl font-semibold text-tf-text tabular-nums">
              {isUnlimited ? '∞' : remaining}
            </span>
            <span className="text-[10px] text-tf-text-tertiary uppercase font-medium">
              {isUnlimited ? 'Unlimited' : 'Remaining'}
            </span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2 text-xs border-t border-tf-border pt-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-tf-accent shrink-0" />
          <span className="text-tf-text-secondary font-normal">Used ({used})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-tf-surface-2 border border-tf-border shrink-0" />
          <span className="text-tf-text-secondary font-normal">
            Rem. ({isUnlimited ? '∞' : remaining})
          </span>
        </div>
      </div>

      {/* Productivity Insights */}
      {insights.length > 0 && (
        <div className="p-3 bg-tf-surface-2 rounded-md border border-tf-border space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-tf-text">
            <Sparkles size={13} className="text-tf-accent" />
            <span>Search Insights</span>
          </div>
          <ul className="space-y-1 text-xs text-tf-text-secondary font-normal list-disc pl-3.5">
            {insights.map((ins, idx) => (
              <li key={idx} className="leading-snug">{ins}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
