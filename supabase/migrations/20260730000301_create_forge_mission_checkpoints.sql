-- Checkpoints ordonnes, persistants et historises des missions Cody.

create table public.forge_mission_checkpoints (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.forge_missions(id) on delete cascade,
  checkpoint_key text not null,
  position integer not null,
  status text not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  message text,
  plan_id uuid references public.forge_mission_plans(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_mission_checkpoints_mission_key unique (mission_id, checkpoint_key),
  constraint forge_mission_checkpoints_mission_position unique (mission_id, position),
  constraint forge_mission_checkpoints_key_position_check check (
    (checkpoint_key = 'analysis_completed' and position = 1)
    or (checkpoint_key = 'plan_generated' and position = 2)
    or (checkpoint_key = 'plan_validated' and position = 3)
    or (checkpoint_key = 'branch_created' and position = 4)
    or (checkpoint_key = 'development_started' and position = 5)
    or (checkpoint_key = 'migrations_prepared' and position = 6)
    or (checkpoint_key = 'tests_executed' and position = 7)
    or (checkpoint_key = 'commits_pushed' and position = 8)
    or (checkpoint_key = 'preview_created' and position = 9)
    or (checkpoint_key = 'final_report_produced' and position = 10)
  ),
  constraint forge_mission_checkpoints_status_check check (
    status in ('pending', 'in_progress', 'completed', 'failed', 'skipped')
  ),
  constraint forge_mission_checkpoints_dates_check check (
    (status = 'pending' and started_at is null and completed_at is null)
    or (status = 'in_progress' and started_at is not null and completed_at is null)
    or (status in ('completed', 'failed', 'skipped')
      and started_at is not null and completed_at is not null
      and completed_at >= started_at)
  ),
  constraint forge_mission_checkpoints_skip_reason_check check (
    status <> 'skipped' or length(trim(coalesce(message, ''))) > 0
  ),
  constraint forge_mission_checkpoints_plan_link_check check (
    (checkpoint_key = 'plan_validated' and status = 'completed' and plan_id is not null)
    or checkpoint_key <> 'plan_validated'
    or status <> 'completed'
  )
);

create table public.forge_mission_checkpoint_history (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references public.forge_mission_checkpoints(id) on delete cascade,
  mission_id uuid not null references public.forge_missions(id) on delete cascade,
  checkpoint_key text not null,
  position integer not null,
  from_status text,
  to_status text not null,
  started_at timestamptz,
  completed_at timestamptz,
  message text,
  plan_id uuid references public.forge_mission_plans(id) on delete restrict,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forge_checkpoint_history_status_check check (
    from_status is null or from_status in ('pending', 'in_progress', 'completed', 'failed', 'skipped')
  ),
  constraint forge_checkpoint_history_to_status_check check (
    to_status in ('pending', 'in_progress', 'completed', 'failed', 'skipped')
  )
);

create index forge_mission_checkpoints_mission_position_idx
  on public.forge_mission_checkpoints(mission_id, position);
create index forge_checkpoint_history_mission_created_idx
  on public.forge_mission_checkpoint_history(mission_id, created_at desc);

create or replace function public.enforce_forge_mission_checkpoint_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_plan uuid;
begin
  if tg_op = 'UPDATE' then
    if new.mission_id <> old.mission_id
      or new.checkpoint_key <> old.checkpoint_key
      or new.position <> old.position then
      raise exception 'L''identite et l''ordre d''un checkpoint sont immuables';
    end if;

    if new.status <> old.status then
      if pg_trigger_depth() > 1 and new.status = 'pending' then
        null;
      elsif old.status = 'pending' and new.status not in ('in_progress', 'skipped') then
        raise exception 'Transition de checkpoint invalide';
      elsif old.status = 'in_progress' and new.status not in ('completed', 'failed', 'skipped') then
        raise exception 'Transition de checkpoint invalide';
      elsif old.status = 'failed' and new.status not in ('in_progress', 'skipped') then
        raise exception 'Transition de checkpoint invalide';
      elsif old.status in ('completed', 'skipped') then
        if new.status <> 'in_progress'
          or length(trim(coalesce(new.message, ''))) = 0 then
          raise exception 'Rejouer un checkpoint termine exige une justification';
        end if;
        if exists (
          select 1 from public.forge_mission_checkpoints later
          where later.mission_id = old.mission_id
            and later.position > old.position
            and later.status <> 'pending'
        ) then
          raise exception 'Un checkpoint ne peut pas etre rejoue apres une etape ulterieure';
        end if;
      end if;
    end if;
  end if;

  if new.status in ('in_progress', 'completed', 'skipped') and exists (
    select 1 from public.forge_mission_checkpoints earlier
    where earlier.mission_id = new.mission_id
      and earlier.position < new.position
      and earlier.status not in ('completed', 'skipped')
  ) then
    raise exception 'Les checkpoints precedents doivent etre termines';
  end if;

  if new.checkpoint_key = 'plan_validated' and new.status = 'completed' then
    select id into current_plan
    from public.forge_mission_plans
    where mission_id = new.mission_id
      and id = new.plan_id
      and is_current = true
      and status = 'validated';
    if current_plan is null then
      raise exception 'Le checkpoint plan valide exige la version courante validee';
    end if;
  end if;

  if new.status = 'pending' then
    new.started_at = null;
    new.completed_at = null;
    new.plan_id = null;
  elsif new.status = 'in_progress' then
    new.started_at = case when tg_op = 'UPDATE' and old.status = 'in_progress'
      then old.started_at else now() end;
    new.completed_at = null;
  else
    new.started_at = coalesce(new.started_at, case when tg_op = 'UPDATE' then old.started_at end, now());
    new.completed_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger forge_mission_checkpoints_enforce_transition
before insert or update on public.forge_mission_checkpoints
for each row execute function public.enforce_forge_mission_checkpoint_transition();

create or replace function public.record_forge_mission_checkpoint_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status
    or new.message is distinct from old.message
    or new.plan_id is distinct from old.plan_id then
    insert into public.forge_mission_checkpoint_history (
      checkpoint_id, mission_id, checkpoint_key, position, from_status,
      to_status, started_at, completed_at, message, plan_id, changed_by
    ) values (
      new.id, new.mission_id, new.checkpoint_key, new.position,
      case when tg_op = 'UPDATE' then old.status end,
      new.status, new.started_at, new.completed_at, new.message, new.plan_id,
      (select auth.uid())
    );
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.forge_activity_logs (mission_id, event_type, message, metadata)
    values (
      new.mission_id,
      case when new.status = 'failed' then 'checkpoint_failed' else 'checkpoint_updated' end,
      coalesce(new.message, 'Checkpoint mis a jour'),
      jsonb_build_object(
        'checkpoint_key', new.checkpoint_key,
        'position', new.position,
        'checkpoint_status', new.status,
        'plan_id', new.plan_id
      )
    );
  end if;
  return new;
end;
$$;

create trigger forge_mission_checkpoints_record_history
after insert or update on public.forge_mission_checkpoints
for each row execute function public.record_forge_mission_checkpoint_history();

create or replace function public.refresh_forge_mission_checkpoint_progress()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_mission uuid;
begin
  target_mission := case when tg_op = 'DELETE' then old.mission_id else new.mission_id end;
  update public.forge_missions m
  set progress = (
    select (count(*) filter (where c.status in ('completed', 'skipped')) * 10)::integer
    from public.forge_mission_checkpoints c
    where c.mission_id = target_mission
  )
  where m.id = target_mission;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger forge_mission_checkpoints_refresh_progress
after insert or update or delete on public.forge_mission_checkpoints
for each row execute function public.refresh_forge_mission_checkpoint_progress();

create or replace function public.initialize_forge_mission_checkpoints()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.agent_key = 'cody' and new.planning_required = true then
    insert into public.forge_mission_checkpoints (mission_id, checkpoint_key, position)
    values
      (new.id, 'analysis_completed', 1),
      (new.id, 'plan_generated', 2),
      (new.id, 'plan_validated', 3),
      (new.id, 'branch_created', 4),
      (new.id, 'development_started', 5),
      (new.id, 'migrations_prepared', 6),
      (new.id, 'tests_executed', 7),
      (new.id, 'commits_pushed', 8),
      (new.id, 'preview_created', 9),
      (new.id, 'final_report_produced', 10);
  end if;
  return new;
end;
$$;

create trigger forge_missions_initialize_checkpoints
after insert on public.forge_missions
for each row execute function public.initialize_forge_mission_checkpoints();

alter table public.forge_mission_checkpoints enable row level security;
alter table public.forge_mission_checkpoint_history enable row level security;

revoke all on table public.forge_mission_checkpoints from anon, authenticated;
revoke all on table public.forge_mission_checkpoint_history from anon, authenticated;
grant select, insert, update on table public.forge_mission_checkpoints to authenticated;
grant select on table public.forge_mission_checkpoint_history to authenticated;

create policy "Studio staff can manage Forge mission checkpoints"
on public.forge_mission_checkpoints for all to authenticated
using (exists (
  select 1 from public.agent_profiles ap
  where ap.is_active = true and ap.role in ('agent', 'admin')
    and (ap.user_id = (select auth.uid())
      or lower(ap.email) = lower((select auth.jwt()) ->> 'email'))
))
with check (exists (
  select 1 from public.agent_profiles ap
  where ap.is_active = true and ap.role in ('agent', 'admin')
    and (ap.user_id = (select auth.uid())
      or lower(ap.email) = lower((select auth.jwt()) ->> 'email'))
));

create policy "Studio staff can read Forge checkpoint history"
on public.forge_mission_checkpoint_history for select to authenticated
using (exists (
  select 1 from public.agent_profiles ap
  where ap.is_active = true and ap.role in ('agent', 'admin')
    and (ap.user_id = (select auth.uid())
      or lower(ap.email) = lower((select auth.jwt()) ->> 'email'))
));

revoke all on function public.enforce_forge_mission_checkpoint_transition() from public, anon, authenticated;
revoke all on function public.record_forge_mission_checkpoint_history() from public, anon, authenticated;
revoke all on function public.refresh_forge_mission_checkpoint_progress() from public, anon, authenticated;
revoke all on function public.initialize_forge_mission_checkpoints() from public, anon, authenticated;
