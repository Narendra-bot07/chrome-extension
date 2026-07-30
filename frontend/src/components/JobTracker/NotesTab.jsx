import React, { useState } from 'react';
import { 
  FileText, Plus, Search, Pin, Trash2, Edit2, Check, Wand2, BookOpen, User, DollarSign, Code
} from 'lucide-react';

const NOTE_CATEGORIES = [
  'Quick Note',
  'Interview Prep',
  'Company Research',
  'Recruiter Conversation',
  'Technical Assessment',
  'Salary Discussion'
];

export function NotesTab({ application, onSaveNotesList }) {
  if (!application) return null;

  const [notesList, setNotesList] = useState(application.notes_list || []);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);

  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] = useState(NOTE_CATEGORIES[0]);
  const [isPinned, setIsPinned] = useState(false);

  const handleSaveNote = async (e) => {
    e.preventDefault();
    if (!noteTitle.trim()) return;

    let updated = [...notesList];
    if (editingNoteId) {
      updated = updated.map(n => n.id === editingNoteId ? {
        ...n,
        title: noteTitle,
        content: noteContent,
        category: noteCategory,
        is_pinned: isPinned,
        updated_at: new Date().toISOString()
      } : n);
    } else {
      updated.push({
        id: Date.now().toString(),
        title: noteTitle,
        content: noteContent,
        category: noteCategory,
        is_pinned: isPinned,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    setNotesList(updated);
    await onSaveNotesList(application.id, updated);
    setShowAddModal(false);
    resetForm();
  };

  const handleDeleteNote = async (id) => {
    const updated = notesList.filter(n => n.id !== id);
    setNotesList(updated);
    await onSaveNotesList(application.id, updated);
  };

  const handleTogglePin = async (id) => {
    const updated = notesList.map(n => n.id === id ? { ...n, is_pinned: !n.is_pinned } : n);
    setNotesList(updated);
    await onSaveNotesList(application.id, updated);
  };

  const resetForm = () => {
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteCategory(NOTE_CATEGORIES[0]);
    setIsPinned(false);
  };

  const handleEditNote = (note) => {
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteCategory(note.category || NOTE_CATEGORIES[0]);
    setIsPinned(Boolean(note.is_pinned));
    setShowAddModal(true);
  };

  const filteredNotes = notesList.filter(n => {
    if (!n) return false;
    const matchesSearch = (n.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (n.content || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (selectedCategoryFilter !== 'All' && n.category !== selectedCategoryFilter) return false;
    return true;
  }).sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      
      {/* Header & Add Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Application Notes & Research
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Store structured notes for interview prep, company research, and salary discussions.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="px-3.5 py-1.5 bg-[#00bda5] hover:bg-[#00a38e] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border-none shadow-xs"
        >
          <Plus size={14} />
          Create Note
        </button>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search size={14} className="absolute left-3 top-2.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search notes content or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-teal-500 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar w-full md:w-auto text-xs">
          <button
            onClick={() => setSelectedCategoryFilter('All')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer ${
              selectedCategoryFilter === 'All' ? 'bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/30 dark:text-teal-400 dark:border-teal-800' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            All Notes
          </button>
          {NOTE_CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                selectedCategoryFilter === cat ? 'bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/30 dark:text-teal-400 dark:border-teal-800' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Add / Edit Note Modal */}
      {showAddModal && (
        <form onSubmit={handleSaveNote} className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-3 animate-fade-in shadow-xs">
          <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
            {editingNoteId ? 'Edit Note' : 'Create New Note'}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <input
              type="text"
              placeholder="Note Title *"
              required
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              className="p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />
            <select
              value={noteCategory}
              onChange={(e) => setNoteCategory(e.target.value)}
              className="p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none cursor-pointer"
            >
              {NOTE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <textarea
            rows={4}
            placeholder="Write your note content here..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            className="w-full p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
          />

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="accent-teal-600 cursor-pointer"
              />
              <span>Pin this note to top</span>
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#00bda5] hover:bg-[#00a38e] text-white font-bold text-xs rounded-xl cursor-pointer border-none shadow-xs"
              >
                Save Note
              </button>
            </div>
          </div>
        </form>
      )}

      {/* NOTES LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredNotes.length === 0 ? (
          <div className="col-span-full p-8 text-center text-zinc-400 text-xs bg-white dark:bg-zinc-900/30 rounded-2xl border border-zinc-200 dark:border-zinc-800">
            No notes created for this category yet. Click "Create Note" to add one.
          </div>
        ) : (
          filteredNotes.map((note) => (
            <div
              key={note.id}
              className={`p-4 rounded-2xl bg-white dark:bg-zinc-900 border transition-all space-y-2 relative shadow-xs ${
                note.is_pinned ? 'border-teal-300 dark:border-teal-800 bg-teal-50/20 dark:bg-teal-950/10' : 'border-zinc-200/80 dark:border-zinc-800'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-teal-700 dark:text-teal-400 border border-zinc-200 dark:border-zinc-700">
                    {note.category || 'Quick Note'}
                  </span>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white mt-1.5">{note.title}</h4>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleTogglePin(note.id)}
                    title={note.is_pinned ? 'Unpin Note' : 'Pin Note'}
                    className={`p-1 rounded cursor-pointer ${note.is_pinned ? 'text-teal-600 dark:text-teal-400' : 'text-zinc-400 hover:text-zinc-700'}`}
                  >
                    <Pin size={13} />
                  </button>
                  <button
                    onClick={() => handleEditNote(note)}
                    className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded cursor-pointer"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="p-1 text-rose-500 hover:text-rose-600 rounded cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {note.content}
              </p>

              <div className="text-[10px] text-zinc-400 pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
                Updated {new Date(note.updated_at || note.created_at || Date.now()).toLocaleDateString()}
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
}

export default NotesTab;
