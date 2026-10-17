-- Run: docker exec -i supabase_db_daily-moments psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql
begin;
insert into auth.users (id, instance_id, aud, role, email) values
 ('00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@t.test'),
 ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@t.test');
update public.user_settings set timezone='Pacific/Auckland' where user_id='00000000-0000-0000-0000-00000000000a';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',true);

insert into public.photos (user_id, client_id, storage_path, mime_type, captured_at)
 values ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), '00000000-0000-0000-0000-00000000000a/1.jpg','image/jpeg','2026-01-01 23:30:00+00');
do $$ begin
  assert (select local_date from public.photos) = '2026-01-02', 'local_date must follow user timezone (NZ is UTC+13)';
  assert (select status from public.photos) = 'pending', 'new photo must be pending';
end $$;

-- cannot insert for another user
do $$ begin
  begin insert into public.photos (user_id, client_id, storage_path, mime_type, captured_at)
   values ('00000000-0000-0000-0000-00000000000b', gen_random_uuid(), '00000000-0000-0000-0000-00000000000b/1.jpg','image/jpeg',now());
   raise exception 'should have been blocked';
  exception when insufficient_privilege then null; end;
end $$;
-- cannot self-mark uploaded
do $$ begin
  begin update public.photos set status='uploaded'; raise exception 'should have been blocked';
  exception when insufficient_privilege then null; end;
end $$;
-- confirm fails without a stored file
do $$ begin
  begin perform public.confirm_photo_upload((select id from public.photos)); raise exception 'should have been blocked';
  exception when sqlstate 'P0001' then null; end;
end $$;
-- user B sees nothing of A
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}',true);
do $$ begin
  assert (select count(*) from public.photos) = 0, 'B must not see A photos';
  assert (select count(*) from public.user_settings) = 1, 'B sees only own settings';
end $$;
-- invalid timezone rejected
do $$ begin
  begin update public.user_settings set timezone='Mars/Base'; raise exception 'should have been blocked';
  exception when sqlstate '22023' then null; end;
end $$;
rollback;
select 'RLS tests passed' as result;
