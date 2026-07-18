import React, { useState, useEffect } from 'react';
import { 
  Briefcase, Search, Trash2, Clock, 
  MapPin, Send, BrainCircuit, ExternalLink, Lightbulb, Bell, FileText,
  X, Zap, CheckCircle2, AlertCircle, Building, Sparkles, ArrowRight, CheckCircle,
  ClipboardCheck, Eye, Calendar, FileEdit, ShieldCheck, Check, DollarSign, User, Link, Plus, Archive
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';

const WORKFLOW_STAGES = [
  { id: 'Ready To Apply', label: 'Ready To Apply', color: '#71717a' },
  { id: 'Applied', label: 'Applied', color: '#3b82f6' },
  { id: 'Assessment', label: 'Assessment', color: '#8b5cf6' },
  { id: 'Recruiter', label: 'Recruiter Contact', color: '#ec4899' },
  { id: 'Interview', label: 'Interview', color: '#f59e0b' },
  { id: 'Final Round', label: 'Final Round', color: '#06b6d4' },
  { id: 'Offer', label: 'Offer Received', color: '#10b981' }
];

const TERMINAL_STAGES = [
  { id: 'Accepted', label: 'Accepted', color: '#059669' },
  { id: 'Rejected', label: 'Rejected', color: '#ef4444' },
  { id: 'Archived', label: 'Archived', color: '#64748b' }
];

const STAGE_ORDER = {
  'Ready To Apply': 1,
  'Applied': 2,
  'Assessment': 3,
  'Recruiter': 4,
  'Interview': 5,
  'Final Round': 6,
  'Offer': 7,
  'Accepted': 8,
  'Rejected': 8,
  'Archived': 8
};

// Error Boundary wrapper to print exact crash logs on screen
class JobTrackerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("JobTrackerErrorBoundary caught an error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50 dark:bg-zinc-950 text-center font-sans min-h-[500px]">
          <AlertCircle className="w-12 h-12 text-rose-500 mb-4 animate-bounce" />
          <h2 className="text-base font-black uppercase text-zinc-950 dark:text-zinc-50 tracking-wider">
            Job Tracker Crash Intercepted
          </h2>
          <p className="text-xs text-zinc-550 max-w-md mt-2 font-semibold">
            {this.state.error?.toString() || "An unexpected rendering crash occurred."}
          </p>
          <pre className="text-[10px] text-rose-600 bg-rose-50 dark:bg-rose-955/20 border border-rose-200 dark:border-rose-955/40 p-4 rounded-xl max-w-lg overflow-x-auto mt-4 text-left max-h-[200px] w-full font-mono">
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer border-none"
          >
            Reload Window
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function JobTrackerContent() {
  const { session, applications: rawApps, updateApplicationStage, fetchApplications, apiUrl, darkMode } = useApp();
  const applications = rawApps || [];
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('All'); 
  const [sortBy, setSortBy] = useState('last_activity'); 
  const [loading, setLoading] = useState(true);

  // Modal Workspace Tab
  const [workspaceTab, setWorkspaceTab] = useState('Workflow'); // 'Workflow' | 'Overview' | 'Timeline' | 'Documents' | 'Recruiter' | 'Notes' | 'History'

  // Drag and drop states
  const [draggingAppId, setDraggingAppId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);

  // Stage Specific Popups
  const [activeStageEditPopup, setActiveStageEditPopup] = useState(null); // stageId
  const [popupFields, setPopupFields] = useState({});

  // Notes and logs edit states
  const [editNotes, setEditNotes] = useState('');
  const [editRecruiterNotes, setEditRecruiterNotes] = useState('');
  const [editInterviewNotes, setEditInterviewNotes] = useState('');
  const [editSalaryNotes, setEditSalaryNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // AI follow-up emails
  const [followUpEmail, setFollowUpEmail] = useState('');
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchApplications();
      setLoading(false);
    };
    loadData();
  }, []);

  const selectedApp = applications.find(a => a && a.id === selectedAppId);

  useEffect(() => {
    if (selectedApp) {
      setEditNotes(selectedApp.notes || '');
      setEditRecruiterNotes(selectedApp.recruiter_notes || '');
      setEditInterviewNotes(selectedApp.interview_notes || '');
      setEditSalaryNotes(selectedApp.salary_expectations || '');
      setFollowUpEmail('');
      setActiveStageEditPopup(null);
    }
  }, [selectedApp]);

  // Load stage metadata
  const getStageMetadata = (app, stageId) => {
    if (!app || !app.timeline) return {};
    const record = app.timeline.find(e => e && e.event === `Stage Metadata: ${stageId}`);
    if (!record || !record.notes) return {};
    try {
      return JSON.parse(record.notes);
    } catch (e) {
      return {};
    }
  };

  const handleOpenStagePopup = (stageId) => {
    if (!selectedApp) return;
    const existing = getStageMetadata(selectedApp, stageId);
    setPopupFields(existing);
    setActiveStageEditPopup(stageId);
  };

  const handleSaveStageMetadata = async (stageId) => {
    if (!selectedApp) return;
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token) return;

      let updatedTimeline = (selectedApp.timeline || []).filter(e => 
        e && e.event !== `Stage Metadata: ${stageId}`
      );

      updatedTimeline.push({
        event: `Stage Metadata: ${stageId}`,
        label: `${stageId} Options Logged`,
        timestamp: new Date().toISOString(),
        notes: JSON.stringify(popupFields)
      });

      const res = await fetch(`${apiUrl}/api/v1/applications/${selectedApp.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          timeline: updatedTimeline
        })
      });

      if (res.ok) {
        await fetchApplications();
        setActiveStageEditPopup(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatSafeDate = (dateVal, showTime = false) => {
    if (!dateVal) return 'Recent';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Recent';
    return showTime ? d.toLocaleString() : d.toLocaleDateString();
  };

  const calculateDuration = (createdDate) => {
    if (!createdDate) return '1 day';
    const created = new Date(createdDate);
    const now = new Date();
    const diffTime = Math.abs(now - created);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
  };

  // Drag and drop HTML5 handlers
  const handleDragStart = (e, appId) => {
    setDraggingAppId(appId);
    e.dataTransfer.setData('text/plain', appId);
  };

  const handleDragEnd = () => {
    setDraggingAppId(null);
    setDragOverStage(null);
  };

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    if (draggingAppId) {
      const app = applications.find(a => a && a.id === draggingAppId);
      const currentOrder = STAGE_ORDER[app?.current_stage] || 0;
      const targetOrder = STAGE_ORDER[stageId] || 0;
      if (targetOrder > currentOrder) {
        setDragOverStage(stageId);
      } else {
        e.dataTransfer.dropEffect = 'none';
      }
    } else {
      setDragOverStage(stageId);
    }
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  const handleDrop = async (e, stageId) => {
    e.preventDefault();
    const appId = e.dataTransfer.getData('text/plain') || draggingAppId;
    if (appId && stageId) {
      const app = applications.find(a => a && a.id === appId);
      const currentOrder = STAGE_ORDER[app?.current_stage] || 0;
      const targetOrder = STAGE_ORDER[stageId] || 0;
      if (targetOrder > currentOrder) {
        await updateApplicationStage(appId, stageId);
      } else {
        alert("Workflow constraint: Applications in a Directed Acyclic Graph (DAG) can only move forward, not backward.");
      }
    }
    setDraggingAppId(null);
    setDragOverStage(null);
  };

  const handleSaveNotes = async () => {
    if (!selectedApp) return;
    setIsSavingNotes(true);
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token) return;

      const res = await fetch(`${apiUrl}/api/v1/applications/${selectedApp.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          notes: editNotes,
          recruiter_notes: editRecruiterNotes,
          interview_notes: editInterviewNotes,
          salary_expectations: editSalaryNotes
        })
      });
      if (res.ok) {
        await fetchApplications();
        alert("Workspace notes successfully updated in Supabase!");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleGenerateFollowUp = () => {
    if (!selectedApp) return;
    setIsGeneratingEmail(true);
    setTimeout(() => {
      const email = `Subject: Quick Follow-up - ${selectedApp.job_title} at ${selectedApp.company_name}

Dear Hiring Team,

I hope this note finds you well.

I am checking in regarding the status of the ${selectedApp.job_title} application I submitted recently. Having tailored my qualifications directly to your needs, I remains highly interested in joining the team.

Best regards,
[Your Name]`;
      setFollowUpEmail(email);
      setIsGeneratingEmail(false);
    }, 900);
  };

  const handleDeleteApp = async (appId) => {
    if (!confirm("Delete this tracked application permanently?")) return;
    try {
      const token = session?.access_token || localStorage.getItem('access_token');
      if (!token) return;
      
      const res = await fetch(`${apiUrl}/api/v1/applications/${appId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setSelectedAppId(null);
        await fetchApplications();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Directory left list filters
  const filteredApps = applications.filter(app => {
    if (!app) return false;
    const title = (app.job_title || '').toLowerCase();
    const company = (app.company_name || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    const matchesSearch = title.includes(query) || company.includes(query);

    if (!matchesSearch) return false;

    if (filterTab === 'Active') {
      return !['Accepted', 'Rejected', 'Archived'].includes(app.current_stage);
    }
    if (filterTab === 'Interviewing') {
      return ['Interview', 'Final Round'].includes(app.current_stage);
    }
    if (filterTab === 'Offers') {
      return app.current_stage === 'Offer';
    }
    if (filterTab === 'Closed') {
      return ['Accepted', 'Rejected', 'Archived'].includes(app.current_stage);
    }
    return true;
  });

  const sortedApps = [...filteredApps].sort((a, b) => {
    if (sortBy === 'ats_score') {
      return (b.ats_score || 0) - (a.ats_score || 0);
    }
    return new Date(b.last_activity) - new Date(a.last_activity);
  });

  const renderLogo = (name) => {
    const letters = name ? name.substring(0, 2).toUpperCase() : 'AF';
    const bgColors = [
      'bg-indigo-650 text-indigo-50',
      'bg-emerald-600 text-emerald-50',
      'bg-amber-600 text-amber-50',
      'bg-blue-600 text-blue-50',
      'bg-purple-600 text-purple-50',
      'bg-pink-600 text-pink-50',
      'bg-rose-600 text-rose-50'
    ];
    const index = name ? name.charCodeAt(0) % bgColors.length : 0;
    return (
      <div className={`w-9 h-9 rounded-xl ${bgColors[index]} font-black text-[11px] flex items-center justify-center shadow-xs shrink-0 select-none`}>
        {letters}
      </div>
    );
  };

  const renderStageBox = (stage) => {
    const isOccupied = selectedApp?.current_stage === stage.id;
    const isOver = dragOverStage === stage.id;
    const isCompletedLinear = selectedApp && STAGE_ORDER[selectedApp.current_stage] > STAGE_ORDER[stage.id];
    
    const showAsCompleted = isCompletedLinear || (isOccupied && stage.id === 'Accepted');
    const showAsRejected = isOccupied && stage.id === 'Rejected';
    const showAsArchived = isOccupied && stage.id === 'Archived';

    return (
      <div
        key={stage.id}
        onDragOver={(e) => handleDragOver(e, stage.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, stage.id)}
        onClick={() => handleOpenStagePopup(stage.id)}
        className={`w-[170px] shrink-0 p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer relative ${
          showAsCompleted && isOccupied ? 'border-emerald-500 shadow-xs bg-emerald-500/5' :
          showAsRejected ? 'border-rose-500 shadow-xs bg-rose-500/5' :
          showAsArchived ? 'border-zinc-500 shadow-xs bg-zinc-500/5' :
          isOccupied 
            ? 'border-[#00bda5] shadow-xs bg-white dark:bg-zinc-900/40' 
            : isCompletedLinear
            ? 'border-emerald-500/35 bg-emerald-500/5 dark:bg-emerald-950/10'
            : 'border-zinc-200 dark:border-zinc-900 hover:border-zinc-350 dark:hover:border-zinc-800 bg-white dark:bg-zinc-900/40'
        } ${isOver ? 'ring-2 ring-[#00bda5] border-transparent bg-emerald-500/5' : ''}`}
      >
        <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-zinc-150 dark:border-zinc-900/60 select-none">
          <div className="flex items-center gap-1.5 min-w-0 w-full justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              {showAsCompleted ? (
                <Check className="w-3 h-3 text-emerald-500 shrink-0 stroke-[3.5]" />
              ) : showAsRejected ? (
                <X className="w-3 h-3 text-rose-500 shrink-0 stroke-[3.5]" />
              ) : showAsArchived ? (
                <Archive className="w-3 h-3 text-zinc-500 shrink-0 stroke-[3.5]" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
              )}
              <span className={`text-[8.5px] font-black uppercase tracking-wider truncate ${
                showAsCompleted ? 'text-emerald-600 dark:text-emerald-500' :
                showAsRejected ? 'text-rose-600 dark:text-rose-500' :
                showAsArchived ? 'text-zinc-600 dark:text-zinc-400' :
                'text-zinc-955 dark:text-zinc-50'
              }`}>
                {stage.label}
              </span>
            </div>
            {showAsCompleted && (
              <span className="text-[7.5px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest leading-none bg-emerald-500/10 dark:bg-emerald-500/20 px-1 py-0.5 rounded shrink-0">
                {isOccupied ? 'Won' : 'Done'}
              </span>
            )}
            {showAsRejected && (
              <span className="text-[7.5px] font-black text-rose-600 dark:text-rose-500 uppercase tracking-widest leading-none bg-rose-500/10 dark:bg-rose-500/20 px-1 py-0.5 rounded shrink-0">
                Closed
              </span>
            )}
            {showAsArchived && (
              <span className="text-[7.5px] font-black text-zinc-600 dark:text-zinc-400 uppercase tracking-widest leading-none bg-zinc-500/10 dark:bg-zinc-500/20 px-1 py-0.5 rounded shrink-0">
                Closed
              </span>
            )}
          </div>
        </div>

        {/* Active application card occupant */}
        {isOccupied ? (
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, selectedApp?.id)}
            onDragEnd={handleDragEnd}
            onClick={(e) => e.stopPropagation()}
            className="p-2.5 bg-zinc-55/40 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-855 rounded-xl select-none space-y-1.5 cursor-grab active:cursor-grabbing hover:shadow-3xs transition-all relative z-10 text-zinc-800 dark:text-zinc-200"
          >
            <h5 className="text-[10px] font-black text-zinc-955 dark:text-zinc-50 leading-tight truncate">
              {selectedApp?.job_title}
            </h5>
            <p className="text-[8.5px] text-zinc-505 font-bold truncate leading-none">
              {selectedApp?.company_name}
            </p>
            
            <div className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800/40 flex justify-between items-center text-[7.5px] text-zinc-400 font-bold">
              <span>ATS {Math.round(selectedApp?.ats_score || 85)}%</span>
              <span>{calculateDuration(selectedApp?.created_at)}</span>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-zinc-200 dark:border-zinc-850 rounded-xl py-4 flex items-center justify-center select-none bg-zinc-55/10 dark:bg-zinc-900/10">
            <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest leading-none">
              Drop Here
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex gap-6 min-h-0 bg-white dark:bg-zinc-955 text-zinc-800 dark:text-zinc-200 select-none">
      
      {/* LEFT PANEL: minimal searchable applications browser */}
      <div className="w-[30%] min-w-[300px] max-w-[330px] flex flex-col h-full border-r border-zinc-200 dark:border-zinc-900 pr-6 shrink-0 min-h-0 select-none">
        
        <div className="border-b border-zinc-200 dark:border-zinc-900 pb-4 mb-4 shrink-0">
          <h1 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-55 flex items-center gap-2">
            <Briefcase size={18} className="text-[#00bda5]" /> Job Tracker
          </h1>
          <p className="text-[9px] text-zinc-455 font-bold uppercase tracking-widest mt-0.5">
            Lightweight Directory Browser
          </p>
        </div>

        <div className="relative mb-3 shrink-0">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search applications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs font-semibold pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-900 rounded-xl focus:outline-hidden focus:border-[#00bda5]"
          />
        </div>

        <div className="flex flex-wrap gap-1 mb-3 shrink-0 select-none">
          {['All', 'Active', 'Interviewing', 'Offers', 'Closed'].map(tab => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`px-2.5 py-1.5 rounded-lg text-[8.5px] font-black uppercase tracking-wider transition cursor-pointer border-none ${
                filterTab === tab
                  ? 'bg-[#00bda5]/10 text-[#00bda5]'
                  : 'text-zinc-455 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-transparent'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex justify-between items-center text-[8.5px] font-black text-zinc-455 uppercase tracking-widest mb-3 shrink-0">
          <span>Directory ({sortedApps.length})</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-transparent text-[8.5px] font-black uppercase border-none text-[#00bda5] cursor-pointer focus:outline-hidden"
          >
            <option value="last_activity" className="bg-white dark:bg-zinc-950">Activity</option>
            <option value="ats_score" className="bg-white dark:bg-zinc-950">ATS Score</option>
          </select>
        </div>

        {/* Listing cards list */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1.5 custom-scrollbar pb-6 min-h-0">
          {sortedApps.length > 0 ? (
            sortedApps.map(app => {
              if (!app) return null;
              const isSelected = selectedAppId === app.id;
              return (
                <div
                  key={app.id}
                  onClick={() => setSelectedAppId(app.id)}
                  className={`p-4 bg-white dark:bg-zinc-900/40 border rounded-2xl cursor-pointer hover:border-zinc-350 dark:hover:border-zinc-800 transition relative flex gap-3.5 ${
                    isSelected 
                      ? 'ring-2 ring-[#00bda5] border-transparent bg-emerald-500/5 dark:bg-emerald-950/10 shadow-sm' 
                      : 'border-zinc-200 dark:border-zinc-900 shadow-3xs'
                  }`}
                >
                  {renderLogo(app.company_name)}
                  <div className="min-w-0 flex-1 space-y-1">
                    <h4 className="text-[11.5px] font-black text-zinc-955 dark:text-zinc-55 truncate leading-tight">
                      {app.job_title}
                    </h4>
                    <p className="text-[10px] text-zinc-505 dark:text-zinc-455 font-bold truncate">
                      {app.company_name}
                    </p>

                    <div className="flex justify-between items-center text-[8px] text-zinc-400 font-black uppercase pt-2 mt-2 border-t border-zinc-100 dark:border-zinc-900/50">
                      <span className="text-[#00bda5] font-black">
                        {app.current_stage}
                      </span>
                      <span>ATS {Math.round(app.ats_score || 85)}%</span>
                    </div>

                    <div className="text-[7.5px] text-zinc-400 font-bold flex justify-between uppercase mt-0.5">
                      <span>Res: {app.resume_version || 'v1'}</span>
                      <span>Applied: {formatSafeDate(app.created_at)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="h-44 border border-dashed border-zinc-200 dark:border-zinc-900 rounded-2xl flex flex-col items-center justify-center p-4 text-center">
              <AlertCircle size={20} className="text-zinc-400 mb-2" />
              <p className="text-[10px] text-zinc-455 font-black uppercase tracking-wider leading-relaxed">
                No tracked applications found.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Placeholder layout */}
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-zinc-50/10 dark:bg-zinc-900/10 rounded-3xl border border-dashed border-zinc-200 dark:border-zinc-900 self-stretch my-1 select-none">
        <Building size={32} className="text-zinc-350 dark:text-zinc-800 mb-2.5 animate-pulse" />
        <h3 className="text-xs font-black uppercase text-zinc-955 dark:text-zinc-200 tracking-wider">
          Launch Orchestration Pipeline
        </h3>
        <p className="text-[10px] text-zinc-455 font-bold max-w-sm mt-1 uppercase tracking-wider leading-relaxed">
          Click on any application card in the left list directory to open the large centered modal and visualize the Databricks/Airflow hiring pipeline.
        </p>
      </div>

      {/* LARGE APPLICATION WORKSPACE MODAL (90vw x 90vh) */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs select-text animate-fadeIn p-4 sm:p-6">
          
          {/* Backdrop Close intercept */}
          <div className="absolute inset-0 z-0" onClick={() => setSelectedAppId(null)} />

          <div className="w-[94vw] h-[92vh] bg-white dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-900 rounded-3xl shadow-2xl flex flex-col overflow-hidden relative z-10 animate-scaleUp">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-900 flex justify-between items-start shrink-0 select-none bg-zinc-50/20 dark:bg-zinc-950/20">
              <div className="flex gap-4 items-start min-w-0">
                {renderLogo(selectedApp?.company_name)}
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] bg-[#00bda5]/10 text-[#00bda5] px-2 py-0.5 rounded font-black uppercase tracking-wider border border-[#00bda5]/20">
                      {selectedApp?.current_stage}
                    </span>
                    <span className="text-[9px] bg-zinc-150/40 dark:bg-zinc-900 text-zinc-550 px-2 py-0.5 rounded font-black uppercase border border-zinc-200/50 dark:border-zinc-800">
                      ATS {Math.round(selectedApp?.ats_score || 85)}%
                    </span>
                    <span className="text-[9px] bg-zinc-150/40 dark:bg-zinc-900 text-zinc-550 px-2 py-0.5 rounded font-black uppercase border border-zinc-200/50 dark:border-zinc-800">
                      Res: {selectedApp?.resume_version || 'v1'}
                    </span>
                    {selectedApp?.location && (
                      <span className="text-[9px] text-zinc-455 font-bold flex items-center gap-1">
                        <MapPin size={11} className="text-zinc-400" /> {selectedApp?.location}
                      </span>
                    )}
                  </div>
                  <h2 className="text-base sm:text-lg font-black text-zinc-955 dark:text-zinc-55 leading-tight truncate">
                    {selectedApp?.job_title}
                  </h2>
                  <p className="text-xs font-bold text-zinc-550 flex items-center gap-1.5 mt-0.5">
                    <Building size={13} /> {selectedApp?.company_name} • Applied {formatSafeDate(selectedApp?.created_at)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 select-none">
                {selectedApp?.job_url && (
                  <a
                    href={selectedApp?.job_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 border border-zinc-200 dark:border-zinc-900 hover:border-zinc-350 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-650 dark:text-zinc-400 font-extrabold text-[9px] uppercase tracking-wider rounded-xl transition flex items-center gap-1 cursor-pointer select-none bg-white dark:bg-transparent"
                  >
                    View Source <ExternalLink size={11} />
                  </a>
                )}
                <button
                  onClick={() => handleDeleteApp(selectedApp?.id)}
                  className="p-2 border border-rose-200 dark:border-rose-955/40 hover:bg-rose-50 dark:hover:bg-rose-955/20 text-rose-600 rounded-xl transition cursor-pointer bg-white dark:bg-transparent"
                >
                  <Trash2 size={15} />
                </button>
                <button
                  onClick={() => setSelectedAppId(null)}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl text-zinc-400 hover:text-zinc-700 transition cursor-pointer border-none bg-transparent"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal horizontal tabs */}
            <div className="flex px-6 border-b border-zinc-200 dark:border-zinc-900 shrink-0 select-none bg-zinc-50/50 dark:bg-zinc-900/10">
              {['Workflow', 'Overview', 'Timeline', 'Documents', 'Recruiter', 'Notes', 'History'].map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    setWorkspaceTab(tab);
                    setActiveStageEditPopup(null);
                  }}
                  className={`px-4 py-3 text-[10px] font-black uppercase tracking-wider transition-all border-b-2 border-transparent cursor-pointer bg-transparent ${
                    workspaceTab === tab
                      ? 'border-[#00bda5] text-[#00bda5]'
                      : 'text-zinc-455 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Modal tab content */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-zinc-50/10 dark:bg-zinc-950/10 custom-scrollbar select-text">
              
              {/* TAB 1: WORKFLOW STAGE PIPELINE */}
              {workspaceTab === 'Workflow' && (
                <div className="w-full h-full flex items-center justify-start py-12 px-6 overflow-x-auto custom-scrollbar select-none animate-fadeIn">
                  
                  {/* Primary flow layout */}
                  <div className="flex items-center shrink-0">
                    {WORKFLOW_STAGES.map((stage, idx) => (
                      <div className="flex items-center" key={stage.id}>
                        {renderStageBox(stage)}
                        
                        {/* Horizontal Connector Line */}
                        {idx < WORKFLOW_STAGES.length - 1 && (
                          <div className="w-8 h-0.5 bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Branching vertical line on the right of Offer stage */}
                  <div className="flex items-center shrink-0 select-none">
                    {/* Horizontal link coming out of Offer Received */}
                    <div className="w-8 h-0.5 bg-zinc-200 dark:bg-zinc-800 shrink-0" />
                    
                    {/* Vertical branching track bar of height 300px for better spacing */}
                    <div className="w-0.5 h-[300px] bg-zinc-200 dark:bg-zinc-800 relative shrink-0">
                      {/* Top outlet branch line to Accepted */}
                      <div className="absolute left-0 top-0 w-8 h-0.5 bg-zinc-200 dark:bg-zinc-800" />
                      {/* Middle outlet branch line to Rejected */}
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-8 h-0.5 bg-zinc-200 dark:bg-zinc-800" />
                      {/* Bottom outlet branch line to Archived */}
                      <div className="absolute left-0 bottom-0 w-8 h-0.5 bg-zinc-200 dark:bg-zinc-800" />
                    </div>
                  </div>

                  {/* Terminal outcome stages stacked vertically, matching outlets */}
                  <div className="flex flex-col justify-between h-[320px] ml-8 shrink-0 select-none">
                    {TERMINAL_STAGES.map((tStage) => renderStageBox(tStage))}
                  </div>

                </div>
              )}

              {/* TAB 2: OVERVIEW */}
              {workspaceTab === 'Overview' && (
                <div className="space-y-6 animate-fadeIn select-text">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-2xl bg-zinc-50/10 dark:bg-zinc-900/10 space-y-1">
                      <span className="text-[8.5px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block">Current Stage</span>
                      <span className="text-base font-black text-[#00bda5]">{selectedApp?.current_stage}</span>
                    </div>
                    <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-2xl bg-zinc-50/10 dark:bg-zinc-900/10 space-y-1">
                      <span className="text-[8.5px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block">ATS Rating Match</span>
                      <span className="text-base font-black text-[#00bda5]">{Math.round(selectedApp?.ats_score || 85)}%</span>
                    </div>
                    <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-2xl bg-zinc-50/10 dark:bg-zinc-900/10 space-y-1">
                      <span className="text-[8.5px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block">Last Activity Logged</span>
                      <span className="text-base font-black text-zinc-700 dark:text-zinc-300">
                        {formatSafeDate(selectedApp?.last_activity)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                    <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-2xl space-y-3">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-955 dark:text-zinc-55">General remarks</h4>
                      <p className="text-xs text-zinc-550 leading-relaxed font-semibold whitespace-pre-wrap">
                        {selectedApp?.notes || "No general remarks recorded yet. Update logs inside the 'Notes' tab."}
                      </p>
                    </div>

                    <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-2xl space-y-3">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-955 dark:text-zinc-55">Recruiter Details</h4>
                      <p className="text-xs text-zinc-550 leading-relaxed font-semibold whitespace-pre-wrap">
                        {selectedApp?.recruiter_notes || "No recruiter contact parameters logged. Update contact fields inside the 'Recruiter' tab."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: TIMELINE */}
              {workspaceTab === 'Timeline' && (
                <div className="space-y-4 animate-fadeIn select-text">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-955 dark:text-zinc-55 select-none pb-2 border-b border-zinc-150 dark:border-zinc-900">
                    Activity transitions history
                  </h4>

                  <div className="space-y-3 relative pl-6 border-l border-zinc-200 dark:border-zinc-900 py-1">
                    {selectedApp?.timeline && selectedApp?.timeline.length > 0 ? (
                      selectedApp?.timeline.map((event, idx) => (
                        <div key={idx} className="relative space-y-1">
                          <div className="absolute -left-[20px] top-1.5 w-1.5 h-1.5 rounded-full bg-[#00bda5] border border-white dark:border-zinc-955" />
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-zinc-955 dark:text-zinc-55">
                            <span>{event?.label || event?.event}</span>
                            <span className="text-zinc-400 font-bold text-[8.5px]">
                              {formatSafeDate(event?.timestamp, true)}
                            </span>
                          </div>
                          {event?.notes && (
                            <p className="text-[10.5px] text-zinc-555 italic leading-normal">
                              "{event?.notes}"
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-zinc-400 italic">No timeline entries found.</div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: DOCUMENTS */}
              {workspaceTab === 'Documents' && (
                <div className="space-y-5 animate-fadeIn select-none">
                  <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-2xl bg-zinc-50/10 dark:bg-zinc-900/10 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-955 dark:text-zinc-55 flex items-center gap-1.5">
                      <FileText size={13} className="text-[#00bda5]" /> Tailored Resume PDFs
                    </h4>
                    <div className="flex justify-between items-center bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800 rounded-xl p-3.5">
                      <div className="min-w-0">
                        <span className="text-[10px] font-black uppercase block text-zinc-955 dark:text-zinc-55">Tailored Resume PDF</span>
                        <span className="text-[8.5px] text-zinc-400 font-bold">Version: {selectedApp?.resume_version || 'v1'}</span>
                      </div>
                      <span className="text-[8px] bg-[#00bda5]/15 text-[#00bda5] px-1.5 py-0.5 rounded font-black uppercase">
                        Downloaded
                      </span>
                    </div>
                  </div>

                  {selectedApp?.cover_letter_version && (
                    <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-2xl bg-zinc-50/10 dark:bg-zinc-900/10 space-y-4 mt-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-955 dark:text-zinc-55 flex items-center gap-1.5">
                        <CheckCircle2 size={13} className="text-[#00bda5]" /> Cover Letter PDFs
                      </h4>
                      <div className="flex justify-between items-center bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800 rounded-xl p-3.5">
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase block text-zinc-955 dark:text-zinc-55">Generated Cover Letter PDF</span>
                          <span className="text-[8.5px] text-zinc-400 font-bold">Version: v1</span>
                        </div>
                        <span className="text-[8px] bg-[#00bda5]/15 text-[#00bda5] px-1.5 py-0.5 rounded font-black uppercase">
                          Generated
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: RECRUITER */}
              {workspaceTab === 'Recruiter' && (
                <div className="space-y-5 animate-fadeIn select-text">
                  <div className="flex justify-between items-center select-none pb-2 border-b border-zinc-150 dark:border-zinc-900">
                    <div>
                      <h4 className="text-[10px] font-black text-zinc-955 dark:text-zinc-55 uppercase tracking-widest">Recruiter / HR Contacts</h4>
                      <p className="text-[8px] text-zinc-400 font-bold uppercase mt-0.5">Editable details stored in Supabase</p>
                    </div>
                    <button
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes}
                      className="px-3.5 py-1.5 bg-[#00bda5] hover:bg-[#00a894] text-white font-extrabold text-[8.5px] uppercase tracking-wider rounded-lg transition border-none cursor-pointer shadow-xs"
                    >
                      {isSavingNotes ? "Saving..." : "Save details"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block flex items-center gap-1 select-none">
                        <User size={10} /> Recruiter Names, Emails, Links
                      </label>
                      <textarea
                        value={editRecruiterNotes}
                        onChange={(e) => setEditRecruiterNotes(e.target.value)}
                        placeholder="Recruiter contact name, email address, LinkedIn links..."
                        className="w-full text-xs p-3 bg-zinc-55/40 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-900 rounded-xl focus:outline-hidden focus:border-[#00bda5] font-semibold font-sans min-h-[110px]"
                      />
                    </div>

                    <div className="p-5 border border-zinc-200 dark:border-zinc-900 rounded-2xl bg-zinc-50/10 dark:bg-zinc-900/10 space-y-4 select-none self-start">
                      <h4 className="text-[9px] font-black uppercase tracking-widest text-zinc-455 flex items-center gap-1.5">
                        <Lightbulb size={11} className="text-[#00bda5]" /> AI Email Assist
                      </h4>
                      <button
                        onClick={handleGenerateFollowUp}
                        disabled={isGeneratingEmail}
                        className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-850 dark:hover:bg-zinc-700 text-white font-extrabold text-[9px] uppercase tracking-wider rounded-xl transition cursor-pointer border-none flex items-center justify-center gap-1"
                      >
                        {isGeneratingEmail ? "Generating..." : "Generate email template"}
                      </button>

                      {followUpEmail && (
                        <div className="p-3 bg-white dark:bg-zinc-950 border border-zinc-200 rounded-xl relative mt-2 select-text">
                          <pre className="text-[8.5px] text-zinc-750 dark:text-zinc-350 whitespace-pre-wrap select-text leading-normal font-sans">{followUpEmail}</pre>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(followUpEmail);
                              alert("Template copied!");
                            }}
                            className="absolute top-2 right-2 text-[7.5px] font-black bg-[#00bda5] text-white px-2 py-0.5 rounded cursor-pointer border-none uppercase"
                          >
                            Copy
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 6: NOTES */}
              {workspaceTab === 'Notes' && (
                <div className="space-y-5 animate-fadeIn select-text">
                  <div className="flex justify-between items-center select-none pb-2 border-b border-zinc-150 dark:border-zinc-900">
                    <div>
                      <h4 className="text-[10px] font-black text-zinc-955 dark:text-zinc-55 uppercase tracking-widest">Interactive Logs & Notes</h4>
                      <p className="text-[8px] text-zinc-400 font-bold uppercase mt-0.5">Editable details stored in Supabase</p>
                    </div>
                    <button
                      onClick={handleSaveNotes}
                      disabled={isSavingNotes}
                      className="px-3.5 py-1.5 bg-[#00bda5] hover:bg-[#00a894] text-white font-extrabold text-[8.5px] uppercase tracking-wider rounded-lg transition border-none cursor-pointer shadow-xs"
                    >
                      {isSavingNotes ? "Saving..." : "Save details"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block select-none">General Notes & Remarks</label>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Key milestones, referral codes..."
                        className="w-full text-xs p-3 bg-zinc-55/40 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-900 rounded-xl focus:outline-hidden focus:border-[#00bda5] font-semibold font-sans min-h-[90px]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block select-none">Interview Prep Questions</label>
                      <textarea
                        value={editInterviewNotes}
                        onChange={(e) => setEditInterviewNotes(e.target.value)}
                        placeholder="Technical details questions preparation..."
                        className="w-full text-xs p-3 bg-zinc-55/40 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-900 rounded-xl focus:outline-hidden focus:border-[#00bda5] font-semibold font-sans min-h-[90px]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block select-none">Salary Package & Expectations</label>
                      <textarea
                        value={editSalaryNotes}
                        onChange={(e) => setEditSalaryNotes(e.target.value)}
                        placeholder="Negotiation boundaries, base values, options grant..."
                        className="w-full text-xs p-3 bg-zinc-55/40 dark:bg-zinc-900/20 border border-zinc-200 dark:border-zinc-900 rounded-xl focus:outline-hidden focus:border-[#00bda5] font-semibold font-sans min-h-[90px]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 7: HISTORICAL TRANSITIONS */}
              {workspaceTab === 'History' && (
                <div className="space-y-4 animate-fadeIn select-text">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-955 dark:text-zinc-55 select-none pb-2 border-b border-zinc-150 dark:border-zinc-900">
                    Pipeline Stage transition logs
                  </h4>

                  <div className="space-y-3 relative pl-6 border-l border-zinc-200 dark:border-zinc-900 py-1">
                    {selectedApp?.timeline && selectedApp?.timeline.length > 0 ? (
                      selectedApp?.timeline
                        .filter(e => e?.event && e?.event.includes('Stage Metadata'))
                        .map((event, idx) => (
                          <div key={idx} className="relative space-y-1">
                            <div className="absolute -left-[20px] top-1.5 w-1.5 h-1.5 rounded-full bg-[#00bda5]" />
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-zinc-955 dark:text-zinc-55">
                              <span>{event?.label || event?.event}</span>
                              <span className="text-zinc-400 font-bold text-[8.5px]">
                                {formatSafeDate(event?.timestamp)}
                              </span>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="text-xs text-zinc-455 italic">No stage changes recorded.</div>
                    )}
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>
      )}

      {/* STAGE METADATA POPUP SHEET */}
      {activeStageEditPopup && selectedApp && (
        <div className="fixed inset-0 z-55 flex items-center justify-center bg-black/60 backdrop-blur-xs select-text animate-fadeIn">
          {/* Backdrop Click Intercept */}
          <div className="absolute inset-0 z-0" onClick={() => setActiveStageEditPopup(null)} />
          
          <div className="w-[450px] max-w-full bg-white dark:bg-zinc-955 border border-zinc-200 dark:border-zinc-900 rounded-3xl shadow-2xl p-6 relative z-10 space-y-4 max-h-[85vh] overflow-y-auto animate-scaleUp text-zinc-850 dark:text-zinc-200">
            
            <div className="flex justify-between items-center pb-3 border-b border-zinc-150 dark:border-zinc-900 select-none">
              <div>
                <span className="text-[8.5px] bg-[#00bda5]/15 text-[#00bda5] px-2 py-0.5 rounded font-black uppercase tracking-wider border border-[#00bda5]/15">
                  Metadata Options
                </span>
                <h3 className="text-sm font-black text-zinc-955 dark:text-zinc-50 mt-2">
                  {activeStageEditPopup} details for {selectedApp?.company_name}
                </h3>
              </div>
              <button
                onClick={() => setActiveStageEditPopup(null)}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg text-zinc-455 border-none cursor-pointer bg-transparent"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              
              {/* Ready to Apply Checklists */}
              {activeStageEditPopup === 'Ready To Apply' && (
                <div className="space-y-3.5">
                  {['Resume Ready', 'Cover Letter Ready', 'Portfolio Added', 'Referral'].map((chk) => (
                    <label key={chk} className="flex items-center gap-3 font-bold text-zinc-700 dark:text-zinc-350 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!popupFields[chk]}
                        onChange={(e) => setPopupFields({ ...popupFields, [chk]: e.target.checked })}
                        className="w-4 h-4 rounded text-[#00bda5] border-zinc-300 focus:ring-[#00bda5] dark:bg-zinc-955 dark:border-zinc-800"
                      />
                      <span>{chk}</span>
                    </label>
                  ))}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Ready notes</label>
                    <textarea
                      value={popupFields.notes || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, notes: e.target.value })}
                      placeholder="Notes for applying..."
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-hidden text-zinc-800 dark:text-zinc-200 font-sans"
                    />
                  </div>
                </div>
              )}

              {/* Applied Popup Fields */}
              {activeStageEditPopup === 'Applied' && (
                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Application Date</label>
                    <input
                      type="date"
                      value={popupFields.applied_date || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, applied_date: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-hidden text-zinc-650"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Resume Version Used</label>
                    <input
                      type="text"
                      placeholder="e.g. v1 (Tailored)"
                      value={popupFields.resume_version || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, resume_version: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-hidden text-zinc-650"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Job Description URL</label>
                    <input
                      type="text"
                      placeholder="https://company.com/job..."
                      value={popupFields.job_url || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, job_url: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-hidden text-zinc-650"
                    />
                  </div>
                </div>
              )}

              {/* Assessment Popup Fields */}
              {activeStageEditPopup === 'Assessment' && (
                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Status</label>
                    <select
                      value={popupFields.status || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, status: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-hidden text-zinc-650"
                    >
                      <option value="">Select Status</option>
                      {['Passed', 'Failed', 'Scheduled', 'Waiting', 'Ghosted'].map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Assessment Link</label>
                    <input
                      type="text"
                      placeholder="HackerRank link..."
                      value={popupFields.assess_link || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, assess_link: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-hidden text-zinc-650"
                    />
                  </div>
                </div>
              )}

              {/* Recruiter Contact Popup Fields */}
              {activeStageEditPopup === 'Recruiter' && (
                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Recruiter Name</label>
                    <input
                      type="text"
                      placeholder="John Doe"
                      value={popupFields.recruiter_name || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, recruiter_name: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-hidden text-zinc-650"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Recruiter Email</label>
                    <input
                      type="email"
                      placeholder="recruiter@company.com"
                      value={popupFields.recruiter_email || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, recruiter_email: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-hidden text-zinc-650"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">LinkedIn Profile</label>
                    <input
                      type="text"
                      placeholder="https://linkedin.com/in/..."
                      value={popupFields.linkedin || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, linkedin: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl focus:outline-hidden text-zinc-650"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Status</label>
                    <select
                      value={popupFields.status || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, status: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-650"
                    >
                      <option value="">Select Status</option>
                      {['Waiting', 'Responded', 'Follow Up', 'Ghosted'].map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Interview Popup Fields */}
              {activeStageEditPopup === 'Interview' && (
                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Interview Type</label>
                    <select
                      value={popupFields.type || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, type: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-650"
                    >
                      <option value="">Select Type</option>
                      {['Technical', 'Managerial', 'HR'].map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Round Number</label>
                    <input
                      type="number"
                      placeholder="e.g. 1"
                      value={popupFields.round || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, round: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-650"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Outcome</label>
                    <select
                      value={popupFields.outcome || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, outcome: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-650"
                    >
                      <option value="">Select Outcome</option>
                      {['Passed', 'Failed', 'Rescheduled', 'Waiting'].map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Final Round Popup Fields */}
              {activeStageEditPopup === 'Final Round' && (
                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Outcome</label>
                    <select
                      value={popupFields.outcome || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, outcome: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-650"
                    >
                      <option value="">Select Outcome</option>
                      {['Passed', 'Failed', 'Waiting'].map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Offer Received Popup Fields */}
              {activeStageEditPopup === 'Offer' && (
                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Salary Parameters</label>
                    <input
                      type="text"
                      placeholder="e.g. $140,000 base + options"
                      value={popupFields.salary || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, salary: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-650"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Negotiation Remarks</label>
                    <input
                      type="text"
                      placeholder="Counter offered base..."
                      value={popupFields.negotiation || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, negotiation: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-650"
                    />
                  </div>
                </div>
              )}

              {/* Accepted Fields */}
              {activeStageEditPopup === 'Accepted' && (
                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Expected Joining Date</label>
                    <input
                      type="date"
                      value={popupFields.joining_date || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, joining_date: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-650"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Package Details</label>
                    <input
                      type="text"
                      placeholder="Final confirmed package details..."
                      value={popupFields.package_details || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, package_details: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-650"
                    />
                  </div>
                </div>
              )}

              {/* Rejected Fields */}
              {activeStageEditPopup === 'Rejected' && (
                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Reason</label>
                    <select
                      value={popupFields.reason || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, reason: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-650"
                    >
                      <option value="">Select Reason</option>
                      {['Salary too low', 'Selected another company', 'Didn\'t clear', 'Company withdrew'].map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Archived Fields */}
              {activeStageEditPopup === 'Archived' && (
                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-zinc-455 uppercase tracking-widest block">Reason</label>
                    <select
                      value={popupFields.reason || ''}
                      onChange={(e) => setPopupFields({ ...popupFields, reason: e.target.value })}
                      className="w-full text-xs p-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-650"
                    >
                      <option value="">Select Reason</option>
                      {['Old application', 'No response', 'Closed'].map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Save footer buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-150 dark:border-zinc-900 select-none">
                <button
                  onClick={() => setActiveStageEditPopup(null)}
                  className="px-4 py-2 text-[10px] font-black uppercase tracking-wider hover:bg-zinc-55 dark:hover:bg-zinc-900 text-zinc-550 rounded-xl border-none bg-transparent cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveStageMetadata(activeStageEditPopup)}
                  className="px-4.5 py-2 bg-[#00bda5] hover:bg-[#00a894] text-white font-black text-[10px] uppercase tracking-wider rounded-xl border-none cursor-pointer shadow-xs"
                >
                  Save Changes
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default function JobTrackerPage() {
  return (
    <JobTrackerErrorBoundary>
      <JobTrackerContent />
    </JobTrackerErrorBoundary>
  );
}

