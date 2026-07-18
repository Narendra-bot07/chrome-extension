import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  FolderOpen,
  HardDrive,
  History,
  Star,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { useApp } from '../context/AppContext';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatSize(bytes) {
  if (!bytes) return 'Unknown';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeResume(resume) {
  if (!resume) return null;
  return {
    ...(resume.parsed_content || resume),
    id: resume.id,
    file_name: resume.file_name,
    file_size: resume.file_size,
    file_type: resume.file_type,
    created_at: resume.created_at || resume.uploaded_at,
    uploaded_at: resume.uploaded_at || resume.created_at,
    last_used_at: resume.last_used_at,
    times_used: resume.times_used || resume.tailor_count || 0,
    tailor_count: resume.tailor_count || resume.times_used || 0,
    parsing_status: resume.parsing_status || resume.parsed_content?.parse_status || 'unknown',
    is_active: !!resume.is_active
  };
}

export default function ResumeDetectionView({
  parsedResume,
  resumesList = [],
  onDeleteResume,
  onActivateResume,
  setResumeFile,
  onSelect,
  onUploadResume,
  loading,
  loadingResume
}) {
  const { apiUrl, session } = useApp();
  const fileInputRef = useRef(null);
  const [pendingUpload, setPendingUpload] = useState(false);
  const [toast, setToast] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewName, setPreviewName] = useState('');

  const activeResumeId = useMemo(() => {
    return resumesList.find((resume) => resume.is_active)?.id || parsedResume?.id || resumesList[0]?.id || null;
  }, [resumesList, parsedResume?.id]);

  const orderedResumes = useMemo(() => {
    return [...resumesList].sort((a, b) => {
      const aActive = a.id === activeResumeId || a.is_active;
      const bActive = b.id === activeResumeId || b.is_active;
      if (aActive !== bActive) return aActive ? -1 : 1;
      return new Date(b.created_at || b.uploaded_at || 0) - new Date(a.created_at || a.uploaded_at || 0);
    });
  }, [resumesList, activeResumeId]);

  const displayNamesById = useMemo(() => {
    const nameCounts = {};
    orderedResumes.forEach((resume) => {
      const name = resume.file_name || 'Resume.pdf';
      nameCounts[name] = (nameCounts[name] || 0) + 1;
    });

    const seen = {};
    return orderedResumes.reduce((acc, resume) => {
      const name = resume.file_name || 'Resume.pdf';
      seen[name] = (seen[name] || 0) + 1;
      acc[resume.id] = nameCounts[name] > 1 ? `${name} (${seen[name]})` : name;
      return acc;
    }, {});
  }, [orderedResumes]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    setPendingUpload(true);
    event.target.value = '';
    const uploaded = await onUploadResume?.(file);
    setPendingUpload(false);
    if (uploaded) {
      onSelect?.({ ...uploaded, is_active: true });
      setToast('Resume uploaded and set as active.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const handlePreview = async (resume) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/${resume.id}/preview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Preview unavailable.');
      const blob = await res.blob();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewName(resume.file_name || 'Resume');
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      setToast('Preview unavailable for this resume.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const handleSelect = async (resume) => {
    if (resume.id === activeResumeId || resume.is_active) return;
    const result = await onActivateResume?.(resume.id);
    const active = normalizeResume(result?.activeResume || resume);
    if (active) onSelect?.({ ...active, is_active: true });
    setToast('Active resume updated.');
    setTimeout(() => setToast(''), 3000);
  };

  const handleDelete = async (resume) => {
    if (!window.confirm(`Delete ${resume.file_name || 'this resume'}?`)) return;
    await onDeleteResume?.(resume.id);
    setToast('Resume deleted.');
    setTimeout(() => setToast(''), 3000);
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto px-1 py-1 text-slate-700 dark:text-slate-250">
      <div className="mb-5">
        <h2 className="text-xl font-black text-slate-900 dark:text-white">Resume Manager</h2>
        <p className="text-sm text-slate-500 mt-1">A list of uploaded resumes.</p>
      </div>

      {toast && (
        <div className="mb-3 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-2 text-xs font-bold">
          {toast}
        </div>
      )}

      {loadingResume ? (
        <div className="flex-1 min-h-[220px] flex items-center justify-center text-sm font-bold text-slate-400">
          Loading resumes...
        </div>
      ) : orderedResumes.length === 0 ? (
        <div className="flex-1 min-h-[260px] flex flex-col items-center justify-center text-center text-slate-400">
          <FolderOpen size={36} className="mb-3" />
          <p className="text-sm font-black">No resumes uploaded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border-y border-slate-200 dark:border-slate-850">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[minmax(240px,1.7fr)_145px_120px_115px_115px_120px_110px_110px_140px_95px] items-center gap-3 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-50/70 dark:bg-slate-950/50">
              <span><FileText size={13} className="inline mr-1" /> Resume Name</span>
              <span><CalendarDays size={13} className="inline mr-1" /> Uploaded</span>
              <span><HardDrive size={13} className="inline mr-1" /> Size</span>
              <span>Status</span>
              <span><Clock3 size={13} className="inline mr-1" /> Last Used</span>
              <span><History size={13} className="inline mr-1" /> Times Used</span>
              <span>Parsing</span>
              <span><Eye size={13} className="inline mr-1" /> Preview</span>
              <span><Star size={13} className="inline mr-1" /> Select</span>
              <span><Trash2 size={13} className="inline mr-1" /> Delete</span>
            </div>

            {orderedResumes.map((resume) => {
              const isActive = resume.id === activeResumeId || resume.is_active;
              return (
                <div
                  key={resume.id}
                  className={`grid grid-cols-[minmax(240px,1.7fr)_145px_120px_115px_115px_120px_110px_110px_140px_95px] items-center gap-3 px-3 py-3 border-t border-slate-100 dark:border-slate-900 text-sm transition ${
                    isActive ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-950/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handlePreview(resume)}
                    className={`min-w-0 text-left border-none bg-transparent cursor-pointer flex items-center gap-2 ${
                      isActive ? 'font-black text-slate-950 dark:text-white' : 'font-bold text-slate-750 dark:text-slate-250'
                    }`}
                  >
                    <FileText size={16} className="text-slate-400 flex-shrink-0" />
                    <span className="truncate">{displayNamesById[resume.id]}</span>
                  </button>

                  <span className="text-slate-500 font-medium">{formatDate(resume.created_at || resume.uploaded_at)}</span>
                  <span className="text-slate-500 font-medium">{formatSize(resume.file_size)}</span>
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-xs font-black ${
                    isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500 dark:bg-slate-900'
                  }`}>
                    {isActive ? <CheckCircle2 size={13} /> : <span className="h-2 w-2 rounded-full bg-slate-300" />}
                    {isActive ? 'Active' : 'Inactive'}
                  </span>
                  <span className="text-slate-500 font-medium">{formatDate(resume.last_used_at)}</span>
                  <span className="text-slate-500 font-black">{resume.times_used || resume.tailor_count || 0}</span>
                  <span className="text-slate-500 font-medium capitalize">{resume.parsing_status || resume.parsed_content?.parse_status || 'unknown'}</span>

                  <button
                    type="button"
                    onClick={() => handlePreview(resume)}
                    className="w-fit inline-flex items-center gap-1.5 border-none bg-transparent text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer"
                  >
                    <Eye size={15} /> Preview
                  </button>

                  {isActive ? (
                    <button
                      type="button"
                      disabled
                      className="w-fit inline-flex items-center gap-1.5 border-none bg-transparent text-slate-500 font-black"
                    >
                      <Star size={15} /> Active Resume
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSelect(resume)}
                      className="w-fit inline-flex items-center gap-1.5 border-none bg-transparent text-slate-700 hover:text-indigo-600 dark:text-slate-250 font-bold cursor-pointer"
                    >
                      <Star size={15} /> Select
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDelete(resume)}
                    className="w-fit inline-flex items-center gap-1.5 border-none bg-transparent text-rose-600 hover:text-rose-700 font-bold cursor-pointer"
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-5">
        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
        <button
          type="button"
          onClick={handleUploadClick}
          disabled={loading || pendingUpload}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-4 py-2.5 text-sm font-black border-none cursor-pointer"
        >
          <Upload size={16} />
          {loading || pendingUpload ? 'Uploading...' : 'Upload New Resume'}
        </button>
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-5xl h-[88vh] bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-850 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} className="text-slate-400" />
                <span className="text-sm font-black truncate">{previewName}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(previewUrl);
                  setPreviewUrl('');
                  setPreviewName('');
                }}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 border-none bg-transparent cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <iframe title="Resume Preview" src={previewUrl} className="flex-1 w-full bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}

