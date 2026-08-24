-- Retrait définitif du runtime Forge / Cody.
-- Les migrations historiques Forge/Cody restent volontairement dans le dépôt :
-- elles ont été appliquées et font partie de l'historique reproductible de la base.

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname = 'forge-telegram-worker-every-5-minutes'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

delete from vault.secrets
where name = 'forge_telegram_worker_secret';

drop table if exists public.forge_activity_logs cascade;
drop table if exists public.forge_alert_events cascade;
drop table if exists public.forge_alerts cascade;
drop table if exists public.forge_corrections cascade;
drop table if exists public.forge_execution_run_history cascade;
drop table if exists public.forge_execution_runs cascade;
drop table if exists public.forge_execution_steps cascade;
drop table if exists public.forge_human_decisions cascade;
drop table if exists public.forge_human_instructions cascade;
drop table if exists public.forge_mission_briefs cascade;
drop table if exists public.forge_mission_checkpoint_history cascade;
drop table if exists public.forge_mission_checkpoints cascade;
drop table if exists public.forge_mission_incident_attempts cascade;
drop table if exists public.forge_mission_incidents cascade;
drop table if exists public.forge_mission_plan_actions cascade;
drop table if exists public.forge_mission_plans cascade;
drop table if exists public.forge_mission_reports cascade;
drop table if exists public.forge_missions cascade;
drop table if exists public.forge_telegram_deliveries cascade;
drop table if exists public.forge_telegram_settings cascade;
drop table if exists public.forge_telegram_worker_runs cascade;
drop table if exists public.forge_validation_items cascade;

do $$
declare r record;
begin
  for r in
    select n.nspname as schema_name,
           p.proname as routine_name,
           pg_get_function_identity_arguments(p.oid) as args,
           p.prokind
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (lower(p.proname) like '%forge%' or lower(p.proname) like '%cody%')
  loop
    execute format(
      'drop %s if exists %I.%I(%s) cascade',
      case when r.prokind = 'p' then 'procedure' else 'function' end,
      r.schema_name,
      r.routine_name,
      r.args
    );
  end loop;
end $$;
