import React from 'react';
import { motion } from 'framer-motion';
import { X, Settings } from 'lucide-react';

function SettingsOverlay({
  apiUrl,
  setApiUrl,
  apiKey,
  setApiKey,
  onSave,
  onClose
}) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-5 select-text"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="bg-white border border-slate-200 dark:bg-[#0f0f11] dark:border-slate-900 rounded-2xl p-5 w-full max-w-[340px] relative shadow-premium"
      >
        <button 
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 dark:hover:text-slate-350 transition cursor-pointer"
          onClick={onClose}
        >
          <X size={16} />
        </button>
        
        <h2 className="text-xs font-black uppercase text-slate-800 dark:text-slate-200 tracking-widest mb-4 flex items-center gap-1.5 select-none">
          <Settings size={14} className="text-brand animate-spin" style={{ animationDuration: '4s' }} />
          Connection Config
        </h2>

        <div className="space-y-4">
          <div>
            <label className="text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block select-none">FastAPI Server URL</label>
            <input 
              type="text" 
              className="w-full bg-white border border-slate-200 dark:bg-[#09090b] dark:border-slate-900 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand placeholder-slate-400 dark:placeholder-slate-650 shadow-sm"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://localhost:8000"
            />
          </div>

          <div>
            <label className="text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 block select-none">AI Engine API Key (Optional)</label>
            <input 
              type="password" 
              className="w-full bg-white border border-slate-200 dark:bg-[#09090b] dark:border-slate-900 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand placeholder-slate-400 dark:placeholder-slate-650 shadow-sm"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter Custom API Key"
            />
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1.5 leading-normal select-none">
              If defined inside your backend <code>.env</code> file, you can leave this empty.
            </p>
          </div>

          <button 
            className="w-full py-2.5 bg-brand hover:bg-brand-hover text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition shadow-md hover:shadow-indigo-900/40 cursor-pointer active:scale-95"
            onClick={onSave}
          >
            Save Config
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default SettingsOverlay;
