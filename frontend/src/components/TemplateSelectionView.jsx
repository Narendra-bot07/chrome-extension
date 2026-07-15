import React, { useState } from 'react';
import { Download, Sparkles, CheckCircle2, ShieldCheck, ChevronRight, ArrowUp, ArrowDown, ListOrdered, Layers } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ResumePreview from './Resume/ResumePreview';

const TEMPLATES = [
  { 
    id: 'ModernProATS', 
    name: 'Modern Pro', 
    description: 'Clean and professional two-column layout with a left sidebar.',
    recommended: true
  },
  { 
    id: 'MinimalATS', 
    name: 'Minimal', 
    description: 'Highly condensed minimal template for quick scanning.' 
  },
  { 
    id: 'ProfessionalATS', 
    name: 'Professional', 
    description: 'Ideal for experienced professionals and traditional roles.' 
  },
  { 
    id: 'ExecutiveATS', 
    name: 'Executive', 
    description: 'Elegant top-header center alignment for executive roles.' 
  },
  { 
    id: 'CorporateATS', 
    name: 'Corporate', 
    description: 'Clean sans-serif design with custom accent headers.' 
  },
  { 
    id: 'ModernATS', 
    name: 'Modern One-Column', 
    description: 'Sleek single-column modern layout.' 
  },
  { 
    id: 'TechnicalATS', 
    name: 'Technical', 
    description: 'Mono-spaced clean hierarchy ideal for software developers.' 
  },
  { 
    id: 'CompactATS', 
    name: 'Compact', 
    description: 'Densely spaced resume optimized for single-page fitting.' 
  },
  { 
    id: 'SidebarATS', 
    name: 'Sidebar Layout', 
    description: 'Dedicated sidebar for skills, education, and credentials.' 
  }
];

// Mini CSS Thumbnails
const TemplateThumbnail = ({ id }) => {
  if (id === 'ModernProATS' || id === 'SidebarATS') {
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
  const [activeTab, setActiveTab] = useState('layouts'); // 'layouts' | 'ordering'
  const [sectionOrder, setSectionOrder] = useState([
    'summary',
    'education',
    'experience',
    'skills',
    'projects',
    'certifications',
    'achievements',
    'volunteer',
    'publications',
    'languages',
    'awards',
    'interests'
  ]);

  // Default to ModernProATS if none selected
  const activeTemplate = selectedTemplate || 'ModernProATS';

  const moveSection = (index, direction) => {
    const newOrder = [...sectionOrder];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    
    setSectionOrder(newOrder);
  };

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
            Resume Tailor Options
          </h2>
          <p className="text-[13px] text-zinc-500 mt-1.5 leading-relaxed">
            Customize layout styles and drag sections dynamically to optimize page fit.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-250">
          <button 
            onClick={() => setActiveTab('layouts')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'layouts'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/10'
                : 'border-transparent text-zinc-400 hover:text-zinc-650'
            }`}
          >
            <Layers size={14} />
            Layouts
          </button>
          <button 
            onClick={() => setActiveTab('ordering')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'ordering'
                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/10'
                : 'border-transparent text-zinc-400 hover:text-zinc-655'
            }`}
          >
            <ListOrdered size={14} />
            Section Order
          </button>
        </div>
        
        {activeTab === 'layouts' ? (
          <div className="flex-1 overflow-x-auto lg:overflow-y-auto px-5 lg:px-6 py-4 flex lg:flex-col gap-3 custom-scrollbar">
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
        ) : (
          <div className="flex-1 overflow-y-auto px-5 lg:px-6 py-4 flex flex-col gap-2 custom-scrollbar">
            <p className="text-[11px] text-zinc-400 mb-2 leading-relaxed">
              Order sections to balance single-page constraints. Sections without content are ignored automatically.
            </p>
            {sectionOrder.map((sectionId, idx) => {
              const label = sectionId.toUpperCase().replace('_', ' ');
              return (
                <div key={sectionId} className="flex items-center justify-between p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-700">
                  <span className="capitalize">{label}</span>
                  <div className="flex items-center gap-1">
                    <button 
                      disabled={idx === 0} 
                      onClick={() => moveSection(idx, -1)}
                      className="p-1 hover:bg-zinc-200 rounded transition-colors disabled:opacity-30"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button 
                      disabled={idx === sectionOrder.length - 1} 
                      onClick={() => moveSection(idx, 1)}
                      className="p-1 hover:bg-zinc-200 rounded transition-colors disabled:opacity-30"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
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
          sectionOrder={sectionOrder}
        />
      </div>
    </div>
  );
}
