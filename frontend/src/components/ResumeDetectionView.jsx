import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Circle,
  Upload,
  FileText,
  ChevronDown,
  ChevronRight,
  Eye,
  Layers,
  Trash2,
  Edit2,
  Download,
  Copy,
  RotateCcw,
  Wand2,
  Plus,
  Search,
  Filter,
  CalendarDays,
  Clock3,
  HardDrive,
  MoreVertical,
  X,
  Shield,
  Check,
  RefreshCw,
  ExternalLink,
  GitCompare,
  TrendingUp,
  BarChart3,
  Zap,
  Briefcase
} from 'lucide-react';
import { InlineAIThinking, SkeletonCard } from './ui/Loading';
import { useApp } from '../context/AppContext';
import TailorRender from './Resume/TailorRender';
import { ResumeDropzoneOverlay } from './Resume/ResumeDropzoneOverlay';
import { Button } from './ui/Button';
import './ResumeDetectionView.css';


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
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAtsScoreBadge(score) {
  if (score === null || score === undefined || score === 0) {
    return <span className="px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded font-semibold text-[10px]">No ATS Score</span>;
  }
  const val = Math.round(score);
  if (val >= 80) {
    return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded font-extrabold text-[10px] flex items-center gap-1"><TrendingUp size={10} /> {val}% ATS</span>;
  }
  if (val >= 60) {
    return <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded font-extrabold text-[10px]">{val}% ATS</span>;
  }
  return <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-300 rounded font-extrabold text-[10px]">{val}% ATS</span>;
}

function getMatchScoreBadge(score) {
  if (score === null || score === undefined || score === 0) {
    return <span className="px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded font-semibold text-[10px]">No Match Score</span>;
  }
  const val = Math.round(score);
  return <span className="px-2 py-0.5 bg-[#00bda5]/10 text-[#00a894] border border-[#00bda5]/30 rounded font-extrabold text-[10px]">{val}% Match</span>;
}

export default function ResumeDetectionView({
  parsedResume,
  resumesList = [],
  onDeleteResume,
  onActivateResume,
  setResumeFile,
  onSelect,
  onUploadResume,
  uploadProgress = 0,
  loading = false,
  loadingResume = false
}) {
  const {
    session,
    apiUrl,
    fetchResumesList,
    listResumeVersions,
    setCurrentResumeVersion,
    updateResumeVersion,
    duplicateResumeVersion,
    restoreResumeVersion,
    deleteResumeVersion,
    compareResumeVersions
  } = useApp();

  // Local state for UI controls
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'active' | 'parsed' | 'has_versions' | 'recently_used'
  const [sortBy, setSortBy] = useState('last_used'); // 'last_used' | 'recently_uploaded' | 'most_used' | 'name'

  // Right-Side Drawer State
  const [sideDrawerResume, setSideDrawerResume] = useState(null);
  const [sideDrawerTab, setSideDrawerTab] = useState('versions'); // 'versions' | 'compare'
  const [sideDrawerVersions, setSideDrawerVersions] = useState([]);
  const [loadingSideDrawer, setLoadingSideDrawer] = useState(false);

  // Compare Mode State
  const [targetCompareVersionId, setTargetCompareVersionId] = useState('');
  const [compareResult, setCompareResult] = useState(null);
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Modals & Action States
  const [previewResume, setPreviewResume] = useState(null);
  const [storedPreviewUrls, setStoredPreviewUrls] = useState({});
  const [storedPreviewErrors, setStoredPreviewErrors] = useState({});
  const [renamingResume, setRenamingResume] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingVersion, setRenamingVersion] = useState(null);
  const [versionRenameValue, setVersionRenameValue] = useState('');

  const fileInputRef = useRef(null);
  const storedPreviewUrlsRef = useRef({});
  const storedPreviewRequestsRef = useRef(new Map());

  const cacheStoredResumeFile = React.useCallback(async (resume) => {
    if (!resume?.id || storedPreviewUrlsRef.current[resume.id]) {
      return storedPreviewUrlsRef.current[resume?.id] || '';
    }
    if (storedPreviewRequestsRef.current.has(resume.id)) {
      return storedPreviewRequestsRef.current.get(resume.id);
    }
    const request = (async () => {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token) throw new Error('Sign in to preview this resume.');
      const response = await fetch(`${apiUrl}/api/v1/resumes/${resume.id}/file`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('The stored resume could not be loaded.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      storedPreviewUrlsRef.current = { ...storedPreviewUrlsRef.current, [resume.id]: url };
      setStoredPreviewUrls(current => ({ ...current, [resume.id]: url }));
      return url;
    })().catch(error => {
      setStoredPreviewErrors(current => ({ ...current, [resume.id]: error.message }));
      return '';
    }).finally(() => {
      storedPreviewRequestsRef.current.delete(resume.id);
    });
    storedPreviewRequestsRef.current.set(resume.id, request);
    return request;
  }, [apiUrl, session?.access_token]);

  // Fetch the immutable uploaded files while the user is viewing the table.
  // Clicking Preview then only reveals an already-created local blob URL.
  useEffect(() => {
    (resumesList || []).forEach(resume => {
      if ((resume.file_type || '').toLowerCase() === 'pdf') cacheStoredResumeFile(resume);
    });
  }, [resumesList, cacheStoredResumeFile]);

  useEffect(() => () => {
    Object.values(storedPreviewUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
    storedPreviewUrlsRef.current = {};
  }, []);

  // Open Right-Side Version Drawer for a specific resume
  const handleOpenVersionsDrawer = async (resume, initialTab = 'versions') => {
    setSideDrawerResume(resume);
    setSideDrawerTab(initialTab);
    setLoadingSideDrawer(true);
    setCompareResult(null);
    setTargetCompareVersionId('');

    try {
      const versions = await listResumeVersions(resume.id);
      const list = versions || [];
      setSideDrawerVersions(list);

      // Default compare target to non-current version if available
      const nonCurrent = list.find(v => !v.is_current);
      if (nonCurrent) {
        setTargetCompareVersionId(nonCurrent.id);
      }
    } catch (err) {
      console.error("Failed to load versions for side drawer:", err);
    } finally {
      setLoadingSideDrawer(false);
    }
  };

  const handleRefreshSideDrawerVersions = async () => {
    if (!sideDrawerResume) return;
    setLoadingSideDrawer(true);
    try {
      const versions = await listResumeVersions(sideDrawerResume.id);
      setSideDrawerVersions(versions || []);
    } catch (err) {
      console.error("Failed to refresh side drawer versions:", err);
    } finally {
      setLoadingSideDrawer(false);
    }
  };

  // Run Version Comparison between Current Version & Target Version
  const handleRunComparison = async (targetVerId) => {
    if (!sideDrawerResume || !targetVerId) return;
    const currentVer = sideDrawerVersions.find(v => v.is_current) || sideDrawerVersions[0];
    if (!currentVer) return;

    setLoadingCompare(true);
    try {
      const diff = await compareResumeVersions(sideDrawerResume.id, currentVer.id, targetVerId);
      setCompareResult(diff);
    } catch (err) {
      console.error("Comparison failed:", err);
    } finally {
      setLoadingCompare(false);
    }
  };

  // Auto-run comparison when tab switches to 'compare' or target changes
  useEffect(() => {
    if (sideDrawerTab === 'compare' && targetCompareVersionId && sideDrawerResume) {
      handleRunComparison(targetCompareVersionId);
    }
  }, [sideDrawerTab, targetCompareVersionId]);

  // Filter & Sort Resumes List
  const filteredResumes = useMemo(() => {
    let result = Array.isArray(resumesList) ? [...resumesList] : [];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(r => 
        (r.file_name || '').toLowerCase().includes(q) ||
        (r.current_version?.version_name || '').toLowerCase().includes(q)
      );
    }

    // Category Filter
    if (filterType === 'active') {
      result = result.filter(r => r.is_active);
    } else if (filterType === 'parsed') {
      result = result.filter(r => (r.parsing_status || '').toLowerCase() === 'parsed' || r.parsed_content);
    } else if (filterType === 'has_versions') {
      result = result.filter(r => (r.versions_count || 1) > 1);
    } else if (filterType === 'recently_used') {
      result = result.filter(r => r.last_used_at);
    }

    // Sort order
    result.sort((a, b) => {
      if (sortBy === 'last_used') {
        const timeA = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
        const timeB = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
        return timeB - timeA;
      }
      if (sortBy === 'recently_uploaded') {
        const timeA = new Date(a.created_at || a.uploaded_at || 0).getTime();
        const timeB = new Date(b.created_at || b.uploaded_at || 0).getTime();
        return timeB - timeA;
      }
      if (sortBy === 'most_used') {
        return (b.times_used || 0) - (a.times_used || 0);
      }
      if (sortBy === 'name') {
        return (a.file_name || '').localeCompare(b.file_name || '');
      }
      return 0;
    });

    return result;
  }, [resumesList, searchQuery, filterType, sortBy]);

  // Handle Root Resume Selection
  const handleSelectActiveResume = async (resume) => {
    if (onActivateResume) {
      await onActivateResume(resume.id);
    }
    if (onSelect) {
      onSelect(resume);
    }
    fetchResumesList();
  };

  // Handle File Upload
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      if (setResumeFile && files[0]) setResumeFile(files[0]);
      handleDropFiles(files);
      if (e.target) e.target.value = '';
    }
  };

  // Rename Root Resume
  const handleConfirmRenameResume = async () => {
    if (!renamingResume || !renameValue.trim()) return;
    const token = session?.access_token || localStorage.getItem('access_token');
    try {
      const res = await fetch(`${apiUrl}/api/v1/resumes/${renamingResume.id}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ file_name: renameValue.trim() })
      });
      if (res.ok) {
        fetchResumesList();
        setRenamingResume(null);
        setRenameValue('');
      } else {
        alert("Failed to rename resume.");
      }
    } catch (err) {
      console.error("Rename failed:", err);
    }
  };

  // Version Actions inside Side Drawer
  const handleSetCurrentVersion = async (resumeId, versionId) => {
    await setCurrentResumeVersion(resumeId, versionId);
    handleRefreshSideDrawerVersions();
    fetchResumesList();
  };

  const handleDuplicateVersion = async (resumeId, versionId) => {
    await duplicateResumeVersion(resumeId, versionId);
    handleRefreshSideDrawerVersions();
    fetchResumesList();
  };

  const handleRestoreVersion = async (resumeId, versionId) => {
    await restoreResumeVersion(resumeId, versionId);
    handleRefreshSideDrawerVersions();
    fetchResumesList();
  };

  const handleDeleteVersion = async (resumeId, versionId, versionType) => {
    if (versionType === 'original') {
      alert("Protected: The original uploaded version cannot be deleted.");
      return;
    }
    if (!confirm("Are you sure you want to delete this version?")) return;
    const res = await deleteResumeVersion(resumeId, versionId);
    if (!res.success) {
      alert(res.error || "Failed to delete version.");
    } else {
      handleRefreshSideDrawerVersions();
      fetchResumesList();
    }
  };

  const handleConfirmRenameVersion = async () => {
    if (!renamingVersion || !versionRenameValue.trim()) return;
    await updateResumeVersion(renamingVersion.resume_id, renamingVersion.id, {
      version_name: versionRenameValue.trim()
    });
    handleRefreshSideDrawerVersions();
    setRenamingVersion(null);
    setVersionRenameValue('');
  };

  const [uploadQueue, setUploadQueue] = useState([]);
  const uploadControllersRef = useRef({});
  const uploadIntervalsRef = useRef({});

  useEffect(() => {
    return () => {
      Object.values(uploadControllersRef.current).forEach(c => c?.abort());
      Object.values(uploadIntervalsRef.current).forEach(i => clearInterval(i));
    };
  }, []);

  const handleCancelUpload = (itemId) => {
    if (uploadControllersRef.current[itemId]) {
      uploadControllersRef.current[itemId].abort();
      delete uploadControllersRef.current[itemId];
    }
    if (uploadIntervalsRef.current[itemId]) {
      clearInterval(uploadIntervalsRef.current[itemId]);
      delete uploadIntervalsRef.current[itemId];
    }
    setUploadQueue(prev => prev.filter(item => item.id !== itemId));
  };

  const handleCancelAllUploads = () => {
    Object.keys(uploadControllersRef.current).forEach(id => {
      uploadControllersRef.current[id]?.abort();
      delete uploadControllersRef.current[id];
    });
    Object.keys(uploadIntervalsRef.current).forEach(id => {
      clearInterval(uploadIntervalsRef.current[id]);
      delete uploadIntervalsRef.current[id];
    });
    setUploadQueue([]);
  };

  const handleDropFiles = async (files) => {
    if (!files || files.length === 0) return;
    
    const newItems = files.map((file, idx) => ({
      id: `upload-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`,
      file,
      name: file.name,
      size: file.size,
      progress: 10,
      status: 'uploading',
      error: null
    }));

    setUploadQueue(prev => [...newItems, ...prev]);

    for (let i = 0; i < newItems.length; i += 3) {
      const chunk = newItems.slice(i, i + 3);
      await Promise.all(
        chunk.map(async (item) => {
          const controller = new AbortController();
          uploadControllersRef.current[item.id] = controller;

          const interval = setInterval(() => {
            setUploadQueue(prev =>
              prev.map(q => {
                if (q.id === item.id && q.status === 'uploading' && q.progress < 90) {
                  return { ...q, progress: Math.min(q.progress + 15, 90) };
                }
                return q;
              })
            );
          }, 300);
          uploadIntervalsRef.current[item.id] = interval;

          try {
            if (onUploadResume) {
              const res = await onUploadResume(item.file, { signal: controller.signal });
              if (res?.cancelled) {
                clearInterval(interval);
                delete uploadIntervalsRef.current[item.id];
                delete uploadControllersRef.current[item.id];
                setUploadQueue(prev => prev.filter(q => q.id !== item.id));
                return;
              }
            }

            clearInterval(interval);
            delete uploadIntervalsRef.current[item.id];
            delete uploadControllersRef.current[item.id];

            setUploadQueue(prev =>
              prev.map(q => q.id === item.id ? { ...q, progress: 100, status: 'success' } : q)
            );
            setTimeout(() => {
              setUploadQueue(prev => prev.filter(q => q.id !== item.id));
            }, 1000);
          } catch (err) {
            clearInterval(interval);
            delete uploadIntervalsRef.current[item.id];
            delete uploadControllersRef.current[item.id];

            if (err.name === 'AbortError' || err.message === 'Canceled') {
              setUploadQueue(prev => prev.filter(q => q.id !== item.id));
            } else {
              setUploadQueue(prev =>
                prev.map(q => q.id === item.id ? { ...q, status: 'error', error: err.message || 'Upload failed' } : q)
              );
            }
          }
        })
      );
    }
  };

  const activeUploads = uploadQueue.filter(item => item.status !== 'success');
  const isUploading = loading || activeUploads.length > 0;


  return (
    <ResumeDropzoneOverlay onDropFiles={handleDropFiles}>
      <div className="resume-manager-page w-full space-y-6 text-tf-text font-sans relative">
        
        {/* HEADER SECTION */}
        <div className="resume-manager-hero flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-tf-surface border border-tf-border p-6 rounded-xl shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-tf-accent/10 border border-tf-accent/20 flex items-center justify-center text-tf-accent">
                <FileText size={18} strokeWidth={1.75} />
              </div>
              <h1 className="text-xl font-semibold text-tf-text tracking-tight">Resume Manager</h1>
            </div>
            <p className="text-xs text-tf-text-secondary font-normal pl-10">
              Select the resume you want to use and manage its saved versions.
            </p>
          </div>

          {/* Upload Resume & Drag & Drop CTA */}
          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.docx,.doc,.txt"
              multiple
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="group flex items-center gap-3 px-4 py-2.5 border-2 border-dashed border-tf-accent/40 hover:border-tf-accent bg-tf-accent/5 hover:bg-tf-accent/10 rounded-xl cursor-pointer transition-all select-none"
            >
              <div className="w-8 h-8 rounded-lg bg-tf-accent text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
                <Upload size={16} strokeWidth={2} />
              </div>
              <div className="text-left space-y-0.5">
                <div className="text-xs font-semibold text-tf-text flex items-center gap-1.5">
                  <span>Upload Resume</span>
                  <span className="text-[10px] font-normal text-tf-text-tertiary">(PDF, DOCX)</span>
                </div>
                <p className="text-[11px] text-tf-accent font-medium">
                  Drag & drop file here, or click to browse
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* UPLOADING STATE QUEUE BARS */}
        {activeUploads.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-tf-text-secondary flex items-center gap-1.5">
                <RefreshCw size={13} className="animate-spin text-tf-accent" />
                Uploading {activeUploads.length} {activeUploads.length === 1 ? 'file' : 'files'}...
              </span>
              {activeUploads.length > 1 && (
                <button
                  type="button"
                  onClick={handleCancelAllUploads}
                  className="text-xs text-tf-danger hover:text-tf-danger/80 font-medium transition-colors flex items-center gap-1 cursor-pointer border-none bg-transparent"
                >
                  <X size={13} />
                  Cancel All
                </button>
              )}
            </div>

            {activeUploads.map(item => (
              <div key={item.id} className="bg-tf-surface border border-tf-accent/30 p-3 rounded-lg flex items-center gap-4 shadow-sm">
                <RefreshCw size={16} className={`animate-spin ${item.status === 'error' ? 'text-tf-danger' : 'text-tf-accent'}`} />
                <div className="flex-1 space-y-1 min-w-0">
                  <div className="flex justify-between text-xs font-medium gap-2">
                    <span className="text-tf-text truncate font-medium">{item.name}</span>
                    <span className="text-tf-text-tertiary shrink-0 font-semibold">
                      {item.status === 'error' ? (
                        <span className="text-tf-danger font-medium">{item.error}</span>
                      ) : (
                        `${item.progress}%`
                      )}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-tf-surface-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${item.status === 'error' ? 'bg-tf-danger' : 'bg-tf-accent'}`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleCancelUpload(item.id)}
                  className="px-2.5 py-1 text-xs font-medium text-tf-text-secondary hover:text-tf-danger hover:bg-tf-danger/10 border border-tf-border hover:border-tf-danger/30 rounded-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                  title={item.status === 'error' ? "Dismiss error" : "Cancel upload"}
                >
                  <X size={14} />
                  <span>{item.status === 'error' ? 'Dismiss' : 'Cancel'}</span>
                </button>
              </div>
            ))}
          </div>
        )}


        {/* FILTER & SEARCH BAR */}
        <div className="resume-manager-toolbar flex flex-col md:flex-row md:items-center justify-between gap-4 bg-tf-surface-2 border border-tf-border p-3.5 rounded-xl">
          
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-tf-text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search resumes by name..."
              className="w-full pl-9 pr-4 py-1.5 bg-tf-surface border border-tf-border rounded-lg text-xs text-tf-text placeholder:text-tf-text-tertiary focus:outline-none focus:border-tf-accent font-normal"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-tf-text-tertiary hover:text-tf-text">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filter Pills & Sort Controls */}
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Filter Pills with Restrained Morphing layoutId */}
            <div className="flex items-center gap-1 bg-tf-surface p-1 rounded-lg border border-tf-border">
              {[
                { id: 'all', label: 'All' },
                { id: 'active', label: 'Active' },
                { id: 'parsed', label: 'Parsed' },
                { id: 'has_versions', label: 'Has Versions' },
                { id: 'recently_used', label: 'Recently Used' }
              ].map(tab => {
                const isSelected = filterType === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setFilterType(tab.id)}
                    className="relative px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer border-none text-tf-text-secondary hover:text-tf-text"
                  >
                    {isSelected && (
                      <motion.div
                        layoutId="activeResumeFilter"
                        className="absolute inset-0 bg-tf-surface-2 rounded-md border border-tf-border"
                        transition={{ type: "spring", stiffness: 350, damping: 28 }}
                      />
                    )}
                    <span className={`relative z-10 ${isSelected ? 'text-tf-text font-semibold' : ''}`}>
                      {tab.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 bg-tf-surface px-3 py-1.5 rounded-lg border border-tf-border text-xs font-normal">
              <span className="text-tf-text-tertiary uppercase text-[10px] font-medium tracking-wider">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent text-tf-text font-medium focus:outline-none cursor-pointer"
              >
                <option value="last_used">Last Used</option>
                <option value="recently_uploaded">Recently Uploaded</option>
                <option value="most_used">Most Used</option>
                <option value="name">Name</option>
              </select>
            </div>

          </div>

        </div>

        {/* RESUMES TABLE */}
        <div className="resume-manager-table bg-tf-surface border border-tf-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-tf-border bg-tf-surface-2 text-[10px] font-medium uppercase tracking-wider text-tf-text-tertiary">
                  <th className="py-3 px-4 w-28 text-center">Select</th>
                  <th className="py-3 px-4">Resume Name</th>
                  <th className="py-3 px-4">Current Version</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Times Used</th>
                  <th className="py-3 px-4">Last Used</th>
                  <th className="py-3 px-4 text-center">Versions</th>
                  <th className="py-3 px-4">Parsing</th>
                  <th className="py-3 px-4 text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tf-border font-normal">
                {filteredResumes.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-tf-text-tertiary space-y-3">
                      <FileText size={36} className="mx-auto text-tf-text-tertiary stroke-[1.5]" />
                      <p className="text-sm font-medium text-tf-text">No resumes found matching your filter.</p>
                      <p className="text-xs text-tf-text-secondary">Upload a new resume PDF/DOCX to get started.</p>
                    </td>
                  </tr>
                ) : (
                  filteredResumes.map(resume => {
                    const isActive = !!resume.is_active;
                    const versionsCount = resume.versions_count || 1;
                    const currentVerName = resume.current_version?.version_name || 'v1 Original';
                    const isPdf = (resume.file_name || '').toLowerCase().endsWith('.pdf');

                    return (
                      <tr
                        key={resume.id}
                        className={`hover:bg-tf-surface-2 transition-colors ${
                          isActive ? 'bg-tf-accent/5 border-l-4 border-l-tf-accent' : ''
                        }`}
                      >
                        
                        {/* 1. SELECT CONTROL (Far Left Radio Button) */}
                        <td className="py-3.5 px-4 text-center">
                          <Button
                            variant={isActive ? "primary" : "secondary"}
                            size="sm"
                            onClick={() => handleSelectActiveResume(resume)}
                            className="text-xs py-1 px-2.5"
                          >
                            {isActive ? (
                              <>
                                <CheckCircle2 size={13} />
                                <span>Active</span>
                              </>
                            ) : (
                              <>
                                <Circle size={13} />
                                <span>Select</span>
                              </>
                            )}
                          </Button>
                        </td>

                        {/* 2. RESUME NAME */}
                        <td className="py-3.5 px-4 font-medium text-tf-text">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-7 h-7 rounded flex items-center justify-center text-xs font-semibold shrink-0 ${
                              isPdf ? 'bg-tf-danger/10 text-tf-danger border border-tf-danger/20' : 'bg-tf-accent/10 text-tf-accent border border-tf-accent/20'
                            }`}>
                              <FileText size={14} />
                            </div>
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="hover:underline cursor-pointer text-tf-text font-medium truncate" onClick={() => setPreviewResume(resume)}>
                                  {resume.file_name}
                                </span>
                              </div>
                              <div className="text-[10px] font-normal text-tf-text-tertiary">
                                {formatSize(resume.file_size)}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 3. CURRENT VERSION */}
                        <td className="py-3.5 px-4 font-normal text-tf-text-secondary">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-tf-surface-2 border border-tf-border rounded text-xs font-normal text-tf-text-secondary">
                            <Layers size={11} className="text-tf-accent-secondary" />
                            <span>{currentVerName}</span>
                          </span>
                        </td>

                        {/* 4. UPLOADED */}
                        <td className="py-3.5 px-4 text-tf-text-tertiary font-normal text-xs">
                          {formatDate(resume.created_at || resume.uploaded_at)}
                        </td>

                        {/* 5. STATUS (Success Green vs Muted Neutral) */}
                        <td className="py-3.5 px-4">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-tf-success/10 text-tf-success border border-tf-success/20">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-normal uppercase tracking-wider bg-tf-surface-2 text-tf-text-tertiary border border-tf-border">
                              Inactive
                            </span>
                          )}
                        </td>

                        {/* 6. TIMES USED */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-tf-surface-2 border border-tf-border font-medium text-xs text-tf-text tabular-nums">
                            {resume.times_used || 0}
                          </span>
                        </td>

                        {/* 7. LAST USED */}
                        <td className="py-3.5 px-4 text-tf-text-secondary font-normal text-xs">
                          {formatRelativeTime(resume.last_used_at)}
                        </td>

                        {/* 8. VERSIONS DRAWER TRIGGER */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => handleOpenVersionsDrawer(resume, 'versions')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-tf-accent-secondary/10 hover:bg-tf-accent-secondary/20 text-tf-accent-secondary border border-tf-accent-secondary/20 rounded-md font-medium text-xs transition cursor-pointer"
                          >
                            <span>{versionsCount} {versionsCount === 1 ? 'Version' : 'Versions'}</span>
                            <ChevronRight size={13} />
                          </button>
                        </td>

                        {/* 9. PARSING STATUS */}
                        <td className="py-3.5 px-4">
                          {(resume.parsing_status || '').toLowerCase() === 'parsed' || resume.parsed_content ? (
                            <span className="inline-flex items-center gap-1 text-tf-success font-medium text-xs">
                              <CheckCircle2 size={13} /> Parsed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-tf-warning font-medium text-xs">
                              <Clock3 size={13} /> Pending
                            </span>
                          )}
                        </td>

                        {/* 10. ACTIONS */}
                        <td className="py-3.5 px-4 text-right pr-6">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setPreviewResume({ ...resume, _storedFilePreview: true });
                                if (!storedPreviewUrlsRef.current[resume.id]) cacheStoredResumeFile(resume);
                              }}
                              title="Preview Resume"
                            >
                              <Eye size={13} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setRenamingResume(resume);
                                setRenameValue(resume.file_name || '');
                              }}
                              title="Rename Resume"
                            >
                              <Edit2 size={13} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete "${resume.file_name}"?`)) {
                                  onDeleteResume && onDeleteResume(resume.id);
                                }
                              }}
                              title="Delete Resume"
                              className="text-tf-danger hover:bg-tf-danger/10"
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </td>


                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT-SIDE DRAWER PANEL FOR VERSIONS & METRICS COMPARISON */}
      {sideDrawerResume && (
        <>
          {/* Backdrop Overlay */}
          <div
            onClick={() => setSideDrawerResume(null)}
            className="resume-drawer-backdrop fixed inset-0 bg-black/40 backdrop-blur-xs z-40 transition-opacity"
          />

          {/* Slide-out Panel */}
          <div className="resume-version-drawer fixed inset-y-0 right-0 w-[540px] sm:w-[620px] bg-white border-l border-zinc-200 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out">
            
            {/* Drawer Header */}
            <div className="resume-version-drawer__header p-5 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-[#00bda5]" />
                  <h2 className="text-sm font-black text-zinc-900 truncate max-w-[380px]">
                    {sideDrawerResume.file_name}
                  </h2>
                </div>
                <p className="text-[11px] text-zinc-500 font-semibold">
                  Inspect version metrics, ATS scores & compare with active layout.
                </p>
              </div>

              <button
                onClick={() => setSideDrawerResume(null)}
                className="p-2 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900 rounded-xl transition border-none cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tab Switcher: All Versions vs Compare Mode */}
            <div className="resume-version-drawer__tabs flex items-center border-b border-zinc-200 bg-white px-5 shrink-0">
              <button
                onClick={() => setSideDrawerTab('versions')}
                className={`py-3 px-4 font-black text-xs border-b-2 transition cursor-pointer flex items-center gap-2 ${
                  sideDrawerTab === 'versions'
                    ? 'border-[#00bda5] text-[#00bda5]'
                    : 'border-transparent text-zinc-500 hover:text-zinc-900'
                }`}
              >
                <Layers size={14} />
                All Versions ({sideDrawerVersions.length})
              </button>
              <button
                onClick={() => setSideDrawerTab('compare')}
                className={`py-3 px-4 font-black text-xs border-b-2 transition cursor-pointer flex items-center gap-2 ${
                  sideDrawerTab === 'compare'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-zinc-500 hover:text-zinc-900'
                }`}
              >
                <GitCompare size={14} />
                Compare Metrics Mode
              </button>
            </div>

            {/* Drawer Body */}
            <div className="resume-version-drawer__body flex-1 overflow-y-auto p-5 space-y-4">
              
              {loadingSideDrawer ? (
                <div className="py-4 space-y-4">
                  <InlineAIThinking statusText="Loading saved version metrics..." />
                  <SkeletonCard numRows={2} />
                  <SkeletonCard numRows={2} />
                </div>
              ) : sideDrawerTab === 'versions' ? (

                /* TAB 1: ALL VERSIONS LIST WITH ATS & MATCH METRICS */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-zinc-500 font-bold pb-1">
                    <span>Select a version to set current or compare metrics</span>
                    <button
                      onClick={handleRefreshSideDrawerVersions}
                      className="text-[10px] text-zinc-400 hover:text-zinc-800 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={11} /> Refresh
                    </button>
                  </div>

                  {sideDrawerVersions.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 space-y-2 border border-dashed border-zinc-300 rounded-2xl">
                      <Layers size={28} className="mx-auto text-zinc-400" />
                      <p className="text-xs font-bold">No version history found.</p>
                    </div>
                  ) : (
                    sideDrawerVersions.map(ver => {
                      const isCurrentVer = !!ver.is_current;
                      const isOriginal = ver.version_type === 'original';

                      return (
                        <div
                          key={ver.id}
                          className={`resume-version-card p-4 rounded-2xl border transition-all ${
                            isCurrentVer
                              ? 'bg-indigo-50/70 border-indigo-200 shadow-xs'
                              : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-2xs'
                          }`}
                        >
                          {/* Top Row: Name, Version #, Badges */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] font-black px-2 py-0.5 bg-zinc-100 rounded text-zinc-700">
                                  v{ver.version_number}
                                </span>
                                <h4 className="text-xs font-extrabold text-zinc-900">
                                  {ver.version_name}
                                </h4>
                                {isCurrentVer && (
                                  <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-full text-[9px] font-black uppercase tracking-wider">
                                    Current
                                  </span>
                                )}
                                {isOriginal && (
                                  <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 border border-zinc-200">
                                    <Shield size={10} /> Original
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-zinc-500 font-medium">
                                Created on {formatDate(ver.created_at)} · Type: {ver.version_type || 'tailored'}
                              </p>
                            </div>

                            {/* Metrics Badges */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {getAtsScoreBadge(ver.ats_score)}
                              {getMatchScoreBadge(ver.resume_match_score)}
                            </div>
                          </div>

                          {/* Divider */}
                          <div className="my-3 border-t border-zinc-200/80" />

                          {/* Action Toolbar */}
                          <div className="flex items-center justify-between pt-0.5">
                            <div className="flex items-center gap-2">
                              {!isCurrentVer && (
                                <button
                                  onClick={() => handleSetCurrentVersion(sideDrawerResume.id, ver.id)}
                                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs rounded-xl transition cursor-pointer border-none shadow-2xs"
                                >
                                  Set as Current
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setTargetCompareVersionId(ver.id);
                                  setSideDrawerTab('compare');
                                }}
                                className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs rounded-xl transition cursor-pointer border border-zinc-200 flex items-center gap-1"
                              >
                                <GitCompare size={12} className="text-indigo-600" /> Compare Metrics
                              </button>
                              <button
                                onClick={() => setPreviewResume({ ...sideDrawerResume, parsed_content: ver.content || sideDrawerResume.parsed_content })}
                                className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl transition cursor-pointer border border-zinc-200 flex items-center gap-1"
                              >
                                <Eye size={12} /> Preview
                              </button>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setRenamingVersion(ver);
                                  setVersionRenameValue(ver.version_name || '');
                                }}
                                className="p-1.5 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900 rounded-lg transition border-none cursor-pointer"
                                title="Rename Version"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDuplicateVersion(sideDrawerResume.id, ver.id)}
                                className="p-1.5 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-900 rounded-lg transition border-none cursor-pointer"
                                title="Duplicate Version"
                              >
                                <Copy size={13} />
                              </button>
                              <button
                                onClick={() => handleRestoreVersion(sideDrawerResume.id, ver.id)}
                                className="p-1.5 hover:bg-zinc-200 text-zinc-500 hover:text-amber-700 rounded-lg transition border-none cursor-pointer"
                                title="Restore Content from Version"
                              >
                                <RotateCcw size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteVersion(sideDrawerResume.id, ver.id, ver.version_type)}
                                disabled={isOriginal}
                                className={`p-1.5 rounded-lg transition border-none cursor-pointer ${
                                  isOriginal
                                    ? 'opacity-30 cursor-not-allowed text-zinc-400'
                                    : 'hover:bg-rose-100 text-zinc-500 hover:text-rose-700'
                                }`}
                                title={isOriginal ? "Protected: Cannot delete original version" : "Delete Version"}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                        </div>
                      );
                    })
                  )}
                </div>

              ) : (

                /* TAB 2: COMPARE MODE (CURRENT VERSION VS TARGET VERSION) */
                <div className="space-y-4">
                  
                  {/* Selector controls */}
                  <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-2xl space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-zinc-700 flex items-center gap-1.5">
                      <GitCompare size={14} className="text-indigo-600" /> Version Comparison Setup
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Base (Current):</span>
                        <div className="p-2.5 bg-white border border-zinc-300 rounded-xl font-extrabold text-zinc-900 truncate">
                          {sideDrawerVersions.find(v => v.is_current)?.version_name || 'v1 Original'}
                        </div>
                      </div>
                      <div>
                        <span className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Target Version to Compare:</span>
                        <select
                          value={targetCompareVersionId}
                          onChange={(e) => setTargetCompareVersionId(e.target.value)}
                          className="w-full p-2.5 bg-white border border-zinc-300 rounded-xl font-bold text-zinc-900 focus:outline-none focus:border-indigo-600 cursor-pointer"
                        >
                          <option value="">Select a version...</option>
                          {sideDrawerVersions.map(v => (
                            <option key={v.id} value={v.id}>
                              v{v.version_number} - {v.version_name} {v.is_current ? '(Current)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Comparison Results Card */}
                  {loadingCompare ? (
                    <div className="py-4 space-y-4">
                      <InlineAIThinking 
                        stages={[
                          "Analyzing version diffs...",
                          "Computing score improvements...",
                          "Finalizing comparison metrics..."
                        ]} 
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <SkeletonCard numRows={2} />
                        <SkeletonCard numRows={2} />
                      </div>
                    </div>
                  ) : compareResult ? (
                    <div className="space-y-4 animate-fade-in">
                      
                      {/* Metric Diffs Comparison Cards */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-2xl space-y-1 text-center">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">ATS Score Impact</span>
                          <div className="text-xl font-black text-emerald-900">
                            {compareResult.score_diffs?.ats_score?.diff !== null && compareResult.score_diffs?.ats_score?.diff !== undefined
                              ? `${compareResult.score_diffs.ats_score.diff >= 0 ? '+' : ''}${Math.round(compareResult.score_diffs.ats_score.diff)}%`
                              : 'No score diff'}
                          </div>
                          <p className="text-[10px] text-emerald-700 font-semibold">
                            Base: {compareResult.version_a?.ats_score ? `${Math.round(compareResult.version_a.ats_score)}%` : 'N/A'} → Target: {compareResult.version_b?.ats_score ? `${Math.round(compareResult.version_b.ats_score)}%` : 'N/A'}
                          </p>
                        </div>

                        <div className="bg-indigo-50/70 border border-indigo-200 p-4 rounded-2xl space-y-1 text-center">
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-800">Job Match Impact</span>
                          <div className="text-xl font-black text-indigo-900">
                            {compareResult.score_diffs?.resume_match_score?.diff !== null && compareResult.score_diffs?.resume_match_score?.diff !== undefined
                              ? `${compareResult.score_diffs.resume_match_score.diff >= 0 ? '+' : ''}${Math.round(compareResult.score_diffs.resume_match_score.diff)}%`
                              : 'No match diff'}
                          </div>
                          <p className="text-[10px] text-indigo-700 font-semibold">
                            Base: {compareResult.version_a?.resume_match_score ? `${Math.round(compareResult.version_a.resume_match_score)}%` : 'N/A'} → Target: {compareResult.version_b?.resume_match_score ? `${Math.round(compareResult.version_b.resume_match_score)}%` : 'N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Summary card */}
                      <div className="bg-white border border-zinc-200 p-4 rounded-2xl space-y-2 shadow-2xs">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Tailoring Change Summary</span>
                        <p className="text-xs font-bold text-zinc-800 leading-relaxed">
                          {compareResult.summary || "No significant content differences detected."}
                        </p>
                      </div>

                      {/* Added Skills */}
                      {compareResult.added_skills && compareResult.added_skills.length > 0 && (
                        <div className="bg-white border border-zinc-200 p-4 rounded-2xl space-y-2 shadow-2xs">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                            + Newly Added Skills ({compareResult.added_skills.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {compareResult.added_skills.map((skill, idx) => (
                              <span key={idx} className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-extrabold rounded-lg border border-emerald-300">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tailored Experience Bullet Highlights */}
                      {compareResult.added_bullets && compareResult.added_bullets.length > 0 && (
                        <div className="bg-white border border-zinc-200 p-4 rounded-2xl space-y-2 shadow-2xs">
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700">
                            Tailored Experience Highlights
                          </span>
                          <ul className="space-y-1.5 text-xs text-zinc-700 pl-4 list-disc font-medium">
                            {compareResult.added_bullets.map((b, idx) => (
                              <li key={idx} className="leading-relaxed">{b}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* CTA to set this compared target version as Current */}
                      <div className="pt-2">
                        <button
                          onClick={() => handleSetCurrentVersion(sideDrawerResume.id, targetCompareVersionId)}
                          className="w-full py-3 bg-[#00bda5] text-white font-black text-xs uppercase tracking-wider rounded-xl hover:bg-[#00a894] transition cursor-pointer shadow-md shadow-[#00bda5]/20 flex items-center justify-center gap-2"
                        >
                          <Check size={16} /> Set Target Version (v{sideDrawerVersions.find(v => v.id === targetCompareVersionId)?.version_number}) as Current
                        </button>
                      </div>

                    </div>
                  ) : (
                    <div className="py-12 text-center text-zinc-500 text-xs font-bold border border-dashed border-zinc-300 rounded-2xl">
                      Select a target version above to run real-time metric comparison.
                    </div>
                  )}

                </div>

              )}

            </div>

          </div>
        </>
      )}

      {/* RENAME RESUME MODAL */}
      {renamingResume && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-zinc-900">Rename Resume</h3>
              <button onClick={() => setRenamingResume(null)} className="text-zinc-400 hover:text-zinc-700">
                <X size={16} />
              </button>
            </div>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Resume Name"
              className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900 focus:outline-none focus:border-[#00bda5] font-semibold"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRenamingResume(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRenameResume}
                className="px-4 py-2 bg-[#00bda5] text-white font-extrabold text-xs rounded-xl hover:bg-[#00a894]"
              >
                Save Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENAME VERSION MODAL */}
      {renamingVersion && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-zinc-900">Rename Version</h3>
              <button onClick={() => setRenamingVersion(null)} className="text-zinc-400 hover:text-zinc-700">
                <X size={16} />
              </button>
            </div>
            <input
              type="text"
              value={versionRenameValue}
              onChange={(e) => setVersionRenameValue(e.target.value)}
              placeholder="Version Name"
              className="w-full px-3.5 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900 focus:outline-none focus:border-indigo-600 font-semibold"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRenamingVersion(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRenameVersion}
                className="px-4 py-2 bg-indigo-600 text-white font-extrabold text-xs rounded-xl hover:bg-indigo-700"
              >
                Save Version Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL RESUME PREVIEW MODAL */}
      {previewResume && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex flex-col p-4 sm:p-6 overflow-hidden">
          <div className="bg-white border border-zinc-200 p-4 rounded-t-2xl flex items-center justify-between shrink-0 text-zinc-900 shadow-sm">
            <div className="flex items-center gap-3">
              <FileText size={18} className="text-[#00bda5]" />
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider">{previewResume.file_name}</h3>
                <span className="text-[10px] text-zinc-500 font-semibold">
                  {previewResume._storedFilePreview ? 'Original stored resume' : 'Saved version preview'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setPreviewResume(null)}
              className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 hover:text-zinc-900 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 bg-zinc-100 border-x border-b border-zinc-200 rounded-b-2xl overflow-hidden flex justify-center items-stretch">
            {previewResume._storedFilePreview ? (
              storedPreviewUrls[previewResume.id] ? (
                <iframe
                  src={`${storedPreviewUrls[previewResume.id]}#toolbar=1&navpanes=0&view=FitH`}
                  title={`Stored resume: ${previewResume.file_name || 'Resume'}`}
                  className="w-full h-full border-0 bg-white"
                />
              ) : storedPreviewErrors[previewResume.id] ? (
                <div className="m-auto text-sm font-semibold text-rose-600">
                  {storedPreviewErrors[previewResume.id]}
                </div>
              ) : (
                <div className="m-auto flex items-center gap-2 text-sm font-semibold text-zinc-500">
                  <RefreshCw size={16} className="animate-spin" /> Opening stored resume…
                </div>
              )
            ) : (
              <div className="overflow-y-auto p-6 w-full flex justify-center items-start">
                <div className="w-[816px] min-h-[1056px] bg-white shadow-2xl rounded-sm p-8 text-zinc-900">
                  <TailorRender
                    resume={previewResume.parsed_content || previewResume}
                    templateName="ExecutiveATS"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      </div>
    </ResumeDropzoneOverlay>
  );
}
