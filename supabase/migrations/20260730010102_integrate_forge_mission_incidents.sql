-- API securisee et garde-fous des incidents de mission Cody.

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
      'checkpoint_updated', 'checkpoint_failed',
      'incident_detected', 'incident_retrying', 'incident_resolved',
      'incident_blocked'
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
begin
  select id into target_checkpoint_id
  from public.forge_mission_checkpoints
  where mission_id = p_mission_id and checkpoint_key = p_checkpoint_key;
  if target_checkpoint_id is null then
    raise exception 'Checkpoint introuvable ou inaccessible';
  end if;

  initial_status := case
    when p_category in ('critical_error', 'human_decision_required') then 'blocked'
    else 'detected'
  end;

  insert into public.forge_mission_incidents (
    mission_id, checkpoint_id, action_key, category, code, message,
    technical_details, max_attempts, resolution_status, human_decision_required
  ) values (
    p_mission_id, target_checkpoint_id, nullif(trim(coalesce(p_action_key, '')), ''),
    p_category, upper(trim(p_code)), trim(p_message),
    coalesce(p_technical_details, '{}'::jsonb), p_max_attempts, initial_status,
    nullif(trim(coalesce(p_human_decision_required, '')), '')
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
      'resolution_status', initial_status
    )
  );

  if initial_status = 'blocked' then
    update public.forge_missions
    set status = 'blocked'
    where id = p_mission_id;
  end if;
  return incident_id;
end;
$$;

create or replace function public.forge_record_incident_attempt(
  p_incident_id uuid,
  p_strategy text,
  p_correction_fingerprint text,
  p_result_status text,
  p_result_message text,
  p_technical_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.forge_mission_incidents%rowtype;
  current_plan_id uuid;
  next_attempt integer;
  next_status text;
begin
  select * into target
  from public.forge_mission_incidents
  where id = p_incident_id
  for update;
  if target.id is null then
    raise exception 'Incident introuvable ou inaccessible';
  end if;
  if target.category <> 'recoverable_error' then
    raise exception 'Seule une erreur recuperable accepte une correction automatique';
  end if;
  if target.resolution_status not in ('detected', 'retrying') then
    raise exception 'Cet incident ne peut plus etre retente';
  end if;
  if target.attempt_count >= target.max_attempts then
    raise exception 'Nombre maximal de tentatives atteint';
  end if;
  if exists (
    select 1 from public.forge_mission_incident_attempts
    where incident_id = p_incident_id
      and strategy = p_strategy
      and correction_fingerprint = trim(p_correction_fingerprint)
      and result_status = 'failed'
  ) then
    raise exception 'La meme correction echouee ne peut pas etre repetee sans nouvel element';
  end if;

  select id into current_plan_id
  from public.forge_mission_plans
  where mission_id = target.mission_id
    and is_current = true
    and status = 'validated';
  if current_plan_id is null then
    raise exception 'Une correction automatique exige le plan courant valide';
  end if;

  next_attempt := target.attempt_count + 1;
  insert into public.forge_mission_incident_attempts (
    incident_id, mission_id, checkpoint_id, attempt_number, strategy,
    correction_fingerprint, result_status, result_message,
    technical_details, plan_id, created_by
  ) values (
    target.id, target.mission_id, target.checkpoint_id, next_attempt,
    p_strategy, trim(p_correction_fingerprint), p_result_status,
    trim(p_result_message), coalesce(p_technical_details, '{}'::jsonb),
    current_plan_id, (select auth.uid())
  );

  next_status := case
    when p_result_status = 'succeeded' then 'resolved'
    when next_attempt >= target.max_attempts then 'failed'
    else 'retrying'
  end;
  update public.forge_mission_incidents
  set attempt_count = next_attempt,
      resolution_status = next_status,
      correction_strategy = p_strategy,
      resolved_at = case when next_status = 'resolved' then now() else null end,
      updated_at = now()
  where id = target.id;

  insert into public.forge_activity_logs (mission_id, event_type, message, metadata)
  values (
    target.mission_id,
    case
      when next_status = 'resolved' then 'incident_resolved'
      when next_status = 'failed' then 'incident_blocked'
      else 'incident_retrying'
    end,
    trim(p_result_message),
    jsonb_build_object(
      'incident_id', target.id,
      'attempt_number', next_attempt,
      'max_attempts', target.max_attempts,
      'strategy', p_strategy,
      'result_status', p_result_status,
      'resolution_status', next_status
    )
  );

  if next_status = 'failed' then
    update public.forge_missions set status = 'blocked' where id = target.mission_id;
  end if;
end;
$$;

create or replace function public.forge_resolve_mission_incident(
  p_incident_id uuid,
  p_resolution_status text,
  p_message text,
  p_ignore_justification text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.forge_mission_incidents%rowtype;
begin
  select * into target
  from public.forge_mission_incidents
  where id = p_incident_id
  for update;
  if target.id is null then
    raise exception 'Incident introuvable ou inaccessible';
  end if;
  if p_resolution_status not in ('resolved', 'ignored_with_justification') then
    raise exception 'Statut de resolution manuelle invalide';
  end if;
  if p_resolution_status = 'ignored_with_justification'
    and length(trim(coalesce(p_ignore_justification, ''))) = 0 then
    raise exception 'Ignorer une erreur exige une justification';
  end if;
  if target.category = 'critical_error'
    and p_resolution_status = 'ignored_with_justification' then
    raise exception 'Une erreur critique ne peut pas etre ignoree';
  end if;

  update public.forge_mission_incidents
  set resolution_status = p_resolution_status,
      resolved_at = now(),
      correction_strategy = 'manual_resolution',
      ignore_justification = case
        when p_resolution_status = 'ignored_with_justification'
          then trim(p_ignore_justification)
        else null
      end,
      updated_at = now()
  where id = target.id;

  insert into public.forge_activity_logs (mission_id, event_type, message, metadata)
  values (
    target.mission_id, 'incident_resolved', trim(p_message),
    jsonb_build_object(
      'incident_id', target.id,
      'resolution_status', p_resolution_status,
      'manual', true
    )
  );
end;
$$;

create or replace function public.enforce_forge_checkpoint_incident_gate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('completed', 'skipped')
    and exists (
      select 1
      from public.forge_mission_incidents incident
      where incident.checkpoint_id = new.id
        and incident.category in ('critical_error', 'human_decision_required')
        and incident.resolution_status not in ('resolved', 'ignored_with_justification')
    ) then
    raise exception 'Un incident critique ou bloquant ouvert empeche de terminer ce checkpoint';
  end if;
  if new.status in ('in_progress', 'completed', 'skipped')
    and exists (
      select 1
      from public.forge_mission_incidents incident
      join public.forge_mission_checkpoints blocked_checkpoint
        on blocked_checkpoint.id = incident.checkpoint_id
      where incident.mission_id = new.mission_id
        and blocked_checkpoint.position <= new.position
        and incident.resolution_status in ('blocked', 'failed')
    ) then
    raise exception 'Un incident bloquant doit etre resolu avant de poursuivre';
  end if;
  return new;
end;
$$;

create trigger forge_mission_checkpoints_incident_gate
before update of status on public.forge_mission_checkpoints
for each row execute function public.enforce_forge_checkpoint_incident_gate();

revoke all on function public.forge_record_mission_incident(uuid, text, text, text, text, jsonb, text, integer, text)
  from public, anon;
grant execute on function public.forge_record_mission_incident(uuid, text, text, text, text, jsonb, text, integer, text)
  to authenticated;
revoke all on function public.forge_record_incident_attempt(uuid, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.forge_record_incident_attempt(uuid, text, text, text, text, jsonb)
  to authenticated;
revoke all on function public.forge_resolve_mission_incident(uuid, text, text, text)
  from public, anon;
grant execute on function public.forge_resolve_mission_incident(uuid, text, text, text)
  to authenticated;
revoke all on function public.enforce_forge_checkpoint_incident_gate()
  from public, anon, authenticated;

