-- Première édition réelle contrôlée de Cody, limitée à docs/forge-cody-sandbox/.

alter table public.forge_execution_runs
  add column execution_kind text not null default 'branch_only',
  add column instruction jsonb,
  add column base_commit_sha text,
  add column final_commit_sha text;

alter table public.forge_execution_runs
  add constraint forge_execution_runs_kind_check
    check (execution_kind in ('branch_only', 'controlled_edit')),
  add constraint forge_execution_runs_instruction_check
    check (
      (execution_kind = 'branch_only' and instruction is null)
      or
      (
        execution_kind = 'controlled_edit'
        and jsonb_typeof(instruction) = 'object'
        and instruction ?& array[
          'target_path', 'operation', 'expected_content',
          'allowed_command', 'commit_message'
        ]
      )
    ),
  add constraint forge_execution_runs_base_sha_check
    check (base_commit_sha is null or base_commit_sha ~ '^[0-9a-f]{40}$'),
  add constraint forge_execution_runs_final_sha_check
    check (final_commit_sha is null or final_commit_sha ~ '^[0-9a-f]{40}$');

create table public.forge_execution_steps (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.forge_execution_runs(id) on delete cascade,
  step_key text not null check (
    step_key in (
      'repository_cloned', 'branch_created', 'workspace_inspected',
      'files_modified', 'diff_validated', 'command_executed',
      'commit_created', 'commit_pushed', 'completed'
    )
  ),
  position integer not null check (position between 1 and 9),
  status text not null check (status in ('completed', 'failed')),
  evidence jsonb not null default '{}'::jsonb,
  worker_id text not null check (length(trim(worker_id)) >= 8),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint forge_execution_steps_run_key unique (run_id, step_key),
  constraint forge_execution_steps_order_check check (
    (step_key = 'repository_cloned' and position = 1)
    or (step_key = 'branch_created' and position = 2)
    or (step_key = 'workspace_inspected' and position = 3)
    or (step_key = 'files_modified' and position = 4)
    or (step_key = 'diff_validated' and position = 5)
    or (step_key = 'command_executed' and position = 6)
    or (step_key = 'commit_created' and position = 7)
    or (step_key = 'commit_pushed' and position = 8)
    or (step_key = 'completed' and position = 9)
  ),
  constraint forge_execution_steps_dates_check check (completed_at >= started_at),
  constraint forge_execution_steps_evidence_size_check
    check (octet_length(evidence::text) <= 65536)
);

create index forge_execution_steps_run_position_idx
  on public.forge_execution_steps(run_id, position);

alter table public.forge_execution_steps enable row level security;
revoke all on public.forge_execution_steps from public, anon, authenticated;
grant select on public.forge_execution_steps to authenticated;

create policy "Forge admins can read execution steps"
on public.forge_execution_steps for select to authenticated
using (public.forge_current_access_level() = 'admin');

create or replace function public.forge_request_controlled_execution(
  p_mission_id uuid,
  p_target_branch text,
  p_created_by uuid,
  p_instruction jsonb
)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  mission_row public.forge_missions%rowtype;
  plan_row public.forge_mission_plans%rowtype;
  existing_row public.forge_execution_runs%rowtype;
  target_path text := coalesce(p_instruction ->> 'target_path', '');
  operation_name text := coalesce(p_instruction ->> 'operation', '');
  expected_content text := coalesce(p_instruction ->> 'expected_content', '');
  command_name text := coalesce(p_instruction ->> 'allowed_command', '');
  commit_message text := coalesce(p_instruction ->> 'commit_message', '');
  next_attempt integer;
  run_id uuid;
begin
  if p_created_by is null then raise exception 'ADMIN_ID_REQUIRED'; end if;
  if jsonb_typeof(p_instruction) <> 'object'
    or (select count(*) from jsonb_object_keys(p_instruction)) <> 5
    then raise exception 'INVALID_CONTROLLED_INSTRUCTION'; end if;
  if target_path !~ '^docs/forge-cody-sandbox/[a-z0-9][a-z0-9._/-]*\.md$'
    or target_path like '%..%'
    or target_path like '%//%'
    or target_path like '%\%'
    or target_path like '%\%%'
    then raise exception 'TARGET_PATH_NOT_ALLOWED'; end if;
  if operation_name not in ('create', 'replace')
    then raise exception 'OPERATION_NOT_ALLOWED'; end if;
  if length(expected_content) < 1 or octet_length(expected_content) > 20000
    then raise exception 'CONTENT_SIZE_NOT_ALLOWED'; end if;
  if command_name <> 'git_status_short'
    then raise exception 'COMMAND_NOT_ALLOWED'; end if;
  if commit_message !~ '^docs\(forge\): [a-z0-9][a-z0-9 ._-]{5,71}$'
    then raise exception 'COMMIT_MESSAGE_NOT_ALLOWED'; end if;

  select * into mission_row from public.forge_missions
  where id = p_mission_id for update;
  if not found then raise exception 'MISSION_NOT_FOUND'; end if;

  select * into existing_row from public.forge_execution_runs
  where mission_id = p_mission_id
    and status in ('queued', 'running', 'waiting_for_human')
  order by requested_at desc limit 1;
  if found then
    if existing_row.execution_kind <> 'controlled_edit'
      or existing_row.instruction <> p_instruction
      or existing_row.target_branch <> lower(trim(p_target_branch))
      then raise exception 'ACTIVE_RUN_INSTRUCTION_MISMATCH'; end if;
    return existing_row.id;
  end if;

  if mission_row.archived_at is not null then raise exception 'MISSION_ARCHIVED'; end if;
  if mission_row.planning_validated_at is null or mission_row.execution_plan_id is null
    then raise exception 'PLAN_NOT_VALIDATED'; end if;
  select * into plan_row from public.forge_mission_plans
  where id = mission_row.execution_plan_id and mission_id = p_mission_id
    and is_current = true and status = 'validated';
  if not found then raise exception 'CURRENT_PLAN_NOT_VALIDATED'; end if;
  if jsonb_array_length(plan_row.blocking_questions) > 0
    then raise exception 'BLOCKING_QUESTIONS_REMAIN'; end if;
  if exists (
    select 1 from public.forge_mission_incidents
    where mission_id = p_mission_id and category = 'critical_error'
      and resolution_status not in ('resolved', 'ignored_with_justification')
  ) then raise exception 'CRITICAL_INCIDENT_OPEN'; end if;
  if exists (
    select 1 from public.forge_execution_runs
    where mission_id = p_mission_id and status = 'completed'
  ) then raise exception 'MISSION_ALREADY_EXECUTED'; end if;

  select coalesce(max(attempt_count), 0) + 1 into next_attempt
  from public.forge_execution_runs where mission_id = p_mission_id;
  if next_attempt > 3 then raise exception 'MAX_ATTEMPTS_REACHED'; end if;

  insert into public.forge_execution_runs(
    mission_id, plan_id, target_branch, repository, attempt_count,
    created_by, execution_kind, instruction
  ) values (
    p_mission_id, plan_row.id, lower(trim(p_target_branch)),
    'crislilredaction-commits/selen-studio', next_attempt,
    p_created_by, 'controlled_edit', p_instruction
  ) returning id into run_id;

  insert into public.forge_activity_logs(mission_id, event_type, message, metadata)
  values (
    p_mission_id, 'development', 'Édition contrôlée Cody mise en file',
    jsonb_build_object(
      'execution_run_id', run_id,
      'target_branch', lower(trim(p_target_branch)),
      'target_path', target_path
    )
  );
  return run_id;
end $$;

create or replace function public.forge_record_execution_step(
  p_run_id uuid,
  p_worker_id text,
  p_step_key text,
  p_evidence jsonb
)
returns void language plpgsql security invoker set search_path='' as $$
declare
  run_row public.forge_execution_runs%rowtype;
  step_position integer;
  existing_evidence jsonb;
  prior_count integer;
begin
  select * into run_row from public.forge_execution_runs
  where id = p_run_id and status = 'running' and locked_by = p_worker_id
  for update;
  if not found then raise exception 'RUN_NOT_OWNED'; end if;
  if run_row.execution_kind <> 'controlled_edit'
    then raise exception 'CONTROLLED_EDIT_RUN_REQUIRED'; end if;
  if jsonb_typeof(p_evidence) <> 'object' or octet_length(p_evidence::text) > 65536
    then raise exception 'INVALID_STEP_EVIDENCE'; end if;

  step_position := case p_step_key
    when 'repository_cloned' then 1
    when 'branch_created' then 2
    when 'workspace_inspected' then 3
    when 'files_modified' then 4
    when 'diff_validated' then 5
    when 'command_executed' then 6
    when 'commit_created' then 7
    when 'commit_pushed' then 8
    else null end;
  if step_position is null then raise exception 'INVALID_EXECUTION_STEP'; end if;

  select evidence into existing_evidence from public.forge_execution_steps
  where run_id = p_run_id and step_key = p_step_key;
  if found then
    if existing_evidence <> p_evidence then
      raise exception 'STEP_EVIDENCE_IMMUTABLE'; end if;
    return;
  end if;

  select count(*) into prior_count from public.forge_execution_steps
  where run_id = p_run_id and status = 'completed' and position < step_position;
  if prior_count <> step_position - 1 then
    raise exception 'EXECUTION_STEP_OUT_OF_ORDER'; end if;

  insert into public.forge_execution_steps(
    run_id, step_key, position, status, evidence, worker_id,
    started_at, completed_at
  ) values (
    p_run_id, p_step_key, step_position, 'completed', p_evidence,
    p_worker_id, now(), now()
  );

  if p_step_key = 'branch_created' then
    update public.forge_mission_checkpoints
    set status = 'in_progress', message = 'Création réelle de la branche en cours'
    where mission_id = run_row.mission_id and checkpoint_key = 'branch_created'
      and status = 'pending';
    update public.forge_mission_checkpoints
    set status = 'completed', message = 'Branche Git vérifiée : ' || run_row.target_branch
    where mission_id = run_row.mission_id and checkpoint_key = 'branch_created'
      and status = 'in_progress';
  elsif p_step_key = 'files_modified' then
    update public.forge_mission_checkpoints
    set status = 'in_progress', message = 'Édition contrôlée démarrée'
    where mission_id = run_row.mission_id and checkpoint_key = 'development_started'
      and status = 'pending';
    update public.forge_mission_checkpoints
    set status = 'completed', message = 'Fichier sandbox modifié et vérifié'
    where mission_id = run_row.mission_id and checkpoint_key = 'development_started'
      and status = 'in_progress';
  elsif p_step_key = 'command_executed' then
    update public.forge_mission_checkpoints
    set status = 'skipped',
        message = 'Aucune migration nécessaire pour cette édition documentaire contrôlée'
    where mission_id = run_row.mission_id and checkpoint_key = 'migrations_prepared'
      and status = 'pending';
    update public.forge_mission_checkpoints
    set status = 'in_progress', message = 'Vérification allowlistée en cours'
    where mission_id = run_row.mission_id and checkpoint_key = 'tests_executed'
      and status = 'pending';
    update public.forge_mission_checkpoints
    set status = 'completed', message = 'Commande allowlistée réussie'
    where mission_id = run_row.mission_id and checkpoint_key = 'tests_executed'
      and status = 'in_progress';
  elsif p_step_key = 'commit_pushed' then
    update public.forge_mission_checkpoints
    set status = 'in_progress', message = 'Push du commit contrôlé en cours'
    where mission_id = run_row.mission_id and checkpoint_key = 'commits_pushed'
      and status = 'pending';
    update public.forge_mission_checkpoints
    set status = 'completed', message = 'Commit contrôlé poussé et SHA distant vérifié'
    where mission_id = run_row.mission_id and checkpoint_key = 'commits_pushed'
      and status = 'in_progress';
  end if;
end $$;

create or replace function public.forge_complete_controlled_execution_run(
  p_run_id uuid,
  p_worker_id text,
  p_base_commit_sha text,
  p_final_commit_sha text,
  p_git_remote_url text
)
returns void language plpgsql security invoker set search_path='' as $$
declare
  run_row public.forge_execution_runs%rowtype;
  completed_steps integer;
begin
  select * into run_row from public.forge_execution_runs
  where id = p_run_id and status = 'running' and locked_by = p_worker_id
  for update;
  if not found then raise exception 'RUN_NOT_OWNED'; end if;
  if run_row.execution_kind <> 'controlled_edit'
    then raise exception 'CONTROLLED_EDIT_RUN_REQUIRED'; end if;
  if p_base_commit_sha !~ '^[0-9a-f]{40}$'
    or p_final_commit_sha !~ '^[0-9a-f]{40}$'
    or p_base_commit_sha = p_final_commit_sha
    then raise exception 'INVALID_COMMIT_PROOF'; end if;
  select count(*) into completed_steps from public.forge_execution_steps
  where run_id = p_run_id and status = 'completed' and position between 1 and 8;
  if completed_steps <> 8 then raise exception 'EXECUTION_STEPS_INCOMPLETE'; end if;

  insert into public.forge_execution_steps(
    run_id, step_key, position, status, evidence, worker_id,
    started_at, completed_at
  ) values (
    p_run_id, 'completed', 9, 'completed',
    jsonb_build_object(
      'base_commit_sha', p_base_commit_sha,
      'final_commit_sha', p_final_commit_sha,
      'remote_verified', true
    ),
    p_worker_id, now(), now()
  );

  update public.forge_execution_runs
  set status = 'completed', completed_at = now(),
      git_commit_sha = p_final_commit_sha,
      base_commit_sha = p_base_commit_sha,
      final_commit_sha = p_final_commit_sha,
      git_remote_url = p_git_remote_url,
      execution_metadata = execution_metadata || jsonb_build_object(
        'branch_verified', true,
        'controlled_edit_verified', true
      ),
      updated_at = now()
  where id = p_run_id;

  update public.forge_missions
  set git_branch = run_row.target_branch
  where id = run_row.mission_id;

  insert into public.forge_activity_logs(mission_id, event_type, message, metadata)
  values (
    run_row.mission_id, 'development',
    'Édition contrôlée commitée et poussée par Cody',
    jsonb_build_object(
      'execution_run_id', p_run_id,
      'branch', run_row.target_branch,
      'commit_sha', p_final_commit_sha
    )
  );
end $$;

revoke all on public.forge_execution_steps from public, anon, authenticated;
revoke all on function public.forge_request_controlled_execution(uuid,text,uuid,jsonb)
  from public, anon, authenticated;
revoke all on function public.forge_record_execution_step(uuid,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.forge_complete_controlled_execution_run(uuid,text,text,text,text)
  from public, anon, authenticated;

grant all on public.forge_execution_steps to service_role;
grant execute on function public.forge_request_controlled_execution(uuid,text,uuid,jsonb)
  to service_role;
grant execute on function public.forge_record_execution_step(uuid,text,text,jsonb)
  to service_role;
grant execute on function public.forge_complete_controlled_execution_run(uuid,text,text,text,text)
  to service_role;
