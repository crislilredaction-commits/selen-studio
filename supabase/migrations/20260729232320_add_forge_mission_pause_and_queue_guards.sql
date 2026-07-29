-- Pause/reprise explicites et une seule mission active par agent.

alter table public.forge_missions
  add column if not exists paused_at timestamptz,
  add column if not exists resumed_at timestamptz;

alter table public.forge_missions
  drop constraint if exists forge_missions_status_check;
alter table public.forge_missions
  add constraint forge_missions_status_check check (
    status in (
      'draft', 'analyzing', 'needs_clarification', 'plan_ready',
      'plan_validated', 'ready', 'in_progress', 'paused', 'deployed',
      'to_review', 'changes_requested', 'validated', 'blocked'
    )
  );

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
      'mission_paused', 'mission_resumed'
    )
  );

create unique index if not exists forge_missions_one_active_per_agent_idx
  on public.forge_missions(agent_key)
  where status = 'in_progress';

create or replace function public.enforce_forge_mission_pause_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'paused' and old.status <> 'in_progress' then
    raise exception 'Seule une mission en cours peut être mise en pause';
  end if;
  if old.status = 'paused' and new.status <> 'in_progress' then
    raise exception 'Une mission en pause doit être reprise avant tout autre changement';
  end if;

  if new.status = 'paused' then
    new.paused_at = now();
    new.resumed_at = null;
  elsif old.status = 'paused' and new.status = 'in_progress' then
    new.resumed_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists forge_missions_enforce_pause_transition
  on public.forge_missions;
create trigger forge_missions_enforce_pause_transition
before update of status on public.forge_missions
for each row execute function public.enforce_forge_mission_pause_transition();

create or replace function public.forge_pause_mission(p_mission_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.forge_missions
  set status = 'paused'
  where id = p_mission_id
    and status = 'in_progress';

  if not found then
    raise exception 'Seule une mission en cours peut être mise en pause';
  end if;

  insert into public.forge_activity_logs (
    mission_id,
    event_type,
    message,
    metadata
  )
  values (
    p_mission_id,
    'mission_paused',
    'Mission mise en pause',
    jsonb_build_object('status', 'paused')
  );
end;
$$;

create or replace function public.forge_resume_mission(p_mission_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  mission_agent_key text;
begin
  select agent_key
  into mission_agent_key
  from public.forge_missions
  where id = p_mission_id
    and status = 'paused'
  for update;

  if mission_agent_key is null then
    raise exception 'Seule une mission en pause peut être reprise';
  end if;

  perform 1
  from public.forge_missions
  where agent_key = mission_agent_key
    and status = 'in_progress'
    and id <> p_mission_id;

  if found then
    raise exception 'Une autre mission de cet agent est déjà en cours';
  end if;

  update public.forge_missions
  set status = 'in_progress'
  where id = p_mission_id;

  insert into public.forge_activity_logs (
    mission_id,
    event_type,
    message,
    metadata
  )
  values (
    p_mission_id,
    'mission_resumed',
    'Mission reprise',
    jsonb_build_object('status', 'in_progress')
  );
end;
$$;

revoke all on function public.enforce_forge_mission_pause_transition()
  from public, anon, authenticated;
revoke all on function public.forge_pause_mission(uuid)
  from public, anon;
revoke all on function public.forge_resume_mission(uuid)
  from public, anon;

grant execute on function public.forge_pause_mission(uuid)
  to authenticated;
grant execute on function public.forge_resume_mission(uuid)
  to authenticated;
