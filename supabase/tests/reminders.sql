-- Run: docker exec -i supabase_db_daily-moments psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/reminders.sql
begin;
insert into auth.users (id, instance_id, aud, role, email) values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c1@t.test'),
 ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c2@t.test');
insert into public.reminder_schedules (user_id, local_date, scheduled_for) values
 ('00000000-0000-0000-0000-0000000000c1', current_date, now() - interval '1 minute'),
 ('00000000-0000-0000-0000-0000000000c1', current_date, now() + interval '1 hour');
-- duplicate instant is rejected
do $$ begin
  begin insert into public.reminder_schedules (user_id, local_date, scheduled_for)
    select user_id, local_date, scheduled_for from public.reminder_schedules limit 1;
    raise exception 'duplicate allowed';
  exception when unique_violation then null; end;
end $$;
-- claim takes only due rows, and a second claim gets nothing (no double send)
do $$ begin
  assert (select count(*) from public.claim_due_reminders()) = 1, 'first claim should take 1 due row';
  assert (select count(*) from public.claim_due_reminders()) = 0, 'second claim must take none';
end $$;
-- users cannot read others' reminders or edit status
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}',true);
do $$ begin
  assert (select count(*) from public.reminder_schedules) = 0, 'c2 must not see c1 reminders';
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}',true);
do $$ begin
  begin update public.reminder_schedules set status='sent'; raise exception 'should be blocked';
  exception when insufficient_privilege then null; end;
  begin perform public.claim_due_reminders(); raise exception 'should be blocked';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'reminder tests passed' as result;
