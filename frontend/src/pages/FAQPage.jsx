import React, { useState } from 'react';
import { ChevronDown, MessageCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function FAQPage() {
  const { darkMode } = useApp();
  const [openIndex, setOpenIndex] = useState(0);

  const faqs = [
    {
      question: "How does the ATS Analysis work?",
      answer: "We use a proprietary NLP (Natural Language Processing) algorithm to extract core competencies, hard skills, and soft skills from the job description you provide. We then cross-reference these exactly with your uploaded resume to determine a match percentage, indicating how likely your resume will pass a standard Applicant Tracking System (ATS)."
    },
    {
      question: "Will the generated resume sound like me?",
      answer: "Yes! Our AI is strictly instructed to maintain truthfulness. It does not hallucinate new experiences. Instead, it rewrites your existing achievements to better align with the vocabulary and emphasis of the target job description."
    },
    {
      question: "What happens when I run out of credits?",
      answer: "If you exhaust your credits, you can upgrade to a higher tier plan directly from the Billing tab in your Profile. We offer Pro and Ultra plans for high-volume applicants. Your free credits reset monthly."
    },
    {
      question: "Can I download my tailored resume as a Word document?",
      answer: "Currently, tailr4u exports pixel-perfect PDF documents because PDFs guarantee that your formatting will be perfectly preserved across all Applicant Tracking Systems and recruiter devices. Word document export is on our roadmap for Q3."
    },
    {
      question: "Is my data secure?",
      answer: "Absolutely. We do not sell your personal data or resume information to third parties. All resumes are processed securely and deleted upon your request."
    }
  ];

  return (
    <div className="w-full animate-fadeIn py-8">
      
      <div className="text-center mb-12">
        <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
          <MessageCircle size={32} />
        </div>
        <h1 className="text-3xl font-extrabold mb-4">Frequently Asked Questions</h1>
        <p className={`text-lg ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
          Everything you need to know about tailr4u and how it works.
        </p>
      </div>

      <div className="space-y-4">
        {faqs.map((faq, idx) => (
          <div 
            key={idx} 
            className={`border rounded-2xl overflow-hidden transition-all ${
              darkMode 
                ? 'bg-zinc-900/50 border-zinc-800' 
                : 'bg-white border-zinc-200'
            } ${openIndex === idx ? (darkMode ? 'border-zinc-500' : 'border-zinc-400 shadow-md') : ''}`}
          >
            <button
              onClick={() => setOpenIndex(openIndex === idx ? -1 : idx)}
              className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none"
            >
              <h3 className="font-bold text-lg pr-8">{faq.question}</h3>
              <ChevronDown 
                className={`transition-transform duration-300 flex-shrink-0 ${openIndex === idx ? 'rotate-180 text-[#00bda5]' : (darkMode ? 'text-zinc-500' : 'text-zinc-400')}`} 
              />
            </button>
            
            <div 
              className={`px-6 overflow-hidden transition-all duration-300 ease-in-out ${
                openIndex === idx ? 'max-h-96 pb-6 opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <p className={`text-sm leading-relaxed ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
                {faq.answer}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className={`mt-12 p-8 text-center rounded-2xl border ${darkMode ? 'bg-zinc-900/30 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
        <h3 className="font-bold text-xl mb-2">Still have questions?</h3>
        <p className={`text-sm mb-6 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
          Can't find the answer you're looking for? Please chat to our friendly team.
        </p>
        <a 
          href="#/support/contact"
          className="inline-flex items-center justify-center px-6 py-3 bg-[#00bda5] hover:bg-[#00a38f] text-white font-bold rounded-lg transition-colors"
        >
          Get in touch
        </a>
      </div>

    </div>
  );
}
