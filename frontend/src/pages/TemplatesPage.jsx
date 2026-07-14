import React from 'react';
import { useApp } from '../context/AppContext';
import TemplateSelectionView from '../components/TemplateSelectionView';
import { useNavigate } from 'react-router-dom';

function TemplatesPage() {
  const navigate = useNavigate();
  const {
    tailoredResume,
    selectedTemplate, setSelectedTemplate,
    companyName, setCompanyName,
    handleDownloadFinalPDF,
    handleGenerateCoverLetter,
    loading, loadingMessage,
    apiUrl, isExtension
  } = useApp();

  if (!tailoredResume) return null;

  return (
    <TemplateSelectionView
      tailoredResume={tailoredResume}
      selectedTemplate={selectedTemplate}
      setSelectedTemplate={setSelectedTemplate}
      companyName={companyName}
      setCompanyName={setCompanyName}
      onDownloadPDF={handleDownloadFinalPDF}
      onGenerateCoverLetter={handleGenerateCoverLetter}
      onBack={() => navigate('/review-changes')}
      loading={loading}
      loadingMessage={loadingMessage}
      apiUrl={apiUrl}
      isExtension={isExtension}
    />
  );
}

export default TemplatesPage;
