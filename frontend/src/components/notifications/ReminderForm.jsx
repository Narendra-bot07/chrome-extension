import React, { useMemo, useState } from 'react';
import { notificationApi } from '../../services/notificationApi';

const localValue = date => new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
export default function ReminderForm({ token, applications=[], applicationId='', onSaved, onCancel }) {
  const tomorrow=useMemo(()=>{const d=new Date();d.setDate(d.getDate()+1);d.setHours(9,0,0,0);return d;},[]);
  const [form,setForm]=useState({title:'Follow up on application',application_id:applicationId,reminder_type:'application_followup',due_at:localValue(tomorrow),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,priority:'normal',recurrence_rule:'',description:''});
  const [saving,setSaving]=useState(false); const [error,setError]=useState(false);
  const preset=days=>{const d=new Date();d.setDate(d.getDate()+days);d.setHours(9,0,0,0);setForm({...form,due_at:localValue(d)});};
  const submit=async e=>{e.preventDefault();setSaving(true);setError(false);try{const result=await notificationApi.createReminder(token,{...form,due_at:new Date(form.due_at).toISOString(),application_id:form.application_id||null,recurrence_rule:form.recurrence_rule||null});onSaved?.(result);}catch(_){setError(true);}finally{setSaving(false);}};
  return <form onSubmit={submit} className="space-y-3">
    <input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="What do you need to do?" className="w-full p-2.5 rounded-xl border border-tf-border bg-tf-bg text-xs"/>
    <div className="grid grid-cols-2 gap-2">
      <select value={form.application_id} onChange={e=>setForm({...form,application_id:e.target.value})} className="p-2.5 rounded-xl border border-tf-border bg-tf-bg text-xs"><option value="">No application</option>{applications.map(a=><option key={a.id} value={a.id}>{a.company_name} — {a.job_title}</option>)}</select>
      <select value={form.reminder_type} onChange={e=>setForm({...form,reminder_type:e.target.value})} className="p-2.5 rounded-xl border border-tf-border bg-tf-bg text-xs">{['application_followup','recruiter_followup','interview_preparation','interview_event','thank_you_email','document_completion','application_deadline','custom'].map(v=><option key={v} value={v}>{v.replaceAll('_',' ')}</option>)}</select>
      <input type="datetime-local" required value={form.due_at} onChange={e=>setForm({...form,due_at:e.target.value})} className="p-2.5 rounded-xl border border-tf-border bg-tf-bg text-xs"/>
      <select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} className="p-2.5 rounded-xl border border-tf-border bg-tf-bg text-xs">{['normal','high','low'].map(v=><option key={v}>{v}</option>)}</select>
      <select value={form.recurrence_rule} onChange={e=>setForm({...form,recurrence_rule:e.target.value})} className="p-2.5 rounded-xl border border-tf-border bg-tf-bg text-xs"><option value="">Does not repeat</option><option value="FREQ=DAILY">Daily</option><option value="FREQ=WEEKLY">Weekly</option><option value="FREQ=MONTHLY">Monthly</option></select>
      <input value={form.timezone} onChange={e=>setForm({...form,timezone:e.target.value})} className="p-2.5 rounded-xl border border-tf-border bg-tf-bg text-xs"/>
    </div>
    <div className="flex gap-1.5 flex-wrap">{[['Tomorrow morning',1],['In 3 days',3],['In 1 week',7],['After 5 business days',7]].map(([label,days])=><button type="button" key={label} onClick={()=>preset(days)} className="px-2 py-1 rounded-lg bg-tf-surface-2 text-[9px] font-semibold">{label}</button>)}</div>
    <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Notes (optional)" className="w-full p-2.5 rounded-xl border border-tf-border bg-tf-bg text-xs"/>
    {error&&<p className="text-xs text-tf-danger">We couldn’t save this reminder.</p>}
    <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="px-3 py-2 text-xs">Cancel</button><button disabled={saving} className="px-4 py-2 rounded-xl bg-tf-accent text-white text-xs font-bold">{saving?'Saving…':'Add reminder'}</button></div>
  </form>;
}
