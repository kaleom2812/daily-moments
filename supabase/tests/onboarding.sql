-- Run: docker exec -i supabase_db_daily-moments psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/onboarding.sql
begin;
insert into auth.users (id, instance_id, aud, role, email) values
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','d1@t.test');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}',true);
update public.profiles set display_name='Om' where id='00000000-0000-0000-0000-0000000000d1';
update public.user_settings set daily_target=7, reminder_start='09:00', reminder_end='21:00', timezone='Asia/Calcutta',
  review_time='21:30', notify_in_app=true, onboarded_at=now() where user_id='00000000-0000-0000-0000-0000000000d1';
do $$ begin
  assert (select count(*) from public.user_settings where onboarded_at is not null) = 1, 'onboarding update must affect the row';
  assert (select count(*) from public.profiles where display_name='Om') = 1, 'profile update must affect the row';
end $$;
rollback;
select 'onboarding update ok' as result;
