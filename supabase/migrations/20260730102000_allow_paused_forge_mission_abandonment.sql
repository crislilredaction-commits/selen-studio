-- Une confirmation humaine renforcee peut abandonner une mission en pause.

create or replace function public.enforce_forge_mission_pause_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'paused' and old.status <> 'in_progress' then
    raise exception 'Seule une mission en cours peut etre mise en pause';
  end if;
  if old.status = 'paused' and new.status not in ('in_progress', 'abandoned') then
    raise exception 'Une mission en pause doit etre reprise ou explicitement abandonnee';
  end if;

  if new.status = 'paused' then
    new.paused_at = now();
    new.resumed_at = null;
  elsif old.status = 'paused' and new.status = 'in_progress' then
    new.resumed_at = now();
  end if;

  return new;
end
$$;

revoke all on function public.enforce_forge_mission_pause_transition()
  from public, anon, authenticated;
