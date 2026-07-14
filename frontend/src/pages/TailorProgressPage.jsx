import React from 'react';
import { useApp } from '../context/AppContext';
import ChecklistLoader from '../components/ChecklistLoader';

function TailorProgressPage() {
  const { loadingProgress, loadingMessage } = useApp();

  return (
    <ChecklistLoader
      title="Tailoring Profile"
      progress={loadingProgress}
      message={loadingMessage}
      checklistItems={[
        { label: "Matching ATS Keywords", progressThreshold: 25 },
        { label: "Improving Descriptions", progressThreshold: 50 },
        { label: "Optimizing Summary", progressThreshold: 75 },
        { label: "Building Final Schema", progressThreshold: 90 }
      ]}
    />
  );
}

export default TailorProgressPage;
