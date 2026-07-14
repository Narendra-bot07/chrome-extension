import React from 'react';
import { useApp } from '../context/AppContext';
import ResumeTailoringConfigView from '../components/ResumeTailoringConfigView';
import { useNavigate } from 'react-router-dom';

function TailorConfigPage() {
  const navigate = useNavigate();
  const {
    selectedSections, setSelectedSections,
    tailoringIntensity, setTailoringIntensity,
    handleRunGapAnalysis, loading
  } = useApp();

  const handleToggleSection = (sectionId) => {
    if (selectedSections.includes(sectionId)) {
      setSelectedSections(selectedSections.filter(id => id !== sectionId));
    } else {
      setSelectedSections([...selectedSections, sectionId]);
    }
  };

  return (
    <ResumeTailoringConfigView
      selectedSections={selectedSections}
      onToggleSection={handleToggleSection}
      tailoringIntensity={tailoringIntensity}
      onSelectIntensity={(intensityId) => setTailoringIntensity(intensityId)}
      onStartTailoring={handleRunGapAnalysis}
      onBack={() => navigate('/resume-review')}
      loading={loading}
      validationMessage={selectedSections.length === 0 ? "Select at least one resume section to continue." : ""}
    />
  );
}

export default TailorConfigPage;
