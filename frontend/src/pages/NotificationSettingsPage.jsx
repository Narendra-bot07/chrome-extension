import React, { useEffect, useState } from 'react';
import { Bell, Clock3, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { notificationApi } from '../services/notificationApi';

const categories = [
  ['application','Applications'],['interview','Interviews'],['recruiter','Recruiter'],['reminder','Reminders'],
  ['resume','Resumes'],['cover_letter','Cover Letters'],['ai_insight','AI Insights'],['security','Security'],
  ['subscription','Subscription'],['product','Product Updates'],['achievement','Achievements']
];
const initial = categories.map(([category]) => ({ category, in_app_enabled: true, email_enabled: true, push_enabled: false }));

export default function NotificationSettingsPage() {
  const { session } = useApp();
  const token = session?.access_token;
  const [rows, setRows] = useState(initial);
  const [settings, setSettings] = useState({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, quiet_hours_start: '22:00', quiet_hours_end: '07:00', smart_reminders_enabled: true });
  const [state, setState] = useState('idle');

  useEffect(() => {
    if (!token) return;
    notificationApi.preferences(token).then(data => {
      if (data.categories?.length) {
        setRows(initial.map(row => {
          const found = data.categories.find(v => v.category === row.category);
          return found ? { ...row, ...found, email_enabled: found.email_enabled !== undefined ? found.email_enabled : true } : row;
        }));
      }
      if (data.categories?.[0]) setSettings(s => ({ ...s, ...data.categories[0] }));
    }).catch(() => setState('error'));
  }, [token]);

  const toggle = (index, key) => setRows(v => v.map((r, i) => i === index ? { ...r, [key]: !r[key] } : r));

  const save = async () => {
    setState('saving');
    try {
      await notificationApi.savePreferences(token, { ...settings, categories: rows });
      setState('saved');
    } catch (_) {
      setState('error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full pb-12">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Bell size={20} className="text-tf-accent"/>
          <h1 className="text-xl font-bold">Notifications</h1>
        </div>
        <p className="text-xs text-tf-text-secondary mt-1">Choose which career signals reach you in app and via email.</p>
      </div>

      <section className="rounded-2xl border border-tf-border bg-tf-surface overflow-hidden">
        <div className="grid grid-cols-[1fr_repeat(2,90px)] px-4 py-3 bg-tf-surface-2 text-[10px] uppercase font-bold text-tf-text-tertiary">
          <span>Category</span>
          <span className="text-center">In app</span>
          <span className="text-center">Email</span>
        </div>
        {rows.map((row, index) => (
          <div key={row.category} className="grid grid-cols-[1fr_repeat(2,90px)] items-center px-4 py-3 border-t border-tf-border text-xs">
            <div className="font-semibold">
              {categories[index]?.[1] || row.category}
              {row.category === 'security' && (
                <span className="ml-2 text-[9px] text-tf-accent">
                  <ShieldCheck size={11} className="inline"/> required
                </span>
              )}
            </div>
            {['in_app_enabled', 'email_enabled'].map(key => (
              <label key={key} className="flex justify-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={row[key]}
                  disabled={row.category === 'security'}
                  onChange={() => toggle(index, key)}
                  className="accent-[var(--tf-accent)] w-4 h-4 rounded cursor-pointer"
                />
              </label>
            ))}
          </div>
        ))}
      </section>

      <section className="mt-5 rounded-2xl border border-tf-border bg-tf-surface p-5 space-y-4">
        <div className="flex items-center gap-2 font-bold text-sm">
          <Clock3 size={16}/> Timing & smart reminders
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-[10px] font-bold text-tf-text-secondary">
            Timezone
            <input
              value={settings.timezone}
              onChange={e => setSettings({ ...settings, timezone: e.target.value })}
              className="mt-1 w-full p-2 rounded-lg border border-tf-border bg-tf-bg text-xs"
            />
          </label>
          <label className="text-[10px] font-bold text-tf-text-secondary">
            Quiet hours start
            <input
              type="time"
              value={settings.quiet_hours_start || ''}
              onChange={e => setSettings({ ...settings, quiet_hours_start: e.target.value })}
              className="mt-1 w-full p-2 rounded-lg border border-tf-border bg-tf-bg text-xs"
            />
          </label>
          <label className="text-[10px] font-bold text-tf-text-secondary">
            Quiet hours end
            <input
              type="time"
              value={settings.quiet_hours_end || ''}
              onChange={e => setSettings({ ...settings, quiet_hours_end: e.target.value })}
              className="mt-1 w-full p-2 rounded-lg border border-tf-border bg-tf-bg text-xs"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
          <input
            type="checkbox"
            checked={settings.smart_reminders_enabled}
            onChange={e => setSettings({ ...settings, smart_reminders_enabled: e.target.checked })}
            className="accent-[var(--tf-accent)] w-4 h-4 rounded cursor-pointer"
          />
          Automatically create useful follow-up and interview reminders
        </label>
      </section>

      {state === 'error' && (
        <p className="mt-3 text-xs text-tf-danger font-medium">
          We couldn’t update notification preferences. Your previous settings are still active.
        </p>
      )}
      <button
        onClick={save}
        disabled={state === 'saving'}
        className="mt-5 px-5 py-2.5 rounded-xl bg-tf-accent hover:bg-tf-accent/90 text-white text-xs font-bold transition cursor-pointer"
      >
        {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Save preferences'}
      </button>
    </div>
  );
}
