import React from 'react';
import { Layers, Building2, Briefcase, AlertCircle, X, ArrowRight } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

function UploaderView({
  jobText,
  setJobText,
  companyName,
  setCompanyName,
  jobTitle,
  setJobTitle,
  handleScanPage,
  handleAnalyzeAndMatch,
  loading,
  isExtension,
  subscription,
  apiError,
  setApiError
}) {
  const jdUsage = subscription?.usage?.jd_extraction;
  const quotaExhausted = jdUsage?.enabled && jdUsage?.remaining !== null && jdUsage?.remaining <= 0;

  return (
    <div className={`space-y-6 flex-1 flex flex-col justify-between select-none font-sans text-tf-text mx-auto w-full ${
      isExtension ? 'max-w-lg' : 'max-w-4xl py-2'
    }`}>
      <div className="space-y-6">
        
        {/* Title Block */}
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-tf-text">
            Extract Job Details
          </h1>
          <p className="text-xs text-tf-text-secondary font-normal">
            Scan or paste the target job description to match your qualifications against.
          </p>
        </div>

        {/* API Error Alert Banner */}
        {apiError && (
          <div className="rounded-md border border-tf-danger/20 bg-tf-danger/10 p-3 text-xs text-tf-danger flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-tf-danger" />
              <span className="font-normal leading-relaxed">{apiError}</span>
            </div>
            {setApiError && (
              <button 
                type="button"
                onClick={() => setApiError(null)} 
                className="text-tf-danger hover:opacity-75 p-0.5"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {subscription?.plan && (
          <div className="rounded-md border border-tf-border bg-tf-surface-2 p-3 text-xs text-tf-text-secondary flex justify-between items-center">
            <span className="font-medium text-tf-text">{subscription.plan.name} Plan</span>
            <span>
              {quotaExhausted
                ? "Quota exhausted for this month"
                : `${jdUsage?.remaining ?? 'Unlimited'} extractions remaining`}
            </span>
          </div>
        )}

        {/* Input coordinates (Company & Title) */}
        <div className="space-y-3">
          <label className="text-[13px] font-medium text-tf-text block">
            Job Coordinates
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Input
              icon={Building2}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Company Name"
            />
            <Input
              icon={Briefcase}
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Job Title"
            />
          </div>
        </div>

        {/* Job Description Textarea */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="text-[13px] font-medium text-tf-text block">
              Job Description
            </label>
            {isExtension && (
              <Button 
                variant="ghost"
                size="sm"
                onClick={() => handleScanPage(true)}
                className="h-7 text-xs"
              >
                <Layers size={14} />
                Scan Page
              </Button>
            )}
          </div>

          <div className="relative">
            <textarea 
              className={`w-full bg-tf-surface border border-tf-border rounded-md px-3 py-2.5 text-xs text-tf-text focus:outline-none focus:ring-3 focus:ring-tf-accent/15 focus:border-tf-accent placeholder:text-tf-text-tertiary resize-none leading-relaxed transition-all font-normal ${
                isExtension ? 'min-h-[180px]' : 'min-h-[280px]'
              }`}
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              placeholder="Auto-scanning page content... Or paste job details manually here."
            />
            {jobText && (
              <span className="absolute bottom-3 right-3 text-[11px] font-medium text-tf-text-tertiary bg-tf-surface-2 border border-tf-border px-1.5 py-0.5 rounded">
                {jobText.length} Chars
              </span>
            )}
          </div>
        </div>

      </div>

      {/* Primary Trigger Button */}
      <div className="pt-4 border-t border-tf-border mt-auto">
        <Button 
          variant="primary"
          size="lg"
          onClick={handleAnalyzeAndMatch}
          disabled={!jobText || quotaExhausted}
          isLoading={loading}
          className="w-full h-10"
        >
          Extract Job Description
          <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}

export default UploaderView;
