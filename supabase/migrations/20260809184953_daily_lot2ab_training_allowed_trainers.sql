-- Selen Daily Lot 2A + 2B - allowed trainers per reusable training.

alter table public.daily_formations
  add column if not exists allowed_trainer_ids jsonb not null default '[]'::jsonb;

create or replace function public.validate_daily_formation_allowed_trainers()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  trainer_id_text text;
begin
  if jsonb_typeof(new.allowed_trainer_ids) <> 'array' then
    raise exception 'allowed_trainer_ids must be an array';
  end if;

  for trainer_id_text in select jsonb_array_elements_text(new.allowed_trainer_ids)
  loop
    if not exists (
      select 1
      from public.daily_trainer_profiles t
      where t.id::text = trainer_id_text
        and t.organisation_id = new.organisation_id
        and t.status not in ('rejected', 'archived')
    ) then
      raise exception 'allowed trainer must belong to the organisation and be active';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists validate_daily_formation_allowed_trainers on public.daily_formations;
create trigger validate_daily_formation_allowed_trainers
before insert or update of allowed_trainer_ids, organisation_id on public.daily_formations
for each row execute function public.validate_daily_formation_allowed_trainers();

revoke execute on function public.validate_daily_formation_allowed_trainers() from public, anon, authenticated;
grant execute on function public.validate_daily_formation_allowed_trainers() to service_role;
