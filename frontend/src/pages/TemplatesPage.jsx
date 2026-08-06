import React, { useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import TemplateSelectionView from '../components/TemplateSelectionView';
import { useNavigate } from 'react-router-dom';
import { categorizeSkillsWithAI } from '../utils/skillCategorizer';

function TemplatesPage() {
  const navigate = useNavigate();
  const {
    tailoredResume,
    parsedResume,
    workflowResume,
    resumeWorkflowHydrated,
    loading,
    apiUrl,
    setTailoredResume,
    updateFinalizedWorkflowResume
  } = useApp();

  const activeResume = tailoredResume || workflowResume || parsedResume;
  const preparedKeyRef = useRef('');
  const skillPreparationKey = useMemo(() => JSON.stringify({
    id: activeResume?.id || activeResume?.resume_id || '',
    skills: activeResume?.skills || activeResume?.technical_skills || [],
  }), [activeResume?.id, activeResume?.resume_id, activeResume?.skills, activeResume?.technical_skills]);

  useEffect(() => {
    if (!resumeWorkflowHydrated || !activeResume) {
      return;
    }
    if (preparedKeyRef.current === skillPreparationKey) {
      return;
    }
    preparedKeyRef.current = skillPreparationKey;
    let cancelled = false;
    // Categorization is presentation enrichment. It must never block template
    // selection or expose an implementation-detail loading screen to users.
    categorizeSkillsWithAI(
      activeResume.skills || activeResume.technical_skills || [],
      activeResume.skills_categories || activeResume.technical_skills_by_category || {},
      apiUrl
    ).then(skillsCategories => {
      if (cancelled) return;
      // Preserve the exact finalized document and change only its canonical
      // presentation grouping. Every template and PDF now reads this same
      // persisted map instead of independently recategorizing the skills.
      const categorizedResume = {
        ...activeResume,
        skills_categories: skillsCategories,
      };
      setTailoredResume(categorizedResume);
      updateFinalizedWorkflowResume(categorizedResume).catch(error => {
        console.warn('[SKILLS] Categories applied locally; workflow persistence deferred.', error);
      });
    }).catch(error => {
      // Templates already have a deterministic local categorizer, so a
      // background enrichment failure must stay non-blocking.
      console.warn('[SKILLS] Background category enrichment skipped.', error);
    });
    return () => { cancelled = true; };
  }, [resumeWorkflowHydrated, skillPreparationKey, apiUrl]);

  if (loading || !resumeWorkflowHydrated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-300 gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#00bda5]/20 border-t-[#00bda5]" />
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Loading Templates Studio...
        </span>
      </div>
    );
  }

  if (!activeResume) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-300 gap-4 p-6 text-center">
        <div className="text-base font-extrabold text-zinc-100">Finalized Resume Not Available</div>
        <p className="text-xs text-zinc-400 max-w-sm">Return to Document Review and finalize your accepted/rejected decisions. The original resume will not be substituted.</p>
        <button
          onClick={() => navigate('/review-changes')}
          className="px-4 py-2.5 bg-[#00bda5] text-white font-extrabold text-xs uppercase tracking-wider rounded-xl hover:bg-[#00a894] transition cursor-pointer shadow-sm"
        >
          Return to Document Review
        </button>
      </div>
    );
  }

  return (
    <TemplateSelectionView
      onBack={() => navigate('/review-changes')}
    />
  );
}

export default TemplatesPage;
