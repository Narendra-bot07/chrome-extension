import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  User, Shield, CreditCard, ChevronLeft, 
  Settings, Check, Mail, Key, Sparkles, Zap, Lock,
  LogOut, Activity, FileText, Briefcase, Plus, Github
} from 'lucide-react';

export default function ProfilePage() {
  const { user, session, darkMode } = useApp();
  const [activeSubTab, setActiveSubTab] = useState('PROFILE');
  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    subscription_plan: 'Free',
    credits_remaining: 5,
    resume_count: 0
  });

  const [nameInput, setNameInput] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [msg, setMsg] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`http://localhost:8000/api/v1/profile/`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
          setNameInput(data.full_name || '');
        }
      } catch (err) {
        console.error("Failed to load user profile:", err);
      }
    };
    fetchProfile();
  }, [session]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setMsg(null);
    try {
      const token = session?.access_token;
      const res = await fetch('http://localhost:8000/api/v1/profile/update', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ full_name: nameInput })
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setEditingName(false);
        setMsg({ type: 'success', text: 'Name updated successfully!' });
      } else {
        throw new Error('Update failed.');
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setUpdating(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div className={`flex-1 flex flex-col min-h-screen ${darkMode ? 'bg-[#0f0f11]' : 'bg-[#FAFAFB]'}`}>
      <div className="flex flex-col md:flex-row h-full">
        
        {/* Sidebar */}
        <div className={`w-full md:w-[260px] flex-shrink-0 flex flex-col p-6 border-r border-[#E5E7EB] ${darkMode ? 'bg-[#0a0a0a] border-zinc-800' : 'bg-[#FCFCFD]'}`}>
          <div className="mb-8">
            <Link 
              to="/" 
              className={`inline-flex items-center gap-2 text-[12px] font-semibold transition-all duration-200 ${darkMode ? 'text-[#9CA3AF] hover:text-white' : 'text-[#6B7280] hover:text-[#111827]'}`}
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </div>

          <div className="mb-8">
            <h1 className={`text-[28px] font-bold tracking-tight ${darkMode ? 'text-white' : 'text-[#111827]'}`}>Account</h1>
            <p className={`text-[14px] mt-1 ${darkMode ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>Manage your account info.</p>
          </div>

          <nav className="flex flex-col gap-2">
            {[
              { id: 'PROFILE', label: 'Profile', icon: User },
              { id: 'SECURITY', label: 'Security', icon: Shield },
              { id: 'BILLING', label: 'Billing & Usage', icon: CreditCard }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-3 px-4 h-10 rounded-[12px] text-[14px] font-semibold transition-all duration-200 ${
                  activeSubTab === tab.id
                    ? darkMode ? 'bg-[#4F46E5] text-white' : 'bg-[#4F46E5] text-white'
                    : darkMode ? 'text-[#9CA3AF] hover:bg-zinc-800 hover:text-white' : 'text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]'
                }`}
              >
                <tab.icon className="w-[18px] h-[18px]" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-8 md:p-12 overflow-y-auto">
          <div className="max-w-[800px] mx-auto flex flex-col gap-8">
            
            {msg && (
              <div className={`p-4 rounded-[12px] text-[14px] font-medium flex items-center gap-3 border ${
                msg.type === 'success' 
                  ? darkMode ? 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20' : 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20'
                  : darkMode ? 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20' : 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20'
              }`}>
                {msg.type === 'success' ? <Check className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                {msg.text}
              </div>
            )}

            {activeSubTab === 'PROFILE' && (
              <div className="flex flex-col gap-8 animate-fadeIn">
                <h2 className={`text-[18px] font-semibold ${darkMode ? 'text-white' : 'text-[#111827]'}`}>Profile Information</h2>
                
                {/* Profile Card */}
                <div className={`p-6 rounded-[18px] border border-[#E5E7EB] flex flex-col md:flex-row items-start md:items-center justify-between gap-6 ${darkMode ? 'bg-[#0f0f11] border-zinc-800' : 'bg-[#FFFFFF]'}`}>
                  <div className="flex items-center gap-5">
                    <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-tr from-[#4F46E5] to-[#3B82F6] flex items-center justify-center text-white text-[24px] font-bold shadow-sm">
                      {getInitials(profile.full_name || user?.full_name)}
                    </div>
                    <div className="flex flex-col">
                      <h3 className={`text-[20px] font-bold ${darkMode ? 'text-white' : 'text-[#111827]'}`}>
                        {profile.full_name || user?.full_name || 'Narendra Bandi'}
                      </h3>
                      <p className={`text-[14px] ${darkMode ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>
                        {profile.email || user?.email || 'narendra@example.com'}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">Active Member</span>
                        <span className={`text-[12px] font-medium ${darkMode ? 'text-[#6B7280]' : 'text-[#9CA3AF]'}`}>Since Aug 2024</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setEditingName(!editingName)}
                    className={`h-10 px-4 rounded-[12px] text-[14px] font-semibold border border-[#E5E7EB] transition-all duration-200 ${darkMode ? 'text-white border-zinc-700 hover:bg-zinc-800' : 'bg-white text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]'}`}
                  >
                    {editingName ? 'Cancel' : 'Edit Profile'}
                  </button>
                </div>

                {/* Edit Inline Form */}
                {editingName && (
                  <form onSubmit={handleUpdateProfile} className={`p-6 rounded-[18px] border border-[#E5E7EB] flex flex-col gap-5 animate-fadeIn ${darkMode ? 'bg-[#0f0f11] border-zinc-800' : 'bg-[#FFFFFF]'}`}>
                    <h3 className={`text-[16px] font-semibold ${darkMode ? 'text-white' : 'text-[#111827]'}`}>Personal Details</h3>
                    <div className="flex flex-col gap-1.5">
                      <label className={`text-[12px] font-medium ${darkMode ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>Full Name</label>
                      <input 
                        type="text" 
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        className={`h-[44px] px-3 rounded-[12px] border border-[#E5E7EB] text-[14px] focus:outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] transition-all ${darkMode ? 'bg-[#0a0a0a] border-zinc-800 text-white' : 'bg-white text-[#111827]'}`}
                        placeholder="John Doe"
                      />
                    </div>
                    <div className="flex justify-end mt-2">
                      <button 
                        type="submit" 
                        disabled={updating}
                        className="h-10 px-6 rounded-[12px] bg-[#4F46E5] hover:bg-[#4338CA] text-white text-[14px] font-semibold transition-all duration-200 disabled:opacity-50"
                      >
                        {updating ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {activeSubTab === 'SECURITY' && (
              <div className="flex flex-col gap-8 animate-fadeIn">
                <h2 className={`text-[18px] font-semibold ${darkMode ? 'text-white' : 'text-[#111827]'}`}>Security & Authentication</h2>
                
                {/* Auth Card */}
                <div className={`p-6 rounded-[18px] border border-[#E5E7EB] flex flex-col gap-6 ${darkMode ? 'bg-[#0f0f11] border-zinc-800' : 'bg-[#FFFFFF]'}`}>
                  <h3 className={`text-[16px] font-semibold ${darkMode ? 'text-white' : 'text-[#111827]'}`}>Authentication Methods</h3>
                  
                  {(!user?.app_metadata?.provider || user.app_metadata.provider === 'email') && (
                    <div className={`p-4 rounded-[12px] border border-[#E5E7EB] flex items-center justify-between ${darkMode ? 'bg-[#0a0a0a] border-zinc-800' : 'bg-[#FCFCFD]'}`}>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center shadow-sm">
                          <Mail className="w-5 h-5 text-[#6B7280]" />
                        </div>
                        <div>
                          <p className={`text-[14px] font-semibold ${darkMode ? 'text-white' : 'text-[#111827]'}`}>Email & Password</p>
                          <p className={`text-[12px] mt-0.5 ${darkMode ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>{profile.email || user?.email}</p>
                        </div>
                      </div>
                      <button className={`h-8 px-3 rounded-[8px] text-[12px] font-semibold border border-[#E5E7EB] transition-all duration-200 ${darkMode ? 'text-white border-zinc-700 hover:bg-zinc-800' : 'bg-white text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]'}`}>
                        Change Password
                      </button>
                    </div>
                  )}

                  {user?.app_metadata?.provider === 'google' && (
                    <div className={`p-4 rounded-[12px] border border-[#E5E7EB] flex items-center justify-between ${darkMode ? 'bg-[#0a0a0a] border-zinc-800' : 'bg-[#FCFCFD]'}`}>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center shadow-sm text-[#111827] font-bold text-[14px]">
                          G
                        </div>
                        <div>
                          <p className={`text-[14px] font-semibold ${darkMode ? 'text-white' : 'text-[#111827]'}`}>Google</p>
                          <p className={`text-[12px] mt-0.5 ${darkMode ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>{profile.email || user?.email}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {user?.app_metadata?.provider === 'azure' && (
                    <div className={`p-4 rounded-[12px] border border-[#E5E7EB] flex items-center justify-between ${darkMode ? 'bg-[#0a0a0a] border-zinc-800' : 'bg-[#FCFCFD]'}`}>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center shadow-sm text-[#111827] font-bold text-[14px]">
                          M
                        </div>
                        <div>
                          <p className={`text-[14px] font-semibold ${darkMode ? 'text-white' : 'text-[#111827]'}`}>Microsoft</p>
                          <p className={`text-[12px] mt-0.5 ${darkMode ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>{profile.email || user?.email}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeSubTab === 'BILLING' && (
              <div className="flex flex-col gap-8 animate-fadeIn">
                <h2 className={`text-[18px] font-semibold ${darkMode ? 'text-white' : 'text-[#111827]'}`}>Billing & Usage Overview</h2>
                
                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Credits Remaining */}
                  <div className={`p-6 rounded-[18px] border border-[#E5E7EB] flex flex-col justify-between min-h-[140px] transition-transform duration-200 hover:scale-[1.02] ${darkMode ? 'bg-[#0f0f11] border-zinc-800' : 'bg-[#FFFFFF]'}`}>
                    <div className="flex justify-between items-start">
                      <span className={`text-[12px] font-semibold uppercase tracking-wider ${darkMode ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>Credits Balance</span>
                      <Zap className="w-5 h-5 text-[#F59E0B]" />
                    </div>
                    <div className="flex items-end gap-2 mt-4">
                      <span className={`text-[32px] font-bold leading-none ${darkMode ? 'text-white' : 'text-[#111827]'}`}>{profile.credits_remaining}</span>
                      <span className={`text-[12px] font-medium mb-1 ${darkMode ? 'text-[#6B7280]' : 'text-[#9CA3AF]'}`}>left</span>
                    </div>
                  </div>

                  {/* Resumes Tailored */}
                  <div className={`p-6 rounded-[18px] border border-[#E5E7EB] flex flex-col justify-between min-h-[140px] transition-transform duration-200 hover:scale-[1.02] ${darkMode ? 'bg-[#0f0f11] border-zinc-800' : 'bg-[#FFFFFF]'}`}>
                    <div className="flex justify-between items-start">
                      <span className={`text-[12px] font-semibold uppercase tracking-wider ${darkMode ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>Resumes Tailored</span>
                      <FileText className="w-5 h-5 text-[#3B82F6]" />
                    </div>
                    <div className="flex items-end gap-2 mt-4">
                      <span className={`text-[32px] font-bold leading-none ${darkMode ? 'text-white' : 'text-[#111827]'}`}>{profile.resume_count}</span>
                      <span className={`text-[12px] font-medium mb-1 ${darkMode ? 'text-[#6B7280]' : 'text-[#9CA3AF]'}`}>total docs</span>
                    </div>
                  </div>

                  {/* Average ATS Score (Mocked) */}
                  <div className={`p-6 rounded-[18px] border border-[#E5E7EB] flex flex-col justify-between min-h-[140px] transition-transform duration-200 hover:scale-[1.02] ${darkMode ? 'bg-[#0f0f11] border-zinc-800' : 'bg-[#FFFFFF]'}`}>
                    <div className="flex justify-between items-start">
                      <span className={`text-[12px] font-semibold uppercase tracking-wider ${darkMode ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>Average ATS Score</span>
                      <Activity className="w-5 h-5 text-[#10B981]" />
                    </div>
                    <div className="flex items-end gap-2 mt-4">
                      <span className={`text-[32px] font-bold leading-none ${darkMode ? 'text-white' : 'text-[#111827]'}`}>84%</span>
                      <span className={`text-[12px] font-medium mb-1 ${darkMode ? 'text-[#10B981]' : 'text-[#10B981]'}`}>+5% this week</span>
                    </div>
                  </div>

                  {/* Applications Tracked (Mocked) */}
                  <div className={`p-6 rounded-[18px] border border-[#E5E7EB] flex flex-col justify-between min-h-[140px] transition-transform duration-200 hover:scale-[1.02] ${darkMode ? 'bg-[#0f0f11] border-zinc-800' : 'bg-[#FFFFFF]'}`}>
                    <div className="flex justify-between items-start">
                      <span className={`text-[12px] font-semibold uppercase tracking-wider ${darkMode ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>Apps Tracked</span>
                      <Briefcase className="w-5 h-5 text-[#4F46E5]" />
                    </div>
                    <div className="flex items-end gap-2 mt-4">
                      <span className={`text-[32px] font-bold leading-none ${darkMode ? 'text-white' : 'text-[#111827]'}`}>12</span>
                      <span className={`text-[12px] font-medium mb-1 ${darkMode ? 'text-[#6B7280]' : 'text-[#9CA3AF]'}`}>in pipeline</span>
                    </div>
                  </div>
                </div>

                {/* Plan Card */}
                <div className={`mt-2 p-6 rounded-[18px] border border-[#E5E7EB] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 ${darkMode ? 'bg-[#0f0f11] border-zinc-800' : 'bg-[#FFFFFF]'}`}>
                  <div>
                    <h3 className={`text-[16px] font-semibold ${darkMode ? 'text-white' : 'text-[#111827]'}`}>Current Plan</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <p className={`text-[24px] font-bold ${darkMode ? 'text-white' : 'text-[#111827]'}`}>{profile.subscription_plan} Tier</p>
                      <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[#4F46E5]/10 text-[#4F46E5] border border-[#4F46E5]/20">Active</span>
                    </div>
                    <p className={`text-[14px] mt-2 ${darkMode ? 'text-[#9CA3AF]' : 'text-[#6B7280]'}`}>You are currently on the {profile.subscription_plan} plan. Upgrade to unlock more features.</p>
                  </div>
                  <button className="h-10 px-6 rounded-[12px] bg-[#111827] hover:bg-[#374151] dark:bg-white dark:hover:bg-zinc-200 dark:text-[#111827] text-white text-[14px] font-semibold transition-all duration-200">
                    Upgrade Plan
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
