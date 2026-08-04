-- API et synchronisation des checkpoints avec le cycle de mission.

alter table public.forge_activity_logs
  drop constraint if exists forge_activity_logs_event_type_check;
alter table public.forge_activity_logs
  add constraint forge_activity_logs_event_type_check check (
    event_type in (
      'mission_received', 'analysis', 'development', 'test', 'error',
      'correction', 'build', 'deployment', 'blocked', 'completed',
      'user_validation', 'report_generated', 'report_updated', 'report_failed',
      'plan_generated', 'plan_updated', 'plan_validated',
      'plan_reopened', 'plan_failed', 'priority_changed',
      'mission_paused', 'mission_resumed',
      'checkpoint_updated', 'checkpoint_failed'
    )
  );

create or replace function public.forge_update_mission_checkpoint(
  p_mission_id uuid,
  p_checkpoint_key text,
  p_status text,
  p_message text default null,
  p_plan_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.forge_mission_checkpoints
  set status = p_status,
      message = nullif(trim(coalesce(p_message, '')), ''),
      plan_id = p_plan_id
  where mission_id = p_mission_id
    and checkpoint_key = p_checkpoint_key
  ;

  if not found then
    raise exception 'Checkpoint introuvable ou inaccessible';
  end if;
end;
$$;

create or replace function public.sync_forge_mission_planning_checkpoints()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_plan_id uuid;
begin
  if new.status = old.status then return new; end if;

  if new.status = 'analyzing' then
    update public.forge_mission_checkpoints
    set status = 'in_progress', message = 'Analyse de la demande en cours'
    where mission_id = new.id and checkpoint_key = 'analysis_completed'
      and status in ('pending', 'failed');
  elsif new.status in ('needs_clarification', 'plan_ready') then
    update public.forge_mission_checkpoints
    set status = 'completed', message = 'Analyse terminee'
    where mission_id = new.id and checkpoint_key = 'analysis_completed'
      and status = 'in_progress';
    update public.forge_mission_checkpoints
    set status = 'in_progress', message = 'Generation du plan'
    where mission_id = new.id and checkpoint_key = 'plan_generated'
      and status = 'pending';
    update public.forge_mission_checkpoints
    set status = 'completed', message = 'Plan courant genere'
    where mission_id = new.id and checkpoint_key = 'plan_generated'
      and status = 'in_progress';
  elsif new.status = 'plan_validated' then
    select id into current_plan_id
    from public.forge_mission_plans
    where mission_id = new.id and is_current = true and status = 'validated';
    update public.forge_mission_checkpoints
    set status = 'in_progress', message = 'Validation du plan courant'
    where mission_id = new.id and checkpoint_key = 'plan_validated'
      and status in ('pending', 'failed');
    update public.forge_mission_checkpoints
    set status = 'completed', message = 'Plan courant valide', plan_id = current_plan_id
    where mission_id = new.id and checkpoint_key = 'plan_validated'
      and status = 'in_progress';
  elsif new.status = 'in_progress' then
    update public.forge_mission_checkpoints
    set status = 'in_progress', message = 'Developpement en cours'
    where mission_id = new.id and checkpoint_key = 'development_started'
      and status in ('pending', 'failed');
  end if;
  return new;
end;
$$;

create trigger forge_missions_sync_planning_checkpoints
after update of status on public.forge_missions
for each row execute function public.sync_forge_mission_planning_checkpoints();

create or replace function public.reset_forge_checkpoints_for_new_plan()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_current = true and (
    tg_op = 'INSERT' or old.is_current is distinct from new.is_current
  ) then
    update public.forge_mission_checkpoints
    set status = 'pending',
        message = 'Reouvert apres creation d''une nouvelle version du plan',
        plan_id = null
    where mission_id = new.mission_id
      and position >= 2
      and status <> 'pending';
  end if;
  return new;
end;
$$;

create trigger forge_mission_plans_reset_later_checkpoints
after insert or update of is_current on public.forge_mission_plans
for each row execute function public.reset_forge_checkpoints_for_new_plan();

create or replace function public.enforce_forge_execution_checkpoint_gate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'in_progress'
    and exists (select 1 from public.forge_mission_checkpoints where mission_id = new.id)
    and not exists (
      select 1 from public.forge_mission_checkpoints
      where mission_id = new.id and checkpoint_key = 'branch_created'
        and status in ('completed', 'skipped')
    ) then
    raise exception 'Le checkpoint branche creee est requis avant le developpement';
  end if;
  return new;
end;
$$;

create trigger forge_missions_enforce_checkpoint_gate
before update of status on public.forge_missions
for each row execute function public.enforce_forge_execution_checkpoint_gate();

create or replace function public.forge_resume_mission(p_mission_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  mission_agent_key text;
  resume_key text;
  resume_position integer;
begin
  select agent_key into mission_agent_key
  from public.forge_missions
  where id = p_mission_id and status = 'paused'
  for update;
  if mission_agent_key is null then
    raise exception 'Seule une mission en pause peut etre reprise';
  end if;

  if exists (
    select 1 from public.forge_missions
    where agent_key = mission_agent_key and status = 'in_progress'
      and id <> p_mission_id
  ) then
    raise exception 'Une autre mission de cet agent est deja en cours';
  end if;

  select checkpoint_key, position into resume_key, resume_position
  from public.forge_mission_checkpoints
  where mission_id = p_mission_id
    and status not in ('completed', 'skipped')
  order by position
  limit 1;

  update public.forge_missions set status = 'in_progress' where id = p_mission_id;

  insert into public.forge_activity_logs (mission_id, event_type, message, metadata)
  values (
    p_mission_id, 'mission_resumed', 'Mission reprise au dernier checkpoint valide',
    jsonb_build_object(
      'status', 'in_progress',
      'resume_checkpoint', resume_key,
      'resume_position', resume_position
    )
  );
end;
$$;

revoke all on function public.forge_update_mission_checkpoint(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.forge_update_mission_checkpoint(uuid, text, text, text, uuid) to authenticated;
revoke all on function public.sync_forge_mission_planning_checkpoints() from public, anon, authenticated;
revoke all on function public.reset_forge_checkpoints_for_new_plan() from public, anon, authenticated;
revoke all on function public.enforce_forge_execution_checkpoint_gate() from public, anon, authenticated;
revoke all on function public.forge_resume_mission(uuid) from public, anon;
grant execute on function public.forge_resume_mission(uuid) to authenticated;
