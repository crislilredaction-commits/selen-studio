-- Selen Daily Lot 1B.3 - avoid PL/pgSQL output-variable ambiguity in bootstrap upserts.

create or replace function public.daily_client_bootstrap_organisation(
  p_name text,
  p_siret text default null,
  p_address text default null,
  p_manager_name text default null
)
returns table(organisation_id uuid, membership_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_email text := lower(btrim(coalesce((select auth.jwt() ->> 'email'), '')));
  existing_membership public.organisation_memberships%rowtype;
  new_organisation_id uuid;
  new_membership_id uuid;
  block_value text;
  clean_name text := nullif(btrim(p_name), '');
  clean_siret text := nullif(regexp_replace(coalesce(p_siret, ''), '\s+', '', 'g'), '');
begin
  if current_user_id is null then raise exception 'authenticated user required'; end if;
  if not public.daily_client_has_active_access(current_user_id) then
    raise exception 'active Selen Daily access required';
  end if;

  select om.* into existing_membership
  from public.organisation_memberships om
  where om.user_id = current_user_id and om.status = 'active'
  order by om.joined_at asc
  limit 1;

  if found then
    organisation_id := existing_membership.organisation_id;
    membership_id := existing_membership.id;
    return next;
    return;
  end if;

  if clean_name is null then raise exception 'organisation name required'; end if;
  if clean_siret is not null and exists (
    select 1 from public.organisations o
    where regexp_replace(coalesce(o.siret, ''), '\s+', '', 'g') = clean_siret
  ) then
    raise exception 'organisation already exists; Selen must link this Daily access';
  end if;

  insert into public.organisations(
    name, legal_name, siret, email, administrative_email,
    address, administrative_address, contact_name, status
  ) values (
    clean_name, clean_name, clean_siret,
    nullif(current_email, ''), nullif(current_email, ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_address, '')), ''),
    nullif(btrim(coalesce(p_manager_name, '')), ''), 'active'
  ) returning id into new_organisation_id;

  insert into public.organisation_memberships(
    organisation_id, user_id, status, primary_role, joined_at, created_by, updated_by
  ) values (
    new_organisation_id, current_user_id, 'active', 'manager', now(), current_user_id, current_user_id
  ) returning id into new_membership_id;

  insert into public.organisation_membership_roles(membership_id, role, created_by)
  values (new_membership_id, 'manager', current_user_id)
  on conflict on constraint organisation_membership_roles_unique do nothing;

  foreach block_value in array array['users','trainers','legal_profile','permanent_documents']::text[] loop
    insert into public.organisation_membership_permission_blocks(
      membership_id, permission_block, enabled, granted_by, granted_at, revoked_at
    ) values (
      new_membership_id, block_value, true, current_user_id, now(), null
    )
    on conflict on constraint organisation_membership_permission_blocks_unique do update
      set enabled = true,
          granted_by = excluded.granted_by,
          granted_at = excluded.granted_at,
          revoked_at = null;
  end loop;

  organisation_id := new_organisation_id;
  membership_id := new_membership_id;
  return next;
end;
$$;

revoke execute on function public.daily_client_bootstrap_organisation(text,text,text,text)
  from public, anon;
grant execute on function public.daily_client_bootstrap_organisation(text,text,text,text)
  to authenticated;
