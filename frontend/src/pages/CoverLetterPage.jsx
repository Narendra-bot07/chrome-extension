import React from 'react';
import { useApp } from '../context/AppContext';
import CoverLetterView from '../components/CoverLetterView';
import { useNavigate } from 'react-router-dom';

function CoverLetterPage() {
  const navigate = useNavigate();
  const {
    coverLetter,
    companyName,
    handleCopyToClipboard,
    handleDownloadCoverLetterPDF
  } = useApp();

  return (
    <CoverLetterView
      coverLetter={coverLetter}
      companyName={companyName}
      handleCopyToClipboard={handleCopyToClipboard}
      handleDownloadCoverLetterPDF={handleDownloadCoverLetterPDF}
      setStep={() => navigate('/download')}
    />
  );
}

export default CoverLetterPage;
