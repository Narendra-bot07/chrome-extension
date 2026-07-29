import React, { useState, useMemo } from 'react';
import {
  Check, Code2, Folder, Github, Globe, Linkedin, Mail, MapPin, Phone,
  RotateCcw, Sparkles, X, Award, BookOpen, Layers, Edit2, ShieldAlert, Target
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  canonicalContactIdentity,
  normalizePersonName,
  professionalLink
} from '../utils/resumePresentation';
import { hasReviewOperation, mergeReviewResume } from '../utils/resumeReviewMerge';
import { toRenderableResume } from '../utils/renderableResume';

const labelFor = (value) => String(value || '')
  .replace(/_/g, ' ')
  .replace(/\b\w/g, char => char.toUpperCase());

const isUrl = value => typeof value === 'string' && /^(https?:\/\/|mailto:)/i.test(value);
const contactHref = (key, value) => {
  const text = String(value || '').trim();
  if (!text || key === 'location') return undefined;
  if (key === 'email') return /^mailto:/i.test(text) ? text : `mailto:${text}`;
  if (key === 'phone') return /^tel:/i.test(text) ? text : `tel:${text.replace(/[^\d+]/g, '')}`;
  if (/^[a-z][a-z\d+.-]*:/i.test(text)) return text;
  return `https://${text.replace(/^\/+/, '')}`;
};
const hasVisibleValue = value => {
  if (value === null || value === undefined || value === '') return false;
  if (String(value).trim() === '0' || String(value).trim() === '0.') return false;
  if (Array.isArray(value)) return value.some(hasVisibleValue);
  if (typeof value === 'object') return Object.values(value).some(hasVisibleValue);
  return true;
};
const INTERNAL_REVIEW_FIELDS = new Set([
  'id', 'confidence', 'source', 'source_span', 'source_text',
  'normalized_text', 'raw_text', 'provenance', 'metadata',
  'item_index', 'bullet_index', 'index', 'order', 'sort_order',
  'itemIndex', 'bulletIndex', 'change_id', 'status', 'category'
]);
const displayValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (String(value).trim() === '0' || String(value).trim() === '0.') return null;
  if (isUrl(value)) {
    return <a href={value} target="_blank" rel="noreferrer" className="text-[#00a894] underline">{value}</a>;
  }
  if (Array.isArray(value)) {
    const valid = value.filter(hasVisibleValue);
    if (valid.length === 0) return null;
    return valid.map((nested, index) => (
      <React.Fragment key={index}>{index > 0 ? ', ' : ''}{displayValue(nested)}</React.Fragment>
    ));
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key, nested]) => !INTERNAL_REVIEW_FIELDS.has(key) && hasVisibleValue(nested))
      .map(([key, nested], index) => (
      <React.Fragment key={key}>{index > 0 ? ' | ' : ''}{labelFor(key)}: {displayValue(nested)}</React.Fragment>
    ));
  }
  return String(value);
};

const CircularGauge = ({ score, label, colorClass, size = 58, strokeWidth = 4, showOutOf100 = false }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - ((score || 0) / 100) * circumference;
  
  return (
    <div className="flex flex-col items-center gap-1 font-sans">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="w-full h-full transform -rotate-90" viewBox={`0 0 ${size} ${size}`}>
          <circle
            className="text-zinc-100 dark:text-zinc-800"
            strokeWidth={strokeWidth}
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          <circle
            className={`transition-all duration-500 ease-out ${colorClass}`}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-baseline leading-none">
            <span className="text-[12px] font-black text-zinc-850 dark:text-zinc-150">
              {score ?? 0}
            </span>
            {showOutOf100 ? (
              <span className="text-[6.5px] font-black text-zinc-400 dark:text-zinc-500 ml-0.5">
                /100
              </span>
            ) : (
              <span className="text-[8px] font-black text-zinc-400 dark:text-zinc-500 ml-0.5">
                %
              </span>
            )}
          </div>
        </div>
      </div>
      <span className="text-[8px] font-black uppercase tracking-wider text-zinc-400 dark:text-zinc-500 text-center mt-0.5 animate-pulse">
        {label}
      </span>
    </div>
  );
};

function ResumeReviewView({
  parsedResume,
  originalResume,
  suggestions,
  reviewOperations,
  reviewProgress,
  validation,
  onUpdateSuggestionStatus,
  onUpdateSuggestionText,
  onAcceptAll,
  onRejectAll,
  onGenerateResume,
  onBack,
  loading
}) {
  const { 
    darkMode, apiUrl, apiKey, jobAnalysis, jdFingerprint, setReviewSuggestions, 
    comparison, selectedSections, liveATS, isRefineStreaming, setIsRefineStreaming 
  } = useApp();
  const [activeEditSection, setActiveEditSection] = useState(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [refining, setRefining] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [streamingSection, setStreamingSection] = useState(null);
  const activeReaderRef = React.useRef(null);
  const summarySuggestions = useMemo(
    () => suggestions.filter(suggestion => suggestion.sectionType === 'summary'),
    [suggestions]
  );
  const skillSuggestions = useMemo(
    () => suggestions.filter(suggestion => suggestion.sectionType === 'skills'),
    [suggestions]
  );
  const contactItems = useMemo(() => {
    const personal = parsedResume.personal_info || {};
    const iconFor = type => ({
      linkedin: Linkedin,
      github: Github,
      code: Code2,
      folder: Folder,
      website: Globe
    }[type] || Globe);
    const professionalItem = (key, value) => {
      const presentation = professionalLink(key, value);
      return {
        key,
        value,
        label: presentation.label,
        Icon: iconFor(presentation.type)
      };
    };
    const candidates = [
      { key: 'email', value: personal.email, label: personal.email, Icon: Mail },
      { key: 'phone', value: personal.phone, label: personal.phone, Icon: Phone },
      { key: 'location', value: personal.location, label: personal.location, Icon: MapPin },
      professionalItem('linkedin', personal.linkedin),
      professionalItem('github', personal.github),
      professionalItem('portfolio', personal.website || parsedResume.portfolio || parsedResume.portfolio_url),
      ...Object.entries(parsedResume.links || {}).map(([key, value]) => professionalItem(key, value)),
      ...Object.entries(personal.coding_profiles || {}).map(([key, value]) => professionalItem(key, value))
    ];
    const seen = new Set();
    return candidates.filter(item => {
      if (!item.value) return false;
      const identity = canonicalContactIdentity(item.key, item.value);
      if (!identity || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }, [parsedResume]);

  const handleStopRefinement = () => {
    if (activeReaderRef.current) {
      activeReaderRef.current.cancel().catch(() => {});
    }
    const cleared = suggestions.map(s => ({ ...s, isTyping: false }));
    setReviewSuggestions(cleared);
    setRefining(false);
    setStreamingSection(null);
    setIsRefineStreaming(false);
    activeReaderRef.current = null;
  };

  const handleRefineSection = async (sectionType) => {
    if (!customPrompt.trim()) return;
    setRefining(true);
    setStreamingSection(sectionType);
    setIsRefineStreaming(true);

    const originalSuggestions = [...suggestions];
    const targetSuggestions = suggestions.filter(s => s.sectionType === sectionType);

    let sectionData;
    if (sectionType === 'summary') {
      const summarySuggest = targetSuggestions[0];
      sectionData = {
        original: parsedResume.summary || "",
        current_suggested: summarySuggest ? summarySuggest.suggested : (parsedResume.summary || "")
      };
    } else if (sectionType === 'skills') {
      sectionData = targetSuggestions.map(s => s.skillName);
    } else {
      sectionData = targetSuggestions.map(s => s.suggested);
    }

    const headers = {};
    if (apiKey) headers["x-groq-key"] = apiKey;
    const token = localStorage.getItem('access_token');
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const res = await fetch(`${apiUrl}/api/refine-section/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: JSON.stringify({
          section_type: sectionType,
          section_data: sectionData,
          prompt: customPrompt,
          job: jobAnalysis,
          resume_id: parsedResume?.id || null,
          intelligence_model: "ATSScoringEngine",
          working_resume: toRenderableResume(mergeReviewResume(parsedResume, suggestions).workingResume),
          source_resume: parsedResume,
          resume_match_analysis: liveATS,
          ats_analysis: liveATS,
          accepted_changes: suggestions.filter(s => s.status === 'accepted'),
          pending_changes: suggestions.filter(s => s.status === 'pending')
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const detailStr = errorData.detail && typeof errorData.detail === 'object'
          ? JSON.stringify(errorData.detail)
          : (errorData.detail || "Section refinement failed on backend.");
        throw new Error(detailStr);
      }

      const reader = res.body.getReader();
      activeReaderRef.current = reader;
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const matches = chunk.matchAll(/data:\s*(.*?)(?:\n\n|\n|$)/g);
        for (const match of matches) {
          const content = match[1];
          if (content.startsWith("[ERROR]")) {
            throw new Error(content.replace("[ERROR]", "").trim());
          }
          accumulatedText += content;
        }

        let updated;
        if (sectionType === 'summary') {
          updated = suggestions.map(s => {
            if (s.sectionType === 'summary') {
              return { ...s, suggested: accumulatedText, status: 'pending', isTyping: true };
            }
            return s;
          });
        } else if (sectionType === 'skills') {
          const items = accumulatedText.split(',').map(item => item.trim()).filter(Boolean);
          updated = suggestions.map(s => {
            if (s.sectionType === 'skills') {
              const idx = targetSuggestions.findIndex(ts => ts.id === s.id);
              if (idx !== -1 && items[idx] !== undefined) {
                const isLast = idx === items.length - 1;
                return { ...s, skillName: items[idx], suggested: items[idx], status: 'pending', isTyping: isLast };
              }
            }
            return s;
          });
        } else {
          const lines = accumulatedText.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => line.replace(/^[-•*]\s*/, ''));
          updated = suggestions.map(s => {
            if (s.sectionType === sectionType) {
              const idx = targetSuggestions.findIndex(ts => ts.id === s.id);
              if (idx !== -1 && lines[idx] !== undefined) {
                const isLast = idx === lines.length - 1;
                return { ...s, suggested: lines[idx], status: 'pending', isTyping: isLast };
              }
            }
            return s;
          });
        }
        setReviewSuggestions(updated);
      }

      const finalSuggestions = suggestions.map(s => {
        if (s.sectionType === sectionType) {
          const idx = targetSuggestions.findIndex(ts => ts.id === s.id);
          if (idx !== -1) {
            let finalVal = s.suggested;
            if (sectionType === 'summary') {
              finalVal = accumulatedText;
            } else if (sectionType === 'skills') {
              const items = accumulatedText.split(',').map(item => item.trim()).filter(Boolean);
              if (items[idx] !== undefined) finalVal = items[idx];
            } else {
              const lines = accumulatedText.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .map(line => line.replace(/^[-•*]\s*/, ''));
              if (lines[idx] !== undefined) finalVal = lines[idx];
            }
            return { ...s, suggested: finalVal, skillName: sectionType === 'skills' ? finalVal : s.skillName, status: 'pending', isTyping: false };
          }
        }
        return s;
      });
      setReviewSuggestions(finalSuggestions);

      setActiveEditSection(null);
      setCustomPrompt("");
    } catch (e) {
      console.error(e);
      setReviewSuggestions(originalSuggestions);
      alert("AI editing was interrupted. Your original content has been restored.");
    } finally {
      setRefining(false);
      setStreamingSection(null);
      setIsRefineStreaming(false);
      activeReaderRef.current = null;
    }
  };

  const handleRefineRecordSection = async (sectionType) => {
    if (!customPrompt.trim()) return;
    const records = parsedResume?.[sectionType] || [];
    if (!records.length) return;
    setRefining(true);
    setStreamingSection(sectionType);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['x-groq-key'] = apiKey;
      const token = localStorage.getItem('access_token');
      if (token) headers.Authorization = `Bearer ${token}`;
      const sectionData = records.map(item => (
        sectionType === 'education' ? JSON.stringify(item) : String(item)
      ));
      const response = await fetch(`${apiUrl}/api/refine-section`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          section_type: sectionType,
          section_data: sectionData,
          prompt: customPrompt,
          job: jobAnalysis,
          source_resume: parsedResume,
          working_resume: toRenderableResume(mergeReviewResume(parsedResume, suggestions).workingResume)
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'AI edit failed.');
      if (!Array.isArray(payload.refined) || payload.refined.length !== records.length) {
        throw new Error('AI changed the number of records, so the edit was rejected.');
      }
      const ids = new Set(records.map((_, index) => `${sectionType}:record:${index}`));
      const retained = suggestions.filter(item => !ids.has(item.id));
      const proposed = records.map((record, index) => ({
        id: `${sectionType}:record:${index}`,
        change_id: `${sectionType}:record:${index}`,
        category: labelFor(sectionType),
        status: 'pending',
        original: sectionType === 'education' ? JSON.stringify(record) : String(record),
        suggested: payload.refined[index],
        reason: 'User-requested wording edit with source structure preserved.',
        atsImpact: 0,
        confidence: 'High',
        sectionType,
        itemIndex: index,
        bulletIndex: 0
      }));
      setReviewSuggestions([...retained, ...proposed]);
      setActiveEditSection(null);
      setCustomPrompt('');
    } catch (error) {
      alert(error.message || 'AI edit failed. Original records were preserved.');
    } finally {
      setRefining(false);
      setStreamingSection(null);
    }
  };

  const renderRefinePanel = (sectionType) => {
    return (
      <div className="p-4 bg-emerald-550/[0.04] dark:bg-emerald-950/10 border border-emerald-500/20 dark:border-emerald-900/30 rounded-xl space-y-3 mt-3 select-none text-left font-sans">
        <div className="flex justify-between items-center text-[#00bda5] dark:text-emerald-400">
          <div className="flex items-center gap-1.5 font-sans font-black text-[10px] uppercase tracking-wider">
            <Sparkles size={12} />
            <span>Edit with AI</span>
            {refining && streamingSection === sectionType && (
              <span className="ml-2 text-rose-500 font-extrabold animate-pulse text-[8px] tracking-widest">Generating...</span>
            )}
          </div>
          <button 
            onClick={() => setActiveEditSection(null)}
            disabled={refining}
            className="text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-200 cursor-pointer border-none bg-transparent p-0 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-sm font-bold">×</span>
          </button>
        </div>
        
        <input
          type="text"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          disabled={refining}
          placeholder={`Describe how you want this ${sectionType} refined...`}
          className="w-full text-[11px] px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-300 focus:outline-hidden focus:border-[#00bda5] font-sans disabled:opacity-60 disabled:cursor-not-allowed"
        />
        
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {[
              "Tighten each bullet to one line",
              "Stronger action verbs",
              "Lead with the most job-relevant work"
            ].map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCustomPrompt(preset)}
                disabled={refining}
                className="px-2.5 py-1 bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 text-zinc-650 dark:text-zinc-350 hover:bg-zinc-50 hover:text-zinc-850 dark:hover:bg-zinc-850 dark:hover:text-white rounded-full text-[9px] font-semibold cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {preset}
              </button>
            ))}
          </div>
          
          {refining && streamingSection === sectionType ? (
            <button
              type="button"
              onClick={handleStopRefinement}
              className="px-4 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[9px] font-extrabold uppercase tracking-wider transition cursor-pointer border-none flex items-center gap-1 shadow-xs ml-auto"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => ['education', 'achievements'].includes(sectionType)
                ? handleRefineRecordSection(sectionType)
                : handleRefineSection(sectionType)}
              disabled={refining || isRefineStreaming}
              className="px-4 py-1.5 bg-[#00bda5] hover:bg-[#00a894] disabled:bg-zinc-300 disabled:dark:bg-zinc-800 text-white rounded-lg text-[9px] font-extrabold uppercase tracking-wider transition cursor-pointer border-none flex items-center gap-1 shadow-xs ml-auto"
            >
              Edit with AI
            </button>
          )}
        </div>
      </div>
    );
  };

  // Statistics
  const stats = useMemo(() => {
    if (reviewProgress) {
      const reviewed = reviewProgress.accepted + reviewProgress.rejected;
      return {
        ...reviewProgress,
        reviewed,
        progressPercent: reviewProgress.total > 0 ? Math.round((reviewed / reviewProgress.total) * 100) : 0
      };
    }
    const total = suggestions.length;
    const accepted = suggestions.filter(s => s.status === 'accepted').length;
    const pending = suggestions.filter(s => s.status === 'pending').length;
    const rejected = suggestions.filter(s => s.status === 'rejected').length;
    const reviewed = accepted + rejected;
    const progressPercent = total > 0 ? Math.round((reviewed / total) * 100) : 100;
    return { total, accepted, pending, rejected, reviewed, progressPercent };
  }, [suggestions, reviewProgress]);

  // Render a modified element inline: Original on top, Suggested below
  const renderInlineDiff = (sectionType, originalText, itemIndex, bulletIndex) => {
    const change = suggestions.find(
      s => s.sectionType === sectionType && 
           s.itemIndex === itemIndex && 
           s.bulletIndex === bulletIndex
    );

    if (!change) return <span>{originalText}</span>;

    const isPending = change.status === 'pending';

    return (
      <span className="inline">
        {isPending ? (
          <span className="inline-flex items-center flex-wrap gap-1 mx-1 align-middle">
            <span className="text-rose-500 line-through bg-rose-50/50 dark:bg-rose-950/20 px-1 py-0.5 rounded select-all font-normal">
              {change.original}
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 px-1 py-0.5 rounded font-bold select-all inline-flex items-center">
              {change.suggested}
              {change.isTyping && (
                <span className="inline-block w-1.5 h-3.5 bg-emerald-600 dark:bg-emerald-400 ml-1 animate-pulse font-normal">|</span>
              )}
            </span>
            <span className="inline-flex gap-1 select-none">
              <button
                disabled={change.isTyping || refining}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateSuggestionStatus(change.id, 'accepted');
                }}
                className="px-2 py-0.5 bg-[#00bda5] hover:bg-[#00a894] disabled:bg-zinc-200 disabled:dark:bg-zinc-800 disabled:text-zinc-400 disabled:dark:text-zinc-600 disabled:cursor-not-allowed text-white rounded font-extrabold text-[9px] transition cursor-pointer border-none"
              >
                Accept
              </button>
              <button
                disabled={change.isTyping || refining}
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateSuggestionStatus(change.id, 'rejected');
                }}
                className="px-2 py-0.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:bg-zinc-100 disabled:dark:bg-zinc-900 disabled:text-zinc-400 disabled:dark:text-zinc-650 disabled:cursor-not-allowed text-zinc-700 dark:text-zinc-300 rounded font-extrabold text-[9px] transition cursor-pointer border-none"
              >
                Reject
              </button>
            </span>
            <span className="basis-full mt-0.5 text-[8px] font-sans text-zinc-500 dark:text-zinc-400 no-underline">
              {change.reason}
              {change.atsBenefit ? ` · ${change.atsBenefit}` : ''}
              {' · '}Confidence {Number(change.confidence || 0).toFixed(0)}%
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 mx-1 align-middle">
            <span className={change.status === 'accepted' ? 'text-zinc-900 dark:text-zinc-150 font-medium bg-emerald-50/30 dark:bg-emerald-900/10 px-1 rounded' : 'text-zinc-400 dark:text-zinc-650 line-through px-1'}>
              {change.status === 'accepted' ? change.suggested : change.original}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateSuggestionStatus(change.id, 'pending');
              }}
              className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 rounded font-extrabold text-[8px] uppercase tracking-wider transition cursor-pointer border-none"
            >
              Undo
            </button>
          </span>
        )}
      </span>
    );
  };

  const renderReadOnlySection = (title, data, sectionKey) => {
    if (!hasVisibleValue(data)) return null;
    const items = Array.isArray(data) ? data : [data];
    return (
      <div className="space-y-2" data-review-section={sectionKey}>
        <div className="flex justify-between items-center border-b border-zinc-150 dark:border-zinc-850 pb-1">
          <h2 className="text-[10px] font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-widest font-sans">
            {title}
          </h2>
          {['education', 'achievements'].includes(sectionKey) && (
            <button
              onClick={() => {
                setActiveEditSection(activeEditSection === sectionKey ? null : sectionKey);
                setCustomPrompt('');
              }}
              className="flex items-center gap-1 text-[8px] bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 text-[#00bda5] px-2 py-0.5 rounded font-extrabold uppercase tracking-wider transition cursor-pointer border-none"
            >
              <Sparkles size={8} /> Edit with AI
            </button>
          )}
        </div>
        {activeEditSection === sectionKey && renderRefinePanel(sectionKey)}
        <div className="space-y-2 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-350">
          {items.map((item, index) => {
            const recordSuggestion = suggestions.find(suggestion =>
              suggestion.sectionType === sectionKey && suggestion.itemIndex === index
            );
            if (recordSuggestion) {
              const shown = recordSuggestion.status === 'accepted'
                ? recordSuggestion.suggested
                : recordSuggestion.original;
              let displayRecord = shown;
              if (sectionKey === 'education' && typeof shown === 'string') {
                try { displayRecord = JSON.parse(shown); } catch { displayRecord = shown; }
              }
              return (
                <div key={index} className="space-y-1">
                  <div>{displayValue(displayRecord)}</div>
                  {recordSuggestion.status === 'pending' && (
                    <div className="flex gap-1">
                      <button onClick={() => onUpdateSuggestionStatus(recordSuggestion.id, 'accepted')} className="px-2 py-0.5 bg-[#00bda5] text-white rounded text-[9px] font-bold">Accept</button>
                      <button onClick={() => onUpdateSuggestionStatus(recordSuggestion.id, 'rejected')} className="px-2 py-0.5 bg-zinc-200 rounded text-[9px] font-bold">Reject</button>
                    </div>
                  )}
                </div>
              );
            }
            if (typeof item !== 'object' || item === null) {
              return <div key={index}>• {displayValue(item)}</div>;
            }
            const isValidText = val => {
              if (val === null || val === undefined) return false;
              const str = String(val).trim();
              return str !== '' && str !== '0' && str !== '0.';
            };
            const heading = item.degree
              ? item.degree
              : (item.role || item.title || item.name || item.certification_name || item.course || item.organization || item.institution);
            const subheading = [
              item.company,
              item.institution || item.school || (heading !== item.organization ? item.organization : null),
              item.issuing_organization || item.issuer || item.publisher,
              item.field_of_study,
              item.location
            ].filter(isValidText).join(' · ');
            const dates = [item.start_date || item.issue_date || item.date || item.year, item.end_date].filter(isValidText).join(' - ');
            const rawTech = Array.isArray(item.technology_stack)
              ? item.technology_stack.join(', ')
              : (item.technology_stack || item.technologies || item.tech);
            const techStack = isValidText(rawTech) ? String(rawTech).trim() : null;
            const bullets = item.description || item.bullet_points || item.bullets || item.highlights;
            const remaining = Object.entries(item).filter(([key, value]) =>
              !INTERNAL_REVIEW_FIELDS.has(key) &&
              !['title', 'name', 'certification_name', 'course', 'role', 'degree', 'organization',
                'institution', 'school', 'company', 'issuing_organization', 'issuer', 'publisher',
                'field_of_study', 'location', 'start_date', 'end_date', 'issue_date', 'date', 'year',
                'description', 'bullet_points', 'bullets', 'highlights', 'technology_stack',
                'technologies', 'tech', 'skills_used'].includes(key) &&
              hasVisibleValue(value) &&
              isValidText(value)
            );
            return (
              <div key={index} className="space-y-0.5">
                {(heading || dates) && (
                  <div className="flex justify-between gap-4 font-extrabold text-zinc-850 dark:text-zinc-200 font-sans">
                    <span>{heading}</span>
                    {dates && <span className="text-zinc-400 dark:text-zinc-500 shrink-0">{dates}</span>}
                  </div>
                )}
                {subheading && <div className="font-semibold text-zinc-600 dark:text-zinc-400">{subheading}</div>}
                {techStack && <div className="text-xs text-zinc-500 italic">Tech: {techStack}</div>}
                {hasVisibleValue(bullets) && !Array.isArray(bullets) && (
                  <div>{displayValue(bullets)}</div>
                )}
                {remaining.map(([key, value]) => (
                  <div key={key}>
                    <span className="font-semibold">{labelFor(key)}:</span> {displayValue(value)}
                  </div>
                ))}
                {Array.isArray(bullets) && bullets.length > 0 && (
                  <ul className="list-disc pl-4">
                    {bullets.map((bullet, bulletIndex) => <li key={bulletIndex}>{displayValue(bullet)}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const sectionRegistry = [
    ['Internships', 'internships'],
    ['Education', 'education'],
    ['Certifications', 'certifications'],
    ['Achievements', 'achievements'],
    ['Awards', 'awards'],
    ['Publications & Research', 'publications'],
    ['Languages', 'languages'],
    ['Leadership & Volunteering', 'volunteer_experience'],
    ['Leadership', 'leadership'],
    ['Open Source', 'open_source'],
    ['Extracurricular Activities', 'extracurricular_activities'],
    ['Interests', 'interests'],
    ['Links', 'links']
  ];

  // Real-time score semantics:
  // original = baseline score before tailoring
  // current = dynamically scales in parallel as suggestions are accepted
  // estimated/potential = target score calculated for the full tailored patch
  const totalEdits = suggestions.length;
  const acceptedCount = suggestions.filter(s => s.status === 'accepted').length;
  const acceptedRatio = totalEdits > 0 ? acceptedCount / totalEdits : 0;

  const originalResumeMatch = liveATS?.original_resume_match ?? comparison?.resume_match_before ?? 0;
  const estimatedResumeMatch = liveATS?.estimated_resume_match ?? comparison?.resume_match_after ?? originalResumeMatch;
  const scoredCurrentResumeMatch = liveATS?.current_resume_match ?? originalResumeMatch;
  const progressiveResumeMatch = Math.round(
    originalResumeMatch + (estimatedResumeMatch - originalResumeMatch) * acceptedRatio
  );
  const currentResumeMatch = acceptedCount > 0
    ? Math.max(originalResumeMatch, scoredCurrentResumeMatch, progressiveResumeMatch)
    : originalResumeMatch;

  const originalATS = liveATS?.original_ats ?? comparison?.ats_score_before ?? 0;
  const estimatedATS = liveATS?.estimated_ats ?? comparison?.ats_score_after ?? originalATS;
  const scoredCurrentATS = liveATS?.current_ats ?? originalATS;
  const progressiveATS = Math.round(
    originalATS + (estimatedATS - originalATS) * acceptedRatio
  );
  const currentATS = acceptedCount > 0
    ? Math.max(originalATS, scoredCurrentATS, progressiveATS)
    : originalATS;

  const breakdownBefore = liveATS?.breakdown_before ?? comparison?.breakdown_before ?? {
    resume_match: {
      "Skills Match": 0, "Keyword Relevance": 0, "Experience Alignment": 0, "Role Similarity": 0, "Project Relevance": 0, "Education Fit": 0, "Certification Relevance": 0
    },
    ats_optimization: {
      "ATS Parseability": 0, "Keyword Optimization": 0, "Required Skills Coverage": 0, "Formatting & Action Verbs": 0, "Section Completeness": 0, "Readability": 0, "Measurable Impact": 0, "Overall Optimization": 0
    }
  };
  const breakdownEstimated = liveATS?.breakdown_estimated ?? comparison?.breakdown_after ?? breakdownBefore;

  const matchBefore = breakdownBefore.resume_match || breakdownBefore;
  const matchEstimated = breakdownEstimated.resume_match || breakdownEstimated;

  const optBefore = breakdownBefore.ats_optimization || {};
  const optEstimated = breakdownEstimated.ats_optimization || {};

  const matchCurrent = useMemo(() => {
    if (liveATS?.breakdown_current?.resume_match) return liveATS.breakdown_current.resume_match;
    const res = {};
    for (const key of Object.keys(matchBefore)) {
      const b = Number(matchBefore[key] || 0);
      const e = Number(matchEstimated[key] ?? b);
      res[key] = Math.round(b + (e - b) * acceptedRatio);
    }
    return res;
  }, [liveATS, matchBefore, matchEstimated, acceptedRatio]);

  const optCurrent = useMemo(() => {
    if (liveATS?.breakdown_current?.ats_optimization) return liveATS.breakdown_current.ats_optimization;
    const res = {};
    for (const key of Object.keys(optBefore)) {
      const b = Number(optBefore[key] || 0);
      const e = Number(optEstimated[key] ?? b);
      res[key] = Math.round(b + (e - b) * acceptedRatio);
    }
    return res;
  }, [liveATS, optBefore, optEstimated, acceptedRatio]);

  return (
    <div className="flex-1 flex flex-col md:flex-row justify-between h-full bg-zinc-50 dark:bg-zinc-950 select-text font-sans overflow-hidden">
      {/* Left Column: LaTeX Resume Review Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden border-r border-zinc-200/60 dark:border-zinc-800">
        {/* Floating Status & Progress Header Bar */}
        <div className="sticky top-0 z-30 bg-white/80 dark:bg-zinc-950/80 border-b border-zinc-200/60 dark:border-zinc-850 p-4 select-none flex-shrink-0 flex items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-widest">Document Review</span>
              <span className="text-[9px] bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-450 px-2 py-0.5 rounded-full font-bold">
                {stats.reviewed}/{stats.total} Edits
              </span>
              {jdFingerprint && (
                <span
                  className="text-[8px] bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full font-bold"
                  title={`Canonical extracted JD: ${jdFingerprint}`}
                >
                  JD Locked · {jdFingerprint.slice(-8)}
                </span>
              )}
            </div>
            {/* Visual Progress Bar */}
            <div className="flex items-center gap-2">
              <div className="w-24 h-1 bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#00bda5] rounded-full transition-all duration-500"
                  style={{ width: `${stats.progressPercent}%` }}
                />
              </div>
              <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500">{stats.progressPercent}% Completed</span>
            </div>
          </div>

          {/* Resume Match & ATS Match Scores */}
          {comparison && (
            <div className="hidden xs:flex items-center gap-3 border-l border-zinc-200/60 dark:border-zinc-800 pl-3 mr-auto select-none">
              <div className="text-left">
                <p className="text-[7px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Resume Match</p>
                <p className="text-[11px] font-black text-indigo-500 dark:text-indigo-400 leading-none mt-1">
                  {currentResumeMatch}%
                </p>
              </div>
              <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800" />
              <div className="text-left">
                <p className="text-[7px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest leading-none">ATS Score</p>
                <p className="text-[11px] font-black text-[#00bda5] leading-none mt-1">
                  {currentATS} / 100
                </p>
              </div>
            </div>
          )}

        {stats.total === 0 && (
          <div className="max-w-md rounded-lg bg-amber-50 px-3 py-2 text-[9px] font-bold text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
            <div>No safe AI edits passed validation. Your original resume is preserved.</div>
            {(comparison?.tailoring_audit?.rejected_edits || []).slice(0, 2).map((edit, index) => (
              <div key={`${edit.path || 'rejected'}-${index}`} className="mt-1 font-medium opacity-80">
                {edit.path}: {edit.reason}
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <button
            onClick={onAcceptAll}
            disabled={refining || stats.total === 0}
            title={stats.total === 0 ? 'There are no validated edits to accept.' : 'Accept every pending edit'}
            className="px-3 py-1.5 bg-[#00bda5] hover:bg-[#00a894] disabled:bg-zinc-200 disabled:dark:bg-zinc-800 disabled:text-zinc-400 disabled:cursor-not-allowed text-white text-[9px] font-bold rounded-lg transition-all cursor-pointer border-none"
          >
            Accept All
          </button>
          <button
            onClick={onRejectAll}
            disabled={refining || stats.total === 0}
            title={stats.total === 0 ? 'There are no validated edits to reject.' : 'Reject every pending edit'}
            className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 disabled:bg-zinc-200 disabled:dark:bg-zinc-800 disabled:text-zinc-405 disabled:cursor-not-allowed text-zinc-650 dark:text-zinc-350 text-[9px] font-bold rounded-lg transition-all cursor-pointer border-none"
          >
            Reject All
          </button>
          <button
            onClick={() => {
              suggestions.forEach(s => onUpdateSuggestionStatus(s.id, 'pending'));
            }}
            className="p-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition active:scale-95 cursor-pointer flex items-center justify-center"
            title="Reset All Changes"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Main Spacing & LaTeX-Style Resume Paper Container */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin max-h-[500px]">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200/80 dark:border-zinc-850 space-y-5 text-zinc-850 dark:text-zinc-200 font-serif leading-relaxed max-w-full relative shadow-xs">
          
          {/* Header Info */}
          <div className="text-center space-y-1.5 pb-4 border-b border-zinc-100 dark:border-zinc-850 font-sans select-none">
            <h1 className="text-base font-extrabold text-zinc-950 dark:text-white tracking-tight leading-none">
              {normalizePersonName(parsedResume.personal_info?.name) || 'Your Name'}
            </h1>
            {(parsedResume.personal_info?.job_title || parsedResume.personal_info?.title) && (
              <p className="text-[10px] text-zinc-700 dark:text-zinc-300 font-extrabold uppercase tracking-wider">
                {parsedResume.personal_info.job_title || parsedResume.personal_info.title}
              </p>
            )}
            <div
              data-contact-links="true"
              className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-zinc-500 dark:text-zinc-400 font-bold"
            >
              {contactItems.map(({ key, value, label, Icon }) => (
                <a
                  key={canonicalContactIdentity(key, value)}
                  href={contactHref(key, value)}
                  target={key === 'location' ? undefined : '_blank'}
                  rel={key === 'location' ? undefined : 'noreferrer'}
                  className="inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400 no-underline"
                >
                  <Icon size={10} strokeWidth={1.8} aria-hidden="true" />
                  <span>{label}</span>
                </a>
              ))}
            </div>
            {Object.entries(parsedResume.personal_info || {})
              .filter(([key, value]) => ![
                'name', 'job_title', 'title', 'email', 'phone', 'location',
                'linkedin', 'github', 'website', 'photo_url', 'coding_profiles'
              ].includes(key) && value !== null && value !== undefined && value !== '')
              .map(([key, value]) => (
                <p key={key} className="text-[9px] text-zinc-400 dark:text-zinc-500">
                  <span className="font-bold">{labelFor(key)}:</span> {displayValue(value)}
                </p>
              ))}
          </div>

          {/* Professional Summary */}
          {(hasVisibleValue(parsedResume.summary) || hasReviewOperation(suggestions, 'summary')) && <div className="space-y-1.5">
            <div className="flex justify-between items-center border-b border-zinc-150 dark:border-zinc-850 pb-1">
              <h2 className="text-[10px] font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-widest font-sans">
                Professional Summary
              </h2>
              {selectedSections?.includes('summary') && <button
                onClick={() => {
                  setActiveEditSection(activeEditSection === 'summary' ? null : 'summary');
                  setCustomPrompt('');
                }}
                className="flex items-center gap-1 text-[8px] bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 text-[#00bda5] px-2 py-0.5 rounded font-extrabold uppercase tracking-wider transition cursor-pointer border-none"
              >
                <Sparkles size={8} /> Edit with AI
              </button>}
            </div>
            <div className="text-[11px] leading-relaxed text-justify text-zinc-600 dark:text-zinc-350">
              {renderInlineDiff('summary', parsedResume.summary || '', 0, 0)}
            </div>
            {activeEditSection === 'summary' && renderRefinePanel('summary')}
          </div>}

          {parsedResume.objective && (
            <div className="space-y-1.5" data-review-section="objective">
              <div className="border-b border-zinc-150 dark:border-zinc-850 pb-1">
                <h2 className="text-[10px] font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-widest font-sans">
                  Career Objective
                </h2>
              </div>
              <div className="text-[11px] leading-relaxed text-justify text-zinc-600 dark:text-zinc-350">
                {displayValue(parsedResume.objective)}
              </div>
            </div>
          )}

          {/* Work Experience */}
          {parsedResume.experience?.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-zinc-150 dark:border-zinc-850 pb-1">
                <h2 className="text-[10px] font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-widest font-sans">
                  Work Experience
                </h2>
                {selectedSections?.includes('experience') && <button
                  onClick={() => {
                    setActiveEditSection(activeEditSection === 'experience' ? null : 'experience');
                    setCustomPrompt('');
                  }}
                  className="flex items-center gap-1 text-[8px] bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 text-[#00bda5] px-2 py-0.5 rounded font-extrabold uppercase tracking-wider transition cursor-pointer border-none"
                >
                  <Sparkles size={8} /> Edit with AI
                </button>}
              </div>
              {activeEditSection === 'experience' && renderRefinePanel('experience')}
              {parsedResume.experience.map((exp, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between font-extrabold text-[11px] text-zinc-850 dark:text-zinc-200 font-sans">
                    <span>{exp.role} — {exp.company}</span>
                    <span className="font-bold text-zinc-400 dark:text-zinc-500">{exp.start_date} - {exp.end_date}</span>
                  </div>
                  {Object.entries(exp).filter(([key, value]) =>
                    !['role', 'company', 'start_date', 'end_date', 'description'].includes(key)
                    && hasVisibleValue(value)
                  ).map(([key, value]) => (
                    <div key={key} className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold">{labelFor(key)}:</span> {displayValue(value)}
                    </div>
                  ))}
                  <ul className="list-disc pl-4 space-y-2">
                    {exp.description?.map((bullet, bIdx) => (
                      <li key={bIdx} className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-350">
                        {renderInlineDiff('experience', bullet, idx, bIdx)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Projects */}
          {parsedResume.projects?.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-zinc-150 dark:border-zinc-850 pb-1">
                <h2 className="text-[10px] font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-widest font-sans">
                  Projects
                </h2>
                {selectedSections?.includes('projects') && <button
                  onClick={() => {
                    setActiveEditSection(activeEditSection === 'projects' ? null : 'projects');
                    setCustomPrompt('');
                  }}
                  className="flex items-center gap-1 text-[8px] bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 text-[#00bda5] px-2 py-0.5 rounded font-extrabold uppercase tracking-wider transition cursor-pointer border-none"
                >
                  <Sparkles size={8} /> Edit with AI
                </button>}
              </div>
              {activeEditSection === 'projects' && renderRefinePanel('projects')}
              {parsedResume.projects.map((proj, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between font-extrabold text-[11px] text-zinc-850 dark:text-zinc-200 font-sans">
                    <span>{proj.name}</span>
                  </div>
                  {Object.entries(proj).filter(([key, value]) =>
                    !['name', 'description'].includes(key) && hasVisibleValue(value)
                  ).map(([key, value]) => (
                    <div key={key} className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold">{labelFor(key)}:</span> {displayValue(value)}
                    </div>
                  ))}
                  <ul className="list-disc pl-4 space-y-2">
                    {proj.description?.map((bullet, bIdx) => (
                      <li key={bIdx} className="text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-350">
                        {renderInlineDiff('projects', bullet, idx, bIdx)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Skills */}
          {(parsedResume.skills?.length > 0 || hasReviewOperation(suggestions, 'skills')) && (
            <div className="space-y-2">
              <div className="flex justify-between items-center border-b border-zinc-150 dark:border-zinc-850 pb-1">
                <h2 className="text-[10px] font-black text-zinc-950 dark:text-zinc-50 uppercase tracking-widest font-sans">
                  Skills
                </h2>
                {selectedSections?.includes('skills') && <button
                  onClick={() => {
                    setActiveEditSection(activeEditSection === 'skills' ? null : 'skills');
                    setCustomPrompt('');
                  }}
                  className="flex items-center gap-1 text-[8px] bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 text-[#00bda5] px-2 py-0.5 rounded font-extrabold uppercase tracking-wider transition cursor-pointer border-none"
                >
                  <Sparkles size={8} /> Edit with AI
                </button>}
              </div>
              {activeEditSection === 'skills' && renderRefinePanel('skills')}
              <div className="flex flex-wrap gap-1.5 leading-relaxed text-[11px] font-sans text-zinc-650 dark:text-zinc-350">
                {(parsedResume.skills || [])
                  .filter(skill => !skillSuggestions.some(suggestion =>
                    suggestion.status === 'accepted'
                    && String(suggestion.skillName || '').toLowerCase() === String(skill).toLowerCase()
                  ))
                  .join(', ')}
                
                {/* Inline suggested skills additions */}
                {skillSuggestions.map(s => {
                  const isPending = s.status === 'pending';
                  const isAccepted = s.status === 'accepted';
                  return (
                    <span 
                      key={s.id} 
                      className={`px-2 py-0.5 rounded-lg border text-[9px] font-bold flex items-center gap-1.5 transition-all ${
                        isPending 
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400' 
                          : isAccepted
                            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 text-emerald-700 dark:text-emerald-300'
                            : 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200/60 text-rose-500 line-through'
                      }`}
                    >
                      {isAccepted ? <Check size={11} /> : '+'} {s.skillName}
                      {isPending ? (
                        <span className="flex items-center gap-1 border-l border-emerald-200/40 pl-1.5 ml-1 select-none">
                          <button className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 cursor-pointer" onClick={() => onUpdateSuggestionStatus(s.id, 'accepted')} title="Accept Skill" aria-label="Accept skill"><Check size={13} /></button>
                          <button className="text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 cursor-pointer" onClick={() => onUpdateSuggestionStatus(s.id, 'rejected')} title="Reject Skill" aria-label="Reject skill"><X size={13} /></button>
                        </span>
                      ) : (
                        <button
                          className="no-underline text-[8px] uppercase tracking-wider ml-1 cursor-pointer"
                          onClick={() => onUpdateSuggestionStatus(s.id, 'pending')}
                          title="Undo skill decision"
                        >
                          Undo
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Unchanged source sections are still part of the reviewed document. */}
          {sectionRegistry.map(([title, key]) => (
            <React.Fragment key={key}>{renderReadOnlySection(title, parsedResume[key], key)}</React.Fragment>
          ))}
          {renderReadOnlySection('Custom Sections', parsedResume.custom_sections, 'custom_sections')}
        </div>
      </div>

      {/* Bottom Sticky Action Bar */}
      <div className="py-4 px-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex gap-3 flex-shrink-0 select-none">
        {!validation?.valid && (
          <div role="alert" className="text-[10px] text-rose-600 self-center max-w-xs">
            Generation blocked: {validation?.issues?.join(' ')}
          </div>
        )}
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="flex-1 py-3 border border-zinc-250 dark:border-zinc-800 text-zinc-650 dark:text-zinc-400 font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
        >
          Back
        </button>
        
        <button
          type="button"
          onClick={onGenerateResume}
          disabled={loading || !validation?.valid}
          className="flex-2 py-3 bg-[#00bda5] hover:bg-[#00a894] disabled:bg-zinc-300 disabled:text-zinc-500 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 shadow-sm cursor-pointer active:scale-95"
        >
          <Sparkles size={13} />
          {stats.total === 0 ? 'Continue With Original Resume' : 'Generate Resume'}
        </button>
      </div>
    </div>

      {/* Right Column: Live ATS Dashboard Panel */}
      <div className="w-full md:w-80 lg:w-96 bg-white dark:bg-zinc-900 border-l border-zinc-200/60 dark:border-zinc-800 flex flex-col h-full overflow-y-auto select-none p-5 shrink-0 space-y-6 scrollbar-thin">
        <div className="space-y-1 pb-4 border-b border-zinc-150 dark:border-zinc-800">
          <div className="flex items-center gap-2 text-zinc-950 dark:text-zinc-50">
            <Target size={18} className="text-[#00bda5] shrink-0" />
            <h2 className="text-xs font-black uppercase tracking-wider">ATS Intelligence</h2>
          </div>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold">
            Real-time deterministic analysis calculated by backend
          </p>
        </div>

        {/* Section 1: Resume Match (%) */}
        <div className="space-y-2 bg-indigo-50/20 dark:bg-indigo-950/10 border border-indigo-100/30 dark:border-indigo-900/20 p-4 rounded-2xl">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
              Resume Match
            </span>
            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
              {currentResumeMatch}%
            </span>
          </div>
          
          {/* Faint double progress bar */}
          <div className="w-full h-2 bg-zinc-150 dark:bg-zinc-800 rounded-full relative overflow-hidden">
            <div 
              className="h-full bg-indigo-500 rounded-full absolute left-0 top-0 transition-all duration-500"
              style={{ width: `${currentResumeMatch}%` }}
            />
            {estimatedResumeMatch > currentResumeMatch && (
              <div 
                className="h-full bg-indigo-400/40 absolute top-0 transition-all duration-500"
                style={{ 
                  left: `${currentResumeMatch}%`, 
                  width: `${estimatedResumeMatch - currentResumeMatch}%` 
                }}
              />
            )}
          </div>
          
          <div className="flex justify-between text-[8px] font-bold text-zinc-400 dark:text-zinc-500 pt-0.5">
            <span>Original: {originalResumeMatch}%</span>
            <span>Potential: {estimatedResumeMatch}%</span>
          </div>
        </div>

        {/* Section 2: ATS Score (0-100) */}
        <div className="space-y-3">
          <h3 className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
            ATS Friendliness Score
          </h3>
          
          {/* Circular Gauges Row */}
          <div className="bg-zinc-50/50 dark:bg-zinc-950/30 border border-zinc-200/60 dark:border-zinc-850 p-4 rounded-2xl flex justify-around items-center gap-2">
            <CircularGauge score={originalATS} label="Original ATS" colorClass="text-zinc-400 dark:text-zinc-500" showOutOf100={true} />
            <div className="w-px h-10 bg-zinc-200 dark:bg-zinc-800 shrink-0" />
            <CircularGauge score={currentATS} label="Current ATS" colorClass="text-[#00bda5]" showOutOf100={true} />
            <div className="w-px h-10 bg-zinc-200 dark:bg-zinc-800 shrink-0" />
            <CircularGauge score={estimatedATS} label="Potential ATS" colorClass="text-indigo-500 dark:text-indigo-400" showOutOf100={true} />
          </div>
        </div>

        {/* Section 3: ATS Optimization Checklist Breakdown */}
        <div className="space-y-4">
          <h3 className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
            ATS Checklist Breakdown
          </h3>
          <div className="space-y-3">
            {Object.keys(optCurrent).map((cat) => {
              const current = optCurrent[cat] ?? 0;
              const estimated = optEstimated[cat] ?? 0;
              
              const Icon = {
                "ATS Parseability": Layers,
                "Keyword Optimization": Target,
                "Required Skills Coverage": Award,
                "Formatting & Action Verbs": Code2,
                "Section Completeness": Check,
                "Readability": BookOpen,
                "Measurable Impact": ShieldAlert,
                "Overall Optimization": Sparkles
              }[cat] || Target;

              return (
                <div key={cat} className="space-y-1 bg-white dark:bg-zinc-900 rounded-lg">
                  <div className="flex justify-between items-center text-[10px] font-bold text-zinc-750 dark:text-zinc-300">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Icon size={12} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
                      {cat}
                    </span>
                    <span className="font-extrabold flex items-center gap-1 shrink-0">
                      <span>{current}%</span>
                      {estimated > current && (
                        <span className="text-indigo-500 text-[9px]">→ {estimated}%</span>
                      )}
                    </span>
                  </div>
                  
                  <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full relative overflow-hidden">
                    <div 
                      className="h-full bg-[#00bda5] rounded-full absolute left-0 top-0 transition-all duration-500"
                      style={{ width: `${current}%` }}
                    />
                    {estimated > current && (
                      <div 
                        className="h-full bg-indigo-400/40 dark:bg-indigo-500/30 absolute top-0 transition-all duration-500"
                        style={{ 
                          left: `${current}%`, 
                          width: `${estimated - current}%` 
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 4: Resume Match Breakdown */}
        <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
          <h3 className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
            Job Match Breakdown
          </h3>
          <div className="space-y-3">
            {Object.keys(matchCurrent).map((cat) => {
              const current = matchCurrent[cat] ?? 0;
              const estimated = matchEstimated[cat] ?? 0;
              
              const Icon = {
                "Skills Match": Award,
                "Keyword Relevance": Target,
                "Experience Alignment": Layers,
                "Role Similarity": Sparkles,
                "Project Relevance": Code2,
                "Education Fit": BookOpen,
                "Certification Relevance": Check
              }[cat] || Target;

              return (
                <div key={cat} className="space-y-1 bg-white dark:bg-zinc-900 rounded-lg">
                  <div className="flex justify-between items-center text-[10px] font-bold text-zinc-750 dark:text-zinc-300">
                    <span className="flex items-center gap-1.5 font-bold">
                      <Icon size={12} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
                      {cat}
                    </span>
                    <span className="font-extrabold flex items-center gap-1 shrink-0">
                      <span>{current}%</span>
                      {estimated > current && (
                        <span className="text-indigo-500 text-[9px]">→ {estimated}%</span>
                      )}
                    </span>
                  </div>
                  
                  <div className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full relative overflow-hidden">
                    <div 
                      className="h-full bg-indigo-500 rounded-full absolute left-0 top-0 transition-all duration-500"
                      style={{ width: `${current}%` }}
                    />
                    {estimated > current && (
                      <div 
                        className="h-full bg-indigo-400/40 absolute top-0 transition-all duration-500"
                        style={{ 
                          left: `${current}%`, 
                          width: `${estimated - current}%` 
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResumeReviewView;

