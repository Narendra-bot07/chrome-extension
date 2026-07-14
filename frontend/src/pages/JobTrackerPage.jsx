import React, { useState, useEffect } from 'react';
import { Briefcase, Search, Filter, Download, Inbox, ChevronRight, Sparkles, Calendar, CheckCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';

export default function JobTrackerPage() {
  const { session, darkMode } = useApp();
  const [activeTab, setActiveTab] = useState('APPLIED');
  const [searchQuery, setSearchQuery] = useState('');
  const [applications, setApplications] = useState([]);
  const [selectedApp, setSelectedApp] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = session?.access_token;
        const res = await fetch('http://localhost:8000/api/v1/tailor/history', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setApplications(data || []);
          if (data && data.length > 0) {
            setSelectedApp(data[0]); // default select first item
          }
        }
      } catch (err) {
        console.error("Failed to load tailoring history:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [session]);

  // Filter applications by search query
  const filteredApps = applications.filter(app => {
    const title = (app.job_title || 'Software Engineer').toLowerCase();
    const company = (app.company_name || 'Employer').toLowerCase();
    const query = searchQuery.toLowerCase();
    return title.includes(query) || company.includes(query);
  });

  // Count tab elements dynamically. For now, tailored resumes populate the 'APPLIED' tab.
  const tabs = [
    { id: 'APPLIED', label: 'APPLIED', count: activeTab === 'APPLIED' ? filteredApps.length : applications.length },
    { id: 'INTERVIEWING', label: 'INTERVIEWING', count: 0 },
    { id: 'OFFERS', label: 'OFFERS', count: 0 },
    { id: 'REJECTED', label: 'REJECTED', count: 0 },
    { id: 'ARCHIVED', label: 'ARCHIVED', count: 0 },
    { id: 'FAVORITES', label: 'FAVORITES', count: 0 },
  ];

  return (
    <div className="flex-1 flex flex-col gap-6 animate-fadeIn">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">Job Tracker</h1>
        <Button variant="outline" size="sm">
          <Download size={14} className="mr-1.5" />
          Export
        </Button>
      </div>

      {/* Summary Bar Tabs */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border rounded-2xl overflow-hidden transition-all ${
        darkMode ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
      }`}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`p-4 flex flex-col items-start gap-1 transition-all text-left relative focus:outline-none ${
                isActive 
                  ? darkMode ? 'bg-zinc-800/50 text-zinc-50 border-b-2 border-zinc-500' : 'bg-white text-zinc-900 border-b-2 border-zinc-900 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/20'
              }`}
            >
              <span className="text-[9px] font-bold tracking-wider uppercase">{tab.label}</span>
              <span className={`text-2xl font-black ${isActive ? (darkMode ? 'text-zinc-50' : 'text-zinc-900') : (darkMode ? 'text-zinc-300' : 'text-zinc-700')}`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Split Screen Container */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden min-h-[400px]">
        
        {/* Left List Panel */}
        <div className={`lg:col-span-5 border-r flex flex-col ${
          darkMode ? 'border-zinc-800 bg-zinc-900/20' : 'border-zinc-200 bg-white'
        }`}>
          {/* Search bar */}
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex gap-2">
            <div className="relative flex-1">
              <Input
                icon={Search}
                type="text"
                placeholder="Search by title, company, or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button variant="outline" className="px-3" size="md">
              <Filter size={16} />
            </Button>
          </div>

          <div className={`p-3 text-[10px] font-bold uppercase tracking-wider ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
            {activeTab === 'APPLIED' ? filteredApps.length : 0} results
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {loading ? (
              <div className="text-center py-8 text-zinc-500 text-xs">Loading applications...</div>
            ) : activeTab === 'APPLIED' && filteredApps.length > 0 ? (
              filteredApps.map((app) => {
                const isSelected = selectedApp && selectedApp.id === app.id;
                return (
                  <div
                    key={app.id}
                    onClick={() => setSelectedApp(app)}
                    className={`p-4 border-b transition-all cursor-pointer flex justify-between items-center ${
                      isSelected
                        ? darkMode ? 'bg-zinc-800/40 border-l-4 border-zinc-500 pl-3' : 'bg-zinc-50 border-l-4 border-zinc-900 pl-3'
                        : darkMode ? 'border-zinc-800/50 hover:bg-zinc-900/50' : 'border-zinc-100 hover:bg-zinc-50'
                    }`}
                  >
                    <div>
                      <h4 className={`text-xs font-bold ${darkMode ? 'text-zinc-50' : 'text-zinc-900'}`}>
                        {app.job_title || 'Software Engineer'}
                      </h4>
                      <p className="text-[11px] text-zinc-500 mt-0.5">{app.company_name || 'Employer'}</p>
                    </div>
                    <ChevronRight size={14} className="text-zinc-400" />
                  </div>
                );
              })
            ) : (
              <div className="p-6 h-full flex items-center justify-center">
                <EmptyState
                  icon={Briefcase}
                  title="No applications found"
                  description="Use the Chrome extension to track jobs automatically as you apply."
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Detail Panel */}
        <div className={`lg:col-span-7 flex flex-col p-8 gap-6 ${
          darkMode ? 'bg-zinc-950' : 'bg-zinc-50/50'
        }`}>
          {selectedApp && activeTab === 'APPLIED' ? (
            <div className="flex flex-col gap-6 animate-fadeIn w-full">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[9px] bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
                    {activeTab}
                  </span>
                  <h2 className={`text-lg font-black mt-3 ${darkMode ? 'text-zinc-50' : 'text-zinc-900'}`}>
                    {selectedApp.job_title || 'Software Engineer'}
                  </h2>
                  <p className="text-xs text-zinc-500 font-semibold mt-1">{selectedApp.company_name || 'Employer'}</p>
                </div>
                
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">ATS Matching</span>
                  <span className="text-2xl font-black text-zinc-900 dark:text-zinc-50 mt-1">
                    {selectedApp.ats_score ? `${Math.round(selectedApp.ats_score)}%` : '85%'}
                  </span>
                </div>
              </div>

              <div className={`border-t my-1 ${darkMode ? 'border-zinc-800' : 'border-zinc-200'}`} />

              <div className="grid grid-cols-2 gap-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow-sm">
                    <Calendar size={16} className="text-zinc-500 dark:text-zinc-400" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase block">Scanned Date</span>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-300">
                      {new Date(selectedApp.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shadow-sm">
                    <CheckCircle size={16} className="text-zinc-500 dark:text-zinc-400" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase block">Status</span>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-300">Tailored Draft</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-4">
                <Button className="flex-1" variant="primary" size="md">
                  View Custom Resume
                </Button>
                <Button variant="outline" size="md">
                  Edit Details
                </Button>
              </div>

            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={Inbox}
                title="No selection"
                description="Select an application from the list to view its details."
              />
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
