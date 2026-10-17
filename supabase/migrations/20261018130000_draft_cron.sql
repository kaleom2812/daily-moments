-- Every-5-minutes cron for draft-tick. Reuses the vault secrets set up for reminder-tick.
create or replace function public.invoke_edge_function(p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  base text := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url');
  sec  text := (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
begin
  if base is null or sec is null then
    raise warning 'cron: vault secrets project_url / cron_secret are not set';
    return;
  end if;
  perform net.http_post(
    url := base || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', sec),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;
revoke all on function public.invoke_edge_function(text) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'draft-tick';
select cron.schedule('draft-tick', '*/5 * * * *', $$select public.invoke_edge_function('draft-tick')$$);
