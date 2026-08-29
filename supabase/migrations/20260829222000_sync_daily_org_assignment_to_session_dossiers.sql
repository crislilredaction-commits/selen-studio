-- Selen Daily - organisation assignment is the canonical owner for all session dossiers.
-- Safe additive synchronisation: no data deletion, no Auth/RLS change.

create or replace function public.daily_sync_organisation_assignment_to_session_dossiers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  organisation_id_value uuid;
  agent_profile_id_value uuid;
  assigned_by_value uuid;
begin
  organisation_id_value := coalesce(new.organisation_id, old.organisation_id);

  if tg_op = 'DELETE' then
    agent_profile_id_value := null;
    assigned_by_value := null;
  else
    agent_profile_id_value := new.agent_profile_id;
    assigned_by_value := new.assigned_by;
  end if;

  update public.daily_session_dossiers
  set assigned_agent_profile_id = agent_profile_id_value,
      assigned_by = assigned_by_value
  where organisation_id = organisation_id_value
    and (
      assigned_agent_profile_id is distinct from agent_profile_id_value
      or assigned_by is distinct from assigned_by_value
    );

  return coalesce(new, old);
end;
$$;

revoke execute on function public.daily_sync_organisation_assignment_to_session_dossiers()
  from public, anon, authenticated;
grant execute on function public.daily_sync_organisation_assignment_to_session_dossiers()
  to service_role;

drop trigger if exists daily_organisation_assignment_session_dossier_sync
  on public.daily_organisation_assignments;
create trigger daily_organisation_assignment_session_dossier_sync
after insert or update or delete on public.daily_organisation_assignments
for each row execute function public.daily_sync_organisation_assignment_to_session_dossiers();

-- Bring any pre-existing dossier into the organisation-level assignment rule.
-- This is idempotent and only touches rows whose assignment differs.
update public.daily_session_dossiers d
set assigned_agent_profile_id = a.agent_profile_id,
    assigned_by = a.assigned_by
from public.daily_organisation_assignments a
where a.organisation_id = d.organisation_id
  and (
    d.assigned_agent_profile_id is distinct from a.agent_profile_id
    or d.assigned_by is distinct from a.assigned_by
  );

-- An organisation without an assignment cannot keep a session-level owner.
update public.daily_session_dossiers d
set assigned_agent_profile_id = null,
    assigned_by = null
where d.assigned_agent_profile_id is not null
  and not exists (
    select 1
    from public.daily_organisation_assignments a
    where a.organisation_id = d.organisation_id
  );
