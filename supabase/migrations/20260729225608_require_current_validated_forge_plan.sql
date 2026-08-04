-- Une mission de cadrage ne peut être exécutée que si sa version courante
-- est explicitement validée.

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
        and p.is_current = true
    ) then
    raise exception 'Un cadrage courant validé est requis avant exécution';
  end if;

  return new;
end;
$$;
