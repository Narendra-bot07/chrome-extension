import React from 'react';
import { ShieldCheck, FileText, Layers, UserCheck, Edit3, Archive, Clock } from 'lucide-react';

export function HistoryTab({ application }) {
  if (!application) return null;

  const historyEvents = application.history || [
    { type: 'CREATE', details: 'Application created in Job Tracker', timestamp: application.created_at || new Date().toISOString() }
  ];

  const getEventIcon = (type) => {
    switch (type) {
      case 'STAGE': return <Layers size={14} className="text-teal-600 dark:text-teal-400" />;
      case 'DOCUMENT': return <FileText size={14} className="text-emerald-600 dark:text-emerald-400" />;
      case 'RECRUITER': return <UserCheck size={14} className="text-purple-600 dark:text-purple-400" />;
      case 'EDIT': return <Edit3 size={14} className="text-amber-600 dark:text-amber-400" />;
      default: return <Clock size={14} className="text-zinc-500" />;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      
      <div>
        <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
          <ShieldCheck size={15} className="text-teal-600 dark:text-teal-400" />
          Structured System Audit Log
        </h3>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
          Immutable audit record of all backend state changes, field edits, and document generation events.
        </p>
      </div>

      {/* Audit Log Table / Cards */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800 shadow-xs">
        {historyEvents.map((item, idx) => (
          <div key={idx} className="p-3.5 flex items-center justify-between text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0">
                {getEventIcon(item.type)}
              </div>
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-zinc-200">{item.details || item.event || 'System Update'}</h4>
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{item.type || 'AUDIT'}</span>
              </div>
            </div>

            <span className="text-[11px] font-medium text-zinc-500 shrink-0">
              {item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Recent'}
            </span>
          </div>
        ))}
      </div>

    </div>
  );
}

export default HistoryTab;
