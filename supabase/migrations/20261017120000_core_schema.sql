-- Core schema: profiles, user_settings, photos, private photo storage.
-- Later migrations add drafts, reminders, publishing, notifications.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  daily_target int not null default 7 check (daily_target between 5 and 10),
  reminder_start time not null default '09:00',
  reminder_end time not null default '21:00',
  min_interval_minutes int not null default 45 check (min_interval_minutes between 10 and 240),
  timezone text not null default 'UTC',
  review_time time not null default '21:30',
  reminders_enabled boolean not null default true,
  notify_in_app boolean not null default true,
  notify_push boolean not null default false,
  notify_email boolean not null default false,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reminder_end > reminder_start)
);

-- IANA timezone validation (a CHECK cannot query pg_timezone_names).
create function public.validate_timezone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid IANA timezone: %', new.timezone using errcode = '22023';
  end if;
  return new;
end $$;

create trigger user_settings_validate_tz
  before insert or update of timezone on public.user_settings
  for each row execute function public.validate_timezone();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- New auth user -> profile + default settings.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null,                       -- client-generated; makes retries idempotent
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/heic')),
  size_bytes int check (size_bytes > 0 and size_bytes <= 10485760),
  caption text check (char_length(caption) <= 500),
  captured_at timestamptz not null,
  timezone text not null,                        -- set by trigger from user_settings
  local_date date not null,                      -- set by trigger; defines the daily collection
  status text not null default 'pending' check (status in ('pending','uploaded','failed')),
  uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, client_id),
  check (storage_path like user_id::text || '/%')
);
create index photos_user_date_idx on public.photos (user_id, local_date, captured_at)
  where status = 'uploaded';

-- Server decides timezone + local date; the client cannot spoof them.
create function public.photos_set_local_date() returns trigger
language plpgsql set search_path = '' as $$
declare tz text;
begin
  select timezone into tz from public.user_settings where user_id = new.user_id;
  if new.captured_at > now() + interval '5 minutes' then
    raise exception 'captured_at is in the future' using errcode = '22007';
  end if;
  new.timezone = coalesce(tz, 'UTC');
  new.local_date = (new.captured_at at time zone new.timezone)::date;
  return new;
end $$;

create trigger photos_local_date before insert on public.photos
  for each row execute function public.photos_set_local_date();

-- A photo counts only after the file really exists in storage.
create function public.confirm_photo_upload(p_photo_id uuid) returns public.photos
language plpgsql security definer set search_path = '' as $$
declare p public.photos;
begin
  select * into p from public.photos where id = p_photo_id and user_id = (select auth.uid());
  if not found then raise exception 'photo not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'photos' and name = p.storage_path) then
    raise exception 'file not uploaded yet' using errcode = 'P0001';
  end if;
  update public.photos set status = 'uploaded', uploaded_at = coalesce(uploaded_at, now())
    where id = p.id returning * into p;
  return p;
end $$;
revoke all on function public.confirm_photo_upload(uuid) from public, anon;
grant execute on function public.confirm_photo_upload(uuid) to authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.photos enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy settings_select on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy settings_update on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy photos_select on public.photos for select to authenticated using (user_id = (select auth.uid()));
create policy photos_insert on public.photos for insert to authenticated with check (user_id = (select auth.uid()));
create policy photos_update on public.photos for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy photos_delete on public.photos for delete to authenticated using (user_id = (select auth.uid()));

-- Column-level grants: clients may only touch the columns they own.
revoke all on public.profiles, public.user_settings, public.photos from anon, authenticated;
grant select on public.profiles, public.user_settings, public.photos to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant update (daily_target, reminder_start, reminder_end, min_interval_minutes, timezone, review_time,
  reminders_enabled, notify_in_app, notify_push, notify_email, onboarded_at) on public.user_settings to authenticated;
grant insert (id, user_id, client_id, storage_path, mime_type, size_bytes, caption, captured_at) on public.photos to authenticated;
grant update (caption) on public.photos to authenticated;
grant delete on public.photos to authenticated;

-- Private bucket: 10 MB cap, image types only, path = <user_id>/<file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy photos_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
