import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { 
  User, Shield, CreditCard, ChevronLeft, 
  Settings, Check, Mail, Key, Sparkles, Zap, Lock
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

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

  return (
    <div className="flex-1 flex flex-col gap-6 animate-fadeIn">
      {/* Header Back Link */}
      <div>
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>

      {/* Main card box with split sidebar */}
      <div className={`border rounded-3xl grid grid-cols-1 md:grid-cols-12 overflow-hidden min-h-[480px] transition-colors ${
        darkMode ? 'bg-zinc-900/40 border-zinc-800' : 'bg-white border-zinc-200'
      }`}>
        
        {/* Left inner tab menu */}
        <div className={`md:col-span-3 border-r p-6 flex flex-col gap-6 ${
          darkMode ? 'border-zinc-800 bg-zinc-950/30' : 'border-zinc-200 bg-zinc-50/50'
        }`}>
          <div>
            <h1 className={`text-xl font-black tracking-tight ${darkMode ? 'text-zinc-50' : 'text-zinc-900'}`}>Account</h1>
            <p className="text-xs text-zinc-500 mt-0.5">Manage your account info.</p>
          </div>

          <nav className="flex flex-col gap-1">
            <button
              onClick={() => setActiveSubTab('PROFILE')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                activeSubTab === 'PROFILE'
                  ? darkMode ? 'bg-zinc-800/50 text-zinc-50' : 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <User size={14} />
              Profile
            </button>
            <button
              onClick={() => setActiveSubTab('SECURITY')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                activeSubTab === 'SECURITY'
                  ? darkMode ? 'bg-zinc-800/50 text-zinc-50' : 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <Shield size={14} />
              Security
            </button>
            <button
              onClick={() => setActiveSubTab('BILLING')}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all text-left ${
                activeSubTab === 'BILLING'
                  ? darkMode ? 'bg-zinc-800/50 text-zinc-50' : 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <CreditCard size={14} />
              Billing
            </button>
          </nav>
        </div>

        {/* Right sub-tab contents */}
        <div className="md:col-span-9 p-8 flex flex-col gap-6">
          
          {msg && (
            <div className={`p-4 rounded-xl border text-xs ${
              msg.type === 'success' 
                ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-400' 
                : 'bg-red-950/20 border-red-900/50 text-red-400'
            }`}>
              {msg.text}
            </div>
          )}

          {activeSubTab === 'PROFILE' && (
            <div className="space-y-8 animate-fadeIn">
              {/* Profile Details segment */}
              <div className="space-y-4">
                <h2 className={`text-md font-extrabold pb-3 border-b ${darkMode ? 'text-zinc-50 border-zinc-800' : 'text-zinc-900 border-zinc-200'}`}>
                  Profile details
                </h2>
                
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-2 gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider w-20">Profile</span>
                    <div className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-black text-sm shadow">
                      {profile.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                    {editingName ? (
                      <form onSubmit={handleUpdateProfile} className="flex gap-2 items-center">
                        <Input
                          type="text"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          className="w-48 h-8"
                        />
                        <Button type="submit" variant="primary" size="sm" isLoading={updating}>
                          Save
                        </Button>
                      </form>
                    ) : (
                      <span className={`text-sm font-semibold ${darkMode ? 'text-zinc-200' : 'text-zinc-700'}`}>
                        {profile.full_name || user?.full_name || 'Narendra'}
                      </span>
                    )}
                  </div>
                  {!editingName && (
                    <Button 
                      onClick={() => setEditingName(true)}
                      variant="ghost"
                      size="sm"
                    >
                      Update profile
                    </Button>
                  )}
                </div>

                <div className="flex items-center py-2 gap-4">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider w-20">Connected accounts</span>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] text-white font-bold">
                      G
                    </div>
                    <span className="text-xs text-zinc-500 font-medium">Google • {profile.email || user?.email || 'developer@example.com'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSubTab === 'SECURITY' && (
            <div className="space-y-6 animate-fadeIn">
              <h2 className={`text-md font-extrabold pb-3 border-b ${darkMode ? 'text-zinc-50 border-zinc-800' : 'text-zinc-900 border-zinc-200'}`}>
                Security Settings
              </h2>
              <div className="flex items-center justify-between p-4 rounded-2xl bg-zinc-900/10 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-800/80">
                <div className="flex items-center gap-3">
                  <Lock className="w-5 h-5 text-zinc-500" />
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white">Password Authentication</h3>
                    <p className="text-[10px] text-zinc-500">Modify or change your access keys.</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">Change Password</Button>
              </div>
            </div>
          )}

          {activeSubTab === 'BILLING' && (
            <div className="space-y-6 animate-fadeIn">
              <h2 className={`text-md font-extrabold pb-3 border-b ${darkMode ? 'text-zinc-50 border-zinc-800' : 'text-zinc-900 border-zinc-200'}`}>
                Subscription & Credits
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-800/80 p-6 rounded-2xl flex flex-col justify-between h-32">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Active Plan</span>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xl font-black text-zinc-900 dark:text-white">{profile.subscription_plan} Plan</span>
                    <span className="text-[9px] bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300 px-3 py-1 rounded-full font-bold uppercase">Active</span>
                  </div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-800/80 p-6 rounded-2xl flex flex-col justify-between h-32">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Credits Balance</span>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-2xl font-black text-zinc-900 dark:text-white">{profile.credits_remaining}</span>
                    <span className="text-[10px] text-zinc-500">AI generations left</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
