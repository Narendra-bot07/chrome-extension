import React, { useState } from 'react';
import { Download, Sparkles, CheckCircle2, ShieldCheck, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ResumePreview from './Resume/ResumePreview';

const TEMPLATES = [
  { 
    id: 'ModernProATS', 
    name: 'Modern Pro', 
    description: 'Clean and professional two-column layout.',
    recommended: true
  },
  { 
    id: 'MinimalATS', 
    name: 'Minimal', 
    description: 'Highly condensed minimal template for quick scanning.' 
  },
  { 
    id: 'ProfessionalATS', 
    name: 'Executive', 
    description: 'Ideal for experienced professionals and leadership roles.' 
  },
  { 
    id: 'ats-classic', 
    name: 'Classic', 
    description: 'Traditional layout with clear hierarchy and sections.' 
  },
  { 
    id: 'ModernATS', 
    name: 'Compact', 
    description: 'One-page compact layout for maximum impact.' 
  },
];

// Mini CSS Thumbnails
const TemplateThumbnail = ({ id }) => {
  if (id === 'ModernProATS') {
    return (
      <div className="w-12 h-16 bg-white border border-zinc-200 rounded-sm shadow-sm flex overflow-hidden shrink-0">
        <div className="w-[35%] bg-indigo-50/50 border-r border-indigo-100 p-1 flex flex-col gap-0.5">
          <div className="w-full h-1 bg-indigo-200 rounded-full mb-1"></div>
          <div className="w-2/3 h-0.5 bg-indigo-100 rounded-full"></div>
          <div className="w-full h-0.5 bg-indigo-100 rounded-full"></div>
          <div className="w-4/5 h-0.5 bg-indigo-100 rounded-full"></div>
          <div className="w-full h-1 bg-indigo-200 rounded-full mt-1 mb-0.5"></div>
          <div className="w-full h-2 bg-indigo-100 rounded-sm"></div>
        </div>
        <div className="flex-1 p-1 flex flex-col gap-0.5">
          <div className="w-4/5 h-1.5 bg-zinc-300 rounded-full mb-1"></div>
          <div className="w-1/3 h-0.5 bg-zinc-200 rounded-full mb-1"></div>
          <div className="w-full h-0.5 bg-zinc-200 rounded-full"></div>
          <div className="w-full h-0.5 bg-zinc-200 rounded-full"></div>
          <div className="w-5/6 h-0.5 bg-zinc-200 rounded-full mb-1"></div>
          <div className="w-1/2 h-0.5 bg-zinc-300 rounded-full mb-0.5"></div>
          <div className="w-full h-2 bg-zinc-100 rounded-sm"></div>
        </div>
      </div>
    );
  }
  
  // Default 1-column layout
  return (
    <div className="w-12 h-16 bg-white border border-zinc-200 rounded-sm shadow-sm flex flex-col overflow-hidden shrink-0 p-1.5 gap-0.5">
      <div className="w-1/2 h-1.5 bg-zinc-300 rounded-full mx-auto mb-0.5"></div>
      <div className="w-1/3 h-0.5 bg-zinc-200 rounded-full mx-auto mb-1.5"></div>
      <div className="w-1/3 h-1 bg-zinc-200 rounded-full mb-0.5"></div>
      <div className="w-full h-0.5 bg-zinc-100 rounded-full"></div>
      <div className="w-full h-0.5 bg-zinc-100 rounded-full"></div>
      <div className="w-5/6 h-0.5 bg-zinc-100 rounded-full mb-1"></div>
      <div className="w-1/3 h-1 bg-zinc-200 rounded-full mb-0.5"></div>
      <div className="w-full h-2 bg-zinc-50 rounded-sm"></div>
    </div>
  );
};

export default function TemplateSelectionView() {
  const { tailoredResume, parsedResume, selectedTemplate, setSelectedTemplate } = useApp();
  const displayResume = tailoredResume || parsedResume;
  const [isDownloading, setIsDownloading] = useState(false);

  // Default to ModernProATS if none selected
  const activeTemplate = selectedTemplate || 'ModernProATS';

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      const res = await fetch('http://localhost:8000/api/download-pdf?company_name=Company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: displayResume,
          template_name: activeTemplate
        })
      });

      if (!res.ok) throw new Error('Failed to generate PDF');
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Resume.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full overflow-hidden bg-zinc-50">
      {/* Sidebar */}
      <div className="w-full lg:w-[340px] bg-white border-b lg:border-b-0 lg:border-r border-zinc-200 flex flex-col shrink-0 lg:h-full shadow-sm z-10">
        <div className="p-5 lg:p-6 pb-4">
          <h2 className="text-[17px] font-bold text-zinc-900 flex items-center gap-2 tracking-tight">
            <Sparkles className="text-indigo-600" size={18} />
            Choose a Layout
          </h2>
          <p className="text-[13px] text-zinc-500 mt-1.5 leading-relaxed">
            Select an ATS-friendly layout<br className="hidden lg:block"/> that best suits your profile.
          </p>
        </div>
        
        <div className="flex-1 overflow-x-auto lg:overflow-y-auto px-5 lg:px-6 pb-2 flex lg:flex-col gap-3 custom-scrollbar">
          {TEMPLATES.map(t => {
            const isSelected = activeTemplate === t.id;
            return (
              <div 
                key={t.id}
                onClick={() => setSelectedTemplate(t.id)}
                className={`p-3 lg:p-3.5 rounded-xl border-[1.5px] transition-all cursor-pointer flex gap-3 relative min-w-[280px] lg:min-w-0 ${
                  isSelected 
                    ? 'border-indigo-500 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-500/20' 
                    : 'border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50'
                }`}
              >
                <TemplateThumbnail id={t.id} />
                <div className="flex-1 pr-6">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h3 className="text-sm font-bold text-zinc-900">{t.name}</h3>
                    {t.recommended && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-center">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-snug pr-2">{t.description}</p>
                </div>
                {isSelected && (
                  <div className="absolute top-3 right-3 text-indigo-600">
                    <CheckCircle2 size={18} className="fill-indigo-600 text-white" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        <div className="p-5 lg:p-6 pt-4 border-t border-zinc-200 bg-white space-y-3">
          <button className="w-full py-2.5 px-3 bg-white border border-indigo-100 hover:bg-indigo-50/50 text-indigo-700 rounded-lg flex items-center justify-between transition-colors shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} />
              <span className="text-xs font-bold">Preview ATS Score Guide</span>
            </div>
            <ChevronRight size={14} className="text-indigo-400" />
          </button>
          <button 
            onClick={handleDownload}
            disabled={isDownloading}
            className="download-trigger w-full py-3 bg-[#1e1b4b] text-white rounded-lg flex items-center justify-center gap-2 hover:bg-[#2e2a6b] transition-colors disabled:opacity-50 font-medium shadow-md"
          >
            <Download size={18} />
            {isDownloading ? 'Generating PDF...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 h-full relative">
        <ResumePreview 
          resumeData={displayResume} 
          selectedTemplate={activeTemplate} 
        />
      </div>
    </div>
  );
}
