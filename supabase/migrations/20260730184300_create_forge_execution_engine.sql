-- Socle minimal d'exécution réelle de Cody : file durable et preuves Git.

create table public.forge_execution_runs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.forge_missions(id) on delete cascade,
  plan_id uuid not null references public.forge_mission_plans(id) on delete restrict,
  status text not null default 'queued' check (
    status in ('queued','running','waiting_for_human','failed','completed','cancelled')
  ),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  attempt_count integer not null default 1 check (attempt_count between 1 and 3),
  last_error text,
  repository text not null check (repository = 'crislilredaction-commits/selen-studio'),
  base_branch text not null default 'main' check (base_branch = 'main'),
  target_branch text not null check (
    target_branch ~ '^(audit|feature|test)/[a-z0-9][a-z0-9._/-]{2,119}$'
    and target_branch not like '%..%'
    and target_branch not like '%//%'
  ),
  git_commit_sha text check (git_commit_sha is null or git_commit_sha ~ '^[0-9a-f]{40}$'),
  git_remote_url text,
  execution_metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_execution_runs_dates_check check (
    (status <> 'running' or started_at is not null)
    and (status <> 'completed' or (completed_at is not null and git_commit_sha is not null))
    and (status <> 'failed' or (failed_at is not null and length(trim(coalesce(last_error,''))) > 0))
    and (locked_by is null) = (locked_at is null)
  )
);

create table public.forge_execution_run_history (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.forge_execution_runs(id) on delete cascade,
  from_status text,
  to_status text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index forge_execution_runs_active_mission_idx
  on public.forge_execution_runs(mission_id)
  where status in ('queued','running','waiting_for_human');
create unique index forge_execution_runs_branch_idx
  on public.forge_execution_runs(repository,target_branch)
  where status <> 'cancelled';
create index forge_execution_runs_queue_idx
  on public.forge_execution_runs(status,requested_at)
  where status = 'queued';
create index forge_execution_history_run_idx
  on public.forge_execution_run_history(run_id,created_at);

alter table public.forge_execution_runs enable row level security;
alter table public.forge_execution_run_history enable row level security;
revoke all on public.forge_execution_runs, public.forge_execution_run_history
  from public, anon, authenticated;
grant select on public.forge_execution_runs, public.forge_execution_run_history
  to authenticated;

create policy "Forge admins can read execution runs"
on public.forge_execution_runs for select to authenticated
using (public.forge_current_access_level() = 'admin');
create policy "Forge admins can read execution history"
on public.forge_execution_run_history for select to authenticated
using (public.forge_current_access_level() = 'admin');

create or replace function public.forge_record_execution_run_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or new.status is distinct from old.status then
    insert into public.forge_execution_run_history(run_id,from_status,to_status,message,metadata)
    values(new.id,case when tg_op='UPDATE' then old.status end,new.status,
      case new.status
        when 'queued' then 'Exécution demandée'
        when 'running' then 'Exécution réservée par le worker'
        when 'completed' then 'Branche Git créée et vérifiée'
        when 'failed' then 'Échec du worker Cody'
        else 'État d’exécution mis à jour' end,
      jsonb_build_object('attempt_count',new.attempt_count,'worker',new.locked_by));
  end if;
  return new;
end $$;

create trigger forge_execution_runs_history
after insert or update on public.forge_execution_runs
for each row execute function public.forge_record_execution_run_history();

create or replace function public.forge_request_execution(
  p_mission_id uuid,
  p_target_branch text,
  p_created_by uuid
)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  mission_row public.forge_missions%rowtype;
  plan_row public.forge_mission_plans%rowtype;
  existing_id uuid;
  next_attempt integer;
  run_id uuid;
begin
  if p_created_by is null then raise exception 'ADMIN_ID_REQUIRED'; end if;
  select * into mission_row from public.forge_missions
  where id=p_mission_id for update;
  if not found then raise exception 'MISSION_NOT_FOUND'; end if;

  select id into existing_id from public.forge_execution_runs
  where mission_id=p_mission_id
    and status in ('queued','running','waiting_for_human')
  order by requested_at desc limit 1;
  if existing_id is not null then return existing_id; end if;

  if mission_row.archived_at is not null then raise exception 'MISSION_ARCHIVED'; end if;
  if mission_row.planning_validated_at is null or mission_row.execution_plan_id is null
    then raise exception 'PLAN_NOT_VALIDATED'; end if;
  select * into plan_row from public.forge_mission_plans
  where id=mission_row.execution_plan_id and mission_id=p_mission_id
    and is_current=true and status='validated';
  if not found then raise exception 'CURRENT_PLAN_NOT_VALIDATED'; end if;
  if jsonb_array_length(plan_row.blocking_questions)>0
    then raise exception 'BLOCKING_QUESTIONS_REMAIN'; end if;
  if exists(select 1 from public.forge_mission_incidents
    where mission_id=p_mission_id and category='critical_error'
      and resolution_status not in ('resolved','ignored_with_justification'))
    then raise exception 'CRITICAL_INCIDENT_OPEN'; end if;
  if exists(select 1 from public.forge_execution_runs
    where mission_id=p_mission_id and status='completed')
    then raise exception 'MISSION_ALREADY_EXECUTED'; end if;

  select coalesce(max(attempt_count),0)+1 into next_attempt
  from public.forge_execution_runs where mission_id=p_mission_id;
  if next_attempt>3 then raise exception 'MAX_ATTEMPTS_REACHED'; end if;

  insert into public.forge_execution_runs(
    mission_id,plan_id,target_branch,repository,attempt_count,created_by
  ) values (
    p_mission_id,plan_row.id,lower(trim(p_target_branch)),
    'crislilredaction-commits/selen-studio',next_attempt,p_created_by
  ) returning id into run_id;
  insert into public.forge_activity_logs(mission_id,event_type,message,metadata)
  values(p_mission_id,'development','Exécution Cody mise en file',
    jsonb_build_object('execution_run_id',run_id,'target_branch',lower(trim(p_target_branch))));
  return run_id;
end $$;

create or replace function public.forge_claim_execution_run(p_worker_id text)
returns setof public.forge_execution_runs
language plpgsql security invoker set search_path='' as $$
declare claimed_id uuid;
begin
  if length(trim(coalesce(p_worker_id,'')))<8 then raise exception 'WORKER_ID_REQUIRED'; end if;
  select id into claimed_id from public.forge_execution_runs
  where status='queued'
  order by requested_at
  for update skip locked limit 1;
  if claimed_id is null then return; end if;
  update public.forge_execution_runs
  set status='running',started_at=coalesce(started_at,now()),
      locked_at=now(),locked_by=trim(p_worker_id),last_error=null
  where id=claimed_id;
  return query select * from public.forge_execution_runs where id=claimed_id;
end $$;

create or replace function public.forge_complete_execution_run(
  p_run_id uuid,p_worker_id text,p_git_commit_sha text,p_git_remote_url text
)
returns void language plpgsql security invoker set search_path='' as $$
declare run_row public.forge_execution_runs%rowtype;
begin
  select * into run_row from public.forge_execution_runs
  where id=p_run_id and status='running' and locked_by=p_worker_id for update;
  if not found then raise exception 'RUN_NOT_OWNED'; end if;
  if p_git_commit_sha !~ '^[0-9a-f]{40}$' then raise exception 'INVALID_GIT_SHA'; end if;
  update public.forge_execution_runs set status='completed',completed_at=now(),
    git_commit_sha=p_git_commit_sha,git_remote_url=p_git_remote_url,
    execution_metadata=execution_metadata||jsonb_build_object('branch_verified',true)
  where id=p_run_id;
  update public.forge_missions set git_branch=run_row.target_branch
  where id=run_row.mission_id;
  update public.forge_mission_checkpoints
  set status=case when status='pending' then 'in_progress' else status end,
      message='Branche Git créée par le worker'
  where mission_id=run_row.mission_id and checkpoint_key='branch_created';
  update public.forge_mission_checkpoints
  set status='completed',message='Branche Git vérifiée : '||run_row.target_branch
  where mission_id=run_row.mission_id and checkpoint_key='branch_created'
    and status='in_progress';
  insert into public.forge_activity_logs(mission_id,event_type,message,metadata)
  values(run_row.mission_id,'development','Branche créée et poussée par Cody',
    jsonb_build_object('execution_run_id',p_run_id,'branch',run_row.target_branch,
      'commit_sha',p_git_commit_sha));
end $$;

create or replace function public.forge_fail_execution_run(
  p_run_id uuid,p_worker_id text,p_error text
)
returns void language plpgsql security invoker set search_path='' as $$
declare run_row public.forge_execution_runs%rowtype; checkpoint_id uuid;
begin
  select * into run_row from public.forge_execution_runs
  where id=p_run_id and status='running' and locked_by=p_worker_id for update;
  if not found then raise exception 'RUN_NOT_OWNED'; end if;
  update public.forge_execution_runs set status='failed',failed_at=now(),
    last_error=left(trim(p_error),2000) where id=p_run_id;
  select id into checkpoint_id from public.forge_mission_checkpoints
  where mission_id=run_row.mission_id and checkpoint_key='branch_created';
  insert into public.forge_mission_incidents(
    mission_id,checkpoint_id,category,code,message,technical_details,
    resolution_status,mission_status_at_detection
  ) values (
    run_row.mission_id,checkpoint_id,'critical_error','CODY_GIT_EXECUTION_FAILED',
    'Le worker Cody n’a pas pu créer la branche.',
    jsonb_build_object('execution_run_id',p_run_id,'attempt',run_row.attempt_count),
    'blocked',(select status from public.forge_missions where id=run_row.mission_id)
  );
end $$;

-- Répare seulement les checkpoints démarrés manuellement sans plan validé.
update public.forge_mission_checkpoints c
set status='failed',message='Arrêté : aucune preuve d’exécution réelle'
where c.checkpoint_key='plan_validated' and c.status='in_progress'
  and not exists (
    select 1 from public.forge_mission_plans p
    join public.forge_missions m on m.id=p.mission_id
    where p.mission_id=c.mission_id and p.id=m.execution_plan_id
      and p.is_current=true and p.status='validated'
      and m.planning_validated_at is not null
  );

revoke all on function public.forge_record_execution_run_history() from public,anon,authenticated;
revoke all on function public.forge_request_execution(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.forge_claim_execution_run(text) from public,anon,authenticated;
revoke all on function public.forge_complete_execution_run(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.forge_fail_execution_run(uuid,text,text) from public,anon,authenticated;
grant all on public.forge_execution_runs,public.forge_execution_run_history to service_role;
grant execute on function public.forge_claim_execution_run(text) to service_role;
grant execute on function public.forge_request_execution(uuid,text,uuid) to service_role;
grant execute on function public.forge_complete_execution_run(uuid,text,text,text) to service_role;
grant execute on function public.forge_fail_execution_run(uuid,text,text) to service_role;
