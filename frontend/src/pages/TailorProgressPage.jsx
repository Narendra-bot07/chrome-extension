import React from 'react';
import { useApp } from '../context/AppContext';
import ChecklistLoader from '../components/ChecklistLoader';

function TailorProgressPage() {
  const { loadingProgress, loadingMessage, selectedSections } = useApp();
  const sectionLabels = {
    summary: 'Polishing Professional Summary',
    skills: 'Aligning Supported Skills',
    experience: 'Improving Work Experience',
    projects: 'Optimizing Projects',
    education: 'Reviewing Education',
    certifications: 'Reviewing Certifications',
    achievements: 'Improving Achievements'
  };
  const selectedStages = (selectedSections || [])
    .filter(section => sectionLabels[section])
    .map((section, index, sections) => ({
      label: sectionLabels[section],
      progressThreshold: Math.round(((index + 1) / (sections.length + 1)) * 90)
    }));
  const checklistItems = [
    ...selectedStages,
    { label: 'Validating Tailored Resume', progressThreshold: 100 }
  ];

  return (
    <ChecklistLoader
      title="Tailoring Profile"
      progress={loadingProgress}
      message={loadingMessage}
      checklistItems={checklistItems}
    />
  );
}

export default TailorProgressPage;
