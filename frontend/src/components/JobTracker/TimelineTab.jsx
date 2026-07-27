import React, { useState } from 'react';
import { 
  Clock, FileText, Layers, Mail, MessageSquare, Plus, CheckCircle2
} from 'lucide-react';

const FILTER_OPTIONS = ['All', 'Documents', 'Stage Changes', 'Communication', 'Notes'];

export function TimelineTab({ application }) {
  if (!application) return null;

  const [activeFilter, setActiveFilter] = useState('All');

  const rawTimeline = application.timeline || [
    { event: 'Job Saved', label: 'Job Added to Tracker', timestamp: application.created_at || new Date().toISOString() }
  ];

  const filteredTimeline = rawTimeline.filter((item) => {
    if (!item) return false;
    const evt = (item.event || item.label || '').toLowerCase();
    if (activeFilter === 'Documents') return evt.includes('resume') || evt.includes('cover') || evt.includes('document');
    if (activeFilter === 'Stage Changes') return evt.includes('stage') || evt.includes('moved');
    if (activeFilter === 'Communication') return evt.includes('recruiter') || evt.includes('email') || evt.includes('contact');
    if (activeFilter === 'Notes') return evt.includes('note') || evt.includes('logged');
    return true;
  }).reverse();

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      
      {/* Header & Filter Chips */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Chronological Activity Timeline
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Audit trail of all meaningful interactions and workflow milestones.
          </p>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar text-xs">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer transition-all ${
                activeFilter === f
                  ? 'bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/30 dark:text-teal-400 dark:border-teal-800'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* TIMELINE EVENT LIST */}
      <div className="relative pl-6 space-y-6 border-l border-zinc-200 dark:border-zinc-800">
        {filteredTimeline.length === 0 ? (
          <div className="p-6 text-center text-zinc-400 text-xs">
            No events match the selected category filter.
          </div>
        ) : (
          filteredTimeline.map((item, idx) => (
            <div key={idx} className="relative group">
              {/* Node Bullet Icon */}
              <div className="absolute -left-[31px] top-0.5 w-7 h-7 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-teal-600 dark:text-teal-400 shadow-xs">
                <Clock size={13} />
              </div>

              {/* Event Card */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-1 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shadow-xs">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
                    {item.event || item.label || 'Workflow Event'}
                  </h4>
                  <span className="text-[10px] font-semibold text-zinc-400">
                    {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Recent'}
                  </span>
                </div>

                {item.notes && (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-normal">
                    {item.notes}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
}

export default TimelineTab;
