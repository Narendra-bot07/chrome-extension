import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, MoreHorizontal, Archive, Clock3, Settings, Shield, Briefcase, Sparkles, CalendarDays, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationApi } from '../../services/notificationApi';

const tabs = [
  ['All', ''], ['Action Required', 'action_required=true'], ['Applications', 'category=application'],
  ['Interviews', 'category=interview'], ['AI Insights', 'category=ai_insight'], ['Security', 'category=security']
];
const icons = { application: Briefcase, interview: CalendarDays, ai_insight: Sparkles, security: Shield, reminder: Clock3 };
const relative = value => {
  const seconds = Math.max(1, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

export default function NotificationCenter({ token }) {
  const navigate = useNavigate();
  const root = useRef(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [menu, setMenu] = useState(null);

  const refreshCount = useCallback(async () => {
    if (!token) return;
    try { setCount((await notificationApi.count(token)).count); } catch (_) {}
  }, [token]);
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(false);
    try { setItems((await notificationApi.list(token, tabs[tab][1])).items); }
    catch (_) { setError(true); }
    finally { setLoading(false); }
  }, [token, tab]);

  useEffect(() => { refreshCount(); const id = setInterval(refreshCount, 15000); return () => clearInterval(id); }, [refreshCount]);
  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => {
    const close = event => { if (root.current && !root.current.contains(event.target)) setOpen(false); };
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

  return (
    <div className="relative" ref={root}>
      <button onClick={() => setOpen(v => !v)} className="relative p-2 rounded-xl border border-tf-border/60 bg-tf-surface-2/50 text-tf-text-secondary hover:text-tf-text transition" aria-label={`Notifications, ${count} unread`}>
        <Bell size={16} />
        {count > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 bg-tf-danger text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-tf-surface">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && <div className="absolute right-0 top-full mt-2 w-[min(94vw,430px)] max-h-[78vh] flex flex-col bg-tf-surface border border-tf-border rounded-2xl shadow-2xl z-[80] overflow-hidden">
        <div className="p-4 flex items-center justify-between border-b border-tf-border">
          <div><h2 className="text-sm font-bold text-tf-text">Notifications</h2><p className="text-[10px] text-tf-text-tertiary">Useful updates and next actions</p></div>
          <div className="flex gap-1">
            <button title="Mark all as read" onClick={async () => { await notificationApi.markAllRead(token); setItems(v => v.map(n => ({...n,status:'read'}))); refreshCount(); }} className="p-2 rounded-lg hover:bg-tf-surface-2"><CheckCheck size={15}/></button>
            <button title="Notification settings" onClick={() => { setOpen(false); navigate('/settings/notifications'); }} className="p-2 rounded-lg hover:bg-tf-surface-2"><Settings size={15}/></button>
          </div>
        </div>
        <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-tf-border">
          {tabs.map(([label], index) => <button key={label} onClick={() => setTab(index)} className={`whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[10px] font-bold ${tab===index?'bg-tf-accent text-white':'text-tf-text-secondary hover:bg-tf-surface-2'}`}>{label}</button>)}
        </div>
        <div className="overflow-y-auto min-h-52">
          {loading && [1,2,3].map(i => <div key={i} className="p-4 border-b border-tf-border animate-pulse"><div className="h-3 bg-tf-surface-2 rounded w-2/5 mb-2"/><div className="h-2 bg-tf-surface-2 rounded w-4/5"/></div>)}
          {!loading && error && <div className="p-8 text-center"><p className="text-xs font-semibold">We couldn’t load notifications.</p><button onClick={load} className="mt-2 text-xs text-tf-accent">Retry</button></div>}
          {!loading && !error && !items.length && <div className="p-10 text-center"><Bell className="mx-auto mb-2 text-tf-text-tertiary" size={22}/><p className="text-xs font-semibold">You’re all caught up</p></div>}
          {!loading && items.map(item => {
            const Icon = icons[item.category] || Bell;
            return <div key={item.id} className={`relative p-3.5 border-b border-tf-border hover:bg-tf-surface-2/60 ${item.status==='unread'?'bg-tf-accent/5':''}`}>
              <div className="flex gap-3">
                <div className="mt-0.5 p-2 rounded-xl bg-tf-surface-2 h-fit"><Icon size={15}/></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-xs font-bold text-tf-text">{item.title}</h3>
                    <button onClick={() => setMenu(menu===item.id?null:item.id)} className="p-1 rounded hover:bg-tf-surface"><MoreHorizontal size={14}/></button>
                  </div>
                  <p className="text-[11px] text-tf-text-secondary mt-0.5 leading-relaxed">{item.message}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[9px] text-tf-text-tertiary">{relative(item.created_at)}</span>
                    {item.priority !== 'normal' && <span className={`text-[8px] uppercase font-black ${item.priority==='critical'?'text-tf-danger':item.priority==='high'?'text-amber-600':'text-tf-text-tertiary'}`}>{item.priority}</span>}
                    {item.action_label && <button onClick={() => act(item)} className="ml-auto text-[10px] font-bold text-tf-accent hover:underline">{item.action_label}</button>}
                  </div>
                </div>
              </div>
              {menu===item.id && <div className="absolute right-4 top-10 z-10 w-40 bg-tf-surface border border-tf-border rounded-xl shadow-xl py-1 text-[11px]">
                <button className="w-full px-3 py-2 text-left hover:bg-tf-surface-2" onClick={() => update(item.id,item.status==='unread'?'read':'unread')}>{item.status==='unread'?'Mark read':'Mark unread'}</button>
                <button className="w-full px-3 py-2 text-left hover:bg-tf-surface-2 flex gap-2" onClick={() => update(item.id,'archived')}><Archive size={12}/>Archive</button>
                <button className="w-full px-3 py-2 text-left hover:bg-tf-surface-2 flex gap-2" onClick={() => update(item.id,'dismissed')}><X size={12}/>Dismiss</button>
                {item.action_url && <button className="w-full px-3 py-2 text-left hover:bg-tf-surface-2" onClick={() => act(item)}>Open related item</button>}
              </div>}
            </div>;
          })}
        </div>
      </div>}
    </div>
  );
}
