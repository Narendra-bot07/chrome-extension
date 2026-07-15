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
      onBack={() => navigate('/review-changes')}
    />
  );
}

export default TemplatesPage;
