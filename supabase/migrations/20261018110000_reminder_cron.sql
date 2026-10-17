-- Every-minute cron that calls the reminder-tick Edge Function.
-- The function URL and shared secret live in Supabase Vault (inserted once, never committed):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.invoke_reminder_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  sec  text := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
begin
  if base is null or sec is null then
    raise warning 'reminder cron: vault secrets project_url / cron_secret are not set';
    return;
  end if;
  perform net.http_post(
    url := base || '/functions/v1/reminder-tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', sec),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;
revoke all on function public.invoke_reminder_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'reminder-tick';
select cron.schedule('reminder-tick', '* * * * *', 'select public.invoke_reminder_tick()');
