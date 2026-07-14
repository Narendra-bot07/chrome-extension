import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { FileText, TrendingUp, Calendar, Zap, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';

export default function DashboardPage() {
  const { user, session } = useApp();
  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    subscription_plan: 'Free',
    credits_remaining: 5,
    resume_count: 0
  });
  const [metrics, setMetrics] = useState({
    total_resumes: 0,
    total_tailored: 0,
    total_downloads: 0
  });
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const token = session?.access_token;
        const headers = { 'Authorization': `Bearer ${token}` };

        // Fetch user profile
        const profileRes = await fetch('http://localhost:8000/api/v1/profile/', { headers });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setProfile(profileData);
        }

        // Fetch metrics
        const metricsRes = await fetch('http://localhost:8000/api/v1/analytics/dashboard', { headers });
        if (metricsRes.ok) {
          const metricsData = await metricsRes.json();
          setMetrics({
            total_resumes: metricsData.resume_count || 0,
            total_tailored: metricsData.tailored_count || 0,
            total_downloads: metricsData.download_count || 0
          });
        }
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  return (
    <div className="flex-1 flex flex-col gap-6 animate-fadeIn font-sans max-w-4xl mx-auto">
      
      {/* Overview Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50">Dashboard</h1>
        <p className="text-xs text-zinc-400 dark:text-zinc-550">Track and optimize your job applications in real time.</p>
      </div>

      {/* Complete Profile Warning Banner if no resumes uploaded */}
      {!loading && profile.resume_count === 0 && (
        <div className="bg-amber-50/50 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-900/30 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-amber-100/50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-500 font-extrabold text-sm">
              <AlertCircle size={16} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-amber-900 dark:text-amber-500">Complete your profile setup</h3>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-500/60 mt-0.5 font-medium">
                You haven't uploaded a master resume yet. Upload your first resume to begin tailoring.
              </p>
            </div>
          </div>
          <Button 
            onClick={() => navigate('/resume-detect')} 
            variant="outline"
            className="border-amber-200/80 text-amber-700 hover:bg-amber-100/30 dark:border-amber-900/30 dark:text-amber-500 dark:hover:bg-amber-500/10 text-xs py-1.5 font-bold rounded-lg cursor-pointer"
          >
            Upload Resume
          </Button>
        </div>
      )}

      {/* 1. Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: All Time */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 rounded-2xl p-5 flex flex-col justify-between h-36 shadow-xs hover:border-zinc-350 dark:hover:border-zinc-800 transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500 text-[10px] font-bold uppercase tracking-widest">All Time</span>
            <TrendingUp className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
          </div>
          <div>
            <div className="text-4xl font-extrabold text-zinc-950 dark:text-zinc-50 leading-none">
              {metrics.total_tailored || 0}
            </div>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-450 mt-1.5 font-bold">Total tailored applications</p>
          </div>
        </div>

        {/* Card 2: Monthly */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 rounded-2xl p-5 flex flex-col justify-between h-36 shadow-xs hover:border-zinc-350 dark:hover:border-zinc-800 transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Monthly</span>
            <Calendar className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
          </div>
          <div>
            <div className="text-4xl font-extrabold text-zinc-950 dark:text-zinc-50 leading-none">
              {metrics.total_tailored || 0}
            </div>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-450 mt-1.5 font-bold">Applications in last 30 days</p>
          </div>
        </div>

        {/* Card 3: Weekly */}
        <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 rounded-2xl p-5 flex flex-col justify-between h-36 shadow-xs hover:border-zinc-350 dark:hover:border-zinc-800 transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 dark:text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Weekly</span>
            <Zap className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
          </div>
          <div>
            <div className="text-4xl font-extrabold text-zinc-950 dark:text-zinc-50 leading-none">
              {metrics.total_tailored || 0}
            </div>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-450 mt-1.5 font-bold">Applications in last 7 days</p>
          </div>
        </div>
      </div>

      {/* 2. Trends Graph area */}
      <div className="bg-white dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-850 rounded-2xl p-6 flex flex-col justify-between min-h-[300px] shadow-xs">
        <div>
          <h2 className="text-xs font-black uppercase tracking-widest text-zinc-950 dark:text-zinc-50">Application Trends</h2>
          <p className="text-[10px] text-zinc-400 dark:text-zinc-550 mt-0.5 font-bold">Track the count of jobs scanned and resumes customized over time.</p>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-2.5 py-12">
          <div className="w-10 h-10 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
            <FileText className="w-5 h-5 text-zinc-400 dark:text-zinc-550" />
          </div>
          <p className="text-xs font-bold text-zinc-700 dark:text-zinc-350 mt-1">No active trends data</p>
          <p className="text-[10px] text-zinc-450 dark:text-zinc-550 font-bold">Optimize and download a resume to trigger application trends charts.</p>
        </div>
      </div>

      {/* 3. Action launcher card */}
      <div className="bg-zinc-950 border border-zinc-850 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white">Optimize another resume?</h3>
            <p className="text-[10.5px] text-zinc-500 mt-0.5 font-bold">Customize your resume credentials to fit any prospective job description in seconds.</p>
          </div>
        </div>
        <button 
          onClick={() => navigate('/tailor')} 
          className="bg-white text-zinc-950 dark:bg-zinc-100 hover:bg-zinc-200 font-extrabold text-xs px-5 py-2.5 rounded-xl transition-all whitespace-nowrap cursor-pointer"
        >
          Tailor New Resume
        </button>
      </div>

    </div>
  );
}
