import React from 'react';
import { Copy, Download } from 'lucide-react';

function CoverLetterView({
  coverLetter,
  companyName,
  handleCopyToClipboard,
  handleDownloadCoverLetterPDF,
  setStep
}) {
  return (
    <div className="space-y-4 flex-1 flex flex-col justify-between">
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Tailored Cover Letter</label>
          <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded shadow-sm">
            {companyName}
          </span>
        </div>

        {/* Scrollable Cover Letter Text container */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 max-h-[350px] overflow-y-auto text-[10px] leading-relaxed scrollbar-thin select-text text-slate-750 shadow-inner font-serif">
          <p className="text-right italic text-[9px] text-slate-400 mb-4">{coverLetter.date}</p>
          
          <div className="mb-4">
            <p className="font-bold text-slate-800">To:</p>
            <p>{coverLetter.recipient_name}</p>
            <p className="font-semibold">{coverLetter.company_name}</p>
          </div>

          <p className="font-bold mb-3">{coverLetter.salutation}</p>
          
          {/* Paragraph break renderer. Not just coverLetter.body -- that field
              doesn't exist on either of the two actual generation shapes in
              use (.content from the Phase-3 pipeline, .cover_letter from the
              legacy endpoint), so this would otherwise crash on `.split`. */}
          {(coverLetter.body || coverLetter.content || coverLetter.cover_letter || '').split('\n\n').map((para, idx) => (
            <p key={idx} className="mb-3 text-justify">{para}</p>
          ))}
          
          <div className="mt-4 pt-2 border-t border-slate-200/50">
            <p className="whitespace-pre-line text-slate-600">{coverLetter.signoff}</p>
          </div>
        </div>
      </div>

      {/* Cover Letter controls */}
      <div className="space-y-2 pt-4 mt-auto">
        <div className="flex gap-2">
          <button 
            onClick={handleCopyToClipboard}
            className="flex-1 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-sm flex items-center justify-center gap-1.5"
          >
            <Copy size={13} />
            Copy Text
          </button>
          <button 
            onClick={handleDownloadCoverLetterPDF}
            className="flex-1 py-3 bg-brand hover:bg-brand-hover text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-sm flex items-center justify-center gap-1.5"
          >
            <Download size={13} />
            Download PDF
          </button>
        </div>
        <button 
          onClick={() => setStep('job-card')}
          className="w-full py-2.5 border border-slate-200 text-slate-500 font-bold text-[10px] uppercase tracking-wider rounded-xl hover:bg-slate-50 transition shadow-xs flex items-center justify-center"
        >
          Back to Job Details
        </button>
      </div>
    </div>
  );
}

export default CoverLetterView;
