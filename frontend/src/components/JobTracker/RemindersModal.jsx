import React, { useState } from 'react';
import { 
  Bell, Calendar, Clock, Plus, CheckCircle2, AlertCircle, X, Trash2, Check
} from 'lucide-react';

export function RemindersModal({ application, isOpen, onClose, onSaveReminders }) {
  if (!isOpen || !application) return null;

  const [reminders, setReminders] = useState(application.reminders || []);
  const [showAddForm, setShowAddForm] = useState(false);

  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('09:00');
  const [priority, setPriority] = useState('Medium');
  const [type, setType] = useState('Follow-up');

  const handleAddReminder = async (e) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;

    const newReminder = {
      id: Date.now().toString(),
      title,
      due_at: `${dueDate}T${dueTime || '09:00'}`,
      priority,
      type,
      is_completed: false
    };

    const updated = [...reminders, newReminder];
    setReminders(updated);
    await onSaveReminders(application.id, updated);
    setShowAddForm(false);
    setTitle('');
    setDueDate('');
  };

  const handleToggleComplete = async (id) => {
    const updated = reminders.map(r => r.id === id ? { ...r, is_completed: !r.is_completed } : r);
    setReminders(updated);
    await onSaveReminders(application.id, updated);
  };

  const handleDeleteReminder = async (id) => {
    const updated = reminders.filter(r => r.id !== id);
    setReminders(updated);
    await onSaveReminders(application.id, updated);
  };

  const isOverdue = (dueAt, completed) => {
    if (completed || !dueAt) return false;
    return new Date(dueAt) < new Date();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4 p-5 text-zinc-900 dark:text-zinc-100">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-teal-600 dark:text-teal-400" />
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              Application Reminders & Follow-ups
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Add Form */}
        {showAddForm ? (
          <form onSubmit={handleAddReminder} className="p-3.5 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3 text-xs">
            <input
              type="text"
              placeholder="Reminder Title (e.g. Follow up on application) *"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none"
              />
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none cursor-pointer"
              >
                <option value="High">Priority: High</option>
                <option value="Medium">Priority: Medium</option>
                <option value="Low">Priority: Low</option>
              </select>

              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none cursor-pointer"
              >
                <option value="Follow-up">Type: Follow-up</option>
                <option value="Assessment">Type: Assessment</option>
                <option value="Interview">Type: Interview</option>
                <option value="Thank-you">Type: Thank-you</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3.5 py-1.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#00bda5] text-white font-bold rounded-xl cursor-pointer border-none shadow-xs"
              >
                Save
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-2 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 text-teal-700 dark:text-teal-400 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700"
          >
            <Plus size={14} />
            Set New Reminder
          </button>
        )}

        {/* Reminders List */}
        <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
          {reminders.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-400">
              No upcoming reminders set for this job.
            </div>
          ) : (
            reminders.map((rem) => {
              const overdue = isOverdue(rem.due_at, rem.is_completed);

              return (
                <div
                  key={rem.id}
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between transition-colors shadow-xs ${
                    rem.is_completed
                      ? 'bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 text-zinc-400 line-through'
                      : overdue
                      ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300'
                      : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      onClick={() => handleToggleComplete(rem.id)}
                      className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 cursor-pointer ${
                        rem.is_completed
                          ? 'bg-emerald-500 border-emerald-400 text-white'
                          : 'border-zinc-300 dark:border-zinc-700 hover:border-teal-500'
                      }`}
                    >
                      {rem.is_completed && <Check size={12} />}
                    </button>

                    <div className="min-w-0">
                      <div className="font-bold truncate">{rem.title}</div>
                      <div className="text-[10px] text-zinc-400 flex items-center gap-2 mt-0.5">
                        <span>{new Date(rem.due_at).toLocaleString()}</span>
                        {overdue && <span className="text-rose-600 dark:text-rose-400 font-bold uppercase">Overdue</span>}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteReminder(rem.id)}
                    className="p-1 text-zinc-400 hover:text-rose-500 cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}

export default RemindersModal;
