import React from 'react';
import { useApp } from '../context/AppContext';
import ResumeTailoringConfigView from '../components/ResumeTailoringConfigView';
import { useNavigate } from 'react-router-dom';

function TailorConfigPage() {
  const navigate = useNavigate();
  const {
    selectedSections, setSelectedSections,
    tailoringIntensity, setTailoringIntensity,
    handleRunGapAnalysis, loading,
    parsedResume,
    resumesList,
    fetchResumesList,
    handleActivateResume,
    handleCompareActiveResumeToJob,
    jobAnalysis,
    comparison,
    session
  } = useApp();
  const comparisonRequestRef = React.useRef('');

  React.useEffect(() => {
    fetchResumesList();
  }, [session?.access_token]);

  React.useEffect(() => {
    const resumeId = parsedResume?.id || parsedResume?.resume_id || null;
    if (!resumeId || !jobAnalysis) return;
    const comparisonResumeId = comparison?._baseline_resume_id || null;
    if (comparisonResumeId === resumeId && comparison?.resume_match_before != null) return;
    const requestKey = `${resumeId}|${jobAnalysis.id || jobAnalysis.jd_id || jobAnalysis.title || jobAnalysis.job_title || ''}`;
    if (comparisonRequestRef.current === requestKey) return;
    comparisonRequestRef.current = requestKey;
    handleCompareActiveResumeToJob().catch(error => {
      console.warn('[TAILOR-CONFIG] Match score refresh failed', error);
      comparisonRequestRef.current = '';
    });
  }, [
    parsedResume?.id,
    parsedResume?.resume_id,
    jobAnalysis,
    comparison?._baseline_resume_id,
    comparison?.resume_match_before,
    handleCompareActiveResumeToJob
  ]);

  const handleToggleSection = (sectionId) => {
    if (selectedSections.includes(sectionId)) {
      setSelectedSections(selectedSections.filter(id => id !== sectionId));
    } else {
      setSelectedSections([...selectedSections, sectionId]);
    }
  };

  const handleSelectIntensity = (intensityId) => {
    setTailoringIntensity(intensityId);
    if (intensityId === 'minimal') {
      setSelectedSections(['summary', 'skills']);
    } else if (intensityId === 'balanced') {
      setSelectedSections(['summary', 'skills', 'experience', 'projects']);
    } else if (intensityId === 'aggressive') {
      setSelectedSections(['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements']);
    }
  };

  return (
    <ResumeTailoringConfigView
      selectedSections={selectedSections}
      onToggleSection={handleToggleSection}
      tailoringIntensity={tailoringIntensity}
      onSelectIntensity={handleSelectIntensity}
      onStartTailoring={handleRunGapAnalysis}
      onBack={() => navigate('/tailor')}
      loading={loading}
      activeResume={parsedResume}
      resumesList={resumesList}
      onChangeResume={handleActivateResume}
      onChooseResume={() => navigate('/resume-detect')}
      onUploadResume={() => navigate('/resume-detect')}
      validationMessage={selectedSections.length === 0 ? "Select at least one resume section to continue." : ""}
      matchScore={comparison?.resume_match_before ?? comparison?.resume_match_score ?? null}
    />
  );
}

export default TailorConfigPage;
