import React, { useState } from 'react';
import { Mail, Send, AlertCircle, CheckCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function ContactSupportPage() {
  const { darkMode, apiUrl, session } = useApp();
  const [subject, setSubject] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${apiUrl}/api/v1/support/ticket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          subject,
          priority,
          description
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to submit support ticket.");
      }

      setSuccess(true);
      setSubject('');
      setDescription('');
      setPriority('NORMAL');
      
      // Auto dismiss success message after 5 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 5000);
    } catch (err) {
      setError(err.message || "Failed to submit support ticket. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full animate-fadeIn py-8">
      
      <div className="text-center mb-10">
        <div className="w-16 h-16 bg-blue-500/10 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <Mail size={32} />
        </div>
        <h1 className="text-3xl font-extrabold mb-4">Contact Support</h1>
        <p className={`text-lg ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
          We're here to help. Fill out the form below and our team will get back to you within 24 hours.
        </p>
      </div>

      <div className={`p-8 rounded-2xl border shadow-sm ${darkMode ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-zinc-200'}`}>
        
        {success && (
          <div className="mb-8 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex gap-3 animate-fadeIn">
            <CheckCircle className="shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-bold">Ticket Submitted Successfully</h3>
              <p className="text-sm mt-1 opacity-90">Our support team has received your request and will contact you via your account email shortly.</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div>
            <label className="block text-sm font-bold mb-2">Subject *</label>
            <input 
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="E.g. Issue with generating PDF"
              className={`w-full p-3 rounded-xl border text-sm outline-none transition-all ${
                darkMode 
                  ? 'bg-zinc-800/50 border-zinc-700 focus:border-blue-500 text-white placeholder-zinc-500' 
                  : 'bg-zinc-50 border-zinc-300 focus:border-blue-500 text-zinc-900 placeholder-zinc-400'
              }`}
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Priority</label>
            <select 
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={`w-full p-3 rounded-xl border text-sm outline-none transition-all ${
                darkMode 
                  ? 'bg-zinc-800/50 border-zinc-700 focus:border-blue-500 text-white' 
                  : 'bg-zinc-50 border-zinc-300 focus:border-blue-500 text-zinc-900'
              }`}
            >
              <option value="LOW">Low - General Question</option>
              <option value="NORMAL">Normal - Issue preventing workflow</option>
              <option value="HIGH">High - Urgent / Billing Issue</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">Description *</label>
            <textarea 
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please describe your issue in detail..."
              rows={6}
              className={`w-full p-3 rounded-xl border text-sm outline-none transition-all resize-none ${
                darkMode 
                  ? 'bg-zinc-800/50 border-zinc-700 focus:border-blue-500 text-white placeholder-zinc-500' 
                  : 'bg-zinc-50 border-zinc-300 focus:border-blue-500 text-zinc-900 placeholder-zinc-400'
              }`}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-rose-500 text-sm font-medium">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button 
            type="submit"
            disabled={submitting}
            className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 text-white transition-all shadow-md hover:shadow-lg ${
              submitting ? 'bg-blue-500/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5'
            }`}
          >
            {submitting ? 'Submitting...' : (
              <>
                <Send size={18} />
                Send Message
              </>
            )}
          </button>

        </form>
      </div>

    </div>
  );
}
