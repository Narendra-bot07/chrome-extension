import React from 'react';
import { useApp } from '../context/AppContext';
import ChecklistLoader from '../components/ChecklistLoader';

function ResumeParsePage() {
  const { loadingProgress, loadingMessage } = useApp();

  return (
    <ChecklistLoader
      title="Parsing Resume"
      progress={loadingProgress}
      message={loadingMessage}
      checklistItems={[
        { label: "Reading Resume File", progressThreshold: 20 },
        { label: "Extracting Identity Info", progressThreshold: 40 },
        { label: "Identifying Professional Experience", progressThreshold: 60 },
        { label: "Building Structure Model", progressThreshold: 100 }
      ]}
    />
  );
}

export default ResumeParsePage;
