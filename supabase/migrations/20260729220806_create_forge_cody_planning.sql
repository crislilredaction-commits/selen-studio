-- Cadrage versionné des nouvelles missions Cody.
-- Aucun fichier n'est exécuté et aucune mission existante n'est modifiée.

alter table public.forge_missions
  add column if not exists planning_required boolean not null default false,
  add column if not exists planning_validated_at timestamptz;

alter table public.forge_missions
  drop constraint if exists forge_missions_status_check;
alter table public.forge_missions
  add constraint forge_missions_status_check check (
    status in (
      'draft', 'analyzing', 'needs_clarification', 'plan_ready',
      'plan_validated', 'ready', 'in_progress', 'deployed', 'to_review',
      'changes_requested', 'validated', 'blocked'
    )
  );

create table if not exists public.forge_mission_briefs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null unique
    references public.forge_missions(id) on delete cascade,
  source_request text not null,
  source_context text,
  source_constraints text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_mission_briefs_request_not_blank check (
    length(trim(source_request)) > 0
  )
);

create table if not exists public.forge_mission_plans (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null
    references public.forge_missions(id) on delete cascade,
  version integer not null,
  is_current boolean not null default true,
  status text not null default 'plan_ready',
  proposed_title text not null,
  summary text not null,
  functional_objective text not null,
  included_scope jsonb not null default '[]'::jsonb,
  excluded_scope jsonb not null default '[]'::jsonb,
  constraints jsonb not null default '[]'::jsonb,
  repository_areas jsonb not null default '[]'::jsonb,
  technical_dependencies jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  blocking_questions jsonb not null default '[]'::jsonb,
  non_blocking_questions jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  acceptance_criteria jsonb not null default '[]'::jsonb,
  execution_steps jsonb not null default '[]'::jsonb,
  verification_plan jsonb not null default '[]'::jsonb,
  markdown_content text not null,
  created_by uuid references auth.users(id) on delete set null,
  validated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  validated_at timestamptz,
  constraint forge_mission_plans_mission_version_key
    unique (mission_id, version),
  constraint forge_mission_plans_version_positive check (version > 0),
  constraint forge_mission_plans_status_check check (
    status in (
      'draft', 'needs_clarification', 'plan_ready',
      'validated', 'superseded', 'failed'
    )
  ),
  constraint forge_mission_plans_title_not_blank check (
    length(trim(proposed_title)) > 0
  ),
  constraint forge_mission_plans_summary_not_blank check (
    length(trim(summary)) > 0
  ),
  constraint forge_mission_plans_objective_not_blank check (
    length(trim(functional_objective)) > 0
  ),
  constraint forge_mission_plans_markdown_not_blank check (
    length(trim(markdown_content)) > 0
  ),
  constraint forge_mission_plans_arrays_check check (
    jsonb_typeof(included_scope) = 'array'
    and jsonb_typeof(excluded_scope) = 'array'
    and jsonb_typeof(constraints) = 'array'
    and jsonb_typeof(repository_areas) = 'array'
    and jsonb_typeof(technical_dependencies) = 'array'
    and jsonb_typeof(risks) = 'array'
    and jsonb_typeof(blocking_questions) = 'array'
    and jsonb_typeof(non_blocking_questions) = 'array'
    and jsonb_typeof(assumptions) = 'array'
    and jsonb_typeof(recommendations) = 'array'
    and jsonb_typeof(acceptance_criteria) = 'array'
    and jsonb_typeof(execution_steps) = 'array'
    and jsonb_typeof(verification_plan) = 'array'
  )
);

create unique index if not exists forge_mission_plans_current_key
  on public.forge_mission_plans(mission_id)
  where is_current;
create index if not exists forge_mission_plans_mission_version_idx
  on public.forge_mission_plans(mission_id, version desc);
create index if not exists forge_mission_plans_status_idx
  on public.forge_mission_plans(status);

drop trigger if exists forge_mission_briefs_set_updated_at
  on public.forge_mission_briefs;
create trigger forge_mission_briefs_set_updated_at
before update on public.forge_mission_briefs
for each row execute function public.set_forge_updated_at();

drop trigger if exists forge_mission_plans_set_updated_at
  on public.forge_mission_plans;
create trigger forge_mission_plans_set_updated_at
before update on public.forge_mission_plans
for each row execute function public.set_forge_updated_at();

alter table public.forge_activity_logs
  drop constraint if exists forge_activity_logs_event_type_check;
alter table public.forge_activity_logs
  add constraint forge_activity_logs_event_type_check check (
    event_type in (
      'mission_received', 'analysis', 'development', 'test', 'error',
      'correction', 'build', 'deployment', 'blocked', 'completed',
      'user_validation', 'report_generated', 'report_updated', 'report_failed',
      'plan_generated', 'plan_updated', 'plan_validated',
      'plan_reopened', 'plan_failed'
    )
  );

create or replace function public.forge_create_planning_mission(
  p_title text,
  p_source_request text,
  p_source_context text default null,
  p_source_constraints text default null
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
    'normal',
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
    jsonb_build_object('status', 'draft', 'planning_required', true)
  );

  return mission_id;
end;
$$;

create or replace function public.forge_set_planning_analysis_state(
  p_mission_id uuid,
  p_state text,
  p_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_state not in ('draft', 'analyzing') then
    raise exception 'État d’analyse non autorisé';
  end if;

  update public.forge_missions
  set status = p_state
  where id = p_mission_id
    and planning_required = true;

  if not found then
    raise exception 'Mission de cadrage introuvable ou inaccessible';
  end if;

  insert into public.forge_activity_logs (
    mission_id,
    event_type,
    message,
    metadata
  )
  values (
    p_mission_id,
    case when p_state = 'analyzing' then 'analysis' else 'plan_failed' end,
    trim(p_message),
    jsonb_build_object('status', p_state)
  );
end;
$$;

create or replace function public.forge_store_mission_plan(
  p_mission_id uuid,
  p_plan jsonb,
  p_action text default 'generate'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  plan_id uuid;
  next_version integer;
  next_status text;
  blocking_count integer;
  action_event text;
  action_message text;
begin
  if p_action not in ('generate', 'regenerate', 'edit', 'draft') then
    raise exception 'Action de cadrage non autorisée';
  end if;

  perform 1
  from public.forge_missions
  where id = p_mission_id
    and planning_required = true
  for update;

  if not found then
    raise exception 'Mission de cadrage introuvable ou inaccessible';
  end if;

  if length(trim(coalesce(p_plan ->> 'proposed_title', ''))) = 0
    or length(trim(coalesce(p_plan ->> 'summary', ''))) = 0
    or length(trim(coalesce(p_plan ->> 'functional_objective', ''))) = 0
    or length(trim(coalesce(p_plan ->> 'markdown_content', ''))) = 0 then
    raise exception 'Le cadrage est incomplet';
  end if;

  blocking_count := jsonb_array_length(
    coalesce(p_plan -> 'blocking_questions', '[]'::jsonb)
  );
  next_status := case
    when p_action = 'draft' then 'draft'
    when blocking_count > 0 then 'needs_clarification'
    else 'plan_ready'
  end;

  select coalesce(max(version), 0) + 1
  into next_version
  from public.forge_mission_plans
  where mission_id = p_mission_id;

  update public.forge_mission_plans
  set is_current = false,
      status = case
        when status = 'validated' then status
        else 'superseded'
      end
  where mission_id = p_mission_id
    and is_current = true;

  insert into public.forge_mission_plans (
    mission_id,
    version,
    is_current,
    status,
    proposed_title,
    summary,
    functional_objective,
    included_scope,
    excluded_scope,
    constraints,
    repository_areas,
    technical_dependencies,
    risks,
    blocking_questions,
    non_blocking_questions,
    assumptions,
    recommendations,
    acceptance_criteria,
    execution_steps,
    verification_plan,
    markdown_content,
    created_by
  )
  values (
    p_mission_id,
    next_version,
    true,
    next_status,
    trim(p_plan ->> 'proposed_title'),
    trim(p_plan ->> 'summary'),
    trim(p_plan ->> 'functional_objective'),
    coalesce(p_plan -> 'included_scope', '[]'::jsonb),
    coalesce(p_plan -> 'excluded_scope', '[]'::jsonb),
    coalesce(p_plan -> 'constraints', '[]'::jsonb),
    coalesce(p_plan -> 'repository_areas', '[]'::jsonb),
    coalesce(p_plan -> 'technical_dependencies', '[]'::jsonb),
    coalesce(p_plan -> 'risks', '[]'::jsonb),
    coalesce(p_plan -> 'blocking_questions', '[]'::jsonb),
    coalesce(p_plan -> 'non_blocking_questions', '[]'::jsonb),
    coalesce(p_plan -> 'assumptions', '[]'::jsonb),
    coalesce(p_plan -> 'recommendations', '[]'::jsonb),
    coalesce(p_plan -> 'acceptance_criteria', '[]'::jsonb),
    coalesce(p_plan -> 'execution_steps', '[]'::jsonb),
    coalesce(p_plan -> 'verification_plan', '[]'::jsonb),
    trim(p_plan ->> 'markdown_content'),
    (select auth.uid())
  )
  returning id into plan_id;

  update public.forge_missions
  set title = trim(p_plan ->> 'proposed_title'),
      objective = trim(p_plan ->> 'functional_objective'),
      scope = coalesce(p_plan -> 'included_scope', '[]'::jsonb)::text,
      expected_result = trim(p_plan ->> 'summary'),
      status = case
        when next_status = 'needs_clarification' then 'needs_clarification'
        when next_status = 'plan_ready' then 'plan_ready'
        else 'draft'
      end,
      planning_validated_at = null
  where id = p_mission_id;

  action_event := case
    when p_action = 'generate' then 'plan_generated'
    when p_action = 'draft' then 'plan_reopened'
    else 'plan_updated'
  end;
  action_message := case
    when p_action = 'generate' then 'Cadrage généré par Cody'
    when p_action = 'regenerate' then 'Cadrage régénéré par Cody'
    when p_action = 'edit' then 'Cadrage modifié manuellement'
    else 'Cadrage rouvert en brouillon'
  end;

  insert into public.forge_activity_logs (
    mission_id,
    event_type,
    message,
    metadata
  )
  values (
    p_mission_id,
    action_event,
    action_message,
    jsonb_build_object(
      'status',
      case
        when next_status = 'needs_clarification' then 'needs_clarification'
        when next_status = 'plan_ready' then 'plan_ready'
        else 'draft'
      end,
      'plan_id', plan_id,
      'version', next_version
    )
  );

  return plan_id;
end;
$$;

create or replace function public.forge_validate_mission_plan(
  p_mission_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_plan_id uuid;
  blocking_count integer;
  current_version integer;
begin
  select id, jsonb_array_length(blocking_questions), version
  into current_plan_id, blocking_count, current_version
  from public.forge_mission_plans
  where mission_id = p_mission_id
    and is_current = true
  for update;

  if current_plan_id is null then
    raise exception 'Aucun cadrage courant à valider';
  end if;

  if blocking_count > 0 then
    raise exception 'Les questions bloquantes doivent être résolues';
  end if;

  update public.forge_mission_plans
  set status = 'validated',
      validated_by = (select auth.uid()),
      validated_at = now()
  where id = current_plan_id;

  update public.forge_missions
  set status = 'plan_validated',
      planning_validated_at = now()
  where id = p_mission_id
    and planning_required = true;

  if not found then
    raise exception 'Mission de cadrage introuvable ou inaccessible';
  end if;

  insert into public.forge_activity_logs (
    mission_id,
    event_type,
    message,
    metadata
  )
  values (
    p_mission_id,
    'plan_validated',
    'Cadrage validé explicitement',
    jsonb_build_object(
      'status', 'plan_validated',
      'plan_id', current_plan_id,
      'version', current_version
    )
  );
end;
$$;

create or replace function public.enforce_forge_mission_planning_gate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.planning_required = true
    and new.status in (
      'ready', 'in_progress', 'deployed', 'to_review',
      'changes_requested', 'validated', 'blocked'
    )
    and not exists (
      select 1
      from public.forge_mission_plans p
      where p.mission_id = new.id
        and p.status = 'validated'
    ) then
    raise exception 'Un cadrage validé est requis avant exécution';
  end if;

  return new;
end;
$$;

create or replace function public.protect_validated_forge_mission_plan()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'validated' then
      raise exception 'Un cadrage validé ne peut pas être supprimé';
    end if;
    return old;
  end if;

  if old.status = 'validated'
    and (
      new.mission_id is distinct from old.mission_id
      or new.version is distinct from old.version
      or new.status is distinct from old.status
      or new.proposed_title is distinct from old.proposed_title
      or new.summary is distinct from old.summary
      or new.functional_objective is distinct from old.functional_objective
      or new.included_scope is distinct from old.included_scope
      or new.excluded_scope is distinct from old.excluded_scope
      or new.constraints is distinct from old.constraints
      or new.repository_areas is distinct from old.repository_areas
      or new.technical_dependencies is distinct from old.technical_dependencies
      or new.risks is distinct from old.risks
      or new.blocking_questions is distinct from old.blocking_questions
      or new.non_blocking_questions is distinct from old.non_blocking_questions
      or new.assumptions is distinct from old.assumptions
      or new.recommendations is distinct from old.recommendations
      or new.acceptance_criteria is distinct from old.acceptance_criteria
      or new.execution_steps is distinct from old.execution_steps
      or new.verification_plan is distinct from old.verification_plan
      or new.markdown_content is distinct from old.markdown_content
      or new.created_by is distinct from old.created_by
      or new.validated_by is distinct from old.validated_by
      or new.created_at is distinct from old.created_at
      or new.validated_at is distinct from old.validated_at
    ) then
    raise exception 'Le contenu d’un cadrage validé est immuable';
  end if;

  return new;
end;
$$;

drop trigger if exists forge_missions_enforce_planning_gate
  on public.forge_missions;
create trigger forge_missions_enforce_planning_gate
before insert or update of status, planning_required
on public.forge_missions
for each row execute function public.enforce_forge_mission_planning_gate();

drop trigger if exists forge_mission_plans_protect_validated
  on public.forge_mission_plans;
create trigger forge_mission_plans_protect_validated
before update or delete on public.forge_mission_plans
for each row execute function public.protect_validated_forge_mission_plan();

alter table public.forge_mission_briefs enable row level security;
alter table public.forge_mission_plans enable row level security;

revoke all on table public.forge_mission_briefs from anon, authenticated;
revoke all on table public.forge_mission_plans from anon, authenticated;
grant select, insert, update, delete
  on table public.forge_mission_briefs to authenticated;
grant select, insert, update, delete
  on table public.forge_mission_plans to authenticated;

drop policy if exists "Studio staff can manage Forge mission briefs"
  on public.forge_mission_briefs;
create policy "Studio staff can manage Forge mission briefs"
on public.forge_mission_briefs
for all
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
)
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
);

drop policy if exists "Studio staff can manage Forge mission plans"
  on public.forge_mission_plans;
create policy "Studio staff can manage Forge mission plans"
on public.forge_mission_plans
for all
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
)
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
);

revoke all on function public.forge_create_planning_mission(text, text, text, text)
  from public, anon;
revoke all on function public.forge_set_planning_analysis_state(uuid, text, text)
  from public, anon;
revoke all on function public.forge_store_mission_plan(uuid, jsonb, text)
  from public, anon;
revoke all on function public.forge_validate_mission_plan(uuid)
  from public, anon;
revoke all on function public.enforce_forge_mission_planning_gate()
  from public, anon, authenticated;
revoke all on function public.protect_validated_forge_mission_plan()
  from public, anon, authenticated;

grant execute on function public.forge_create_planning_mission(text, text, text, text)
  to authenticated;
grant execute on function public.forge_set_planning_analysis_state(uuid, text, text)
  to authenticated;
grant execute on function public.forge_store_mission_plan(uuid, jsonb, text)
  to authenticated;
grant execute on function public.forge_validate_mission_plan(uuid)
  to authenticated;
