-- Selen Daily Lot 2A + 2B - enforce training-level trainer restrictions in sessions.

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
  formation_allowed_trainer_ids jsonb;
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

  select f.allowed_trainer_ids into formation_allowed_trainer_ids
  from public.daily_formations f
  where f.id = new.formation_id
    and f.organisation_id = new.organisation_id;

  if formation_allowed_trainer_ids is null then
    raise exception 'session formation must belong to the organisation';
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

    if jsonb_array_length(formation_allowed_trainer_ids) > 0
      and not (formation_allowed_trainer_ids ? trainer_id_text) then
      raise exception 'session trainer is not allowed for this formation';
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function public.validate_daily_session_schedule() from public, anon, authenticated;
grant execute on function public.validate_daily_session_schedule() to service_role;
