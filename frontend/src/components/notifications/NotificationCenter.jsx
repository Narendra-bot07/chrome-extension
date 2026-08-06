import React, { Component, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCheck, MoreHorizontal, Archive, Clock3, Settings, Shield, Briefcase, Zap, CalendarDays, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationApi } from '../../services/notificationApi';

const tabs = [
  ['All', ''], ['Action Required', 'action_required=true'], ['Applications', 'category=application'],
  ['Interviews', 'category=interview'], ['AI Insights', 'category=ai_insight'], ['Security', 'category=security']
];
const icons = { application: Briefcase, interview: CalendarDays, ai_insight: Zap, security: Shield, reminder: Clock3 };
const relative = value => {
  const seconds = Math.max(1, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

function NotificationCenter({ token }) {
  const navigate = useNavigate();
  const root = useRef(null);
  // The dropdown is portaled to document.body (see render below) so it can
  // stack above modals rendered elsewhere in the app (e.g. the Job Tracker
  // workspace modal, z-[9999]) instead of being trapped under the header's
  // own z-20 stacking context. It needs its own ref for outside-click
  // detection since it's no longer a DOM descendant of `root` once portaled.
  const portalRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [menu, setMenu] = useState(null);

  const refreshCount = useCallback(async () => {
    if (!token || (typeof navigator !== 'undefined' && !navigator.onLine) || document.hidden) return;
    try { setCount((await notificationApi.count(token)).count); } catch (_) {}
  }, [token]);
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(false);
    try { setItems((await notificationApi.list(token, tabs[tab][1])).items); }
    catch (_) { setError(true); }
    finally { setLoading(false); }
  }, [token, tab]);

  useEffect(() => {
    if (!token) {
      setCount(0);
      setItems([]);
      setOpen(false);
      return undefined;
    }
    refreshCount();
    const id = setInterval(refreshCount, 15000);
    const resumePolling = () => {
      if (!document.hidden && navigator.onLine) refreshCount();
    };
    window.addEventListener('online', resumePolling);
    document.addEventListener('visibilitychange', resumePolling);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', resumePolling);
      document.removeEventListener('visibilitychange', resumePolling);
    };
  }, [token, refreshCount]);
  useEffect(() => { if (open) load(); }, [open, load]);
  useLayoutEffect(() => {
    if (open && root.current) {
      const rect = root.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 12, right: window.innerWidth - rect.right });
    }
  }, [open]);
  useEffect(() => {
    const close = event => {
      if (
        root.current && !root.current.contains(event.target) &&
        portalRef.current && !portalRef.current.contains(event.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close);
  }, []);

  const update = async (id, status) => {
    await notificationApi.update(token, id, status);
    setItems(current => status === 'archived' || status === 'dismissed' ? current.filter(n => n.id !== id) : current.map(n => n.id === id ? { ...n, status } : n));
    setMenu(null); refreshCount();
  };
  const act = async item => {
    if (item.status === 'unread') await update(item.id, 'actioned');
    setOpen(false);
    if (item.action_url) navigate(item.action_url);
  };

  const is24h = (timestamp) => {
    if (!timestamp) return false;
    const diff = Date.now() - new Date(timestamp).getTime();
    return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
  };
  const filteredItems = items.filter(n => is24h(n.created_at || n.timestamp));

  return (
    <div className="relative shrink-0" ref={root}>
      <button onClick={() => setOpen(v => !v)} className="relative p-2 rounded-xl border border-tf-border/60 bg-tf-surface-2/50 text-tf-text-secondary hover:text-tf-text transition cursor-pointer" aria-label={`Notifications, ${count} unread`}>
        <Bell size={16} />
        <AnimatePresence>
          {count > 0 && <motion.span key={count} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 bg-tf-danger text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-tf-surface">{count > 99 ? '99+' : count}</motion.span>}
        </AnimatePresence>
      </button>
      {open && createPortal(
          <motion.div
            ref={portalRef}
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ top: menuPos.top, right: menuPos.right }}
            className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md fixed w-[380px] max-h-[500px] flex flex-col border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-[10000] overflow-hidden"
          >
            <div className="p-3.5 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-black uppercase tracking-wider text-tf-text">Notifications</h2>
                  <span className="px-1.5 py-0.5 text-[8.5px] font-black rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 uppercase">
                    LAST 24h
                  </span>
                </div>
                <p className="text-[10px] text-tf-text-tertiary mt-0.5">Useful updates and next actions</p>
              </div>
              <div className="flex gap-1">
                <button title="Mark all as read" onClick={async () => { await notificationApi.markAllRead(token); setItems(v => v.map(n => ({...n,status:'read'}))); refreshCount(); }} className="p-1.5 rounded-lg hover:bg-tf-surface-2 text-tf-text-secondary hover:text-tf-text transition cursor-pointer"><CheckCheck size={14}/></button>
                <button title="Notification settings" onClick={() => { setOpen(false); navigate('/settings/notifications'); }} className="p-1.5 rounded-lg hover:bg-tf-surface-2 text-tf-text-secondary hover:text-tf-text transition cursor-pointer"><Settings size={14}/></button>
              </div>
            </div>

            <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-zinc-200 dark:border-zinc-800 custom-scrollbar shrink-0">
              {tabs.map(([label], index) => <button key={label} onClick={() => setTab(index)} className={`whitespace-nowrap px-2.5 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition ${tab===index?'bg-orange-500 text-white shadow-xs':'text-tf-text-secondary hover:bg-tf-surface-2'}`}>{label}</button>)}
            </div>

            <div className="overflow-y-auto custom-scrollbar flex-1 min-h-48">
              {loading && [1,2].map(i => <div key={i} className="p-3.5 border-b border-zinc-100 dark:border-zinc-800 animate-pulse"><div className="h-3 bg-tf-surface-2 rounded w-2/5 mb-2"/><div className="h-2 bg-tf-surface-2 rounded w-4/5"/></div>)}
              {!loading && error && <div className="p-8 text-center"><p className="text-xs font-semibold">We couldn’t load notifications.</p><button onClick={load} className="mt-2 text-xs text-tf-accent font-bold">Retry</button></div>}
              {!loading && !error && !filteredItems.length && (
                <div className="p-10 text-center space-y-1">
                  <Bell className="mx-auto text-tf-text-tertiary mb-1" size={20}/>
                  <p className="text-xs font-bold text-tf-text">No notifications in the last 24h</p>
                  <p className="text-[10px] text-tf-text-tertiary">New updates will appear here automatically.</p>
                </div>
              )}
              {!loading && filteredItems.map(item => {
                const Icon = icons[item.category] || Bell;
                return (
                  <div key={item.id} className={`p-3.5 border-b border-zinc-100 dark:border-zinc-800/60 transition ${item.status==='unread'?'bg-orange-500/5':''}`}>
                    <div className="flex gap-3 items-start min-w-0">
                      <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-orange-500 shrink-0">
                        <Icon size={15}/>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs font-bold text-tf-text truncate">{item.title}</h3>
                          <span className="text-[9.5px] font-medium text-tf-text-tertiary shrink-0">{relative(item.created_at)}</span>
                        </div>
                        <p className="text-[11px] text-tf-text-secondary mt-1 leading-relaxed line-clamp-2">{item.message}</p>
                        {item.action_label && (
                          <div className="mt-2 flex justify-end">
                            <button onClick={() => act(item)} className="text-[10px] font-bold text-orange-500 hover:underline cursor-pointer">
                              {item.action_label}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>,
          document.body
      )}
    </div>
  );
}

class NotificationCenterBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Notification center failed:', error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <button
          type="button"
          className="relative p-2 rounded-xl border border-tf-border/60 bg-tf-surface-2/50 text-tf-text-secondary"
          aria-label="Notifications unavailable"
          title="Notifications are temporarily unavailable"
        >
          <Bell size={16} />
        </button>
      );
    }

    return this.props.children;
  }
}

export default function SafeNotificationCenter(props) {
  return (
    <NotificationCenterBoundary>
      <NotificationCenter {...props} />
    </NotificationCenterBoundary>
  );
}
