import React, { useState } from 'react';
import { 
  Check, RefreshCw, GripVertical, ChevronDown, ChevronRight, Plus, Trash2, Download, Sparkles, Eye, 
  User, FileText, GraduationCap, Wrench, Briefcase, FolderGit2, Award, Trophy, Languages, Heart, 
  BookOpen, CheckCircle2, Circle, Undo2, Redo2, Activity
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useApp } from '../../context/AppContext';
import { TEMPLATE_CONFIGS } from '../../templates/templates_config';
import { getTemplateSectionLayout } from '../../utils/templateSectionLayout';

const CORE_SECTIONS = ['personal_info', 'summary', 'education', 'skills', 'experience', 'projects'];
const OPTIONAL_SECTIONS = ['certifications', 'achievements', 'awards', 'languages', 'volunteer_experience', 'publications'];
const SECTION_INTELLIGENCE = {
  summary: { importance: 'High', ats: 'Keywords' },
  experience: { importance: 'Critical', ats: 'Evidence' },
  projects: { importance: 'High', ats: 'Technical' },
  skills: { importance: 'Critical', ats: 'Matching' },
  education: { importance: 'High', ats: 'Eligibility' },
  certifications: { importance: 'Medium', ats: 'Credentials' },
  achievements: { importance: 'Medium', ats: 'Impact' },
  awards: { importance: 'Medium', ats: 'Impact' },
  volunteer_experience: { importance: 'Supporting', ats: 'Leadership' },
  publications: { importance: 'Supporting', ats: 'Authority' },
  languages: { importance: 'Supporting', ats: 'Requirements' }
};

// Map section to premium Lucide icons
const getSectionIcon = (section) => {
  switch (section) {
    case 'personal_info': return <User size={14} className="text-indigo-500" />;
    case 'summary': return <FileText size={14} className="text-emerald-500" />;
    case 'education': return <GraduationCap size={14} className="text-sky-500" />;
    case 'skills': return <Wrench size={14} className="text-violet-500" />;
    case 'experience': return <Briefcase size={14} className="text-amber-500" />;
    case 'projects': return <FolderGit2 size={14} className="text-rose-500" />;
    case 'certifications': return <Award size={14} className="text-teal-500" />;
    case 'achievements': case 'awards': return <Trophy size={14} className="text-orange-500" />;
    case 'languages': return <Languages size={14} className="text-cyan-500" />;
    case 'volunteer_experience': return <Heart size={14} className="text-pink-500" />;
    case 'publications': return <BookOpen size={14} className="text-purple-500" />;
    default: return <Sparkles size={14} className="text-indigo-500" />;
  }
};

export default function ResumeEditorView({
  parsedResume,
  setParsedResume,
  onLooksGood,
  onUploadDifferent,
  loading,
  reorderOnly = false,
  onPreview,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  quality
}) {
  const { darkMode, selectedTemplate } = useApp();
  const templateConfig = TEMPLATE_CONFIGS[selectedTemplate] || TEMPLATE_CONFIGS.ExecutiveATS;

  const [expandedSections, setExpandedSections] = useState(
    [...CORE_SECTIONS, ...OPTIONAL_SECTIONS].reduce((acc, sec) => ({ ...acc, [sec]: false }), {})
  );
  
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Initialize active sections (Core + any optional that have data, or loaded from section_order)
  const [activeSections, setActiveSections] = useState(() => {
    if (parsedResume?.section_order && parsedResume.section_order.length > 0) {
      return parsedResume.section_order;
    }
    const active = [...CORE_SECTIONS];
    OPTIONAL_SECTIONS.forEach(sec => {
      if (parsedResume && parsedResume[sec] && parsedResume[sec].length > 0) {
        if (!active.includes(sec)) active.push(sec);
      }
    });
    return active;
  });

  const sectionLayout = getTemplateSectionLayout(templateConfig, activeSections, parsedResume);
  const leftSections = sectionLayout.primary;
  const rightSections = sectionLayout.secondary;

  const toggleSection = (section) => {
    if (reorderOnly) return;
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Section strength metric calculator (0-100%)
  const getSectionStrength = (section) => {
    if (!parsedResume) return 0;
    const data = parsedResume[section];
    
    if (section === 'personal_info') {
      const info = data || {};
      let score = 0;
      if (info.name) score += 25;
      if (info.email) score += 25;
      if (info.phone) score += 25;
      if (info.location) score += 25;
      return score;
    }
    if (section === 'summary') {
      const len = (data || '').length;
      return Math.min(100, Math.round((len / 180) * 100));
    }
    if (section === 'skills') {
      const len = Array.isArray(data) ? data.length : 0;
      return Math.min(100, Math.round((len / 10) * 100));
    }
    if (Array.isArray(data)) {
      if (data.length === 0) return 0;
      let filledItems = 0;
      data.forEach(item => {
        if (item && Object.values(item).some(v => v !== '')) {
          filledItems++;
        }
      });
      return Math.round((filledItems / data.length) * 100);
    }
    return data ? 100 : 0;
  };

  const handleUpdateField = (section, index, field, value) => {
    const updated = structuredClone(parsedResume);
    if (index === null) {
      if (typeof updated[section] === 'object' && !Array.isArray(updated[section])) {
        updated[section] = { ...updated[section], [field]: value };
      } else {
        updated[section] = value;
      }
    } else {
      updated[section][index] = { ...updated[section][index], [field]: value };
    }
    setParsedResume(updated);
  };

  const handleUpdateBullet = (section, itemIndex, bulletIndex, value) => {
    const updated = structuredClone(parsedResume);
    const field = Array.isArray(updated[section]?.[itemIndex]?.description) ? 'description' : 'bullets';
    if (!Array.isArray(updated[section][itemIndex][field])) updated[section][itemIndex][field] = [];
    updated[section][itemIndex][field][bulletIndex] = value;
    setParsedResume(updated);
  };

  const addBullet = (section, itemIndex) => {
    const updated = structuredClone(parsedResume);
    const field = Array.isArray(updated[section]?.[itemIndex]?.description) ? 'description' : 'description';
    if (!Array.isArray(updated[section][itemIndex][field])) updated[section][itemIndex][field] = [];
    updated[section][itemIndex][field].push('');
    setParsedResume(updated);
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination, type } = result;

    if (type === 'SECTIONS') {
      if (source.droppableId !== destination.droppableId) {
        return; // Fixed template layout: prevent dragging between columns
      }
      
      if (source.droppableId === 'LEFT_COLUMN') {
        const newLeft = Array.from(leftSections);
        const [removed] = newLeft.splice(source.index, 1);
        newLeft.splice(destination.index, 0, removed);
        const merged = ['personal_info', ...newLeft, ...rightSections];
        setActiveSections(merged);
        setParsedResume({ ...parsedResume, section_order: merged });
      } else if (source.droppableId === 'RIGHT_COLUMN') {
        const newRight = Array.from(rightSections);
        const [removed] = newRight.splice(source.index, 1);
        newRight.splice(destination.index, 0, removed);
        const merged = ['personal_info', ...leftSections, ...newRight];
        setActiveSections(merged);
        setParsedResume({ ...parsedResume, section_order: merged });
      } else {
        const newActive = Array.from(activeSections.filter(s => s !== 'personal_info'));
        const [removed] = newActive.splice(source.index, 1);
        newActive.splice(destination.index, 0, removed);
        const merged = ['personal_info', ...newActive];
        setActiveSections(merged);
        setParsedResume({ ...parsedResume, section_order: merged });
      }
    } else {
      const section = type;
      const updated = structuredClone(parsedResume);
      const items = Array.from(updated[section] || []);
      const [removed] = items.splice(source.index, 1);
      items.splice(destination.index, 0, removed);
      updated[section] = items;
      setParsedResume(updated);
    }
  };

  const addItem = (section) => {
    const updated = structuredClone(parsedResume);
    if (!updated[section]) updated[section] = [];
    if (section === 'experience') updated[section].push({ role: '', company: '', location: '', start_date: '', end_date: '', description: [''] });
    else if (section === 'education') updated[section].push({ institution: '', degree: '', field_of_study: '', location: '', start_date: '', end_date: '', gpa: '' });
    else if (section === 'projects') updated[section].push({ name: '', role: '', link: '', description: [''] });
    else if (section === 'skills') updated[section].push('');
    else updated[section].push({});
    const newActive = [...activeSections, section];
    setActiveSections(newActive);
    updated.section_order = newActive;
    setParsedResume(updated);
  };

  const removeItem = (section, index) => {
    const updated = structuredClone(parsedResume);
    updated[section].splice(index, 1);
    setParsedResume(updated);
  };

  const removeSection = (section) => {
    const newActive = activeSections.filter(s => s !== section);
    setActiveSections(newActive);
    const updated = structuredClone(parsedResume);
    delete updated[section];
    updated.section_order = newActive;
    setParsedResume(updated);
  };

  const renderSectionContent = (section) => {
    if (section === 'personal_info') {
      const info = parsedResume?.personal_info || {};
      return (
        <div className="space-y-3 p-4 bg-slate-50/30">
          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Full Name</label>
            <input className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-500 outline-none" value={info.name || ''} onChange={e => handleUpdateField(section, null, 'name', e.target.value)} placeholder="Full Name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Email</label>
              <input className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-500 outline-none" value={info.email || ''} onChange={e => handleUpdateField(section, null, 'email', e.target.value)} placeholder="Email" />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Phone</label>
              <input className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-500 outline-none" value={info.phone || ''} onChange={e => handleUpdateField(section, null, 'phone', e.target.value)} placeholder="Phone" />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Location</label>
              <input className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-500 outline-none" value={info.location || ''} onChange={e => handleUpdateField(section, null, 'location', e.target.value)} placeholder="Location" />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">LinkedIn</label>
              <input className="w-full p-2.5 border rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-500 outline-none" value={info.linkedin || ''} onChange={e => handleUpdateField(section, null, 'linkedin', e.target.value)} placeholder="LinkedIn" />
            </div>
          </div>
        </div>
      );
    }
    
    if (section === 'summary') {
      const charCount = (parsedResume?.summary || '').length;
      return (
        <div className="p-4 bg-slate-50/30 space-y-2">
          <textarea 
            className="w-full p-3 border rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-500 outline-none min-h-[90px]" 
            value={parsedResume?.summary || ''} 
            onChange={e => handleUpdateField(section, null, 'summary', e.target.value)} 
            placeholder="Professional Summary" 
          />
          <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-wider">
            <span>Progress Indicator: {charCount > 150 ? 'Strong' : 'Short'}</span>
            <span>{charCount} Characters</span>
          </div>
        </div>
      );
    }

    if (section === 'skills') {
      const skills = parsedResume?.skills || [];
      return (
        <div className="p-4 bg-slate-50/30 space-y-2">
          <textarea 
            className="w-full p-3 border rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-500 outline-none min-h-[70px]" 
            value={Array.isArray(skills) ? skills.join(', ') : (typeof skills === 'object' ? JSON.stringify(skills) : skills)} 
            onChange={e => {
              const val = e.target.value.split(',').map(s => s.trim());
              setParsedResume({ ...parsedResume, skills: val });
            }}
            placeholder="Comma separated skills..." 
          />
          <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-wider">
            <span>Separate using commas</span>
            <span>{skills.length} Skills Registered</span>
          </div>
        </div>
      );
    }

    const items = parsedResume?.[section] || [];
    return (
      <div className="p-4 bg-slate-50/30">
        <Droppable droppableId={section} type={section}>
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
              {items.map((item, index) => (
                <Draggable key={`${section}-${index}`} draggableId={`${section}-${index}`} index={index}>
                  {(provided) => (
                    <div 
                      ref={provided.innerRef} 
                      {...provided.draggableProps} 
                      className="border border-slate-200 rounded-xl p-3 bg-white relative group shadow-sm hover:shadow transition-shadow"
                    >
                      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 flex items-center gap-1">
                         <div {...provided.dragHandleProps} className="text-slate-400 hover:text-slate-600 cursor-grab p-1"><GripVertical size={14} /></div>
                         <button onClick={() => removeItem(section, index)} className="text-rose-400 hover:text-rose-600 border-none bg-transparent cursor-pointer p-1"><Trash2 size={14} /></button>
                      </div>

                      {section === 'experience' && (
                        <div className="space-y-2 mt-1">
                          <input className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50/50 font-bold focus:bg-white outline-none" value={item.role || ''} onChange={e => handleUpdateField(section, index, 'role', e.target.value)} placeholder="Role" />
                          <div className="grid grid-cols-2 gap-2">
                            <input className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50/50 focus:bg-white outline-none" value={item.company || ''} onChange={e => handleUpdateField(section, index, 'company', e.target.value)} placeholder="Company" />
                            <input className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50/50 focus:bg-white outline-none" value={item.start_date || ''} onChange={e => handleUpdateField(section, index, 'start_date', e.target.value)} placeholder="Start Date" />
                          </div>
                          <div className="space-y-1.5 pt-1">
                            {(item.description || []).map((bullet, bulletIndex) => (
                              <textarea
                                key={bulletIndex}
                                value={bullet}
                                onChange={event => handleUpdateBullet(section, index, bulletIndex, event.target.value)}
                                className="w-full min-h-[58px] resize-y p-2 border border-slate-200 rounded-lg text-xs leading-relaxed bg-white outline-none focus:border-indigo-400"
                                placeholder="Evidence-focused achievement bullet"
                              />
                            ))}
                            <button onClick={() => addBullet(section, index)} className="text-[9px] font-black uppercase tracking-wider text-indigo-600 border-none bg-transparent cursor-pointer">
                              + Add evidence bullet
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {section === 'education' && (
                        <div className="space-y-2 mt-1">
                          <input className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50/50 font-bold focus:bg-white outline-none" value={item.institution || ''} onChange={e => handleUpdateField(section, index, 'institution', e.target.value)} placeholder="Institution" />
                          <div className="grid grid-cols-2 gap-2">
                            <input className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50/50 focus:bg-white outline-none" value={item.degree || ''} onChange={e => handleUpdateField(section, index, 'degree', e.target.value)} placeholder="Degree" />
                            <input className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50/50 focus:bg-white outline-none" value={item.field_of_study || ''} onChange={e => handleUpdateField(section, index, 'field_of_study', e.target.value)} placeholder="Field of Study" />
                          </div>
                        </div>
                      )}
                      
                      {section === 'projects' && (
                        <div className="space-y-2 mt-1">
                          <input className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50/50 font-bold focus:bg-white outline-none" value={item.name || ''} onChange={e => handleUpdateField(section, index, 'name', e.target.value)} placeholder="Project Name" />
                          <input className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50/50 focus:bg-white outline-none" value={item.role || ''} onChange={e => handleUpdateField(section, index, 'role', e.target.value)} placeholder="Role / Tech Stack" />
                          {(item.description || []).map((bullet, bulletIndex) => (
                            <textarea
                              key={bulletIndex}
                              value={bullet}
                              onChange={event => handleUpdateBullet(section, index, bulletIndex, event.target.value)}
                              className="w-full min-h-[58px] resize-y p-2 border border-slate-200 rounded-lg text-xs leading-relaxed bg-white outline-none focus:border-indigo-400"
                              placeholder="Project outcome or implementation evidence"
                            />
                          ))}
                          <button onClick={() => addBullet(section, index)} className="text-[9px] font-black uppercase tracking-wider text-indigo-600 border-none bg-transparent cursor-pointer">
                            + Add project bullet
                          </button>
                        </div>
                      )}
                      
                      {(section === 'certifications' || section === 'awards') && (
                        <div className="space-y-2 mt-1">
                          <input className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50/50 font-bold focus:bg-white outline-none" value={item.name || item.title || ''} onChange={e => handleUpdateField(section, index, section === 'awards' ? 'title' : 'name', e.target.value)} placeholder="Name/Title" />
                        </div>
                      )}

                      {section === 'achievements' && (
                        <textarea
                          value={typeof item === 'string' ? item : `${item.title || item.name || ''}${item.description ? ` — ${item.description}` : ''}`}
                          onChange={event => {
                            const updated = structuredClone(parsedResume);
                            updated.achievements[index] = event.target.value;
                            setParsedResume(updated);
                          }}
                          className="w-full min-h-[72px] resize-y p-2 border border-slate-200 rounded-lg text-xs leading-relaxed bg-white outline-none focus:border-indigo-400"
                          placeholder="Achievement — supporting evidence and measurable result"
                        />
                      )}

                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              <button 
                onClick={() => addItem(section)} 
                className="w-full py-2.5 border border-dashed border-slate-200 text-slate-500 rounded-xl text-xs font-bold hover:border-indigo-500 hover:text-indigo-600 hover:bg-slate-50/40 transition flex items-center justify-center gap-1.5 cursor-pointer bg-white"
              >
                <Plus size={14} /> Add Item
              </button>
            </div>
          )}
        </Droppable>
      </div>
    );
  };

  const renderDraggableSection = (section, index) => {
    const isExpanded = expandedSections[section];
    const strength = getSectionStrength(section);
    const isComplete = strength === 100;
    
    return (
      <Draggable key={section} draggableId={section} index={index}>
        {(provided) => (
          <div 
            ref={provided.innerRef} 
            {...provided.draggableProps} 
            data-editor-section={section}
            className={`bg-white border rounded-2xl overflow-hidden transition-all duration-300 group shadow-sm ${
              isExpanded 
                ? 'border-indigo-500 ring-4 ring-indigo-50/40 shadow-md' 
                : 'border-slate-200 hover:border-slate-350 hover:shadow'
            }`}
          >
            {/* Premium Redesigned Section Header */}
            <div className="flex items-center justify-between py-4 px-5 bg-slate-50/30 hover:bg-slate-50/70 transition-colors">
              <div className="flex items-center gap-3">
                {/* Section Drag handle */}
                <div {...provided.dragHandleProps} className="text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing p-0.5">
                  <GripVertical size={15} />
                </div>

                {/* Section Collapse button */}
                <div className={`flex items-center gap-2.5 ${reorderOnly ? 'cursor-default' : 'cursor-pointer'}`} onClick={() => toggleSection(section)}>
                  {!reorderOnly && (
                    <button className="text-slate-400 hover:text-slate-800 transition border-none bg-transparent cursor-pointer p-0.5">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  )}
                  
                  {/* Section icon indicator */}
                  <div className="p-1.5 bg-slate-100 rounded-lg shrink-0">
                    {getSectionIcon(section)}
                  </div>

                  <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                    {section.replace('_', ' ')}
                  </span>

                  {!reorderOnly && SECTION_INTELLIGENCE[section] && (
                    <span className="hidden 2xl:inline text-[8px] font-bold text-slate-500">
                      {SECTION_INTELLIGENCE[section].importance} · ATS {SECTION_INTELLIGENCE[section].ats}
                    </span>
                  )}

                  {/* Quality Strength Badge */}
                  {!reorderOnly && (
                    <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-md border shrink-0 ${
                      isComplete 
                        ? 'bg-green-50 border-green-150 text-green-700' 
                        : strength > 50 
                        ? 'bg-amber-50 border-amber-150 text-amber-700' 
                        : 'bg-rose-50 border-rose-150 text-rose-700'
                    }`}>
                      {strength}% {isComplete ? 'Complete' : 'Filled'}
                    </span>
                  )}

                  {/* AI Tailored Badge */}
                  {!reorderOnly && section === 'summary' && (
                    <span className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-150 text-indigo-700 text-[8px] font-extrabold rounded-md flex items-center gap-0.5 shrink-0">
                      <Sparkles size={8} /> AI TAILORED
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Completion checkmark */}
                {!reorderOnly && (
                  <div className="shrink-0">
                    {isComplete ? (
                      <CheckCircle2 size={15} className="text-green-500" />
                    ) : (
                      <Circle size={15} className="text-slate-300" />
                    )}
                  </div>
                )}

                {/* Only allow deleting Optional sections */}
                {!CORE_SECTIONS.includes(section) && !reorderOnly && (
                  <button onClick={() => removeSection(section)} className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600 transition p-1 border-none bg-transparent cursor-pointer">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Section Content (Collapsible) */}
            {isExpanded && renderSectionContent(section)}
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <div className="h-full flex flex-col justify-between bg-white text-slate-800 font-sans">
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-24 custom-scrollbar">
        {!reorderOnly && (
          <div className="mb-4 sticky top-0 z-20 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-sm p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={14} className={quality?.status === 'needs-attention' ? 'text-amber-500' : 'text-emerald-500'} />
              <div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Authoring quality</div>
                <div className="text-xs font-extrabold text-slate-800">
                  {quality?.score ?? 0}/100 · {quality?.metrics?.estimatedPages || 1} page estimate
                </div>
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" className="p-2 rounded-lg border border-slate-200 bg-white disabled:opacity-30 hover:bg-slate-50">
                <Undo2 size={14} />
              </button>
              <button onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" className="p-2 rounded-lg border border-slate-200 bg-white disabled:opacity-30 hover:bg-slate-50">
                <Redo2 size={14} />
              </button>
            </div>
          </div>
        )}
        {!reorderOnly && (
          <div className="mb-5 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex items-start gap-2.5 shadow-sm">
            <Sparkles className="text-indigo-600 mt-0.5 shrink-0" size={16} />
            <div className="text-[11px] text-zinc-550 leading-relaxed font-bold">
              Confirm your parsed resume fields. Drag categories to change A4 section layout order.
            </div>
          </div>
        )}

        {/* Personal Info Header */}
        {activeSections.includes('personal_info') && (
          <div data-editor-section="personal_info" className="mb-4 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div 
              className="flex items-center justify-between py-4 px-5 bg-slate-50/30 hover:bg-slate-50/70 transition-colors cursor-pointer"
              onClick={() => toggleSection('personal_info')}
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-slate-100 rounded-lg shrink-0">
                  {getSectionIcon('personal_info')}
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-800">Personal Info</span>
              </div>
              <button className="text-slate-400 hover:text-slate-800 transition border-none bg-transparent cursor-pointer">
                {expandedSections['personal_info'] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            </div>
            {expandedSections['personal_info'] && renderSectionContent('personal_info')}
          </div>
        )}

        <DragDropContext onDragEnd={onDragEnd}>
          {sectionLayout.split ? (
            <div className="grid grid-cols-5 gap-4">
              {/* Left Column (Skills, Education etc.) */}
              <div className="col-span-2 space-y-3.5">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest pb-1 border-b border-slate-100 flex justify-between items-center">
                  <span>{sectionLayout.primaryLabel}</span>
                  <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{leftSections.length}</span>
                </div>
                <Droppable droppableId="LEFT_COLUMN" type="SECTIONS">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3.5 min-h-[100px]">
                      {leftSections.map((section, index) => renderDraggableSection(section, index))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
              
              {/* Right Column (Summary, Experience, Projects) */}
              <div className="col-span-3 space-y-3.5">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest pb-1 border-b border-slate-100 flex justify-between items-center">
                  <span>{sectionLayout.secondaryLabel}</span>
                  <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{rightSections.length}</span>
                </div>
                <Droppable droppableId="RIGHT_COLUMN" type="SECTIONS">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3.5 min-h-[100px]">
                      {rightSections.map((section, index) => renderDraggableSection(section, index))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            </div>
          ) : (
            <Droppable droppableId="SECTIONS" type="SECTIONS">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3.5">
                  {activeSections
                    .filter(s => s !== 'personal_info')
                    .map((section, index) => renderDraggableSection(section, index))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          )}
        </DragDropContext>
      </div>

      {/* Actions Bar */}
      <div className="p-4 border-t border-slate-200 bg-white shrink-0 flex gap-3 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
        {reorderOnly ? (
          <button 
            onClick={() => {
               const cleaned = { ...parsedResume };
               Object.keys(cleaned).forEach(key => {
                 if (Array.isArray(cleaned[key]) && cleaned[key].length === 0) {
                   delete cleaned[key];
                 }
               });
               setParsedResume(cleaned);
               onLooksGood();
            }}
            disabled={loading}
            className={`w-full py-3.5 relative overflow-hidden font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer border-none shadow-md ${
              loading 
                ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed' 
                : 'bg-zinc-950 hover:bg-zinc-900 text-white shadow-zinc-950/20'
            }`}
          >
            {loading ? (
              <>
                <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 animate-pulse w-full" />
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-zinc-500 border-t-zinc-200" />
                <span>Compiling A4 PDF...</span>
              </>
            ) : (
              <>
                <Download size={14} className="animate-bounce" />
                <span>Download Tailored Resume</span>
              </>
            )}
          </button>
        ) : (
          <>
            <button 
              onClick={onUploadDifferent}
              disabled={loading}
              className="flex-1 py-3 border border-slate-250 text-slate-600 font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-50 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RefreshCw size={13} /> Upload New
            </button>
            <button 
              onClick={() => {
                 const cleaned = { ...parsedResume };
                 Object.keys(cleaned).forEach(key => {
                   if (Array.isArray(cleaned[key]) && cleaned[key].length === 0) {
                     delete cleaned[key];
                   }
                 });
                 setParsedResume(cleaned);
                 onLooksGood();
              }}
              disabled={loading}
              className="flex-2 py-3 bg-[#00bda5] hover:bg-[#00a894] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-1.5 shadow-md hover:shadow-[#00bda5]/30 cursor-pointer"
            >
              <Check size={13} /> Looks Good
            </button>
          </>
        )}
      </div>
    </div>
  );
}
