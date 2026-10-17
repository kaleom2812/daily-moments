-- Run: docker exec -i supabase_db_daily-moments psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/drafts.sql
begin;
insert into auth.users (id, instance_id, aud, role, email) values
 ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','e1@t.test'),
 ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','e2@t.test');
insert into public.photos (id, user_id, client_id, storage_path, mime_type, captured_at, status) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1',gen_random_uuid(),'00000000-0000-0000-0000-0000000000e1/a.jpg','image/jpeg',now(),'uploaded'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000e1',gen_random_uuid(),'00000000-0000-0000-0000-0000000000e1/b.jpg','image/jpeg',now(),'uploaded'),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000e1',gen_random_uuid(),'00000000-0000-0000-0000-0000000000e1/c.jpg','image/jpeg',now(),'pending'),
 ('10000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-0000000000e2',gen_random_uuid(),'00000000-0000-0000-0000-0000000000e2/z.jpg','image/jpeg',now(),'uploaded');
insert into public.daily_post_drafts (id, user_id, local_date, status) values
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000e1',(select local_date from public.photos limit 1),'awaiting_review');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}',true);

-- cannot save with someone else's photo, or a not-yet-uploaded photo
do $$ begin
  begin perform public.save_draft('20000000-0000-0000-0000-000000000001','x','{}',array['10000000-0000-0000-0000-000000000009']::uuid[]);
    raise exception 'foreign photo allowed'; exception when sqlstate '22023' then null; end;
  begin perform public.save_draft('20000000-0000-0000-0000-000000000001','x','{}',array['10000000-0000-0000-0000-000000000003']::uuid[]);
    raise exception 'pending photo allowed'; exception when sqlstate '22023' then null; end;
  begin perform public.save_draft('20000000-0000-0000-0000-000000000001','x',array['bad tag'],array['10000000-0000-0000-0000-000000000001']::uuid[]);
    raise exception 'bad hashtag allowed'; exception when sqlstate '22023' then null; end;
end $$;

-- save + reorder works, order is preserved
select public.save_draft('20000000-0000-0000-0000-000000000001','Hello',array['#a','#b'],
  array['10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001']::uuid[]);
select public.save_draft('20000000-0000-0000-0000-000000000001','Hello2',array['#a'],
  array['10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002']::uuid[]);
do $$ begin
  assert (select photo_id from public.daily_post_items where position = 0) = '10000000-0000-0000-0000-000000000001', 'reorder must stick';
  assert (select caption from public.daily_post_drafts) = 'Hello2';
end $$;

-- approve is idempotent; edits are blocked once approved; clients cannot write tables directly
select public.approve_draft('20000000-0000-0000-0000-000000000001');
select public.approve_draft('20000000-0000-0000-0000-000000000001');
do $$ begin
  assert (select status from public.daily_post_drafts) = 'approved';
  begin perform public.save_draft('20000000-0000-0000-0000-000000000001','x','{}',array['10000000-0000-0000-0000-000000000001']::uuid[]);
    raise exception 'edit after approval allowed'; exception when sqlstate 'P0001' then null; end;
  begin update public.daily_post_drafts set status = 'published'; raise exception 'direct write allowed';
    exception when insufficient_privilege then null; end;
end $$;

-- another user cannot see or approve it
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}',true);
do $$ begin
  assert (select count(*) from public.daily_post_drafts) = 0, 'e2 must not see e1 draft';
  assert (select count(*) from public.daily_post_items) = 0, 'e2 must not see e1 items';
  begin perform public.reject_draft('20000000-0000-0000-0000-000000000001'); raise exception 'foreign reject allowed';
    exception when sqlstate 'P0001' then null; end;
end $$;
rollback;
select 'draft tests passed' as result;
