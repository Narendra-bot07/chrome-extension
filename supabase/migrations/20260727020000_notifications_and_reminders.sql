-- TailorFlow notification, domain-event, delivery, preference, and reminder system.
create extension if not exists pgcrypto;

-- Stage notes and follow-up dates are application data first. Keeping them on
-- the application makes them available after reload and lets reminders link
-- back to the exact next action that created them.
alter table public.applications
  add column if not exists next_action text,
  add column if not exists next_action_due_at timestamptz;

do $$ begin
  create type notification_category as enum ('profile','resume','cover_letter','application','interview','recruiter','reminder','ai_insight','security','subscription','product','achievement','system');
exception when duplicate_object then null; end $$;
do $$ begin
  create type notification_priority as enum ('critical','high','normal','low');
exception when duplicate_object then null; end $$;
do $$ begin
  create type notification_status as enum ('unread','read','archived','dismissed','actioned');
exception when duplicate_object then null; end $$;
do $$ begin
  create type reminder_status as enum ('scheduled','due','snoozed','completed','cancelled','overdue');
exception when duplicate_object then null; end $$;

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null,
  related_entity_type text,
  related_entity_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  deduplication_key text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_id uuid references public.notification_events(id) on delete set null,
  category notification_category not null,
  notification_type text not null,
  priority notification_priority not null default 'normal',
  title text not null,
  message text not null,
  status notification_status not null default 'unread',
  action_label text,
  action_url text,
  action_payload_json jsonb,
  related_entity_type text,
  related_entity_id uuid,
  deduplication_key text,
  expires_at timestamptz,
  read_at timestamptz,
  archived_at timestamptz,
  dismissed_at timestamptz,
  actioned_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade legacy TailorFlow notification tables in place. CREATE TABLE IF NOT
-- EXISTS intentionally does not reconcile columns on an existing installation.
alter table public.notifications
  add column if not exists event_id uuid references public.notification_events(id) on delete set null,
  add column if not exists category notification_category,
  add column if not exists notification_type text,
  add column if not exists priority notification_priority not null default 'normal',
  add column if not exists title text,
  add column if not exists message text,
  add column if not exists status notification_status not null default 'unread',
  add column if not exists action_label text,
  add column if not exists action_url text,
  add column if not exists action_payload_json jsonb,
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id uuid,
  add column if not exists deduplication_key text,
  add column if not exists expires_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists dismissed_at timestamptz,
  add column if not exists actioned_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists notifications_active_dedup_idx
  on public.notifications(user_id, deduplication_key)
  where deduplication_key is not null and deleted_at is null
    and status not in ('archived','dismissed','actioned');
create index if not exists notifications_feed_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_state_idx on public.notifications(user_id, status, priority);
create index if not exists notifications_category_idx on public.notifications(user_id, category, created_at desc);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  recruiter_contact_id uuid,
  interview_id uuid,
  reminder_type text not null check (reminder_type in ('application_followup','recruiter_followup','interview_preparation','interview_event','thank_you_email','document_completion','application_deadline','custom')),
  title text not null,
  description text,
  due_at timestamptz not null,
  timezone text not null default 'UTC',
  priority notification_priority not null default 'normal',
  status reminder_status not null default 'scheduled',
  recurrence_rule text,
  snoozed_until timestamptz,
  completed_at timestamptz,
  created_by text not null default 'user',
  last_fired_at timestamptz,
  overdue_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reminders_due_idx on public.reminders(status, coalesce(snoozed_until, due_at));
create index if not exists reminders_user_idx on public.reminders(user_id, status, due_at);
create unique index if not exists reminders_smart_dedup_idx
  on public.reminders(user_id, application_id, reminder_type, due_at)
  where status in ('scheduled','due','snoozed','overdue');

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('in_app','email','browser_push','mobile_push')),
  status text not null default 'pending' check (status in ('pending','delivered','failed','deferred','cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  error_code text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id, channel)
);
alter table public.notification_deliveries
  add column if not exists next_attempt_at timestamptz;
create index if not exists notification_deliveries_pending_idx
  on public.notification_deliveries(status, next_attempt_at)
  where status in ('pending','failed','deferred');

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category notification_category not null,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  push_enabled boolean not null default false,
  digest_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text not null default 'UTC',
  daily_digest_enabled boolean not null default false,
  digest_time time not null default '08:00',
  smart_reminders_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, category)
);

alter table public.notifications enable row level security;
alter table public.reminders enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;

do $$ begin
  create policy notifications_owner on public.notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy reminders_owner on public.reminders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy preferences_owner on public.notification_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  create policy events_owner on public.notification_events for select using (auth.uid() = user_id);
  create policy deliveries_owner on public.notification_deliveries for select using (
    exists (select 1 from public.notifications n where n.id = notification_id and n.user_id = auth.uid())
  );
exception when duplicate_object then null; end $$;
