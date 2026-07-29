-- Priorité explicite des missions Cody, sans préemption automatique.

create index if not exists forge_missions_agent_priority_created_idx
  on public.forge_missions(agent_key, priority, created_at);

create or replace function public.enforce_forge_mission_priority_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.priority is distinct from old.priority
    and old.status = 'validated' then
    raise exception 'La priorité d''une mission terminée ne peut plus être modifiée';
  end if;
  return new;
end;
$$;

drop trigger if exists forge_missions_enforce_priority_update
  on public.forge_missions;
create trigger forge_missions_enforce_priority_update
before update of priority on public.forge_missions
for each row execute function public.enforce_forge_mission_priority_update();

alter table public.forge_activity_logs
  drop constraint if exists forge_activity_logs_event_type_check;
alter table public.forge_activity_logs
  add constraint forge_activity_logs_event_type_check check (
    event_type in (
      'mission_received', 'analysis', 'development', 'test', 'error',
      'correction', 'build', 'deployment', 'blocked', 'completed',
      'user_validation', 'report_generated', 'report_updated', 'report_failed',
      'plan_generated', 'plan_updated', 'plan_validated',
      'plan_reopened', 'plan_failed', 'priority_changed'
    )
  );

drop function if exists public.forge_create_planning_mission(
  text, text, text, text
);

create or replace function public.forge_create_planning_mission(
  p_title text,
  p_source_request text,
  p_source_context text default null,
  p_source_constraints text default null,
  p_priority text default 'normal'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  mission_id uuid;
  clean_title text;
begin
  if length(trim(coalesce(p_source_request, ''))) = 0 then
    raise exception 'La demande ne peut pas être vide';
  end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Priorité de mission non autorisée';
  end if;

  clean_title := nullif(trim(coalesce(p_title, '')), '');

  insert into public.forge_missions (
    agent_key,
    title,
    project_key,
    description,
    objective,
    scope,
    expected_result,
    priority,
    status,
    progress,
    planning_required,
    created_by
  )
  values (
    'cody',
    coalesce(clean_title, 'Nouvelle mission Cody'),
    'selen-studio',
    trim(p_source_request),
    'Cadrage à générer avant toute exécution.',
    '[]',
    'Plan technique à valider.',
    p_priority,
    'draft',
    0,
    true,
    (select auth.uid())
  )
  returning id into mission_id;

  insert into public.forge_mission_briefs (
    mission_id,
    source_request,
    source_context,
    source_constraints,
    created_by
  )
  values (
    mission_id,
    trim(p_source_request),
    nullif(trim(coalesce(p_source_context, '')), ''),
    nullif(trim(coalesce(p_source_constraints, '')), ''),
    (select auth.uid())
  );

  insert into public.forge_activity_logs (
    mission_id,
    event_type,
    message,
    metadata
  )
  values (
    mission_id,
    'mission_received',
    'Nouvelle demande reçue par Cody',
    jsonb_build_object(
      'status', 'draft',
      'priority', p_priority,
      'planning_required', true
    )
  );

  return mission_id;
end;
$$;

create or replace function public.forge_update_mission_priority(
  p_mission_id uuid,
  p_priority text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous_priority text;
begin
  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Priorité de mission non autorisée';
  end if;

  select priority
  into previous_priority
  from public.forge_missions
  where id = p_mission_id
    and status <> 'validated'
  for update;

  if previous_priority is null then
    raise exception 'Mission terminée ou inaccessible';
  end if;
  if previous_priority = p_priority then
    return;
  end if;

  update public.forge_missions
  set priority = p_priority
  where id = p_mission_id;

  insert into public.forge_activity_logs (
    mission_id,
    event_type,
    message,
    metadata
  )
  values (
    p_mission_id,
    'priority_changed',
    'Priorité modifiée',
    jsonb_build_object(
      'previous_priority', previous_priority,
      'priority', p_priority
    )
  );
end;
$$;

revoke all on function public.forge_create_planning_mission(
  text, text, text, text, text
) from public, anon;
revoke all on function public.forge_update_mission_priority(uuid, text)
  from public, anon;
revoke all on function public.enforce_forge_mission_priority_update()
  from public, anon, authenticated;

grant execute on function public.forge_create_planning_mission(
  text, text, text, text, text
) to authenticated;
grant execute on function public.forge_update_mission_priority(uuid, text)
  to authenticated;
