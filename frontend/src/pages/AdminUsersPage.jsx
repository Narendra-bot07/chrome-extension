import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Ban, CheckCircle2, Crown, Search, ShieldCheck,
  Sparkles, TrendingUp, User as UserIcon, UserCheck, Users, UserX, X
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getApiUrl } from '../config/apiConfig';

const FEATURE_LABELS = {
  jd_extraction: 'JD Extractions',
  resume_upload: 'Resume Uploads',
  resume_generation: 'Resume Generations',
  cover_letter_generation: 'Cover Letter Generations',
};

const EMPTY_STATS = {
  total_users: 0,
  free_users: 0,
  basic_users: 0,
  pro_users: 0,
  elite_users: 0,
  active_users: 0,
  suspended_users: 0,
  admin_users: 0,
  verified_users: 0,
  signups_7d: 0,
  signups_30d: 0,
};

function StatCard({ label, value, icon: Icon, tone = 'blue', detail }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
    slate: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    cyan: 'bg-cyan-50 text-cyan-600 border-cyan-100 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20',
    violet: 'bg-violet-50 text-violet-600 border-violet-100 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
    amber: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    rose: 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  };
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm dark:shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] uppercase tracking-widest font-black text-slate-500 dark:text-zinc-500">{label}</p>
          <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white tabular-nums">{value}</p>
          {detail && <p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-zinc-500">{detail}</p>}
        </div>
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${tones[tone] || tones.blue}`}>
          <Icon size={17} />
        </span>
      </div>
    </div>
  );
}

function RoleBadge({ role }) {
  if (role === 'admin') {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black bg-amber-500/15 text-amber-500 border border-amber-500/30"><Crown size={10} /> ADMIN</span>;
  }
  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">USER</span>;
}

function UserDetailPanel({ userId, onClose, onChanged, apiUrl, token }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/v1/admin/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load user detail.');
      setDetail(await res.json());
    } catch (err) {
      setError(err.message);
    }
  }, [apiUrl, token, userId]);

  useEffect(() => { load(); }, [load]);

  const patch = async (path, body) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/v1/admin/users/${userId}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Update failed.');
      await load();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!detail) return (
    <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 text-xs text-slate-500 dark:text-zinc-400 shadow-xl" onClick={e => e.stopPropagation()}>
        {error || 'Loading…'}
      </div>
    </div>
  );

  const { user, subscription, usage } = detail;

  return (
    <div className="fixed inset-0 bg-slate-950/45 dark:bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-slate-900 dark:text-white">{user.full_name || user.email}</h2>
              <RoleBadge role={user.role} />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-500 mt-0.5">{user.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-400 cursor-pointer"><X size={16} /></button>
        </div>

        {error && <p className="text-[11px] font-bold text-rose-400 mb-3">{error}</p>}

        <div className="grid grid-cols-2 gap-2 mb-4 text-[11px]">
          <div className="bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-transparent rounded-lg p-2.5"><span className="text-slate-500 dark:text-zinc-500 block text-[9px] uppercase font-black tracking-wide">Plan</span><span className="text-slate-900 dark:text-white font-bold">{subscription?.plan_name || user.current_plan || '—'}</span></div>
          <div className="bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-transparent rounded-lg p-2.5"><span className="text-slate-500 dark:text-zinc-500 block text-[9px] uppercase font-black tracking-wide">Status</span><span className="text-slate-900 dark:text-white font-bold">{user.is_active ? 'Active' : 'Suspended'}</span></div>
          <div className="bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-transparent rounded-lg p-2.5"><span className="text-slate-500 dark:text-zinc-500 block text-[9px] uppercase font-black tracking-wide">Provider</span><span className="text-slate-900 dark:text-white font-bold capitalize">{user.provider}</span></div>
          <div className="bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-transparent rounded-lg p-2.5"><span className="text-slate-500 dark:text-zinc-500 block text-[9px] uppercase font-black tracking-wide">Joined</span><span className="text-slate-900 dark:text-white font-bold">{new Date(user.created_at).toLocaleDateString()}</span></div>
        </div>

        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-zinc-500 mb-2">Usage this period</h3>
        <div className="space-y-1.5 mb-5">
          {Object.entries(usage || {}).map(([key, u]) => (
            <div key={key} className="flex items-center justify-between text-[11px] bg-slate-50 dark:bg-zinc-800/40 rounded-lg px-2.5 py-1.5">
              <span className="text-slate-700 dark:text-zinc-300 font-semibold">{FEATURE_LABELS[key] || key}{u.lifetime ? ' (lifetime)' : ''}</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">{u.used}{u.limit != null ? ` / ${u.limit}` : ' / ∞'}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => patch('/role', { role: user.role === 'admin' ? 'user' : 'admin' })}
            className="flex-1 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide bg-amber-500/15 text-amber-500 border border-amber-500/30 hover:bg-amber-500/25 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <ShieldCheck size={13} /> {user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
          </button>
          <button
            disabled={busy}
            onClick={() => patch('/status', { is_active: !user.is_active })}
            className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide border transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 ${
              user.is_active ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
            }`}
          >
            <Ban size={13} /> {user.is_active ? 'Suspend' : 'Reactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const { session } = useApp();
  const apiUrl = getApiUrl();
  const token = session?.access_token || localStorage.getItem('access_token');

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`${apiUrl}/api/v1/admin/users?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) { setError('Admin access required.'); return; }
      if (!res.ok) throw new Error('Failed to load users.');
      const data = await res.json();
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, token, search, offset]);

  useEffect(() => { load(); }, [load]);

  const loadStats = useCallback(async () => {
    if (!token) return;
    setStatsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/admin/users/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load admin statistics.');
      setStats({ ...EMPTY_STATS, ...(await res.json()) });
    } catch (err) {
      setError(current => current || err.message);
    } finally {
      setStatsLoading(false);
    }
  }, [apiUrl, token]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const refreshDirectory = useCallback(() => {
    load();
    loadStats();
  }, [load, loadStats]);

  return (
    <div className="p-4 md:p-5 w-full min-h-[calc(100vh-80px)] bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 transition-colors">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl border border-slate-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-zinc-700 text-slate-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-white bg-white dark:bg-transparent transition cursor-pointer">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <UserIcon size={15} className="text-blue-500" /> Users
            </h1>
            <p className="text-[10px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-wide mt-0.5">{total} total accounts</p>
          </div>
        </div>
      </div>

      <section className="mb-5" aria-label="User analytics">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-700 dark:text-zinc-300">Account overview</h2>
            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-zinc-500">Live statistics across all registered accounts</p>
          </div>
          {statsLoading && <span className="text-[10px] font-bold text-blue-500 animate-pulse">Refreshing…</span>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard label="Total users" value={stats.total_users} icon={Users} detail={`${stats.signups_7d} joined this week`} />
          <StatCard label="Free" value={stats.free_users} icon={UserIcon} tone="slate" />
          <StatCard label="Basic" value={stats.basic_users} icon={CheckCircle2} tone="cyan" />
          <StatCard label="Pro" value={stats.pro_users} icon={Sparkles} tone="violet" />
          <StatCard label="Elite" value={stats.elite_users} icon={Crown} tone="amber" />
          <StatCard label="Active" value={stats.active_users} icon={UserCheck} tone="emerald" />
          <StatCard label="Suspended" value={stats.suspended_users} icon={UserX} tone="rose" />
          <StatCard label="Admins" value={stats.admin_users} icon={ShieldCheck} tone="amber" />
          <StatCard label="Verified" value={stats.verified_users} icon={CheckCircle2} tone="blue" />
          <StatCard label="30-day signups" value={stats.signups_30d} icon={TrendingUp} tone="cyan" />
        </div>
      </section>

      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
        <input
          value={search}
          onChange={e => { setOffset(0); setSearch(e.target.value); }}
          placeholder="Search by email or name…"
          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 shadow-sm dark:shadow-none"
        />
      </div>

      {error && <p className="text-xs font-bold text-rose-400 mb-4">{error}</p>}

      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-wider text-slate-500 dark:text-zinc-500 bg-slate-50/80 dark:bg-transparent border-b border-slate-200 dark:border-zinc-800">
                <th className="text-left font-black px-4 py-2">Email</th>
                <th className="text-left font-black px-2 py-2">Role</th>
                <th className="text-left font-black px-2 py-2">Plan</th>
                <th className="text-left font-black px-2 py-2">Status</th>
                <th className="text-left font-black px-2 py-2">Joined</th>
                <th className="text-left font-black px-4 py-2">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500 dark:text-zinc-500 font-semibold">Loading…</td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500 dark:text-zinc-500 font-semibold">No users found.</td></tr>}
              {!loading && users.map(u => (
                <tr key={u.id} onClick={() => setSelectedId(u.id)} className="border-b border-slate-100 dark:border-zinc-800/60 hover:bg-blue-50/60 dark:hover:bg-zinc-800/30 cursor-pointer transition-colors">
                  <td className="px-4 py-2">
                    <div className="font-bold text-slate-900 dark:text-white truncate max-w-[220px]">{u.full_name || '—'}</div>
                    <div className="text-slate-500 dark:text-zinc-500 text-[10px] truncate max-w-[220px]">{u.email}</div>
                  </td>
                  <td className="px-2 py-2"><RoleBadge role={u.role} /></td>
                  <td className="px-2 py-2 text-slate-700 dark:text-zinc-300 capitalize">{u.current_plan || '—'}</td>
                  <td className="px-2 py-2">
                    {u.is_active
                      ? <span className="text-emerald-400 font-bold">Active</span>
                      : <span className="text-rose-400 font-bold">Suspended</span>}
                  </td>
                  <td className="px-2 py-2 text-slate-500 dark:text-zinc-400">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-slate-500 dark:text-zinc-400">{u.last_login ? new Date(u.last_login).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-zinc-800 text-[11px] text-slate-500 dark:text-zinc-500">
          <span>{total === 0 ? '0' : `${offset + 1}-${Math.min(offset + limit, total)}`} of {total}</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-800 disabled:opacity-40 cursor-pointer hover:border-blue-300 dark:hover:border-zinc-700 bg-white dark:bg-transparent">Prev</button>
            <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-800 disabled:opacity-40 cursor-pointer hover:border-blue-300 dark:hover:border-zinc-700 bg-white dark:bg-transparent">Next</button>
          </div>
        </div>
      </div>

      {selectedId && (
        <UserDetailPanel
          userId={selectedId}
          apiUrl={apiUrl}
          token={token}
          onClose={() => setSelectedId(null)}
          onChanged={refreshDirectory}
        />
      )}
    </div>
  );
}
