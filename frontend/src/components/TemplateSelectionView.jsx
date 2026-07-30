import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { toRenderableResume } from '../utils/renderableResume';
import { Download, Wand2, CheckCircle2, ShieldCheck, ChevronRight, X, ZoomIn, Eye, ArrowLeft, Layers, Image, Minimize2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import TailorRender from './Resume/TailorRender';
import DownloadPage from '../pages/DownloadPage';

const TEMPLATES_LIST = [
  { 
    id: 'ClassicATS', 
    name: 'Classic ATS', 
    description: 'Maximum ATS compatibility with a clean single-column structure and traditional corporate styling.',
    atsScore: 99,
    recommendedFor: 'Software Engineers, Data Engineers, Backend Engineers, Consulting, Banking',
    layout: 'Single Column',
    photo: 'No Photo',
    recommended: true
  },
  { 
    id: 'ExecutiveATS', 
    name: 'Executive ATS', 
    description: 'High-authority executive single-column layout with serif typography and generous spacing.',
    atsScore: 98,
    recommendedFor: 'Senior Engineers, Leads, Tech Architects, Engineering Managers',
    layout: 'Single Column',
    photo: 'No Photo',
    recommended: false
  },
  { 
    id: 'ModernSidebar', 
    name: 'Modern Sidebar', 
    description: 'Modern engineering profile with a dedicated narrow sidebar for skills, education, and credentials.',
    atsScore: 94,
    recommendedFor: 'Developers, Data Scientists, ML Engineers, Tech Specialists',
    layout: 'Sidebar',
    photo: 'Optional Photo',
    recommended: true
  },
  { 
    id: 'PortfolioPro', 
    name: 'Portfolio Pro', 
    description: 'Tech-first personal branding layout with hero header, highlighted SVG badges, and project emphasis.',
    atsScore: 93,
    recommendedFor: 'Frontend, Full Stack, Product Engineers, Open Source Contributors',
    layout: 'Hero Banner',
    photo: 'Optional Photo',
    recommended: false
  },
  { 
    id: 'EuropeanModern', 
    name: 'European Modern', 
    description: 'European market style featuring a sleek left accent banner, compact typography, and crisp structure.',
    atsScore: 92,
    recommendedFor: 'International Applications, Research, Engineering, R&D',
    layout: 'Left Banner',
    photo: 'Optional Photo',
    recommended: false
  },
  { 
    id: 'PremiumExecutive', 
    name: 'Premium Executive', 
    description: 'High-end executive resume featuring a balanced two-column strategy and luxury typography.',
    atsScore: 96,
    recommendedFor: 'Senior Managers, Staff Engineers, Principal Engineers, Directors',
    layout: 'Two Column',
    photo: 'Optional Photo',
    recommended: false
  },
  { 
    id: 'JohnsonsResume', 
    name: "Johnson's Resume", 
    description: "Classic Italian academic and executive serif layout featuring steel blue titles, italic headers, and precise key-value column alignment.",
    atsScore: 97,
    recommendedFor: 'Academia, Legal, Executive Leadership, Research, High-End Corporate',
    layout: 'Single Column',
    photo: 'No Photo',
    recommended: true
  }
];

// Miniature Live A4 preview renderer card
const MiniPreview = ({ resume, templateId }) => {
  return (
    <div className="resume-document-light w-full h-[260px] bg-white border-b border-zinc-200 overflow-hidden relative shadow-inner flex justify-center items-start group-hover:shadow-md transition-all">
      <div 
        className="resume-document-light absolute top-0 left-1/2 -translate-x-1/2 w-[816px] h-[1056px] bg-white origin-top scale-[0.24] pointer-events-none select-none"
        style={{ width: '816px', height: '1056px' }}
      >
        <TailorRender resume={resume} templateName={templateId} />
      </div>
      <div className="absolute inset-0 bg-black/[0.02] group-hover:bg-black/[0.04] transition-colors pointer-events-none" />
    </div>
  );
};

export default function TemplateSelectionView({ onBack }) {
  const navigate = useNavigate();
  const { 
    workflowResume,
    selectedTemplate, 
    setSelectedTemplate,
    customFileName,
    setCustomFileName,
    companyName,
    comparison,
    liveATS
  } = useApp();

  const baseATS = liveATS?.current_ats ?? comparison?.ats_score_after ?? comparison?.ats_score_before;
  const userATSScore = baseATS !== undefined && baseATS !== null ? Number(baseATS) : null;

  const displayResume = React.useMemo(() => {
    const rendered = toRenderableResume(workflowResume);
    if (!rendered) return null;
    return {
      ...rendered,
      // Template UI receives presentation content only. Parser provenance,
      // numeric placeholders, and credential metadata stay outside the
      // frontend rendering model.
      certifications: (rendered.certifications || [])
        .map(item => ({
          name: String(item?.name || item?.title || '').replace(/\s+/g, ' ').trim()
        }))
        .filter(item =>
          item.name
          && !/^(?:0+\.?|null|none|undefined|n\/a|na)$/i.test(item.name)
        )
    };
  }, [workflowResume]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'no-photo' | 'with-photo'
  const [zoomModalTemplate, setZoomModalTemplate] = useState(null); // active zoomed template object
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [editingFileName, setEditingFileName] = useState('');

  const activeTemplate = selectedTemplate || 'ExecutiveATS';

  const handleUseTemplate = (id) => {
    setSelectedTemplate(id);
    navigate('/download');
  };

  const handleDownload = async (templateId) => {
    const targetTemplate = templateId || activeTemplate;
    try {
      setIsDownloading(true);
      const res = await fetch('http://localhost:8000/api/download-pdf?company_name=Company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: toRenderableResume(displayResume),
          // Review is complete at this boundary. The reviewed resume is the
          // canonical export baseline; using parsedResume here causes the
          // preservation workflow to remove accepted tailoring edits.
          original_resume: toRenderableResume(displayResume),
          template_name: targetTemplate
        })
      });

      if (!res.ok) throw new Error('Failed to generate PDF');
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${displayResume.personal_info?.name || 'Resume'}_${targetTemplate}.pdf`;
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

  const filteredTemplates = TEMPLATES_LIST.filter(t => {
    if (filter === 'no-photo') return t.photo === 'No Photo';
    if (filter === 'with-photo') return t.photo !== 'No Photo';
    return true;
  });

  return (
    <div className="flex-1 w-full h-full overflow-y-auto custom-scrollbar bg-zinc-50 flex flex-col font-sans select-none pb-20">
      {/* Top Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 hover:text-zinc-800 transition-colors border-none bg-transparent cursor-pointer"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-md font-black text-zinc-950 flex items-center gap-2 uppercase tracking-tight">
                <Wand2 size={16} className="text-indigo-600" />
                Select Premium Layout Style
              </h1>
              <p className="text-[10px] text-zinc-400 font-bold uppercase mt-0.5">
                6 Config-Driven ATS Optimized Templates (90%+ Score)
              </p>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="flex bg-zinc-100 p-1.5 rounded-xl border border-zinc-200">
            <button 
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider rounded-lg transition-all border-none cursor-pointer ${
                filter === 'all'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 bg-transparent'
              }`}
            >
              All Layouts ({TEMPLATES_LIST.length})
            </button>
            <button 
              onClick={() => setFilter('no-photo')}
              className={`px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider rounded-lg transition-all border-none cursor-pointer ${
                filter === 'no-photo'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 bg-transparent'
              }`}
            >
              Without Photo (2)
            </button>
            <button 
              onClick={() => setFilter('with-photo')}
              className={`px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider rounded-lg transition-all border-none cursor-pointer ${
                filter === 'with-photo'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800 bg-transparent'
              }`}
            >
              With Photo (4)
            </button>
          </div>
        </div>
      </header>

      {/* Grid Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 flex-1 w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {filteredTemplates.map(t => {
            const isSelected = activeTemplate === t.id;
            return (
              <div 
                key={t.id}
                className={`group flex flex-col bg-white border rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 ${
                  isSelected 
                    ? 'border-indigo-500 ring-2 ring-indigo-550/20' 
                    : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                {/* Live Miniature Page Preview wrapper */}
                <MiniPreview resume={displayResume} templateId={t.id} />

                {/* Details Footer */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-extrabold text-zinc-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">
                        {t.name}
                      </h3>
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 bg-green-650 text-white rounded text-center animate-pulse">
                        ATS {userATSScore !== null ? Math.max(0, Math.min(100, Math.round(userATSScore + (t.atsScore - 98)))) : t.atsScore}%
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed line-clamp-2">
                      {t.description}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="text-[9px] font-bold px-2 py-0.5 bg-zinc-50 border border-zinc-200 text-zinc-600 rounded flex items-center gap-1">
                        <Layers size={10} /> {t.layout}
                      </span>
                      <span className="text-[9px] font-bold px-2 py-0.5 bg-zinc-50 border border-zinc-200 text-zinc-600 rounded flex items-center gap-1">
                        <Image size={10} /> {t.photo}
                      </span>
                      {t.recommended && (
                        <span className="text-[9px] font-extrabold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded">
                          Recommended Choice
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 pt-1 border-t border-zinc-100">
                    <div className="text-[10px] text-zinc-400 font-medium">
                      <span className="font-extrabold text-zinc-500 uppercase tracking-widest block text-[8px] mb-0.5">Recommended For</span>
                      {t.recommendedFor}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => setZoomModalTemplate(t)}
                        className="py-2 text-[10px] font-extrabold text-zinc-700 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 rounded-lg border border-zinc-200 transition-colors uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Eye size={12} /> Preview
                      </button>
                      <button 
                        onClick={() => handleUseTemplate(t.id)}
                        className="py-2 text-[10px] font-extrabold text-white bg-[#1e1b4b] hover:bg-[#2c2770] rounded-lg shadow-sm hover:shadow transition-all uppercase tracking-wider flex items-center justify-center gap-1 border-none cursor-pointer"
                      >
                        Use Style
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Canva-Grade Live Overlay Modal */}
      {zoomModalTemplate && createPortal((
        <div className="fixed top-[64px] inset-x-0 bottom-0 bg-black/70 backdrop-blur-sm z-[100] flex items-stretch justify-center p-4 lg:p-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-6xl h-full flex flex-col lg:flex-row overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Body: A4 live replica preview */}
            <div className="flex-1 h-full bg-zinc-950 overflow-auto flex justify-center items-start p-6 custom-scrollbar">
              <div 
                className="w-[816px] bg-white shadow-2xl ring-1 ring-zinc-200/50 shrink-0 select-none"
                style={{ width: '816px' }}
              >
                <TailorRender resume={displayResume} templateName={zoomModalTemplate.id} />
              </div>
            </div>

            {/* Sidebar Inspector Panel */}
            <div className="w-full lg:w-[320px] bg-zinc-900 border-t lg:border-t-0 lg:border-l border-zinc-850 flex flex-col justify-between p-6 shrink-0 text-white">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest block">Template Details</span>
                  <button 
                    onClick={() => setZoomModalTemplate(null)}
                    className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors border-none bg-transparent cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black tracking-tight uppercase">{zoomModalTemplate.name}</h2>
                    <span className="text-[10px] font-black px-1.5 py-0.5 bg-green-650 text-white rounded animate-pulse">
                      ATS {userATSScore !== null ? Math.max(0, Math.min(100, Math.round(userATSScore + (zoomModalTemplate.atsScore - 98)))) : zoomModalTemplate.atsScore}%
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {zoomModalTemplate.description}
                  </p>
                </div>

                <div className="border-t border-zinc-800 pt-4 space-y-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500 font-bold">Layout Grid:</span>
                    <span className="font-extrabold text-zinc-300">{zoomModalTemplate.layout}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500 font-bold">Photo Support:</span>
                    <span className="font-extrabold text-zinc-300">{zoomModalTemplate.photo}</span>
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-4 space-y-2">
                  <span className="text-[9.5px] font-black text-zinc-500 uppercase tracking-widest block">Ideal for positions</span>
                  <p className="text-xs text-zinc-300 leading-relaxed font-semibold">
                    {zoomModalTemplate.recommendedFor}
                  </p>
                </div>
              </div>

              {/* Sidebar Action Buttons */}
              <div className="space-y-3 pt-6 border-t border-zinc-800">
                <button 
                  onClick={() => {
                    handleUseTemplate(zoomModalTemplate.id);
                    setZoomModalTemplate(null);
                  }}
                  className="w-full py-3 bg-[#00bda5] hover:bg-[#00a894] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 border-none cursor-pointer shadow-md"
                >
                  <CheckCircle2 size={16} /> Use Style
                </button>
                <button 
                  onClick={() => setZoomModalTemplate(null)}
                  className="w-full py-3 bg-zinc-800 hover:bg-zinc-755 text-zinc-300 hover:text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 border border-zinc-700 cursor-pointer"
                >
                  <Minimize2 size={14} /> Back to Gallery
                </button>
              </div>
            </div>

          </div>
        </div>
      ), document.body)}
      {/* Full Screen Download & Reorder Overlay Pop-up Modal */}
      {selectedTemplateId && (
        <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col animate-in fade-in duration-200">
          <DownloadPage onClose={() => setSelectedTemplateId(null)} />
        </div>
      )}
    </div>
  );
}
