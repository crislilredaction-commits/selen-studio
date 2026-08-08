-- Selen Daily Lot 1B.1 - guards against losing the last active organisation manager.
-- Integrity checks lock the organisation row to serialize concurrent manager-removal attempts.

create or replace function public.daily_active_manager_count(
  p_organisation_id uuid,
  p_excluded_membership_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct om.id)::integer
  from public.organisation_memberships om
  join public.organisation_membership_roles omr on omr.membership_id = om.id
  where om.organisation_id = p_organisation_id
    and om.status = 'active'
    and omr.role = 'manager'
    and (p_excluded_membership_id is null or om.id <> p_excluded_membership_id);
$$;

revoke execute on function public.daily_active_manager_count(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.daily_active_manager_count(uuid, uuid)
  to service_role;

create or replace function public.prevent_last_daily_organisation_manager_loss()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_organisation_id uuid;
  source_membership_id uuid;
  source_membership_status text;
  removal_attempt boolean := false;
begin
  if tg_table_name = 'organisation_memberships' then
    source_organisation_id := old.organisation_id;
    source_membership_id := old.id;

    if tg_op = 'DELETE' then
      removal_attempt := old.status = 'active';
    else
      removal_attempt := old.status = 'active'
        and (new.status <> 'active' or new.organisation_id is distinct from old.organisation_id);
    end if;

    if removal_attempt and exists (
      select 1 from public.organisation_membership_roles
      where membership_id = source_membership_id and role = 'manager'
    ) then
      perform 1 from public.organisations where id = source_organisation_id for update;
      if public.daily_active_manager_count(source_organisation_id, source_membership_id) = 0 then
        raise exception 'last active manager cannot be removed from organisation';
      end if;
    end if;

  elsif tg_table_name = 'organisation_membership_roles' then
    if old.role <> 'manager' then
      if tg_op = 'DELETE' then return old; else return new; end if;
    end if;

    select om.organisation_id, om.status
    into source_organisation_id, source_membership_status
    from public.organisation_memberships om
    where om.id = old.membership_id;

    if source_membership_status = 'active' then
      if tg_op = 'DELETE' then
        removal_attempt := true;
      else
        removal_attempt := new.role <> 'manager'
          or new.membership_id is distinct from old.membership_id;
      end if;
    end if;

    if removal_attempt then
      perform 1 from public.organisations where id = source_organisation_id for update;
      if public.daily_active_manager_count(source_organisation_id, old.membership_id) = 0 then
        raise exception 'last active manager role cannot be removed or moved';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke execute on function public.prevent_last_daily_organisation_manager_loss()
  from public, anon, authenticated;
grant execute on function public.prevent_last_daily_organisation_manager_loss()
  to service_role;

drop trigger if exists organisation_memberships_prevent_last_manager_loss
  on public.organisation_memberships;
create trigger organisation_memberships_prevent_last_manager_loss
before delete or update of status, organisation_id
on public.organisation_memberships
for each row execute function public.prevent_last_daily_organisation_manager_loss();

drop trigger if exists organisation_membership_roles_prevent_last_manager_loss
  on public.organisation_membership_roles;
create trigger organisation_membership_roles_prevent_last_manager_loss
before delete or update of role, membership_id
on public.organisation_membership_roles
for each row execute function public.prevent_last_daily_organisation_manager_loss();

comment on function public.prevent_last_daily_organisation_manager_loss() is
  'Daily Lot 1B.1: serializes on organisations and prevents deleting, disabling, revoking or moving the last active manager or manager role.';
