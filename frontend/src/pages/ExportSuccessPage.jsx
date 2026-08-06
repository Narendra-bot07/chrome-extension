import React, { useMemo } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import SuccessView from '../components/SuccessView';
import { useApp } from '../context/AppContext';

export default function ExportSuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { companyName, tailoredResume, comparison, liveATS, handleDownloadFinalPDF } = useApp();
  const completion = useMemo(() => {
    if (location.state?.syncedApplication) return location.state;
    try {
      return JSON.parse(sessionStorage.getItem('tailr4u_export_completion') || 'null');
    } catch {
      return null;
    }
  }, [location.state]);

  if (!completion?.syncedApplication) return <Navigate to="/job-tracker" replace />;

  const application = completion.syncedApplication;
  const atsScore = [
    completion.atsScore,
    application.ats_score,
    application.resume_snapshot?._job_context?.ats_score,
    comparison?.ats_score_after,
    comparison?.ats_score_before,
    liveATS?.current_ats,
    liveATS?.estimated_ats
  ].map(Number).find(value => Number.isFinite(value) && value >= 0 && value <= 100);

  const openTracker = () => navigate(
    `/job-tracker?appId=${encodeURIComponent(application.id)}`,
    { state: { selectedAppId: application.id } }
  );

  return (
    <SuccessView
      standalone
      companyName={completion.companyName || companyName}
      tailoredResume={completion.tailoredResume || tailoredResume}
      syncedApplication={application}
      atsScore={atsScore}
      onDownloadPDF={() => handleDownloadFinalPDF(undefined)}
      onReset={openTracker}
    />
  );
}
