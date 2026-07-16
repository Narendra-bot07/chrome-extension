import React, { useState } from 'react';
import { Search, Book, FileText, PlayCircle, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function HelpSearchPage() {
  const { darkMode } = useApp();
  const [query, setQuery] = useState('');

  const topics = [
    { title: 'Getting Started', icon: PlayCircle, articles: 5, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { title: 'Resume Tailoring', icon: FileText, articles: 12, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { title: 'Job Tracking', icon: Book, articles: 8, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { title: 'Billing & Subscriptions', icon: Book, articles: 4, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  ];

  return (
    <div className="max-w-4xl mx-auto w-full animate-fadeIn">
      
      {/* Header */}
      <div className="text-center py-12">
        <h1 className="text-4xl font-extrabold mb-4">How can we help you?</h1>
        <p className={`text-lg mb-8 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
          Search through our extensive documentation and articles.
        </p>

        {/* Search Bar */}
        <div className="max-w-2xl mx-auto relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className={`w-5 h-5 ${darkMode ? 'text-zinc-500 group-focus-within:text-[#00bda5]' : 'text-zinc-400 group-focus-within:text-[#00bda5]'} transition-colors`} />
          </div>
          <input
            type="text"
            className={`w-full pl-12 pr-4 py-4 rounded-2xl text-lg outline-none transition-all border-2 shadow-sm ${
              darkMode 
                ? 'bg-zinc-900 border-zinc-800 focus:border-[#00bda5] text-white placeholder-zinc-500' 
                : 'bg-white border-zinc-200 focus:border-[#00bda5] text-zinc-900 placeholder-zinc-400'
            }`}
            placeholder="Search for articles, tutorials, or troubleshooting..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Topics */}
      <div className="mt-8">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          Browse by Topic
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {topics.map((topic, idx) => {
            const Icon = topic.icon;
            return (
            <button 
              key={idx}
              className={`flex items-center justify-between p-6 rounded-2xl border transition-all text-left ${
                darkMode 
                  ? 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-500 hover:bg-zinc-800' 
                  : 'bg-white border-zinc-200 hover:border-zinc-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${topic.bg} ${topic.color}`}>
                  <Icon size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{topic.title}</h3>
                  <p className={`text-sm mt-0.5 ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
                    {topic.articles} articles
                  </p>
                </div>
              </div>
              <ArrowRight className={darkMode ? 'text-zinc-600' : 'text-zinc-300'} />
            </button>
            );
          })}
        </div>
      </div>

      {/* Popular Articles */}
      <div className="mt-12">
        <h2 className="text-xl font-bold mb-6">Popular Articles</h2>
        <div className={`rounded-2xl border overflow-hidden ${darkMode ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-zinc-200'}`}>
          {[
            "How does the AI determine my ATS score?",
            "Can I edit the resume after it's been tailored?",
            "What happens when I run out of credits?",
            "How do I link my custom domain?"
          ].map((article, idx, arr) => (
            <button 
              key={idx}
              className={`w-full flex items-center justify-between p-5 text-left transition-colors ${
                idx !== arr.length - 1 ? (darkMode ? 'border-b border-zinc-800' : 'border-b border-zinc-100') : ''
              } ${darkMode ? 'hover:bg-zinc-800/50' : 'hover:bg-zinc-50'}`}
            >
              <span className="font-medium text-sm">{article}</span>
              <ArrowRight size={16} className={darkMode ? 'text-zinc-600' : 'text-zinc-300'} />
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
