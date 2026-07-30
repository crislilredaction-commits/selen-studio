-- Ordonnancement Supabase Cron du worker Telegram Forge.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table public.forge_telegram_worker_runs (
  id uuid primary key default gen_random_uuid(),
  invocation_key text not null unique,
  source text not null default 'supabase_cron',
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  processed_count integer,
  sent_count integer,
  error_code text,
  created_at timestamptz not null default now(),
  constraint forge_telegram_worker_runs_source_check check (
    source in ('supabase_cron', 'manual_mock')
  ),
  constraint forge_telegram_worker_runs_status_check check (
    status in ('running', 'completed', 'skipped', 'failed')
  ),
  constraint forge_telegram_worker_runs_counts_check check (
    (processed_count is null or processed_count >= 0)
    and (sent_count is null or sent_count >= 0)
  ),
  constraint forge_telegram_worker_runs_finished_check check (
    (status = 'running' and finished_at is null)
    or (status <> 'running' and finished_at is not null)
  )
);

create index forge_telegram_worker_runs_history_idx
  on public.forge_telegram_worker_runs(started_at desc);
create unique index forge_telegram_worker_runs_single_running_idx
  on public.forge_telegram_worker_runs((true))
  where status = 'running';

alter table public.forge_telegram_worker_runs enable row level security;
revoke all on table public.forge_telegram_worker_runs
  from public, anon, authenticated;
grant select on table public.forge_telegram_worker_runs to authenticated;

create policy "Studio admins read Forge Telegram worker history"
on public.forge_telegram_worker_runs for select to authenticated
using (public.forge_current_access_level() = 'admin');

create or replace function public.forge_begin_telegram_worker_run(
  p_invocation_key text,
  p_source text default 'supabase_cron'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id uuid;
begin
  if length(trim(coalesce(p_invocation_key, ''))) < 8 then
    raise exception 'Invalid Telegram worker invocation key';
  end if;

  update public.forge_telegram_worker_runs
  set status = 'failed',
      finished_at = now(),
      error_code = 'stale_worker_lease'
  where status = 'running'
    and started_at < now() - interval '15 minutes';

  begin
    insert into public.forge_telegram_worker_runs(invocation_key, source)
    values (left(trim(p_invocation_key), 120), p_source)
    returning id into run_id;
  exception
    when unique_violation then
      return null;
  end;

  return run_id;
end;
$$;

create or replace function public.forge_finish_telegram_worker_run(
  p_run_id uuid,
  p_status text,
  p_processed_count integer default null,
  p_sent_count integer default null,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('completed', 'skipped', 'failed') then
    raise exception 'Invalid Telegram worker result';
  end if;

  update public.forge_telegram_worker_runs
  set status = p_status,
      processed_count = p_processed_count,
      sent_count = p_sent_count,
      error_code = case
        when p_error_code is null then null
        else left(regexp_replace(p_error_code, '[^a-zA-Z0-9_-]', '_', 'g'), 120)
      end,
      finished_at = now()
  where id = p_run_id and status = 'running';

  if not found then
    raise exception 'Telegram worker run is not active';
  end if;
end;
$$;

create or replace function public.forge_install_telegram_cron_job()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_job_id bigint;
  installed_job_id bigint;
begin
  if not exists (
    select 1 from vault.secrets
    where name = 'forge_telegram_worker_secret'
  ) then
    raise exception 'Telegram worker secret is missing from Vault';
  end if;

  select jobid into existing_job_id
  from cron.job
  where jobname = 'forge-telegram-worker-every-5-minutes';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  select cron.schedule(
    'forge-telegram-worker-every-5-minutes',
    '*/5 * * * *',
    $cron$
      select net.http_post(
        url := 'https://studio.selen-editions.fr/agent/api/jobs/forge-telegram-alerts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'forge_telegram_worker_secret'
          ),
          'x-forge-invocation-key',
          'supabase-cron-' || to_char(
            date_bin('5 minutes', clock_timestamp(), timestamptz '2000-01-01'),
            'YYYYMMDDHH24MI'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      );
    $cron$
  ) into installed_job_id;

  return installed_job_id;
end;
$$;

revoke all on function public.forge_begin_telegram_worker_run(text, text)
  from public, anon, authenticated;
revoke all on function public.forge_finish_telegram_worker_run(uuid, text, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.forge_install_telegram_cron_job()
  from public, anon, authenticated, service_role;
grant execute on function public.forge_begin_telegram_worker_run(text, text)
  to service_role;
grant execute on function public.forge_finish_telegram_worker_run(uuid, text, integer, integer, text)
  to service_role;
