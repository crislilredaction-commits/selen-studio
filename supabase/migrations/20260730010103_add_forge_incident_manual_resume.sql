-- Reprise explicite d'une mission apres resolution humaine d'un incident.

alter table public.forge_mission_incidents
  add column mission_status_at_detection text not null default 'draft';

alter table public.forge_mission_incidents
  add constraint forge_mission_incidents_detection_status_check check (
    mission_status_at_detection in (
      'draft', 'analyzing', 'needs_clarification', 'plan_ready',
      'plan_validated', 'ready', 'in_progress', 'paused', 'deployed',
      'to_review', 'changes_requested', 'validated', 'blocked'
    )
  );

create or replace function public.forge_record_mission_incident(
  p_mission_id uuid,
  p_checkpoint_key text,
  p_category text,
  p_code text,
  p_message text,
  p_technical_details jsonb default '{}'::jsonb,
  p_action_key text default null,
  p_max_attempts integer default 3,
  p_human_decision_required text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_checkpoint_id uuid;
  incident_id uuid;
  initial_status text;
  current_mission_status text;
begin
  select id into target_checkpoint_id
  from public.forge_mission_checkpoints
  where mission_id = p_mission_id and checkpoint_key = p_checkpoint_key;
  select status into current_mission_status
  from public.forge_missions
  where id = p_mission_id
  for update;
  if target_checkpoint_id is null or current_mission_status is null then
    raise exception 'Mission ou checkpoint introuvable ou inaccessible';
  end if;

  initial_status := case
    when p_category in ('critical_error', 'human_decision_required') then 'blocked'
    else 'detected'
  end;

  insert into public.forge_mission_incidents (
    mission_id, checkpoint_id, action_key, category, code, message,
    technical_details, max_attempts, resolution_status,
    human_decision_required, mission_status_at_detection
  ) values (
    p_mission_id, target_checkpoint_id, nullif(trim(coalesce(p_action_key, '')), ''),
    p_category, upper(trim(p_code)), trim(p_message),
    coalesce(p_technical_details, '{}'::jsonb), p_max_attempts, initial_status,
    nullif(trim(coalesce(p_human_decision_required, '')), ''),
    current_mission_status
  )
  returning id into incident_id;

  insert into public.forge_activity_logs (mission_id, event_type, message, metadata)
  values (
    p_mission_id,
    case when initial_status = 'blocked' then 'incident_blocked' else 'incident_detected' end,
    trim(p_message),
    jsonb_build_object(
      'incident_id', incident_id,
      'checkpoint_key', p_checkpoint_key,
      'category', p_category,
      'code', upper(trim(p_code)),
      'resolution_status', initial_status,
      'mission_status_at_detection', current_mission_status
    )
  );

  if initial_status = 'blocked' then
    update public.forge_missions set status = 'blocked' where id = p_mission_id;
  end if;
  return incident_id;
end;
$$;

create or replace function public.forge_resume_blocked_mission(p_mission_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resume_key text;
  resume_position integer;
  resume_status text;
begin
  if not exists (
    select 1 from public.forge_missions
    where id = p_mission_id and status = 'blocked'
    for update
  ) then
    raise exception 'Seule une mission bloquee peut etre reprise par cette action';
  end if;
  if exists (
    select 1 from public.forge_mission_incidents
    where mission_id = p_mission_id
      and (
        resolution_status in ('blocked', 'failed')
        or (
          category in ('critical_error', 'human_decision_required')
          and resolution_status not in ('resolved', 'ignored_with_justification')
        )
      )
  ) then
    raise exception 'Tous les incidents bloquants doivent etre resolus avant la reprise';
  end if;

  select checkpoint_key, position into resume_key, resume_position
  from public.forge_mission_checkpoints
  where mission_id = p_mission_id
    and status not in ('completed', 'skipped')
  order by position
  limit 1;

  select case
    when mission_status_at_detection in ('in_progress', 'paused', 'blocked')
      then 'in_progress'
    else mission_status_at_detection
  end
  into resume_status
  from public.forge_mission_incidents
  where mission_id = p_mission_id
    and resolved_at is not null
  order by resolved_at desc
  limit 1;

  update public.forge_missions
  set status = coalesce(resume_status, 'draft'),
      resumed_at = now()
  where id = p_mission_id;

  insert into public.forge_activity_logs (mission_id, event_type, message, metadata)
  values (
    p_mission_id, 'mission_resumed',
    'Mission reprise apres resolution du blocage',
    jsonb_build_object(
      'status', coalesce(resume_status, 'draft'),
      'resume_checkpoint', resume_key,
      'resume_position', resume_position,
      'after_incident_resolution', true
    )
  );
end;
$$;

revoke all on function public.forge_record_mission_incident(uuid, text, text, text, text, jsonb, text, integer, text)
  from public, anon;
grant execute on function public.forge_record_mission_incident(uuid, text, text, text, text, jsonb, text, integer, text)
  to authenticated;
revoke all on function public.forge_resume_blocked_mission(uuid) from public, anon;
grant execute on function public.forge_resume_blocked_mission(uuid) to authenticated;

