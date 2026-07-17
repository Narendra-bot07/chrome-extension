import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

function ManualJobEntryPage() {
  const navigate = useNavigate();
  const {
    lastAnalyzedUrl,
    lastAnalyzedTitle,
    lastAnalyzedCompany,
    lastAnalyzedText,
    submitManualJobEntry,
    isExtension
  } = useApp();

  // Form state
  const [url, setUrl] = useState('');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [experience, setExperience] = useState('');
  const [salary, setSalary] = useState('');

  // Validation error state
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Prefill on mount
  useEffect(() => {
    // 1. Prefill URL
    if (lastAnalyzedUrl && lastAnalyzedUrl !== 'about:blank') {
      setUrl(lastAnalyzedUrl);
    } else if (isExtension && typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab && tab.url && !tab.url.startsWith('chrome://')) {
          setUrl(tab.url);
        }
      });
    } else if (window.location && window.location.href && !window.location.href.includes('localhost')) {
      setUrl(window.location.href);
    }

    // 2. Prefill Role
    if (lastAnalyzedTitle && lastAnalyzedTitle !== 'Software Engineer' && lastAnalyzedTitle !== 'Unsupported Page') {
      setRole(lastAnalyzedTitle);
    }

    // 3. Prefill Company
    if (lastAnalyzedCompany && lastAnalyzedCompany !== 'Target Company' && lastAnalyzedCompany !== 'Unknown') {
      setCompany(lastAnalyzedCompany);
    }

    // 4. Prefill Description if available
    if (lastAnalyzedText && lastAnalyzedText.length > 50) {
      setDescription(lastAnalyzedText);
    }
  }, [lastAnalyzedUrl, lastAnalyzedTitle, lastAnalyzedCompany, lastAnalyzedText, isExtension]);

  const validate = () => {
    const newErrors = {};
    if (!url || !url.trim()) newErrors.url = "Job URL is required";
    if (!role || !role.trim()) newErrors.role = "Role is required";
    if (!company || !company.trim()) newErrors.company = "Company is required";
    if (!description || !description.trim()) newErrors.description = "Job Description is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    await submitManualJobEntry({
      url: url.trim(),
      role: role.trim(),
      company: company.trim(),
      description: description.trim(),
      location: location.trim(),
      employmentType: employmentType.trim(),
      experience: experience.trim(),
      salary: salary.trim()
    });
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50/50 dark:bg-slate-950 py-8 px-4 sm:px-6 animate-in fade-in duration-300 flex justify-center items-start">
      <div className="max-w-3xl w-full bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-sm transition-all">
        
        {/* Header */}
        <div className="mb-8 border-b border-slate-100 dark:border-slate-800 pb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Enter Details Manually
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
              Fill in the essential fields below to proceed into tailored extraction.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/no-job-detected')}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            title="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* Required Fields Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Required Information
              </h2>
            </div>

            {/* Job URL */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Job URL <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (errors.url) setErrors({ ...errors, url: null });
                }}
                placeholder="https://company.com/careers/job-id"
                className={`w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border ${
                  errors.url ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'
                } rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 transition`}
              />
              {errors.url && <p className="text-xs text-rose-500">{errors.url}</p>}
            </div>

            {/* Role & Company Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Role */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Role <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value);
                    if (errors.role) setErrors({ ...errors, role: null });
                  }}
                  placeholder="e.g. Senior Software Engineer"
                  className={`w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border ${
                    errors.role ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'
                  } rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 transition`}
                />
                {errors.role && <p className="text-xs text-rose-500">{errors.role}</p>}
              </div>

              {/* Company */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Company <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => {
                    setCompany(e.target.value);
                    if (errors.company) setErrors({ ...errors, company: null });
                  }}
                  placeholder="e.g. Google"
                  className={`w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border ${
                    errors.company ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'
                  } rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 transition`}
                />
                {errors.company && <p className="text-xs text-rose-500">{errors.company}</p>}
              </div>
            </div>

            {/* Job Description */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Job Description <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={7}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (errors.description) setErrors({ ...errors, description: null });
                }}
                placeholder="Paste the full job description or responsibilities here..."
                className={`w-full p-4 bg-slate-50 dark:bg-slate-800/80 border ${
                  errors.description ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'
                } rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 transition leading-relaxed`}
              />
              {errors.description && <p className="text-xs text-rose-500">{errors.description}</p>}
            </div>
          </div>

          {/* Optional Fields Section */}
          <div className="space-y-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Optional Information
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Location */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Remote, San Francisco, CA"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              {/* Employment Type */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Employment Type
                </label>
                <input
                  type="text"
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  placeholder="e.g. Full-time, Contract"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              {/* Experience */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Experience
                </label>
                <input
                  type="text"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  placeholder="e.g. 5+ years, Mid-Level"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              {/* Salary */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Salary
                </label>
                <input
                  type="text"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value)}
                  placeholder="e.g. $140,000 - $180,000 / yr"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-semibold rounded-xl shadow-sm hover:shadow transition-all duration-150 flex items-center justify-center gap-2 text-sm"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Continue to Extraction</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('/no-job-detected')}
              className="py-3.5 px-6 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl transition text-sm"
            >
              Cancel
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}

export default ManualJobEntryPage;
