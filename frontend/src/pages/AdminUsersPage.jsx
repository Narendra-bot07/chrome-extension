import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, Ban, Crown, Search, ShieldCheck, User as UserIcon, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getApiUrl } from '../config/apiConfig';

const FEATURE_LABELS = {
  jd_extraction: 'JD Extractions',
  resume_upload: 'Resume Uploads',
  resume_generation: 'Resume Generations',
  cover_letter_generation: 'Cover Letter Generations',
};

function RoleBadge({ role }) {
  if (role === 'admin') {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black bg-amber-500/15 text-amber-500 border border-amber-500/30"><Crown size={10} /> ADMIN</span>;
  }
  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">USER</span>;
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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-xs text-zinc-400" onClick={e => e.stopPropagation()}>
        {error || 'Loading…'}
      </div>
    </div>
  );

  const { user, subscription, usage } = detail;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-white">{user.full_name || user.email}</h2>
              <RoleBadge role={user.role} />
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">{user.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 cursor-pointer"><X size={16} /></button>
        </div>

        {error && <p className="text-[11px] font-bold text-rose-400 mb-3">{error}</p>}

        <div className="grid grid-cols-2 gap-2 mb-4 text-[11px]">
          <div className="bg-zinc-800/60 rounded-lg p-2.5"><span className="text-zinc-500 block text-[9px] uppercase font-black tracking-wide">Plan</span><span className="text-white font-bold">{subscription?.plan_name || user.current_plan || '—'}</span></div>
          <div className="bg-zinc-800/60 rounded-lg p-2.5"><span className="text-zinc-500 block text-[9px] uppercase font-black tracking-wide">Status</span><span className="text-white font-bold">{user.is_active ? 'Active' : 'Suspended'}</span></div>
          <div className="bg-zinc-800/60 rounded-lg p-2.5"><span className="text-zinc-500 block text-[9px] uppercase font-black tracking-wide">Provider</span><span className="text-white font-bold capitalize">{user.provider}</span></div>
          <div className="bg-zinc-800/60 rounded-lg p-2.5"><span className="text-zinc-500 block text-[9px] uppercase font-black tracking-wide">Joined</span><span className="text-white font-bold">{new Date(user.created_at).toLocaleDateString()}</span></div>
        </div>

        <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Usage this period</h3>
        <div className="space-y-1.5 mb-5">
          {Object.entries(usage || {}).map(([key, u]) => (
            <div key={key} className="flex items-center justify-between text-[11px] bg-zinc-800/40 rounded-lg px-2.5 py-1.5">
              <span className="text-zinc-300 font-semibold">{FEATURE_LABELS[key] || key}{u.lifetime ? ' (lifetime)' : ''}</span>
              <span className="font-mono font-bold text-white">{u.used}{u.limit != null ? ` / ${u.limit}` : ' / ∞'}</span>
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

  return (
    <div className="p-4 md:p-5 w-full min-h-[calc(100vh-80px)] bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
              <UserIcon size={15} className="text-blue-500" /> Users
            </h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wide mt-0.5">{total} total accounts</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/admin/observability')}
          className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border border-zinc-800 hover:border-zinc-700 text-zinc-300 transition cursor-pointer flex items-center gap-1.5"
        >
          <Activity size={12} /> Observability
        </button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={search}
          onChange={e => { setOffset(0); setSearch(e.target.value); }}
          placeholder="Search by email or name…"
          className="w-full pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-600"
        />
      </div>

      {error && <p className="text-xs font-bold text-rose-400 mb-4">{error}</p>}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                <th className="text-left font-black px-4 py-2">Email</th>
                <th className="text-left font-black px-2 py-2">Role</th>
                <th className="text-left font-black px-2 py-2">Plan</th>
                <th className="text-left font-black px-2 py-2">Status</th>
                <th className="text-left font-black px-2 py-2">Joined</th>
                <th className="text-left font-black px-4 py-2">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-zinc-500 font-semibold">Loading…</td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-zinc-500 font-semibold">No users found.</td></tr>}
              {!loading && users.map(u => (
                <tr key={u.id} onClick={() => setSelectedId(u.id)} className="border-b border-zinc-800/60 hover:bg-zinc-800/30 cursor-pointer">
                  <td className="px-4 py-2">
                    <div className="font-bold text-white truncate max-w-[220px]">{u.full_name || '—'}</div>
                    <div className="text-zinc-500 text-[10px] truncate max-w-[220px]">{u.email}</div>
                  </td>
                  <td className="px-2 py-2"><RoleBadge role={u.role} /></td>
                  <td className="px-2 py-2 text-zinc-300 capitalize">{u.current_plan || '—'}</td>
                  <td className="px-2 py-2">
                    {u.is_active
                      ? <span className="text-emerald-400 font-bold">Active</span>
                      : <span className="text-rose-400 font-bold">Suspended</span>}
                  </td>
                  <td className="px-2 py-2 text-zinc-400">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-zinc-400">{u.last_login ? new Date(u.last_login).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 text-[11px] text-zinc-500">
          <span>{total === 0 ? '0' : `${offset + 1}-${Math.min(offset + limit, total)}`} of {total}</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="px-2.5 py-1 rounded-lg border border-zinc-800 disabled:opacity-40 cursor-pointer hover:border-zinc-700">Prev</button>
            <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} className="px-2.5 py-1 rounded-lg border border-zinc-800 disabled:opacity-40 cursor-pointer hover:border-zinc-700">Next</button>
          </div>
        </div>
      </div>

      {selectedId && (
        <UserDetailPanel
          userId={selectedId}
          apiUrl={apiUrl}
          token={token}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
