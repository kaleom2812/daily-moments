-- Daily post drafts. One draft per user per local date (idempotent daily job).
-- Clients can only read drafts; every change goes through the RPCs below, which check
-- ownership, status and photo eligibility server-side.

alter table public.user_settings
  add column carousel_size int not null default 7 check (carousel_size between 2 and 10);
grant update (carousel_size) on public.user_settings to authenticated;

create table public.daily_post_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  status text not null default 'processing' check (status in
    ('processing','awaiting_review','approved','rejected','failed','publishing','published')),
  caption text not null default '' check (char_length(caption) <= 2200),
  hashtags text[] not null default '{}' check (cardinality(hashtags) <= 30),
  ai_provider text,
  partial boolean not null default false,         -- fewer photos than the daily target
  error text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);
create index drafts_user_idx on public.daily_post_drafts (user_id, local_date desc);

create table public.daily_post_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.daily_post_drafts (id) on delete cascade,
  photo_id uuid not null references public.photos (id) on delete cascade,
  position int not null check (position >= 0),
  unique (draft_id, photo_id),
  unique (draft_id, position) deferrable initially deferred
);

create trigger drafts_touch before update on public.daily_post_drafts
  for each row execute function public.touch_updated_at();

alter table public.daily_post_drafts enable row level security;
alter table public.daily_post_items enable row level security;

create policy drafts_select on public.daily_post_drafts for select to authenticated using (user_id = (select auth.uid()));
create policy items_select on public.daily_post_items for select to authenticated
  using (exists (select 1 from public.daily_post_drafts d where d.id = draft_id and d.user_id = (select auth.uid())));

revoke all on public.daily_post_drafts, public.daily_post_items from anon, authenticated;
grant select on public.daily_post_drafts, public.daily_post_items to authenticated;

-- Replace caption, hashtags and the ordered photo list of a draft that is awaiting review.
create function public.save_draft(p_draft_id uuid, p_caption text, p_hashtags text[], p_photo_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare d public.daily_post_drafts; n int := coalesce(cardinality(p_photo_ids), 0); h text;
begin
  select * into d from public.daily_post_drafts where id = p_draft_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'draft not found' using errcode = 'P0002'; end if;
  if d.status <> 'awaiting_review' then raise exception 'draft is % and cannot be edited', d.status using errcode = 'P0001'; end if;
  if n < 1 or n > 10 then raise exception 'a post needs 1 to 10 photos' using errcode = '22023'; end if;
  if (select count(distinct x) from unnest(p_photo_ids) x) <> n then raise exception 'duplicate photos' using errcode = '22023'; end if;
  if char_length(coalesce(p_caption, '')) > 2200 then raise exception 'caption too long' using errcode = '22023'; end if;
  if cardinality(coalesce(p_hashtags, '{}')) > 30 then raise exception 'too many hashtags' using errcode = '22023'; end if;
  foreach h in array coalesce(p_hashtags, '{}') loop
    if h !~ '^#[[:alnum:]_]{1,100}$' then raise exception 'invalid hashtag' using errcode = '22023'; end if;
  end loop;
  -- every photo must be the caller's, confirmed uploaded, and from the draft's local date
  if (select count(*) from public.photos
        where id = any (p_photo_ids) and user_id = d.user_id and status = 'uploaded' and local_date = d.local_date) <> n then
    raise exception 'ineligible photo' using errcode = '22023';
  end if;
  delete from public.daily_post_items where draft_id = d.id;
  insert into public.daily_post_items (draft_id, photo_id, position)
    select d.id, pid, ord - 1 from unnest(p_photo_ids) with ordinality as t(pid, ord);
  update public.daily_post_drafts set caption = coalesce(p_caption, ''), hashtags = coalesce(p_hashtags, '{}') where id = d.id;
end $$;

-- Explicit approval. Idempotent: approving an approved draft is a no-op.
create function public.approve_draft(p_draft_id uuid) returns public.daily_post_drafts
language plpgsql security definer set search_path = '' as $$
declare d public.daily_post_drafts;
begin
  select * into d from public.daily_post_drafts where id = p_draft_id and user_id = (select auth.uid()) for update;
  if not found then raise exception 'draft not found' using errcode = 'P0002'; end if;
  if d.status = 'approved' then return d; end if;
  if d.status <> 'awaiting_review' then raise exception 'draft is % and cannot be approved', d.status using errcode = 'P0001'; end if;
  if not exists (select 1 from public.daily_post_items where draft_id = d.id) then
    raise exception 'draft has no photos' using errcode = 'P0001';
  end if;
  update public.daily_post_drafts set status = 'approved', approved_at = now() where id = d.id returning * into d;
  return d;
end $$;

create function public.reopen_draft(p_draft_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.daily_post_drafts set status = 'awaiting_review', approved_at = null
   where id = p_draft_id and user_id = (select auth.uid()) and status = 'approved';
  if not found then raise exception 'only an approved, unpublished draft can be reopened' using errcode = 'P0001'; end if;
end $$;

create function public.reject_draft(p_draft_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.daily_post_drafts set status = 'rejected', approved_at = null
   where id = p_draft_id and user_id = (select auth.uid()) and status in ('awaiting_review','approved','failed');
  if not found then raise exception 'draft cannot be discarded in its current state' using errcode = 'P0001'; end if;
end $$;

revoke all on function public.save_draft(uuid, text, text[], uuid[]), public.approve_draft(uuid),
  public.reopen_draft(uuid), public.reject_draft(uuid) from public, anon;
grant execute on function public.save_draft(uuid, text, text[], uuid[]), public.approve_draft(uuid),
  public.reopen_draft(uuid), public.reject_draft(uuid) to authenticated;
