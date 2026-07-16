import React from 'react';
import { X, CheckCircle, Zap, FileText, BarChart2, DollarSign, HelpCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function HowItWorksModal({ isOpen, onClose }) {
  const { darkMode } = useApp();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl ${darkMode ? 'bg-zinc-900 text-white border-zinc-800' : 'bg-white text-zinc-900 border-zinc-200'} border`}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b bg-inherit border-inherit">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#00bda5]" />
            How ApplyFlow Works
          </h2>
          <button 
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-zinc-800 text-zinc-400 hover:text-white' : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900'}`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 1 */}
            <div className={`p-5 rounded-xl border ${darkMode ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-zinc-50 border-zinc-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-[#00bda5]/10 flex items-center justify-center text-[#00bda5]">
                  <FileText size={16} />
                </div>
                <h3 className="font-bold text-lg">1. Job Description Extraction</h3>
              </div>
              <p className={`text-sm leading-relaxed ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Paste any job description or URL. Our AI instantly extracts required skills, preferred qualifications, and core competencies, breaking down exactly what the recruiter is looking for.
              </p>
            </div>

            {/* 2 */}
            <div className={`p-5 rounded-xl border ${darkMode ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-zinc-50 border-zinc-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <BarChart2 size={16} />
                </div>
                <h3 className="font-bold text-lg">2. ATS Analysis</h3>
              </div>
              <p className={`text-sm leading-relaxed ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                ApplyFlow compares your base resume against the extracted job description, identifying critical keyword gaps and generating a baseline ATS match score before tailoring.
              </p>
            </div>

            {/* 3 */}
            <div className={`p-5 rounded-xl border ${darkMode ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-zinc-50 border-zinc-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
                  <Zap size={16} />
                </div>
                <h3 className="font-bold text-lg">3. Resume Tailoring</h3>
              </div>
              <p className={`text-sm leading-relaxed ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Our advanced AI automatically rewrites your bullet points, summary, and skills section to perfectly align with the target role while maintaining absolute truthfulness to your experience.
              </p>
            </div>

            {/* 4 */}
            <div className={`p-5 rounded-xl border ${darkMode ? 'bg-zinc-800/50 border-zinc-700/50' : 'bg-zinc-50 border-zinc-200'}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500">
                  <CheckCircle size={16} />
                </div>
                <h3 className="font-bold text-lg">4. Job Tracker & Analytics</h3>
              </div>
              <p className={`text-sm leading-relaxed ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                Generate a pixel-perfect PDF, automatically track the application in your Kanban board, and monitor your success rate and conversion metrics directly from your dashboard.
              </p>
            </div>
            
          </div>

          {/* Pricing & FAQ Section */}
          <div className="mt-8 border-t border-inherit pt-8">
            <h3 className="font-bold text-xl mb-6">Frequently Asked Questions</h3>
            <div className="space-y-4">
              
              <div className={`p-4 rounded-lg border ${darkMode ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white'}`}>
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <DollarSign size={16} className="text-[#00bda5]" />
                  How does pricing work?
                </h4>
                <p className={`text-sm ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  We operate on a credit-based system. You consume 1 credit per tailored application. We offer a Free Tier (3 credits), a Pro Tier, and an Ultra Tier for high-volume applicants.
                </p>
              </div>

              <div className={`p-4 rounded-lg border ${darkMode ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-200 bg-white'}`}>
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <HelpCircle size={16} className="text-blue-500" />
                  Is the generated resume ATS friendly?
                </h4>
                <p className={`text-sm ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  Yes. All templates generated by ApplyFlow use strict, parseable semantic structures designed explicitly to pass through Applicant Tracking Systems (Workday, Greenhouse, Lever) without formatting errors.
                </p>
              </div>

            </div>
          </div>

        </div>
        
        {/* Footer */}
        <div className="sticky bottom-0 z-10 px-6 py-4 border-t bg-inherit border-inherit flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-[#00bda5] hover:bg-[#00a38f] text-white font-bold rounded-lg transition-colors"
          >
            Got it
          </button>
        </div>

      </div>
    </div>
  );
}
