-- Reminders, push subscriptions, in-app notifications.
-- Four distinct facts are tracked separately:
--   scheduled  -> reminder_schedules.status = 'scheduled'
--   sent       -> reminder_schedules.sent_at (push service accepted it; NOT proof of device delivery)
--   opened     -> reminder_schedules.opened_at (user tapped it)
--   uploaded   -> photos.status = 'uploaded' (counted separately)

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.reminder_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','sending','sent','failed','skipped','cancelled')),
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, scheduled_for)            -- no duplicate reminders at the same instant
);
create index reminder_due_idx on public.reminder_schedules (scheduled_for) where status = 'scheduled';
create index reminder_user_date_idx on public.reminder_schedules (user_id, local_date);

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reminder_id uuid references public.reminder_schedules (id) on delete set null,
  channel text not null check (channel in ('in_app','push','email')),
  kind text not null check (kind in ('reminder','draft_ready','publish_result')),
  title text not null,
  body text,
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_events_user_idx on public.notification_events (user_id, created_at desc);

alter table public.push_subscriptions enable row level security;
alter table public.reminder_schedules enable row level security;
alter table public.notification_events enable row level security;

create policy push_sub_select on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_sub_insert on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_sub_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

create policy reminders_select on public.reminder_schedules for select to authenticated using (user_id = (select auth.uid()));
create policy reminders_update on public.reminder_schedules for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy notif_select on public.notification_events for select to authenticated using (user_id = (select auth.uid()));
create policy notif_update on public.notification_events for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.push_subscriptions, public.reminder_schedules, public.notification_events from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant insert (user_id, endpoint, p256dh, auth, user_agent) on public.push_subscriptions to authenticated;
grant select on public.reminder_schedules, public.notification_events to authenticated;
grant update (opened_at) on public.reminder_schedules to authenticated;   -- "opened" is reported by the client
grant update (read_at) on public.notification_events to authenticated;
-- Writes to reminder status / notification rows happen only server-side (service role).

-- Atomically claim due reminders so overlapping cron runs never double-send.
create function public.claim_due_reminders(p_limit int default 100)
returns setof public.reminder_schedules
language sql security definer set search_path = '' as $$
  update public.reminder_schedules r
     set status = 'sending', attempts = r.attempts + 1
   where r.id in (
     select id from public.reminder_schedules
      where status = 'scheduled' and scheduled_for <= now()
      order by scheduled_for
      limit p_limit
      for update skip locked)
  returning r.*;
$$;
revoke all on function public.claim_due_reminders(int) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(int) to service_role;
