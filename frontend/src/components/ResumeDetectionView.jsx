import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  FolderOpen,
  GitCompare,
  HardDrive,
  History,
  Info,
  Layers,
  MoreVertical,
  Plus,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  Star,
  Trash2,
  TrendingUp,
  Upload,
  X
} from 'lucide-react';
import { useApp } from '../context/AppContext';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeTime(value) {
  if (!value) return 'Never';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Never';
  const now = new Date();
  const diffMs = now - d;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return 'Today';
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatSize(bytes) {
  if (!bytes) return 'Unknown';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getScoreColorClass(score) {
  if (score === null || score === undefined) return 'text-slate-400 bg-slate-100 dark:bg-slate-800/60 dark:text-slate-400';
  if (score >= 80) return 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  if (score >= 60) return 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800';
  return 'text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800';
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
    parsing_status: resume.parsing_status || resume.parsed_content?.parse_status || 'unknown',
    is_active: !!resume.is_active,
    current_version: resume.current_version,
    versions_count: resume.versions_count || 1,
    latest_ats_score: resume.latest_ats_score,
    latest_match_score: resume.latest_match_score
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
  const {
    apiUrl,
    session,
    fetchResumeVersions,
    createResumeVersion,
    setCurrentResumeVersion,
    updateResumeVersion,
    duplicateResumeVersion,
    restoreResumeVersion,
    deleteResumeVersion,
    compareResumeVersions,
    recordResumeUsage,
    fetchResumesList
  } = useApp();

  const fileInputRef = useRef(null);
  const [toast, setToast] = useState('');
  const [toastType, setToastType] = useState('success');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewName, setPreviewName] = useState('');

  // UI Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState('all'); // all | active | parsed | has_versions | recently_used | high_ats | needs_improvement
  const [sortBy, setSortBy] = useState('last_used'); // last_used | most_used | highest_ats | highest_match | most_versions | recently_uploaded

  // Expandable row state
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [openDropdownId, setOpenDropdownId] = useState(null);

  // Versions Panel State
  const [activeVersionResume, setActiveVersionResume] = useState(null);
  const [resumeVersions, setResumeVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Compare Modal State
  const [compareResume, setCompareResume] = useState(null);
  const [compareVersionAId, setCompareVersionAId] = useState('');
  const [compareVersionBId, setCompareVersionBId] = useState('');
  const [compareResult, setCompareResult] = useState(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Rename Version Modal State
  const [editingVersion, setEditingVersion] = useState(null);
  const [editVersionName, setEditVersionName] = useState('');

  // Active Resume Choice Modal (Edge Case: active resume deleted)
  const [showChooseActiveModal, setShowChooseActiveModal] = useState(false);

  // Tooltip State
  const [activeTooltip, setActiveTooltip] = useState(null);

  const activeResumeId = useMemo(() => {
    return resumesList.find((r) => r.is_active)?.id || parsedResume?.id || resumesList[0]?.id || null;
  }, [resumesList, parsedResume?.id]);

  const showToast = (msg, type = 'success') => {
    setToast(msg);
    setToastType(type);
    setTimeout(() => setToast(''), 3500);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.dropdown-trigger') && !e.target.closest('.dropdown-menu')) {
        setOpenDropdownId(null);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Load versions whenever activeVersionResume is opened
  const loadVersionsForResume = async (resume) => {
    if (!resume) return;
    setActiveVersionResume(resume);
    setLoadingVersions(true);
    const versions = await fetchResumeVersions(resume.id);
    setResumeVersions(versions);
    setLoadingVersions(false);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setResumeFile(file);
    event.target.value = '';
    const uploaded = await onUploadResume?.(file);
    if (uploaded) {
      const active = normalizeResume(uploaded);
      onSelect?.({ ...active, is_active: true });
      showToast('Resume uploaded and set as active.');
    }
  };

  const handlePreview = async (resume, versionId = null) => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token) return;
    try {
      const endpoint = versionId
        ? `${apiUrl}/api/v1/resumes/${resume.id}/preview?version_id=${versionId}`
        : `${apiUrl}/api/v1/resumes/${resume.id}/preview`;
      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Preview unavailable.');
      const blob = await res.blob();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewName(resume.file_name || 'Resume');
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      showToast('Preview unavailable for this resume.', 'error');
    }
  };

  const handleSelectActive = async (resume) => {
    if (resume.id === activeResumeId || resume.is_active) return;
    const result = await onActivateResume?.(resume.id);
    const active = normalizeResume(result?.activeResume || resume);
    if (active) onSelect?.({ ...active, is_active: true });
    showToast('Active resume updated.');
  };

  const handleDelete = async (resume) => {
    const wasActive = resume.id === activeResumeId || resume.is_active;
    if (!window.confirm(`Delete ${resume.file_name || 'this resume'}?`)) return;

    await onDeleteResume?.(resume.id);
    const updatedList = await fetchResumesList();

    if (wasActive) {
      if (updatedList && updatedList.length > 0) {
        setShowChooseActiveModal(true);
      } else {
        onSelect?.(null);
        showToast('Active resume deleted.', 'warning');
      }
    } else {
      showToast('Resume deleted.');
    }
  };

  // Version management handlers
  const handleSetCurrentVer = async (resumeId, versionId) => {
    const res = await setCurrentResumeVersion(resumeId, versionId);
    if (res) {
      showToast(`Set v${res.version_number} as current version.`);
      const updatedVersions = await fetchResumeVersions(resumeId);
      setResumeVersions(updatedVersions);
      fetchResumesList();
    }
  };

  const handleDuplicateVer = async (resumeId, versionId) => {
    const dup = await duplicateResumeVersion(resumeId, versionId);
    if (dup) {
      showToast(`Created duplicate v${dup.version_number}.`);
      const updatedVersions = await fetchResumeVersions(resumeId);
      setResumeVersions(updatedVersions);
      fetchResumesList();
    }
  };

  const handleRestoreVer = async (resumeId, versionId) => {
    const restored = await restoreResumeVersion(resumeId, versionId);
    if (restored) {
      showToast(`Restored version v${restored.version_number} as current.`);
      const updatedVersions = await fetchResumeVersions(resumeId);
      setResumeVersions(updatedVersions);
      fetchResumesList();
    }
  };

  const handleDeleteVer = async (resumeId, versionId, isOriginalOnly) => {
    if (isOriginalOnly) {
      showToast('Cannot delete the primary original version.', 'error');
      return;
    }
    if (!window.confirm('Delete this version?')) return;
    const res = await deleteResumeVersion(resumeId, versionId);
    if (res.success) {
      if (res.was_current && res.fallback_version) {
        showToast(`Version deleted. Fallback set to v${res.fallback_version.version_number}.`, 'info');
      } else {
        showToast('Version deleted.');
      }
      const updatedVersions = await fetchResumeVersions(resumeId);
      setResumeVersions(updatedVersions);
      fetchResumesList();
    } else {
      showToast(res.error || 'Failed to delete version.', 'error');
    }
  };

  const handleSaveRenameVer = async () => {
    if (!editingVersion || !editVersionName.trim()) return;
    const res = await updateResumeVersion(editingVersion.resume_id, editingVersion.id, {
      version_name: editVersionName.trim()
    });
    if (res) {
      showToast('Version renamed successfully.');
      setEditingVersion(null);
      if (activeVersionResume) {
        loadVersionsForResume(activeVersionResume);
      }
    }
  };

  // Compare handler
  const handleOpenCompare = async (resume, versionAId = null, versionBId = null) => {
    setCompareResume(resume);
    setCompareResult(null);
    const versions = await fetchResumeVersions(resume.id);
    if (versions.length < 2) {
      showToast('At least 2 versions are needed for comparison.', 'warning');
      return;
    }
    const verA = versionAId || versions[versions.length - 1]?.id || versions[0]?.id;
    const verB = versionBId || versions[0]?.id;
    setCompareVersionAId(verA);
    setCompareVersionBId(verB);

    if (verA && verB && verA !== verB) {
      runCompare(resume.id, verA, verB);
    }
  };

  const runCompare = async (resumeId, verA, verB) => {
    setLoadingCompare(true);
    const result = await compareResumeVersions(resumeId, verA, verB);
    setCompareResult(result);
    setLoadingCompare(false);
  };

  // Filter & Sort Logic
  const filteredResumes = useMemo(() => {
    let list = [...resumesList].map(normalizeResume).filter(Boolean);

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.file_name?.toLowerCase().includes(q) ||
          r.current_version?.version_name?.toLowerCase().includes(q)
      );
    }

    // Filter pills
    if (filterTag === 'active') list = list.filter((r) => r.is_active || r.id === activeResumeId);
    else if (filterTag === 'parsed') list = list.filter((r) => r.parsing_status === 'parsed');
    else if (filterTag === 'has_versions') list = list.filter((r) => r.versions_count > 1);
    else if (filterTag === 'recently_used') list = list.filter((r) => r.last_used_at);
    else if (filterTag === 'high_ats') list = list.filter((r) => (r.latest_ats_score || 0) >= 75);
    else if (filterTag === 'needs_improvement') list = list.filter((r) => r.latest_ats_score !== null && (r.latest_ats_score || 0) < 75);

    // Sorting
    list.sort((a, b) => {
      const aActive = a.id === activeResumeId || a.is_active;
      const bActive = b.id === activeResumeId || b.is_active;
      if (aActive !== bActive) return aActive ? -1 : 1;

      if (sortBy === 'last_used') {
        const timeA = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
        const timeB = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
        return timeB - timeA;
      }
      if (sortBy === 'most_used') return (b.times_used || 0) - (a.times_used || 0);
      if (sortBy === 'highest_ats') return (b.latest_ats_score || -1) - (a.latest_ats_score || -1);
      if (sortBy === 'highest_match') return (b.latest_match_score || -1) - (a.latest_match_score || -1);
      if (sortBy === 'most_versions') return (b.versions_count || 1) - (a.versions_count || 1);
      if (sortBy === 'recently_uploaded') {
        return new Date(b.created_at || b.uploaded_at || 0) - new Date(a.created_at || a.uploaded_at || 0);
      }
      return 0;
    });

    return list;
  }, [resumesList, activeResumeId, searchQuery, filterTag, sortBy]);

  // Overall metrics
  const activeResumeRecord = useMemo(() => {
    return resumesList.find((r) => r.id === activeResumeId) || resumesList[0];
  }, [resumesList, activeResumeId]);

  const totalResumes = resumesList.length;
  const totalApplications = useMemo(() => {
    return resumesList.reduce((acc, r) => acc + (r.times_used || r.tailor_count || 0), 0);
  }, [resumesList]);

  const topATSScore = useMemo(() => {
    let top = 0;
    resumesList.forEach((r) => {
      if (r.latest_ats_score > top) top = r.latest_ats_score;
    });
    return top > 0 ? `${Math.round(top)} / 100` : '—';
  }, [resumesList]);

  return (
    <div className="h-full flex flex-col overflow-y-auto px-2 py-2 text-slate-700 dark:text-slate-200">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Resume Intelligence & Versioning
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 rounded-full border border-indigo-200 dark:border-indigo-800">
              ApplyFlow Intelligence
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Track live application usage, monitor ATS performance, manage tailored versions, and activate root resumes.
          </p>
        </div>

        <button
          onClick={handleUploadClick}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm shadow-md hover:shadow-indigo-500/20 transition active:scale-95"
        >
          <Upload size={16} />
          <span>Upload New Resume</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">
            <span>Active Resume</span>
            <Star size={14} className="text-amber-500 fill-amber-500" />
          </div>
          <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
            {activeResumeRecord?.file_name || 'None Active'}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {activeResumeRecord?.current_version?.version_name || 'v1 Original'}
          </p>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">
            <span>Root Resumes</span>
            <FileText size={14} className="text-indigo-500" />
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-white">{totalResumes}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Managed families</p>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">
            <span>Times Used</span>
            <TrendingUp size={14} className="text-emerald-500" />
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-white">{totalApplications}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Applications & Tailors</p>
        </div>

        <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">
            <span>Top ATS Score</span>
            <BarChart3 size={14} className="text-violet-500" />
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-white">{topATSScore}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Latest highest match</p>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-xs font-bold flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2 ${
            toastType === 'error'
              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-900'
              : toastType === 'warning'
              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-900'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastType === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{toast}</span>
          </div>
          <button onClick={() => setToast('')} className="opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Toolbar: Search, Filters, Sorting */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search resume or version name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
            { id: 'parsed', label: 'Parsed' },
            { id: 'has_versions', label: 'Has Versions' },
            { id: 'recently_used', label: 'Recently Used' },
            { id: 'high_ats', label: 'High ATS (≥75)' },
            { id: 'needs_improvement', label: 'Needs Improvement' }
          ].map((tag) => (
            <button
              key={tag.id}
              onClick={() => setFilterTag(tag.id)}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition whitespace-nowrap ${
                filterTag === tag.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
              }`}
            >
              {tag.label}
            </button>
          ))}
        </div>

        {/* Sort Select */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Filter size={12} /> Sort:
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-2.5 py-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="last_used">Last Used</option>
            <option value="most_used">Most Used</option>
            <option value="highest_ats">Highest ATS</option>
            <option value="highest_match">Highest Match</option>
            <option value="most_versions">Most Versions</option>
            <option value="recently_uploaded">Recently Uploaded</option>
          </select>
        </div>
      </div>

      {/* Main Resume Table */}
      {loadingResume ? (
        <div className="flex-1 min-h-[260px] flex items-center justify-center text-sm font-bold text-slate-400">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading resume intelligence...</span>
          </div>
        </div>
      ) : filteredResumes.length === 0 ? (
        <div className="flex-1 min-h-[300px] flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/30">
          <FolderOpen size={42} className="text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-base font-extrabold text-slate-800 dark:text-slate-200">No resumes found</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            {searchQuery || filterTag !== 'all'
              ? 'Try adjusting your search query or filter settings.'
              : 'Upload your first master resume to enable live AI versioning and score tracking.'}
          </p>
          {filterTag !== 'all' || searchQuery ? (
            <button
              onClick={() => {
                setFilterTag('all');
                setSearchQuery('');
              }}
              className="mt-4 px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl"
            >
              Reset Filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[980px]">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200/80 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400 select-none">
                  <th className="py-3 px-3 w-8"></th>
                  <th className="py-3 px-3">Resume Name</th>
                  <th className="py-3 px-3">Version</th>
                  <th className="py-3 px-3">Uploaded</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Times Used</th>
                  <th className="py-3 px-3">Last Used</th>
                  <th className="py-3 px-3">
                    <div className="flex items-center gap-1">
                      <span>Latest Match</span>
                      <Info
                        size={11}
                        className="cursor-pointer text-slate-400 hover:text-indigo-500"
                        onMouseEnter={() => setActiveTooltip('match_header')}
                        onMouseLeave={() => setActiveTooltip(null)}
                      />
                    </div>
                  </th>
                  <th className="py-3 px-3">
                    <div className="flex items-center gap-1">
                      <span>Latest ATS</span>
                      <Info
                        size={11}
                        className="cursor-pointer text-slate-400 hover:text-indigo-500"
                        onMouseEnter={() => setActiveTooltip('ats_header')}
                        onMouseLeave={() => setActiveTooltip(null)}
                      />
                    </div>
                  </th>
                  <th className="py-3 px-3">Versions</th>
                  <th className="py-3 px-3">Parsing</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-xs">
                {filteredResumes.map((resume) => {
                  const isActive = resume.id === activeResumeId || resume.is_active;
                  const isExpanded = expandedRowId === resume.id;
                  const currentVer = resume.current_version;

                  return (
                    <React.Fragment key={resume.id}>
                      <tr
                        className={`transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${
                          isActive ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                        }`}
                      >
                        {/* Expand Toggle */}
                        <td className="py-3 px-3 text-slate-400">
                          <button
                            onClick={() => setExpandedRowId(isExpanded ? null : resume.id)}
                            className="p-1 hover:text-slate-600 dark:hover:text-slate-200 transition"
                            title="Toggle expanded details"
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </td>

                        {/* Resume Name */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <FileText size={16} className={isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'} />
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                <span className="truncate max-w-[200px]">{resume.file_name || 'Resume'}</span>
                                {isActive && (
                                  <span className="px-1.5 py-0.2 text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-800">
                                    Active Root
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {formatSize(resume.file_size)} • {resume.file_type || 'PDF'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Version */}
                        <td className="py-3 px-3 font-semibold">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px]">
                            <Layers size={11} className="text-indigo-500" />
                            {currentVer?.version_name || 'v1 Original'}
                          </span>
                        </td>

                        {/* Uploaded */}
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatDate(resume.created_at)}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 rounded-full">
                              Inactive
                            </span>
                          )}
                        </td>

                        {/* Times Used */}
                        <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {resume.times_used > 0 ? (
                            <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 rounded-md font-extrabold text-[11px]">
                              {resume.times_used} {resume.times_used === 1 ? 'application' : 'applications'}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Never used</span>
                          )}
                        </td>

                        {/* Last Used */}
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatRelativeTime(resume.last_used_at)}
                        </td>

                        {/* Latest Match */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="relative group inline-block">
                            {resume.latest_match_score !== null && resume.latest_match_score !== undefined ? (
                              <span className={`px-2 py-0.5 rounded-md font-extrabold text-[11px] border ${getScoreColorClass(resume.latest_match_score)}`}>
                                {Math.round(resume.latest_match_score)}%
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-[11px]">—</span>
                            )}
                            {/* Score Tooltip */}
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block z-20 w-48 p-2 text-[10px] text-white bg-slate-900 rounded-lg shadow-lg pointer-events-none">
                              Score from the most recent job description analyzed with this resume.
                            </div>
                          </div>
                        </td>

                        {/* Latest ATS */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="relative group inline-block">
                            {resume.latest_ats_score !== null && resume.latest_ats_score !== undefined ? (
                              <span className={`px-2 py-0.5 rounded-md font-extrabold text-[11px] border ${getScoreColorClass(resume.latest_ats_score)}`}>
                                {Math.round(resume.latest_ats_score)} / 100
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono text-[11px]">—</span>
                            )}
                            {/* Score Tooltip */}
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block z-20 w-48 p-2 text-[10px] text-white bg-slate-900 rounded-lg shadow-lg pointer-events-none">
                              Score from the most recent job description analyzed with this resume.
                            </div>
                          </div>
                        </td>

                        {/* Versions */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <button
                            onClick={() => loadVersionsForResume(resume)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 transition border border-indigo-200 dark:border-indigo-900"
                          >
                            <Layers size={12} />
                            <span>{resume.versions_count || 1} {resume.versions_count === 1 ? 'version' : 'versions'}</span>
                          </button>
                        </td>

                        {/* Parsing Status */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-extrabold rounded-md uppercase tracking-wide ${
                              resume.parsing_status === 'parsed'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                : resume.parsing_status === 'failed'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300'
                            }`}
                          >
                            {resume.parsing_status}
                          </span>
                        </td>

                        {/* Quick Actions */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handlePreview(resume)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                              title="Preview Resume"
                            >
                              <Eye size={15} />
                            </button>

                            {!isActive && (
                              <button
                                onClick={() => handleSelectActive(resume)}
                                className="p-1.5 text-slate-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                title="Set as Active Resume"
                              >
                                <Star size={15} />
                              </button>
                            )}

                            <button
                              onClick={() => loadVersionsForResume(resume)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                              title="View Versions"
                            >
                              <Layers size={15} />
                            </button>

                            {/* Dropdown Menu */}
                            <div className="relative inline-block text-left">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenDropdownId(openDropdownId === resume.id ? null : resume.id);
                                }}
                                className="dropdown-trigger p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                              >
                                <MoreVertical size={15} />
                              </button>

                              {openDropdownId === resume.id && (
                                <div className="dropdown-menu absolute right-0 mt-1 w-44 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-30 py-1.5 text-xs">
                                  <button
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handlePreview(resume);
                                    }}
                                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                                  >
                                    <Eye size={13} /> Preview File
                                  </button>
                                  {!isActive && (
                                    <button
                                      onClick={() => {
                                        setOpenDropdownId(null);
                                        handleSelectActive(resume);
                                      }}
                                      className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                                    >
                                      <Star size={13} className="text-amber-500" /> Set Active
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      loadVersionsForResume(resume);
                                    }}
                                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                                  >
                                    <Layers size={13} /> View Versions ({resume.versions_count || 1})
                                  </button>
                                  <button
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleOpenCompare(resume);
                                    }}
                                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                                  >
                                    <GitCompare size={13} /> Compare Versions
                                  </button>
                                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                                  <button
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleDelete(resume);
                                    }}
                                    className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                                  >
                                    <Trash2 size={13} /> Delete Resume
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Row Details */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800">
                          <td colSpan={12} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              {/* Version & Metadata Info */}
                              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                <h4 className="font-extrabold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                                  <Layers size={14} className="text-indigo-500" /> Current Version Overview
                                </h4>
                                <div className="space-y-1.5 text-slate-600 dark:text-slate-300">
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Current Version:</span>
                                    <span className="font-bold">{currentVer?.version_name || 'v1 Original'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Version Type:</span>
                                    <span className="font-semibold capitalize">{currentVer?.version_type?.replace('_', ' ') || 'Original'}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Total Versions:</span>
                                    <span className="font-semibold">{resume.versions_count || 1} versions</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-slate-400">Filename:</span>
                                    <span className="font-mono text-[11px] truncate max-w-[150px]">{resume.file_name}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Intelligence Scores */}
                              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                <h4 className="font-extrabold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                                  <BarChart3 size={14} className="text-violet-500" /> Intelligence Scores
                                </h4>
                                <div className="space-y-3">
                                  <div>
                                    <div className="flex justify-between font-bold mb-1">
                                      <span className="text-slate-600 dark:text-slate-300">Resume Match</span>
                                      <span>{resume.latest_match_score !== null ? `${Math.round(resume.latest_match_score)}%` : '—'}</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                        style={{ width: `${resume.latest_match_score || 0}%` }}
                                      />
                                    </div>
                                  </div>

                                  <div>
                                    <div className="flex justify-between font-bold mb-1">
                                      <span className="text-slate-600 dark:text-slate-300">ATS Score</span>
                                      <span>{resume.latest_ats_score !== null ? `${Math.round(resume.latest_ats_score)} / 100` : '—'}</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                        style={{ width: `${resume.latest_ats_score || 0}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Quick Actions & Version History */}
                              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                <h4 className="font-extrabold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                                  <Sparkles size={14} className="text-amber-500" /> Actions & Family
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    onClick={() => loadVersionsForResume(resume)}
                                    className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold hover:bg-indigo-100 transition flex items-center gap-1.5"
                                  >
                                    <Layers size={13} /> Manage Versions
                                  </button>
                                  <button
                                    onClick={() => handleOpenCompare(resume)}
                                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 transition flex items-center gap-1.5"
                                  >
                                    <GitCompare size={13} /> Compare
                                  </button>
                                  <button
                                    onClick={() => handlePreview(resume)}
                                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 transition flex items-center gap-1.5"
                                  >
                                    <Eye size={13} /> Preview
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VERSIONS PANEL (SLIDE-OVER / MODAL) */}
      {/* ========================================================================= */}
      {activeVersionResume && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/60">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers size={18} className="text-indigo-600" />
                  Versions for {activeVersionResume.file_name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {resumeVersions.length} versions stored in this resume family
                </p>
              </div>
              <button
                onClick={() => setActiveVersionResume(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingVersions ? (
                <div className="min-h-[200px] flex items-center justify-center text-xs font-bold text-slate-400">
                  Loading version lineage...
                </div>
              ) : resumeVersions.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs font-semibold">
                  No versions registered yet.
                </div>
              ) : (
                resumeVersions.map((ver) => {
                  const isCurrent = ver.is_current;
                  const isOriginalOnly = ver.version_type === 'original' && resumeVersions.filter((v) => v.version_type === 'original').length <= 1;

                  return (
                    <div
                      key={ver.id}
                      className={`p-3.5 rounded-xl border transition ${
                        isCurrent
                          ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-800 shadow-sm'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                              v{ver.version_number} — {ver.version_name || 'Version'}
                            </span>
                            {isCurrent && (
                              <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wide bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded border border-emerald-200 dark:border-emerald-800">
                                Current
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400">
                            Type: <strong className="capitalize text-slate-600 dark:text-slate-300">{ver.version_type?.replace('_', ' ')}</strong> • {formatDate(ver.created_at)}
                          </span>
                        </div>

                        {/* Scores */}
                        <div className="flex items-center gap-1.5 text-right">
                          {ver.ats_score !== null && ver.ats_score !== undefined && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${getScoreColorClass(ver.ats_score)}`}>
                              ATS {Math.round(ver.ats_score)}
                            </span>
                          )}
                          {ver.resume_match_score !== null && ver.resume_match_score !== undefined && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${getScoreColorClass(ver.resume_match_score)}`}>
                              Match {Math.round(ver.resume_match_score)}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Summary */}
                      {ver.changes_summary && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/50 p-2 rounded-lg mb-3">
                          {ver.changes_summary}
                        </p>
                      )}

                      {/* Version Actions */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1 border-t border-slate-100 dark:border-slate-850">
                        {!isCurrent && (
                          <button
                            onClick={() => handleSetCurrentVer(activeVersionResume.id, ver.id)}
                            className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition flex items-center gap-1 text-[11px]"
                          >
                            <Check size={12} /> Set as Current
                          </button>
                        )}

                        <button
                          onClick={() => handlePreview(activeVersionResume, ver.id)}
                          className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-200 transition flex items-center gap-1 text-[11px]"
                        >
                          <Eye size={12} /> Preview
                        </button>

                        <button
                          onClick={() => handleOpenCompare(activeVersionResume, ver.id)}
                          className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-200 transition flex items-center gap-1 text-[11px]"
                        >
                          <GitCompare size={12} /> Compare
                        </button>

                        <button
                          onClick={() => {
                            setEditingVersion(ver);
                            setEditVersionName(ver.version_name || '');
                          }}
                          className="px-2 py-1 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          title="Rename Version"
                        >
                          <Edit2 size={12} />
                        </button>

                        <button
                          onClick={() => handleDuplicateVer(activeVersionResume.id, ver.id)}
                          className="px-2 py-1 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          title="Duplicate Version"
                        >
                          <Copy size={12} />
                        </button>

                        <button
                          onClick={() => handleRestoreVer(activeVersionResume.id, ver.id)}
                          className="px-2 py-1 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          title="Restore this version as new current version"
                        >
                          <RotateCcw size={12} />
                        </button>

                        <button
                          onClick={() => handleDeleteVer(activeVersionResume.id, ver.id, isOriginalOnly)}
                          disabled={isOriginalOnly}
                          className={`px-2 py-1 rounded-md transition ${
                            isOriginalOnly
                              ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                              : 'text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                          }`}
                          title={isOriginalOnly ? 'Cannot delete the primary original version' : 'Delete Version'}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* COMPARE VERSIONS MODAL */}
      {/* ========================================================================= */}
      {compareResume && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-5 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <GitCompare size={20} className="text-indigo-600" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Compare Version Differences
                </h3>
              </div>
              <button
                onClick={() => setCompareResume(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {/* Version Selectors */}
            <div className="grid grid-cols-2 gap-3 py-3 bg-slate-50 dark:bg-slate-950/50 my-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <label className="text-[11px] font-extrabold uppercase text-slate-400 mb-1 block">Baseline Version (A)</label>
                <select
                  value={compareVersionAId}
                  onChange={(e) => {
                    setCompareVersionAId(e.target.value);
                    if (compareResume && e.target.value && compareVersionBId) {
                      runCompare(compareResume.id, e.target.value, compareVersionBId);
                    }
                  }}
                  className="w-full p-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                >
                  {resumeVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version_number} — {v.version_name || 'Version'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-extrabold uppercase text-slate-400 mb-1 block">Target Version (B)</label>
                <select
                  value={compareVersionBId}
                  onChange={(e) => {
                    setCompareVersionBId(e.target.value);
                    if (compareResume && compareVersionAId && e.target.value) {
                      runCompare(compareResume.id, compareVersionAId, e.target.value);
                    }
                  }}
                  className="w-full p-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                >
                  {resumeVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version_number} — {v.version_name || 'Version'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Compare Results */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {loadingCompare ? (
                <div className="py-12 text-center text-xs font-bold text-slate-400">
                  Computing version diff analysis...
                </div>
              ) : compareResult ? (
                <>
                  {/* Score Diffs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">ATS Score Change</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-lg font-black text-slate-900 dark:text-white">
                          {compareResult.score_diffs?.ats_score?.from ?? '—'} → {compareResult.score_diffs?.ats_score?.to ?? '—'}
                        </span>
                        {compareResult.score_diffs?.ats_score?.diff !== null && compareResult.score_diffs?.ats_score?.diff !== undefined && (
                          <span
                            className={`text-xs font-extrabold px-1.5 py-0.5 rounded ${
                              compareResult.score_diffs.ats_score.diff >= 0
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {compareResult.score_diffs.ats_score.diff >= 0 ? '+' : ''}
                            {compareResult.score_diffs.ats_score.diff} pts
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
                      <span className="text-[11px] font-bold text-slate-400 uppercase">Resume Match Change</span>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-lg font-black text-slate-900 dark:text-white">
                          {compareResult.score_diffs?.resume_match_score?.from ? `${compareResult.score_diffs.resume_match_score.from}%` : '—'} →{' '}
                          {compareResult.score_diffs?.resume_match_score?.to ? `${compareResult.score_diffs.resume_match_score.to}%` : '—'}
                        </span>
                        {compareResult.score_diffs?.resume_match_score?.diff !== null && compareResult.score_diffs?.resume_match_score?.diff !== undefined && (
                          <span
                            className={`text-xs font-extrabold px-1.5 py-0.5 rounded ${
                              compareResult.score_diffs.resume_match_score.diff >= 0
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                            }`}
                          >
                            {compareResult.score_diffs.resume_match_score.diff >= 0 ? '+' : ''}
                            {compareResult.score_diffs.resume_match_score.diff}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 text-xs">
                    <span className="font-extrabold text-indigo-700 dark:text-indigo-300">Summary: </span>
                    <span className="text-slate-700 dark:text-slate-300">{compareResult.summary}</span>
                  </div>

                  {/* Added Bullets */}
                  {compareResult.added_bullets && compareResult.added_bullets.length > 0 && (
                    <div>
                      <h4 className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 mb-1 flex items-center gap-1">
                        <Plus size={13} /> Added / Improved Bullets
                      </h4>
                      <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 pl-2 border-l-2 border-emerald-500">
                        {compareResult.added_bullets.map((b, i) => (
                          <li key={i}>• {b}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Added Skills */}
                  {compareResult.added_skills && compareResult.added_skills.length > 0 && (
                    <div>
                      <h4 className="text-xs font-extrabold text-indigo-700 dark:text-indigo-400 mb-1">
                        Added Keywords & Skills
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {compareResult.added_skills.map((s, i) => (
                          <span key={i} className="px-2 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 rounded font-bold text-[10px]">
                            +{s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400 font-semibold">
                  Select two different versions above to compare differences.
                </div>
              )}
            </div>

            <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-800 text-right">
              <button
                onClick={() => setCompareResume(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENAME VERSION MODAL */}
      {editingVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mb-2">
              Rename Version v{editingVersion.version_number}
            </h3>
            <input
              type="text"
              value={editVersionName}
              onChange={(e) => setEditVersionName(e.target.value)}
              className="w-full p-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
              placeholder="e.g. NVIDIA Tailored"
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setEditingVersion(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRenameVer}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-bold text-white shadow-sm"
              >
                Save Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CHOOSE ACTIVE RESUME MODAL */}
      {showChooseActiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-base mb-1">
              <AlertTriangle size={20} />
              <span>Select New Active Resume</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              The active root resume was deleted. Please choose which resume should be selected by default for future job analysis:
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
              {resumesList.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    handleSelectActive(r);
                    setShowChooseActiveModal(false);
                  }}
                  className="w-full p-2.5 text-left rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500 bg-slate-50 dark:bg-slate-950/50 flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200 transition"
                >
                  <span className="truncate">{r.file_name}</span>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">Select</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
