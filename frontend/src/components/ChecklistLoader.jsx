import React from 'react';
import { Loader2 } from 'lucide-react';

function ChecklistLoader({ title, progress, message, checklistItems }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center space-y-6 py-12 animate-fadeIn select-none font-sans max-w-sm mx-auto">
      <div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center relative">
        <Loader2 className="text-[#00bda5] animate-spin" size={16} />
      </div>
      
      <div className="text-center space-y-1">
        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-zinc-50">{title}</h3>
        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium h-4 leading-none">{message}</p>
      </div>

      {/* Progress track */}
      <div className="w-48 h-1 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
        <div 
          className="h-full bg-[#00bda5] rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Checklist items list */}
      <div className="w-full bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200/50 dark:border-zinc-850 rounded-2xl p-4 space-y-2.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        {checklistItems.map((item, idx) => {
          const isDone = progress >= item.progressThreshold;
          const isPending = progress < item.progressThreshold && (idx === 0 || progress >= checklistItems[idx - 1].progressThreshold);
          return (
            <div key={idx} className="flex items-center gap-2.5 font-bold">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                isDone ? 'bg-[#00bda5] text-white' : isPending ? 'bg-zinc-100 dark:bg-zinc-800 text-[#00bda5] animate-pulse' : 'bg-zinc-200/60 dark:bg-zinc-800 text-zinc-400'
              }`}>
                {isDone ? '✓' : isPending ? '⟳' : '○'}
              </span>
              <span className={isDone ? 'line-through text-zinc-400 dark:text-zinc-650' : 'text-zinc-700 dark:text-zinc-350'}>{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ChecklistLoader;
