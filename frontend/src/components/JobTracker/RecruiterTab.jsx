import React, { useState } from 'react';
import { 
  User, Mail, Phone, Linkedin, ExternalLink, Copy, Check, Plus, 
  Trash2, Edit2, Wand2, Send, RefreshCw, MessageSquare
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const EMAIL_PURPOSES = [
  'Initial Recruiter Outreach',
  'Application Follow-up',
  'Thank-you Email',
  'Interview Confirmation',
  'Post-interview Follow-up',
  'Offer Clarification'
];

export function RecruiterTab({ application, onSaveContacts }) {
  const { apiUrl, session } = useApp();
  if (!application) return null;

  const [contacts, setContacts] = useState(application.contacts || []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState(null);

  // Contact Form State
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    linkedin_url: '',
    notes: '',
    last_contacted_at: '',
    next_follow_up_at: ''
  });

  // AI Email Generator State
  const [selectedPurpose, setSelectedPurpose] = useState(EMAIL_PURPOSES[0]);
  const [selectedContactEmail, setSelectedContactEmail] = useState('');
  const [generatedSubject, setGeneratedSubject] = useState('');
  const [generatedBody, setGeneratedBody] = useState('');
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);

  const handleSaveContact = async (e) => {
    e.preventDefault();
    let updated = [...contacts];
    if (editingContactId) {
      updated = updated.map(c => c.id === editingContactId ? { ...formData, id: editingContactId } : c);
    } else {
      updated.push({ ...formData, id: Date.now().toString() });
    }
    setContacts(updated);
    await onSaveContacts(application.id, updated);
    setShowAddForm(false);
    setEditingContactId(null);
    setFormData({ name: '', title: '', email: '', phone: '', linkedin_url: '', notes: '', last_contacted_at: '', next_follow_up_at: '' });
  };

  const handleDeleteContact = async (id) => {
    const updated = contacts.filter(c => c.id !== id);
    setContacts(updated);
    await onSaveContacts(application.id, updated);
  };

  const handleGenerateEmail = async () => {
    setIsGeneratingEmail(true);
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      const targetContact = contacts.find(c => c.email === selectedContactEmail) || contacts[0] || {};
      
      const res = await fetch(`${apiUrl}/api/v1/applications/${application.id}/generate-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          purpose: selectedPurpose,
          recruiter_name: targetContact.name || 'Hiring Manager',
          recruiter_title: targetContact.title || 'Recruiter',
          tone: "Professional and enthusiastic"
        })
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedSubject(data.subject);
        setGeneratedBody(data.body);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  const handleCopyText = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'subject') {
      setCopiedSubject(true);
      setTimeout(() => setCopiedSubject(false), 2000);
    } else {
      setCopiedBody(true);
      setTimeout(() => setCopiedBody(false), 2000);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      
      {/* Header & Add Contact Action */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Recruiter & Hiring Contacts
          </h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            Store contact entries and generate contextual AI outreach emails.
          </p>
        </div>
        <button
          onClick={() => { setShowAddForm(true); setEditingContactId(null); setFormData({ name: '', title: '', email: '', phone: '', linkedin_url: '', notes: '', last_contacted_at: '', next_follow_up_at: '' }); }}
          className="px-3.5 py-1.5 bg-[#00bda5] hover:bg-[#00a38e] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border-none shadow-xs"
        >
          <Plus size={14} />
          Add Contact
        </button>
      </div>

      {/* Add / Edit Form Modal */}
      {showAddForm && (
        <form onSubmit={handleSaveContact} className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-3 animate-fade-in shadow-xs">
          <h4 className="text-xs font-bold text-zinc-900 dark:text-white">
            {editingContactId ? 'Edit Recruiter Contact' : 'Add New Recruiter Contact'}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <input
              type="text"
              placeholder="Name *"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />
            <input
              type="text"
              placeholder="Title / Role (e.g. Senior Recruiter)"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />
            <input
              type="email"
              placeholder="Email address"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />
            <input
              type="text"
              placeholder="Phone number"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />
            <input
              type="url"
              placeholder="LinkedIn URL"
              value={formData.linkedin_url}
              onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
              className="p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />
            <input
              type="date"
              placeholder="Next Follow-up Date"
              value={formData.next_follow_up_at}
              onChange={(e) => setFormData({ ...formData, next_follow_up_at: e.target.value })}
              className="p-2.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-teal-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#00bda5] hover:bg-[#00a38e] text-white font-bold text-xs rounded-xl cursor-pointer border-none shadow-xs"
            >
              Save Contact
            </button>
          </div>
        </form>
      )}

      {/* CONTACT CARDS GRID */}
      {contacts.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-zinc-900/40 border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-500">
          No recruiter contacts stored for this application yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contacts.map((contact) => (
            <div key={contact.id} className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-3 shadow-xs">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-white">{contact.name}</h4>
                  <p className="text-xs text-teal-700 dark:text-teal-400 font-semibold">{contact.title || 'Recruiter / Contact'}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingContactId(contact.id); setFormData(contact); setShowAddForm(true); }}
                    className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-800 dark:hover:text-white rounded"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    onClick={() => handleDeleteContact(contact.id)}
                    className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-500 rounded"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                {contact.email && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 flex items-center gap-1">
                      <Mail size={12} /> {contact.email}
                    </span>
                    <button
                      onClick={() => handleCopyText(contact.email, 'email')}
                      className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline cursor-pointer font-semibold"
                    >
                      Copy Email
                    </button>
                  </div>
                )}
                {contact.phone && (
                  <div className="text-zinc-500 flex items-center gap-1">
                    <Phone size={12} /> {contact.phone}
                  </div>
                )}
                {contact.linkedin_url && (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Linkedin size={12} /> Open LinkedIn Profile
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI EMAIL ASSIST PANEL */}
      <section className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
            <Wand2 size={15} />
            AI Contextual Email Assist
          </h4>
          <span className="text-[10px] font-semibold text-zinc-400">
            Powered by tailr4u
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
              Select Purpose
            </label>
            <select
              value={selectedPurpose}
              onChange={(e) => setSelectedPurpose(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none cursor-pointer"
            >
              {EMAIL_PURPOSES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
              Recipient Contact
            </label>
            <select
              value={selectedContactEmail}
              onChange={(e) => setSelectedContactEmail(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-2.5 text-zinc-900 dark:text-zinc-100 focus:outline-none cursor-pointer"
            >
              {contacts.map((c) => (
                <option key={c.id} value={c.email}>{c.name} ({c.email || 'No email'})</option>
              ))}
              <option value="">Default Hiring Team</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerateEmail}
          disabled={isGeneratingEmail}
          className="px-4 py-2.5 bg-[#00bda5] hover:bg-[#00a38e] text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer border-none shadow-xs"
        >
          {isGeneratingEmail ? <RefreshCw size={14} className="animate-spin" /> : <Wand2 size={14} />}
          <span>Generate Outreach Email</span>
        </button>

        {/* Generated Email Content */}
        {generatedBody && (
          <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 space-y-3 text-xs animate-fade-in">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
              <div className="font-bold text-zinc-900 dark:text-white">Subject: {generatedSubject}</div>
              <button
                onClick={() => handleCopyText(generatedSubject, 'subject')}
                className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer font-bold"
              >
                {copiedSubject ? <Check size={12} /> : <Copy size={12} />}
                {copiedSubject ? 'Copied' : 'Copy Subject'}
              </button>
            </div>

            <div className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
              {generatedBody}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => handleCopyText(generatedBody, 'body')}
                className="px-3.5 py-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-100 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 font-bold rounded-xl flex items-center gap-1.5 cursor-pointer text-xs shadow-xs"
              >
                {copiedBody ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span>{copiedBody ? 'Copied to Clipboard' : 'Copy Email Body'}</span>
              </button>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}

export default RecruiterTab;
