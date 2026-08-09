-- Selen Daily Lot 2A + 2B
-- Complete the reusable training catalogue and operational session core.

alter table public.daily_formations
  add column if not exists learning_objectives jsonb not null default '[]'::jsonb,
  add column if not exists pedagogical_methods text not null default '';

alter table public.daily_sessions
  add column if not exists internal_reference text,
  add column if not exists max_participants integer;

alter table public.daily_sessions
  drop constraint if exists daily_sessions_max_participants_check;

alter table public.daily_sessions
  add constraint daily_sessions_max_participants_check
  check (max_participants is null or max_participants > 0);

create index if not exists daily_sessions_organisation_reference_idx
  on public.daily_sessions(organisation_id, internal_reference)
  where internal_reference is not null;

create or replace function public.validate_daily_formation_learning_objectives()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  objective jsonb;
begin
  if jsonb_typeof(new.learning_objectives) <> 'array' then
    raise exception 'learning_objectives must be an array';
  end if;

  for objective in select value from jsonb_array_elements(new.learning_objectives)
  loop
    if jsonb_typeof(objective) <> 'string' or btrim(objective #>> '{}') = '' then
      raise exception 'learning objectives must be non-empty strings';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists validate_daily_formation_learning_objectives on public.daily_formations;
create trigger validate_daily_formation_learning_objectives
before insert or update of learning_objectives on public.daily_formations
for each row execute function public.validate_daily_formation_learning_objectives();

create or replace function public.validate_daily_session_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  block jsonb;
  block_date date;
  block_start time;
  block_end time;
  trainer_id_text text;
begin
  if new.start_date is not null and new.end_date is not null and new.end_date < new.start_date then
    raise exception 'session end date must be on or after start date';
  end if;

  if jsonb_typeof(new.schedule_blocks) <> 'array' then
    raise exception 'schedule_blocks must be an array';
  end if;

  for block in select value from jsonb_array_elements(new.schedule_blocks)
  loop
    if jsonb_typeof(block) <> 'object' then
      raise exception 'schedule block must be an object';
    end if;

    if coalesce(block->>'date', '') = '' or coalesce(block->>'start', '') = '' or coalesce(block->>'end', '') = '' then
      raise exception 'schedule block date, start and end are required';
    end if;

    block_date := (block->>'date')::date;
    block_start := (block->>'start')::time;
    block_end := (block->>'end')::time;

    if block_end <= block_start then
      raise exception 'schedule block end time must be after start time';
    end if;

    if new.start_date is not null and block_date < new.start_date then
      raise exception 'schedule block cannot start before session';
    end if;
    if new.end_date is not null and block_date > new.end_date then
      raise exception 'schedule block cannot end after session';
    end if;
  end loop;

  if jsonb_typeof(new.trainer_ids) <> 'array' then
    raise exception 'trainer_ids must be an array';
  end if;

  for trainer_id_text in select jsonb_array_elements_text(new.trainer_ids)
  loop
    if not exists (
      select 1
      from public.daily_trainer_profiles t
      where t.id::text = trainer_id_text
        and t.organisation_id = new.organisation_id
        and t.status not in ('rejected', 'archived')
    ) then
      raise exception 'session trainer must belong to the organisation and be active';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists validate_daily_session_schedule on public.daily_sessions;
create trigger validate_daily_session_schedule
before insert or update of start_date, end_date, schedule_blocks, trainer_ids, organisation_id
on public.daily_sessions
for each row execute function public.validate_daily_session_schedule();

revoke execute on function public.validate_daily_formation_learning_objectives() from public, anon, authenticated;
revoke execute on function public.validate_daily_session_schedule() from public, anon, authenticated;
grant execute on function public.validate_daily_formation_learning_objectives() to service_role;
grant execute on function public.validate_daily_session_schedule() to service_role;
