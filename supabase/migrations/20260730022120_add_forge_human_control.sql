-- Centre de pilotage humain de Cody : autorisation, consignes et decisions.

alter table public.forge_missions
  drop constraint forge_missions_status_check;
alter table public.forge_missions
  add constraint forge_missions_status_check check (
    status in (
      'draft', 'analyzing', 'needs_clarification', 'plan_ready',
      'plan_validated', 'ready', 'in_progress', 'paused', 'deployed',
      'to_review', 'changes_requested', 'validated', 'blocked',
      'failed', 'abandoned', 'archived'
    )
  );

create table public.forge_human_instructions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.forge_missions(id) on delete cascade,
  incident_id uuid references public.forge_mission_incidents(id) on delete restrict,
  plan_id uuid references public.forge_mission_plans(id) on delete restrict,
  content text not null check (length(trim(content)) between 3 and 4000),
  sensitivity text not null default 'minor' check (sensitivity in ('minor', 'sensitive')),
  status text not null default 'recorded' check (status in ('recorded', 'acknowledged', 'superseded')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index forge_human_instructions_mission_created_idx
  on public.forge_human_instructions(mission_id, created_at desc);

create table public.forge_human_decisions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.forge_missions(id) on delete cascade,
  incident_id uuid references public.forge_mission_incidents(id) on delete restrict,
  plan_id uuid references public.forge_mission_plans(id) on delete restrict,
  action text not null check (action in (
    'plan_validated', 'plan_rejected', 'change_requested',
    'mission_paused', 'mission_resumed', 'block_maintained',
    'incident_resolved', 'mission_abandoned', 'mission_archived'
  )),
  reason text not null check (length(trim(reason)) between 3 and 4000),
  consequences text not null check (length(trim(consequences)) between 3 and 4000),
  previous_status text,
  resulting_status text,
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now()
);

create index forge_human_decisions_mission_decided_idx
  on public.forge_human_decisions(mission_id, decided_at desc);

alter table public.forge_human_instructions enable row level security;
alter table public.forge_human_decisions enable row level security;

create or replace function public.forge_current_access_level()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case ap.role
    when 'admin' then 'admin'
    when 'agent' then 'viewer'
    else 'none'
  end
  from public.agent_profiles ap
  where ap.is_active = true
    and ap.role in ('agent', 'admin')
    and (
      ap.user_id = (select auth.uid())
      or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
    )
  order by case ap.role when 'admin' then 0 else 1 end
  limit 1
$$;

create or replace function public.forge_require_admin()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if coalesce(public.forge_current_access_level(), 'none') <> 'admin' then
    raise exception 'Cette action est reservee a une administratrice de La Forge';
  end if;
end
$$;

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'forge_missions', 'forge_activity_logs', 'forge_validation_items',
    'forge_corrections', 'forge_mission_reports', 'forge_mission_briefs',
    'forge_mission_plans', 'forge_mission_checkpoints',
    'forge_mission_checkpoint_history', 'forge_mission_incidents',
    'forge_mission_incident_attempts', 'forge_mission_plan_actions',
    'forge_human_instructions', 'forge_human_decisions'
  ] loop
    for policy_name in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy %I on public.%I', policy_name, table_name);
    end loop;
    execute format(
      'create policy %I on public.%I for select to authenticated using (coalesce(public.forge_current_access_level(), ''none'') in (''viewer'', ''admin''))',
      'Forge authorized users can read', table_name
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (coalesce(public.forge_current_access_level(), ''none'') = ''admin'') with check (coalesce(public.forge_current_access_level(), ''none'') = ''admin'')',
      'Forge admins can manage', table_name
    );
  end loop;
end
$$;

revoke all on public.forge_human_instructions, public.forge_human_decisions
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.forge_human_instructions, public.forge_human_decisions
  to authenticated;

create or replace function public.forge_add_human_instruction(
  p_mission_id uuid,
  p_content text,
  p_sensitivity text default 'minor',
  p_incident_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  instruction_id uuid;
  current_plan_id uuid;
  current_checkpoint_key text;
begin
  perform public.forge_require_admin();
  if p_sensitivity not in ('minor', 'sensitive') then
    raise exception 'Sensibilite de consigne invalide';
  end if;
  if length(trim(coalesce(p_content, ''))) < 3 then
    raise exception 'Une consigne explicite est obligatoire';
  end if;
  if p_incident_id is not null and not exists (
    select 1 from public.forge_mission_incidents
    where id = p_incident_id and mission_id = p_mission_id
  ) then
    raise exception 'Incident incompatible avec la mission';
  end if;
  select id into current_plan_id
  from public.forge_mission_plans
  where mission_id = p_mission_id and is_current = true;
  insert into public.forge_human_instructions(
    mission_id, incident_id, plan_id, content, sensitivity, created_by
  ) values (
    p_mission_id, p_incident_id, current_plan_id, trim(p_content),
    p_sensitivity, (select auth.uid())
  ) returning id into instruction_id;
  if p_sensitivity = 'sensitive' then
    select checkpoint_key into current_checkpoint_key
    from public.forge_mission_checkpoints
    where mission_id = p_mission_id
    order by case when status = 'in_progress' then 0 else 1 end, position desc
    limit 1;
    perform public.forge_record_plan_action(
      p_mission_id,
      current_checkpoint_key,
      'human_instruction',
      'sensitive',
      'functional_scope',
      'Une consigne humaine modifie sensiblement le plan',
      jsonb_build_array('consigne Studio', instruction_id),
      trim(p_content),
      'Consigne ajoutee depuis le centre de pilotage humain',
      'Le plan courant doit integrer la consigne puis etre revalide'
    );
  else
    insert into public.forge_activity_logs(mission_id, event_type, message, metadata)
    values (
      p_mission_id, 'correction', 'Consigne humaine ajoutee',
      jsonb_build_object('instruction_id', instruction_id, 'sensitivity', 'minor')
    );
  end if;
  return instruction_id;
end
$$;

create or replace function public.forge_control_mission(
  p_mission_id uuid,
  p_action text,
  p_reason text,
  p_consequences text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_status text;
  new_status text;
begin
  perform public.forge_require_admin();
  if length(trim(coalesce(p_reason, ''))) < 3
    or length(trim(coalesce(p_consequences, ''))) < 3 then
    raise exception 'Le motif et les consequences doivent etre confirmes';
  end if;
  select status into old_status from public.forge_missions
  where id = p_mission_id for update;
  if old_status is null then raise exception 'Mission introuvable'; end if;
  if p_action = 'abandon' then
    if old_status in ('validated', 'abandoned', 'archived') then
      raise exception 'Cette mission ne peut plus etre abandonnee';
    end if;
    new_status := 'abandoned';
  elsif p_action = 'archive' then
    if old_status not in ('validated', 'failed', 'abandoned') then
      raise exception 'Seule une mission terminee, echouee ou abandonnee peut etre archivee';
    end if;
    new_status := 'archived';
  elsif p_action = 'maintain_block' then
    if old_status <> 'blocked' then
      raise exception 'Seule une mission bloquee peut rester bloquee';
    end if;
    new_status := 'blocked';
  else
    raise exception 'Action de pilotage inconnue';
  end if;
  update public.forge_missions set status = new_status where id = p_mission_id;
  insert into public.forge_human_decisions(
    mission_id, action, reason, consequences, previous_status,
    resulting_status, decided_by
  ) values (
    p_mission_id,
    case p_action when 'abandon' then 'mission_abandoned'
      when 'archive' then 'mission_archived' else 'block_maintained' end,
    trim(p_reason), trim(p_consequences), old_status, new_status,
    (select auth.uid())
  );
  insert into public.forge_activity_logs(mission_id, event_type, message, metadata)
  values (
    p_mission_id,
    case when p_action = 'maintain_block' then 'blocked' else 'completed' end,
    case p_action when 'abandon' then 'Mission abandonnee par decision humaine'
      when 'archive' then 'Mission archivee par decision humaine'
      else 'Blocage maintenu par decision humaine' end,
    jsonb_build_object('previous_status', old_status, 'status', new_status, 'reason', trim(p_reason))
  );
end
$$;

revoke all on function public.forge_current_access_level() from public, anon;
grant execute on function public.forge_current_access_level() to authenticated;
revoke all on function public.forge_require_admin() from public, anon, authenticated;
revoke all on function public.forge_add_human_instruction(uuid,text,text,uuid) from public, anon;
grant execute on function public.forge_add_human_instruction(uuid,text,text,uuid) to authenticated;
revoke all on function public.forge_control_mission(uuid,text,text,text) from public, anon;
grant execute on function public.forge_control_mission(uuid,text,text,text) to authenticated;
