-- Selen Daily Lot 1B.4 - make training/session permissions delegable by organisation managers.

create or replace function public.daily_grant_manager_operational_blocks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  block_value text;
begin
  if new.role <> 'manager' then
    return new;
  end if;

  foreach block_value in array array['trainings','sessions']::text[] loop
    insert into public.organisation_membership_permission_blocks(
      membership_id, permission_block, enabled, granted_by, granted_at, revoked_at, reason
    ) values (
      new.membership_id, block_value, true, new.created_by, now(), null,
      'Operational block granted with manager role'
    )
    on conflict on constraint organisation_membership_permission_blocks_unique do update
      set enabled = true,
          granted_by = excluded.granted_by,
          granted_at = excluded.granted_at,
          revoked_at = null,
          reason = excluded.reason;
  end loop;

  return new;
end;
$$;

revoke execute on function public.daily_grant_manager_operational_blocks()
  from public, anon, authenticated;
grant execute on function public.daily_grant_manager_operational_blocks()
  to service_role;

drop trigger if exists daily_manager_operational_blocks_after_role on public.organisation_membership_roles;
create trigger daily_manager_operational_blocks_after_role
after insert or update of role on public.organisation_membership_roles
for each row execute function public.daily_grant_manager_operational_blocks();

-- Idempotent backfill for any manager memberships that may exist when this migration is replayed.
insert into public.organisation_membership_permission_blocks(
  membership_id, permission_block, enabled, granted_by, granted_at, revoked_at, reason
)
select r.membership_id, b.permission_block, true, r.created_by, now(), null,
       'Operational block granted with manager role'
from public.organisation_membership_roles r
cross join (values ('trainings'::text), ('sessions'::text)) b(permission_block)
where r.role = 'manager'
on conflict on constraint organisation_membership_permission_blocks_unique do update
  set enabled = true,
      granted_at = excluded.granted_at,
      revoked_at = null,
      reason = excluded.reason;
