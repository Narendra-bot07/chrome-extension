import React from 'react';
import { useApp } from '../context/AppContext';
import SuccessView from '../components/SuccessView';
import { useNavigate } from 'react-router-dom';

function DownloadPage() {
  const navigate = useNavigate();
  const {
    companyName,
    tailoredResume,
    handleDownloadFinalPDF
  } = useApp();

  return (
    <SuccessView
      companyName={companyName}
      tailoredResume={tailoredResume}
      onDownloadPDF={handleDownloadFinalPDF}
      onReset={() => navigate('/')}
    />
  );
}

export default DownloadPage;
