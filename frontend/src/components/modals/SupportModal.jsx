import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, BookOpen, Mail, HelpCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { MotionModal } from '../../motion/MotionSystem';

export default function SupportModal({ isOpen, onClose }) {
  const { darkMode, profile, user } = useApp();
  const navigate = useNavigate();

  return (
    <MotionModal open={isOpen} onClose={onClose} className={`relative max-w-md overflow-hidden ${darkMode ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-white text-zinc-900 border-zinc-200'}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-inherit border-inherit">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-indigo-500" />
            Support Center
          </h2>
          <button 
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900'}`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          
          <button 
            onClick={() => { onClose(); navigate('/support/search'); }}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
            darkMode ? 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800 hover:border-zinc-500' : 'bg-zinc-50 border-zinc-200 hover:bg-white hover:border-zinc-400 shadow-sm'
          }`}>
            <div className="w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <Search size={20} />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-sm">Search Help</h3>
              <p className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Find articles and documentation</p>
            </div>
          </button>

          <button 
            onClick={() => { onClose(); navigate('/support/faq'); }}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
            darkMode ? 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800 hover:border-zinc-500' : 'bg-zinc-50 border-zinc-200 hover:bg-white hover:border-zinc-400 shadow-sm'
          }`}>
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <BookOpen size={20} />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-sm">Frequently Asked Questions</h3>
              <p className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Answers to common questions</p>
            </div>
          </button>

          <button 
            onClick={() => { onClose(); navigate('/support/contact'); }}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
            darkMode ? 'bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800 hover:border-indigo-500' : 'bg-zinc-50 border-zinc-200 hover:bg-white hover:border-indigo-500 shadow-sm'
          }`}>
            <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Mail size={20} />
            </div>
            <div className="text-left">
              <h3 className="font-bold text-sm">Email Support</h3>
              <p className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Get in touch with our team directly</p>
            </div>
          </button>

        </div>
    </MotionModal>
  );
}
