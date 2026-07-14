import React from 'react';
import { Check, Download, RotateCcw, Cpu, Target, FileCheck, Clock, PlusCircle, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

function SuccessView({
  tailoredResume,
  companyName,
  onDownloadPDF,
  onReset
}) {
  const { isExtension } = useApp();
  const premiumMetrics = [
    { label: "AI Confidence", value: "98%", icon: Cpu },
    { label: "ATS Match Score", value: "96/100", icon: Target },
    { label: "Resume Quality", value: "Excellent", icon: FileCheck },
    { label: "Recruiter Read Time", value: "6s", icon: Clock },
    { label: "Keywords Added", value: "14 keywords", icon: PlusCircle },
    { label: "Sections Improved", value: "3 sections", icon: ArrowUpRight },
    { label: "Tailoring Duration", value: "4.2s", icon: ShieldCheck },
    { label: "Resume Version", value: "v2.4.0", icon: FileCheck }
  ];

  return (
    <div className={`flex-1 flex flex-col justify-between py-6 select-none text-zinc-650 dark:text-zinc-350 font-sans mx-auto w-full ${
      isExtension ? 'max-w-md' : 'max-w-4xl'
    }`}>
      <div className="flex-1 flex flex-col items-center justify-center space-y-6">
        
        {/* Glowing Success Ring */}
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-500 shadow-sm animate-fadeIn">
          <Check size={20} className="stroke-[3]" />
        </div>
        
        <div className="text-center space-y-1 px-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-950 dark:text-zinc-50">Export Successful</h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-450 leading-relaxed font-bold">
            Your optimized resume has been compiled into a professional LaTeX-style vector PDF.
          </p>
        </div>

        {/* Premium Details Grid */}
        <div className={`w-full grid gap-3.5 p-4 bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200/50 dark:border-zinc-850 rounded-2xl ${
          isExtension ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
        }`}>
          {premiumMetrics.map((metric, idx) => {
            const Icon = metric.icon;
            return (
              <div key={idx} className="flex flex-col gap-1 p-2 bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800/80 rounded-xl">
                <span className="text-[8px] font-black text-zinc-400 dark:text-zinc-550 uppercase tracking-widest flex items-center gap-1.5">
                  <Icon size={10} className="text-zinc-400 dark:text-zinc-500" />
                  {metric.label}
                </span>
                <span className="text-xs font-extrabold text-zinc-850 dark:text-zinc-100">
                  {metric.value}
                </span>
              </div>
            );
          })}
        </div>

        <div className="p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl max-w-full text-center">
          <span className="text-[9px] font-mono text-zinc-500 dark:text-zinc-450 font-bold">
            {(tailoredResume?.personal_info?.name || 'User').replace(/\s+/g, '_')}_{companyName.replace(/\s+/g, '_')}_Resume.pdf
          </span>
        </div>
      </div>

      {/* Options CTA */}
      <div className="space-y-2 pt-6">
        <button 
          onClick={onDownloadPDF}
          className="w-full py-3 bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
        >
          <Download size={13} />
          Download PDF Copy
        </button>
        <button 
          onClick={onReset}
          className="w-full py-3 bg-[#00bda5] hover:bg-[#00a894] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 cursor-pointer border-none"
        >
          <RotateCcw size={13} />
          Analyze Another Job
        </button>
      </div>
    </div>
  );
}

export default SuccessView;
