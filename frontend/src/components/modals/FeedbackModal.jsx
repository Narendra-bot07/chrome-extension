import React, { useState } from 'react';
import { X, Star, UploadCloud, MessageSquare, CheckCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function FeedbackModal({ isOpen, onClose }) {
  const { darkMode, apiUrl, session } = useApp();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const categories = [
    "Feature Request",
    "Bug Report",
    "UI/UX",
    "Resume Tailoring",
    "Job Tracker",
    "Performance",
    "Other"
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      setError("Please select a rating.");
      return;
    }
    
    setSubmitting(true);
    setError(null);
    
    try {
      const res = await fetch(`${apiUrl}/api/v1/support/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          rating,
          category,
          title,
          description,
          screenshot_url: screenshotUrl || null
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to submit feedback.");
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
        // reset state after closing
        setTimeout(() => {
          setSuccess(false);
          setRating(0);
          setCategory('');
          setTitle('');
          setDescription('');
          setScreenshotUrl('');
        }, 300);
      }, 2000);
    } catch (err) {
      setError(err.message || "Failed to submit feedback. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className={`relative w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl ${darkMode ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-white text-zinc-900 border-zinc-200'} border`}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-inherit border-inherit">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-500" />
            Send Feedback
          </h2>
          <button 
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900'}`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center py-10 space-y-4">
              <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} />
              </div>
              <h3 className="text-xl font-bold">Thank you for your feedback!</h3>
              <p className={darkMode ? "text-zinc-400" : "text-zinc-600"}>Your input helps us improve ApplyFlow.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Rating */}
              <div>
                <label className="block text-sm font-bold mb-2">How would you rate your experience? *</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      className="focus:outline-none transition-transform hover:scale-110"
                    >
                      <Star 
                        size={28} 
                        className={
                          star <= (hoverRating || rating)
                            ? "fill-yellow-400 text-yellow-400"
                            : darkMode ? "text-zinc-700" : "text-zinc-300"
                        }
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-bold mb-2">Category *</label>
                <select 
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={`w-full p-2.5 rounded-lg border text-sm outline-none transition-all ${
                    darkMode 
                      ? 'bg-zinc-800/50 border-zinc-700 focus:border-[#00bda5] text-white' 
                      : 'bg-zinc-50 border-zinc-300 focus:border-[#00bda5] text-zinc-900'
                  }`}
                >
                  <option value="" disabled>Select a category</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-bold mb-2">Title *</label>
                <input 
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Brief summary of your feedback"
                  className={`w-full p-2.5 rounded-lg border text-sm outline-none transition-all ${
                    darkMode 
                      ? 'bg-zinc-800/50 border-zinc-700 focus:border-[#00bda5] text-white placeholder-zinc-600' 
                      : 'bg-zinc-50 border-zinc-300 focus:border-[#00bda5] text-zinc-900 placeholder-zinc-400'
                  }`}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-bold mb-2">Description *</label>
                <textarea 
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Please provide more details..."
                  rows={4}
                  className={`w-full p-2.5 rounded-lg border text-sm outline-none transition-all resize-none ${
                    darkMode 
                      ? 'bg-zinc-800/50 border-zinc-700 focus:border-[#00bda5] text-white placeholder-zinc-600' 
                      : 'bg-zinc-50 border-zinc-300 focus:border-[#00bda5] text-zinc-900 placeholder-zinc-400'
                  }`}
                />
              </div>

              {/* Optional Screenshot */}
              <div>
                <label className="block text-sm font-bold mb-2">Screenshot URL (Optional)</label>
                <div className="flex items-center gap-2">
                  <div className={`flex items-center justify-center p-2.5 rounded-lg border ${darkMode ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-50 border-zinc-300'}`}>
                    <UploadCloud size={18} className="text-zinc-500" />
                  </div>
                  <input 
                    type="url"
                    value={screenshotUrl}
                    onChange={(e) => setScreenshotUrl(e.target.value)}
                    placeholder="https://imgur.com/..."
                    className={`flex-1 p-2.5 rounded-lg border text-sm outline-none transition-all ${
                      darkMode 
                        ? 'bg-zinc-800/50 border-zinc-700 focus:border-[#00bda5] text-white placeholder-zinc-600' 
                        : 'bg-zinc-50 border-zinc-300 focus:border-[#00bda5] text-zinc-900 placeholder-zinc-400'
                    }`}
                  />
                </div>
              </div>

              {error && (
                <div className="text-red-500 text-sm font-medium">{error}</div>
              )}

              <button 
                type="submit"
                disabled={submitting}
                className={`w-full py-3 rounded-lg font-bold text-white transition-all ${
                  submitting ? 'bg-blue-500/50 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </button>

            </form>
          )}
        </div>
      </div>
    </div>
  );
}


