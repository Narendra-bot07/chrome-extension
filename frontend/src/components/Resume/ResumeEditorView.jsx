import React, { useState } from 'react';
import { Check, RefreshCw, GripVertical, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const CORE_SECTIONS = ['personal_info', 'summary', 'education', 'skills', 'experience', 'projects'];
const OPTIONAL_SECTIONS = ['certifications', 'achievements', 'awards', 'languages', 'volunteer_experience', 'publications'];

export default function ResumeEditorView({
  parsedResume,
  setParsedResume,
  onLooksGood,
  onUploadDifferent,
  loading
}) {
  const [expandedSections, setExpandedSections] = useState(
    [...CORE_SECTIONS, ...OPTIONAL_SECTIONS].reduce((acc, sec) => ({ ...acc, [sec]: true }), {})
  );
  
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Initialize active sections (Core + any optional that have data)
  const [activeSections, setActiveSections] = useState(() => {
    const active = [...CORE_SECTIONS];
    OPTIONAL_SECTIONS.forEach(sec => {
      if (parsedResume[sec] && parsedResume[sec].length > 0) {
        if (!active.includes(sec)) active.push(sec);
      }
    });
    return active;
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleUpdateField = (section, index, field, value) => {
    const updated = { ...parsedResume };
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

  const handleUpdateArrayString = (section, index, value) => {
    const updated = { ...parsedResume };
    updated[section][index] = value;
    setParsedResume(updated);
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination, type } = result;

    if (type === 'SECTIONS') {
      const newActive = Array.from(activeSections);
      const [removed] = newActive.splice(source.index, 1);
      newActive.splice(destination.index, 0, removed);
      setActiveSections(newActive);
    } else {
      // Nested items like experience or education
      const section = type;
      const items = Array.from(parsedResume[section] || []);
      const [removed] = items.splice(source.index, 1);
      items.splice(destination.index, 0, removed);
      setParsedResume({ ...parsedResume, [section]: items });
    }
  };

  const addItem = (section) => {
    const updated = { ...parsedResume };
    if (!updated[section]) updated[section] = [];
    if (section === 'experience') updated[section].push({ role: '', company: '', location: '', start_date: '', end_date: '', description: [''] });
    else if (section === 'education') updated[section].push({ institution: '', degree: '', field_of_study: '', location: '', start_date: '', end_date: '', gpa: '' });
    else if (section === 'projects') updated[section].push({ name: '', role: '', link: '', description: [''] });
    else if (section === 'skills') updated[section].push('');
    else updated[section].push({}); // Fallback
    setParsedResume(updated);
  };

  const removeItem = (section, index) => {
    const updated = { ...parsedResume };
    updated[section].splice(index, 1);
    setParsedResume(updated);
  };

  const removeSection = (section) => {
    setActiveSections(activeSections.filter(s => s !== section));
    const updated = { ...parsedResume };
    delete updated[section];
    setParsedResume(updated);
  };

  const renderSectionContent = (section) => {
    if (section === 'personal_info') {
      const info = parsedResume.personal_info || {};
      return (
        <div className="space-y-2 p-3">
          <input className="w-full p-2 border rounded text-xs bg-slate-50" value={info.name || ''} onChange={e => handleUpdateField(section, null, 'name', e.target.value)} placeholder="Full Name" />
          <div className="grid grid-cols-2 gap-2">
            <input className="w-full p-2 border rounded text-xs bg-slate-50" value={info.email || ''} onChange={e => handleUpdateField(section, null, 'email', e.target.value)} placeholder="Email" />
            <input className="w-full p-2 border rounded text-xs bg-slate-50" value={info.phone || ''} onChange={e => handleUpdateField(section, null, 'phone', e.target.value)} placeholder="Phone" />
            <input className="w-full p-2 border rounded text-xs bg-slate-50" value={info.location || ''} onChange={e => handleUpdateField(section, null, 'location', e.target.value)} placeholder="Location" />
            <input className="w-full p-2 border rounded text-xs bg-slate-50" value={info.linkedin || ''} onChange={e => handleUpdateField(section, null, 'linkedin', e.target.value)} placeholder="LinkedIn" />
          </div>
        </div>
      );
    }
    
    if (section === 'summary') {
      return (
        <div className="p-3">
          <textarea 
            className="w-full p-2 border rounded text-xs bg-slate-50 min-h-[80px]" 
            value={parsedResume.summary || ''} 
            onChange={e => handleUpdateField(section, null, 'summary', e.target.value)} 
            placeholder="Professional Summary" 
          />
        </div>
      );
    }

    if (section === 'skills') {
      const skills = parsedResume.skills || [];
      return (
        <div className="p-3">
          <textarea 
            className="w-full p-2 border rounded text-xs bg-slate-50 min-h-[60px]" 
            value={Array.isArray(skills) ? skills.join(', ') : (typeof skills === 'object' ? JSON.stringify(skills) : skills)} 
            onChange={e => {
              const val = e.target.value.split(',').map(s => s.trim());
              setParsedResume({ ...parsedResume, skills: val });
            }}
            placeholder="Comma separated skills..." 
          />
        </div>
      );
    }

    // List based sections (Experience, Projects, Education, etc)
    const items = parsedResume[section] || [];
    return (
      <div className="p-3">
        <Droppable droppableId={section} type={section}>
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3">
              {items.map((item, index) => (
                <Draggable key={`${section}-${index}`} draggableId={`${section}-${index}`} index={index}>
                  {(provided) => (
                    <div 
                      ref={provided.innerRef} 
                      {...provided.draggableProps} 
                      className="border border-slate-200 rounded-lg p-3 bg-slate-50 relative group"
                    >
                      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 flex items-center gap-1">
                         <div {...provided.dragHandleProps} className="text-slate-400 hover:text-slate-600 cursor-grab"><GripVertical size={14} /></div>
                         <button onClick={() => removeItem(section, index)} className="text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button>
                      </div>

                      {section === 'experience' && (
                        <div className="space-y-2 mt-2">
                          <input className="w-full p-2 border border-slate-200 rounded text-xs bg-white font-bold" value={item.role || ''} onChange={e => handleUpdateField(section, index, 'role', e.target.value)} placeholder="Role" />
                          <div className="grid grid-cols-2 gap-2">
                            <input className="w-full p-2 border border-slate-200 rounded text-xs bg-white" value={item.company || ''} onChange={e => handleUpdateField(section, index, 'company', e.target.value)} placeholder="Company" />
                            <input className="w-full p-2 border border-slate-200 rounded text-xs bg-white" value={item.start_date || ''} onChange={e => handleUpdateField(section, index, 'start_date', e.target.value)} placeholder="Start Date" />
                          </div>
                        </div>
                      )}
                      
                      {section === 'education' && (
                        <div className="space-y-2 mt-2">
                          <input className="w-full p-2 border border-slate-200 rounded text-xs bg-white font-bold" value={item.institution || ''} onChange={e => handleUpdateField(section, index, 'institution', e.target.value)} placeholder="Institution" />
                          <div className="grid grid-cols-2 gap-2">
                            <input className="w-full p-2 border border-slate-200 rounded text-xs bg-white" value={item.degree || ''} onChange={e => handleUpdateField(section, index, 'degree', e.target.value)} placeholder="Degree" />
                            <input className="w-full p-2 border border-slate-200 rounded text-xs bg-white" value={item.field_of_study || ''} onChange={e => handleUpdateField(section, index, 'field_of_study', e.target.value)} placeholder="Field of Study" />
                          </div>
                        </div>
                      )}
                      
                      {section === 'projects' && (
                        <div className="space-y-2 mt-2">
                          <input className="w-full p-2 border border-slate-200 rounded text-xs bg-white font-bold" value={item.name || ''} onChange={e => handleUpdateField(section, index, 'name', e.target.value)} placeholder="Project Name" />
                          <input className="w-full p-2 border border-slate-200 rounded text-xs bg-white" value={item.role || ''} onChange={e => handleUpdateField(section, index, 'role', e.target.value)} placeholder="Role / Tech Stack" />
                        </div>
                      )}
                      
                      {(section === 'certifications' || section === 'awards') && (
                        <div className="space-y-2 mt-2">
                          <input className="w-full p-2 border border-slate-200 rounded text-xs bg-white font-bold" value={item.name || item.title || ''} onChange={e => handleUpdateField(section, index, section === 'awards' ? 'title' : 'name', e.target.value)} placeholder="Name/Title" />
                        </div>
                      )}

                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              <button 
                onClick={() => addItem(section)} 
                className="w-full py-2 border-2 border-dashed border-slate-200 text-slate-500 rounded-lg text-xs font-bold hover:border-brand hover:text-brand transition flex items-center justify-center gap-1"
              >
                <Plus size={14} /> Add Item
              </button>
            </div>
          )}
        </Droppable>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col justify-between h-full select-none text-slate-800 font-sans">
      
      {/* Title */}
      <div className="space-y-1 shrink-0 p-4 pb-2">
        <h2 className="text-lg font-black tracking-tight text-slate-800">Dynamic Resume Editor</h2>
        <p className="text-xs text-slate-500">Edit, reorder, or add custom sections Notion-style.</p>
      </div>

      {/* Editor Scroll */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="ROOT" type="SECTIONS">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3 pb-20">
                {activeSections.map((section, index) => (
                  <Draggable key={section} draggableId={section} index={index}>
                    {(provided) => (
                      <div 
                        ref={provided.innerRef} 
                        {...provided.draggableProps} 
                        className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden group"
                      >
                        {/* Section Header */}
                        <div className="flex items-center justify-between p-3 bg-slate-50/50 border-b border-slate-100">
                          <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleSection(section)}>
                            <button className="text-slate-400 hover:text-slate-800 transition">
                              {expandedSections[section] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </button>
                            <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                              {section.replace('_', ' ')}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {/* Only allow deleting Optional sections */}
                            {!CORE_SECTIONS.includes(section) && (
                              <button onClick={() => removeSection(section)} className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600 transition p-1">
                                <Trash2 size={14} />
                              </button>
                            )}
                            <div {...provided.dragHandleProps} className="text-slate-400 hover:text-slate-600 transition p-1 cursor-grab">
                              <GripVertical size={16} />
                            </div>
                          </div>
                        </div>

                        {/* Section Content (Collapsible) */}
                        {expandedSections[section] && renderSectionContent(section)}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {/* Notion-style Add Section Button */}
        <div className="mt-4 relative">
          <button 
            onClick={() => setShowAddMenu(!showAddMenu)}
            className="w-full py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm"
          >
            <Plus size={16} /> Add Optional Section
          </button>
          
          {showAddMenu && (
            <div className="absolute bottom-full left-0 w-full mb-2 bg-white border border-slate-200 shadow-lg rounded-xl overflow-hidden z-50">
              <div className="p-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Available Sections</div>
              <div className="max-h-48 overflow-y-auto">
                {OPTIONAL_SECTIONS.filter(s => !activeSections.includes(s)).map(sec => (
                  <button 
                    key={sec}
                    onClick={() => {
                      setActiveSections([...activeSections, sec]);
                      setExpandedSections({ ...expandedSections, [sec]: true });
                      setShowAddMenu(false);
                      // Initialize empty array for this section if needed
                      if (!parsedResume[sec]) setParsedResume({ ...parsedResume, [sec]: [] });
                    }}
                    className="w-full text-left p-3 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-brand transition capitalize"
                  >
                    + {sec.replace('_', ' ')}
                  </button>
                ))}
                {OPTIONAL_SECTIONS.filter(s => !activeSections.includes(s)).length === 0 && (
                  <div className="p-3 text-xs text-slate-500 italic text-center">All sections added!</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions Bar */}
      <div className="p-4 border-t border-slate-200 bg-white shrink-0 flex gap-3 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
        <button 
          onClick={onUploadDifferent}
          disabled={loading}
          className="flex-1 py-3 border border-slate-250 text-slate-600 font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-slate-50 transition flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <RefreshCw size={13} /> Upload New
        </button>
        <button 
          onClick={() => {
             // Clean up empty sections before proceeding
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
      </div>
    </div>
  );
}
