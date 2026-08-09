-- Selen Daily Lot 1B.4 - temporary bridge while V0 APIs are moved from user_id to organisation_id.

create or replace function public.daily_resolve_active_organisation_for_user(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select om.organisation_id
  from public.organisation_memberships om
  where om.user_id = p_user_id
    and om.status = 'active'
  order by om.joined_at asc
  limit 1;
$$;

revoke execute on function public.daily_resolve_active_organisation_for_user(uuid)
  from public, anon, authenticated;
grant execute on function public.daily_resolve_active_organisation_for_user(uuid)
  to service_role;

create or replace function public.daily_fill_legacy_organisation_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_organisation_id uuid;
  formation_organisation_id uuid;
begin
  if new.user_id is null then
    raise exception 'Daily owner user is required';
  end if;

  resolved_organisation_id := public.daily_resolve_active_organisation_for_user(new.user_id);
  if resolved_organisation_id is null then
    raise exception 'active organisation membership required for Daily record';
  end if;

  if tg_table_name = 'daily_formations' then
    if new.organisation_id is null then
      new.organisation_id := resolved_organisation_id;
    elsif new.organisation_id <> resolved_organisation_id then
      raise exception 'Daily formation organisation does not match active membership';
    end if;
    return new;
  end if;

  if tg_table_name = 'daily_sessions' then
    select f.organisation_id into formation_organisation_id
    from public.daily_formations f
    where f.id = new.formation_id;

    if formation_organisation_id is null then
      raise exception 'Daily session formation not found';
    end if;
    if formation_organisation_id <> resolved_organisation_id then
      raise exception 'Daily session formation belongs to another organisation';
    end if;
    if new.organisation_id is null then
      new.organisation_id := formation_organisation_id;
    elsif new.organisation_id <> formation_organisation_id then
      raise exception 'Daily session organisation does not match formation';
    end if;
    return new;
  end if;

  raise exception 'unsupported Daily ownership bridge table';
end;
$$;

revoke execute on function public.daily_fill_legacy_organisation_ownership()
  from public, anon, authenticated;
grant execute on function public.daily_fill_legacy_organisation_ownership()
  to service_role;

drop trigger if exists daily_formations_fill_legacy_organisation on public.daily_formations;
create trigger daily_formations_fill_legacy_organisation
before insert or update of user_id, organisation_id on public.daily_formations
for each row execute function public.daily_fill_legacy_organisation_ownership();

drop trigger if exists daily_sessions_fill_legacy_organisation on public.daily_sessions;
create trigger daily_sessions_fill_legacy_organisation
before insert or update of user_id, organisation_id, formation_id on public.daily_sessions
for each row execute function public.daily_fill_legacy_organisation_ownership();
