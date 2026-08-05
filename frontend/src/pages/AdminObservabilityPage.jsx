import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowLeft, Cpu, RefreshCw, Timer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getApiUrl } from '../config/apiConfig';

// Validated via the dataviz skill's palette validator against this app's
// actual light (#FFFFFF) and dark (#1b1e24) surfaces -- the app-wide
// --tf-status-success/warning/danger tokens FAIL that validator (adjacent
// pairs too close to tell apart, even for full-color vision), so this page
// uses its own separately-validated status triad instead of propagating a
// known-bad palette into new UI.
const STATUS_COLORS = {
  light: { good: '#10b981', warn: '#f59e0b', crit: '#f43f5e', neutral: '#8b93a1' },
  dark: { good: '#059669', warn: '#d97706', crit: '#e11d48', neutral: '#747c89' }
};

const REFRESH_MS = 5000;

function StatTile({ label, value, sub, icon: Icon, tone }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-1.5 text-zinc-500">
        {Icon && <Icon size={13} />}
        <span className="text-[9.5px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-2xl font-black text-white truncate" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-zinc-500 font-semibold truncate">{sub}</div>}
    </div>
  );
}

function CompositionBar({ totals, colors }) {
  const segments = [
    { key: '2xx', label: '2xx', value: totals['2xx'], color: colors.good },
    { key: '3xx', label: '3xx', value: totals['3xx'], color: colors.neutral },
    { key: '4xx', label: '4xx', value: totals['4xx'], color: colors.warn },
    { key: '5xx', label: '5xx', value: totals['5xx'], color: colors.crit }
  ].filter(s => s.value > 0);
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (!total) {
    return <p className="text-xs text-zinc-500 font-semibold">No requests recorded yet since the last restart.</p>;
  }

  return (
    <div>
      <div className="flex w-full h-3 rounded-full overflow-hidden gap-0.5 bg-zinc-800">
        {segments.map(s => (
          <div
            key={s.key}
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
        {segments.map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-[11px] font-bold text-zinc-300">{s.label}</span>
            <span className="text-[11px] font-black text-white">{s.value.toLocaleString()}</span>
            <span className="text-[10px] text-zinc-500">({((s.value / total) * 100).toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ code, colors }) {
  const color = code >= 500 ? colors.crit : code >= 400 ? colors.warn : code >= 300 ? colors.neutral : colors.good;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black font-mono"
      style={{ color, backgroundColor: `${color}1a`, border: `1px solid ${color}40` }}
    >
      {code}
    </span>
  );
}

export default function AdminObservabilityPage() {
  const navigate = useNavigate();
  const { session, darkMode } = useApp();
  const apiUrl = getApiUrl();
  const colors = darkMode ? STATUS_COLORS.dark : STATUS_COLORS.light;

  const [summary, setSummary] = useState(null);
  const [recentRequests, setRecentRequests] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    const token = session?.access_token || localStorage.getItem('access_token');
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [summaryRes, requestsRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/admin/observability/summary`, { headers }),
        fetch(`${apiUrl}/api/v1/admin/observability/requests?limit=100`, { headers })
      ]);
      if (summaryRes.status === 403 || requestsRes.status === 403) {
        setError('Admin access required to view observability data.');
        return;
      }
      if (!summaryRes.ok || !requestsRes.ok) throw new Error('Failed to load observability data.');
      const summaryData = await summaryRes.json();
      const requestsData = await requestsRes.json();
      setSummary(summaryData);
      setRecentRequests(requestsData.requests || []);
      setError('');
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message || 'Failed to load observability data.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, session?.access_token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [autoRefresh, fetchData]);

  const totals = summary?.totals || { requests: 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, error_rate: 0, in_progress: 0 };
  const resources = summary?.resources || {};
  const routes = summary?.routes || [];

  const overallAvgMs = routes.length
    ? routes.reduce((sum, r) => sum + (r.avg_ms || 0) * r.total, 0) / Math.max(1, routes.reduce((sum, r) => sum + r.total, 0))
    : null;

  const formatUptime = (seconds) => {
    if (seconds == null) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="p-4 md:p-5 w-full min-h-[calc(100vh-80px)] bg-zinc-950 text-zinc-100">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Activity size={15} className="text-blue-500" /> Observability
            </h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wide mt-0.5">
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading…'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition cursor-pointer flex items-center gap-1.5 ${
              autoRefresh
                ? 'bg-blue-600/15 border-blue-600/40 text-blue-400'
                : 'bg-zinc-900 border-zinc-800 text-zinc-500'
            }`}
          >
            <RefreshCw size={12} className={autoRefresh ? 'animate-spin' : ''} style={autoRefresh ? { animationDuration: '2.5s' } : undefined} />
            Auto-refresh {autoRefresh ? 'on' : 'off'}
          </button>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border border-zinc-800 hover:border-zinc-700 text-zinc-300 transition cursor-pointer"
          >
            Refresh now
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-5 p-3.5 rounded-xl border flex items-center gap-2 text-xs font-bold" style={{ borderColor: `${colors.crit}40`, backgroundColor: `${colors.crit}15`, color: colors.crit }}>
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {loading && !summary ? (
        <p className="text-xs text-zinc-500 font-semibold">Loading…</p>
      ) : summary ? (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <StatTile label="Total Requests" value={totals.requests.toLocaleString()} icon={Activity} />
            <StatTile
              label="Error Rate"
              value={`${totals.error_rate}%`}
              sub={`${totals['4xx'] + totals['5xx']} failed`}
              tone={totals.error_rate > 0 ? colors.warn : undefined}
              icon={AlertTriangle}
            />
            <StatTile label="In Progress" value={totals.in_progress} icon={Timer} />
            <StatTile label="Avg Latency" value={overallAvgMs != null ? `${overallAvgMs.toFixed(0)}ms` : '—'} icon={Timer} />
            <StatTile label="Memory" value={`${resources.memory_mb ?? '—'} MB`} sub={resources.virtual_memory_mb ? `${resources.virtual_memory_mb} MB virtual` : undefined} icon={Cpu} />
            <StatTile label="Uptime" value={formatUptime(resources.uptime_seconds)} sub={resources.cpu_seconds_total != null ? `${resources.cpu_seconds_total}s CPU` : undefined} icon={Cpu} />
          </div>

          {/* Composition bar */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">Response Status Mix (since process start)</h2>
            <CompositionBar totals={totals} colors={colors} />
          </div>

          {/* Routes table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mb-6">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 px-4 pt-4 pb-2">By Route</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9.5px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                    <th className="text-left font-black px-4 py-2">Method</th>
                    <th className="text-left font-black px-2 py-2">Route</th>
                    <th className="text-right font-black px-2 py-2">Total</th>
                    <th className="text-right font-black px-2 py-2">2xx</th>
                    <th className="text-right font-black px-2 py-2">4xx</th>
                    <th className="text-right font-black px-2 py-2">5xx</th>
                    <th className="text-right font-black px-2 py-2">Error %</th>
                    <th className="text-right font-black px-4 py-2">Avg ms</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-6 text-center text-zinc-500 font-semibold">No requests recorded yet.</td></tr>
                  )}
                  {routes.map(r => (
                    <tr key={`${r.method}-${r.route}`} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                      <td className="px-4 py-2 font-mono font-bold text-zinc-400">{r.method}</td>
                      <td className="px-2 py-2 font-mono text-zinc-200 truncate max-w-[280px]">{r.route}</td>
                      <td className="px-2 py-2 text-right font-black text-white">{r.total.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right" style={{ color: colors.good }}>{r['2xx'] || ''}</td>
                      <td className="px-2 py-2 text-right" style={{ color: colors.warn }}>{r['4xx'] || ''}</td>
                      <td className="px-2 py-2 text-right" style={{ color: colors.crit }}>{r['5xx'] || ''}</td>
                      <td className="px-2 py-2 text-right text-zinc-400">{r.error_rate}%</td>
                      <td className="px-4 py-2 text-right text-zinc-400">{r.avg_ms != null ? r.avg_ms : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent requests live feed */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 px-4 pt-4 pb-2">Recent Requests (live)</h2>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-900">
                  <tr className="text-[9.5px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
                    <th className="text-left font-black px-4 py-2">Time</th>
                    <th className="text-left font-black px-2 py-2">Method</th>
                    <th className="text-left font-black px-2 py-2">Route</th>
                    <th className="text-left font-black px-2 py-2">Status</th>
                    <th className="text-right font-black px-4 py-2">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-zinc-500 font-semibold">No requests recorded yet.</td></tr>
                  )}
                  {recentRequests.map(r => (
                    <tr key={r.request_id + r.timestamp} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                      <td className="px-4 py-1.5 font-mono text-zinc-500">{new Date(r.timestamp).toLocaleTimeString()}</td>
                      <td className="px-2 py-1.5 font-mono font-bold text-zinc-400">{r.method}</td>
                      <td className="px-2 py-1.5 font-mono text-zinc-200 truncate max-w-[320px]">{r.route}</td>
                      <td className="px-2 py-1.5"><StatusBadge code={r.status_code} colors={colors} /></td>
                      <td className="px-4 py-1.5 text-right text-zinc-400">{r.duration_ms.toFixed(0)}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
