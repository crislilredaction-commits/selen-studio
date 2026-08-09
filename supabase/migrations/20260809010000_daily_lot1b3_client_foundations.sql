-- Selen Daily Lot 1B.3 - client organisation workspace foundations.
-- Bridges the authenticated client experience to the organisation/membership model
-- introduced in Lots 1A/1B.1 without exposing Studio-only checklist or assignment data.

create or replace function public.daily_client_has_active_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.daily_subscriptions ds
    where ds.user_id = p_user_id
      and ds.status = 'active'
  )
  or exists (
    select 1
    from public.selen_client_tool_access a
    where a.user_id = p_user_id
      and a.tool_slug = 'selen-daily'
      and a.status = 'active'
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at is null or a.ends_at >= now())
  );
$$;

revoke execute on function public.daily_client_has_active_access(uuid)
  from public, anon, authenticated;
grant execute on function public.daily_client_has_active_access(uuid)
  to service_role;

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
  if current_user_id is null then
    raise exception 'authenticated user required';
  end if;

  if not public.daily_client_has_active_access(current_user_id) then
    raise exception 'active Selen Daily access required';
  end if;

  select om.* into existing_membership
  from public.organisation_memberships om
  where om.user_id = current_user_id
    and om.status = 'active'
  order by om.joined_at asc
  limit 1;

  if found then
    organisation_id := existing_membership.organisation_id;
    membership_id := existing_membership.id;
    return next;
    return;
  end if;

  if clean_name is null then
    raise exception 'organisation name required';
  end if;

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
  on conflict (membership_id, role) do nothing;

  foreach block_value in array array['users','trainers','legal_profile','permanent_documents']::text[] loop
    insert into public.organisation_membership_permission_blocks(
      membership_id, permission_block, enabled, granted_by, granted_at, revoked_at
    ) values (
      new_membership_id, block_value, true, current_user_id, now(), null
    )
    on conflict (membership_id, permission_block) do update
      set enabled = true, granted_by = excluded.granted_by,
          granted_at = excluded.granted_at, revoked_at = null;
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

create or replace function public.daily_client_workspace(p_organisation_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_membership public.organisation_memberships%rowtype;
  current_roles text[] := '{}'::text[];
  current_blocks text[] := '{}'::text[];
  can_users boolean := false;
  can_trainers boolean := false;
  can_legal boolean := false;
  workspace jsonb;
begin
  if current_user_id is null then
    raise exception 'authenticated user required';
  end if;

  select om.* into current_membership
  from public.organisation_memberships om
  where om.user_id = current_user_id
    and om.status = 'active'
    and (p_organisation_id is null or om.organisation_id = p_organisation_id)
  order by om.joined_at asc
  limit 1;

  if not found then raise exception 'active organisation membership required'; end if;

  select coalesce(array_agg(omr.role order by omr.role), '{}'::text[])
    into current_roles
  from public.organisation_membership_roles omr
  where omr.membership_id = current_membership.id;

  select coalesce(array_agg(omp.permission_block order by omp.permission_block), '{}'::text[])
    into current_blocks
  from public.organisation_membership_permission_blocks omp
  where omp.membership_id = current_membership.id
    and omp.enabled = true and omp.revoked_at is null;

  can_users := 'manager' = any(current_roles) or 'users' = any(current_blocks);
  can_trainers := 'manager' = any(current_roles) or 'trainers' = any(current_blocks) or 'trainer' = any(current_roles);
  can_legal := 'manager' = any(current_roles) or 'legal_profile' = any(current_blocks);

  select jsonb_build_object(
    'organisation', to_jsonb(o),
    'membership', jsonb_build_object(
      'id', current_membership.id,
      'organisation_id', current_membership.organisation_id,
      'status', current_membership.status,
      'primary_role', current_membership.primary_role,
      'roles', to_jsonb(current_roles),
      'permission_blocks', to_jsonb(current_blocks)
    ),
    'capabilities', jsonb_build_object(
      'users', can_users,
      'trainers', can_trainers,
      'legal_profile', can_legal,
      'permanent_documents', ('manager' = any(current_roles) or 'permanent_documents' = any(current_blocks))
    ),
    'users', case when can_users then coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', om.id,
        'user_id', om.user_id,
        'email', coalesce(scp.email, au.email),
        'full_name', scp.full_name,
        'status', om.status,
        'primary_role', om.primary_role,
        'roles', coalesce((select jsonb_agg(r.role order by r.role)
          from public.organisation_membership_roles r where r.membership_id = om.id), '[]'::jsonb),
        'permission_blocks', coalesce((select jsonb_agg(b.permission_block order by b.permission_block)
          from public.organisation_membership_permission_blocks b
          where b.membership_id = om.id and b.enabled = true and b.revoked_at is null), '[]'::jsonb)
      ) order by om.joined_at)
      from public.organisation_memberships om
      left join public.selen_client_profiles scp on scp.user_id = om.user_id
      left join auth.users au on au.id = om.user_id
      where om.organisation_id = current_membership.organisation_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'invitations', case when can_users then coalesce((
      select jsonb_agg(to_jsonb(i) - 'token_hash' order by i.created_at desc)
      from public.daily_organisation_invitations i
      where i.organisation_id = current_membership.organisation_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'trainers', case when can_trainers then coalesce((
      select jsonb_agg((to_jsonb(t) || jsonb_build_object(
        'certifications', coalesce((select jsonb_agg(to_jsonb(c) order by c.valid_until nulls last, c.created_at)
          from public.daily_trainer_certifications c where c.trainer_profile_id = t.id), '[]'::jsonb)
      )) order by t.display_name)
      from public.daily_trainer_profiles t
      where t.organisation_id = current_membership.organisation_id
        and (can_trainers or t.user_id = current_user_id)
    ), '[]'::jsonb) else '[]'::jsonb end,
    'profile_change_requests', case when can_legal then coalesce((
      select jsonb_agg(to_jsonb(r) order by r.requested_at desc)
      from public.daily_organisation_profile_change_requests r
      where r.organisation_id = current_membership.organisation_id
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into workspace
  from public.organisations o
  where o.id = current_membership.organisation_id;

  return workspace;
end;
$$;

revoke execute on function public.daily_client_workspace(uuid) from public, anon;
grant execute on function public.daily_client_workspace(uuid) to authenticated;

create or replace function public.daily_client_set_membership_access(
  p_organisation_id uuid, p_membership_id uuid, p_roles text[], p_permission_blocks text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_membership public.organisation_memberships%rowtype;
  role_value text;
  block_value text;
begin
  if current_user_id is null then raise exception 'authenticated user required'; end if;
  if cardinality(coalesce(p_roles, '{}'::text[])) = 0 then raise exception 'at least one role required'; end if;

  if not public.daily_can_assign_invitation_scope(
    p_organisation_id, coalesce(p_roles, '{}'::text[]), coalesce(p_permission_blocks, '{}'::text[])
  ) then raise exception 'membership scope is not allowed for current user'; end if;

  select * into target_membership
  from public.organisation_memberships
  where id = p_membership_id and organisation_id = p_organisation_id
  for update;

  if not found then raise exception 'membership not found'; end if;
  if target_membership.user_id = current_user_id then raise exception 'users cannot change their own access scope'; end if;
  if target_membership.status not in ('active','disabled') then raise exception 'membership status cannot be changed here'; end if;
  if exists (select 1 from public.organisation_membership_roles r
    where r.membership_id = target_membership.id and r.role = 'manager') then
    raise exception 'manager access is reserved to Selen staff';
  end if;

  delete from public.organisation_membership_roles where membership_id = target_membership.id;
  foreach role_value in array p_roles loop
    insert into public.organisation_membership_roles(membership_id, role, created_by)
    values (target_membership.id, role_value, current_user_id)
    on conflict (membership_id, role) do nothing;
  end loop;

  update public.organisation_membership_permission_blocks
  set enabled = false, revoked_at = now(), reason = 'Client access scope updated'
  where membership_id = target_membership.id and enabled = true and revoked_at is null;

  foreach block_value in array coalesce(p_permission_blocks, '{}'::text[]) loop
    insert into public.organisation_membership_permission_blocks(
      membership_id, permission_block, enabled, granted_by, granted_at, revoked_at, reason
    ) values (
      target_membership.id, block_value, true, current_user_id, now(), null, 'Client access scope updated'
    )
    on conflict (membership_id, permission_block) do update
      set enabled = true, granted_by = excluded.granted_by,
          granted_at = excluded.granted_at, revoked_at = null, reason = excluded.reason;
  end loop;

  update public.organisation_memberships
  set primary_role = p_roles[1], updated_by = current_user_id, updated_at = now()
  where id = target_membership.id;
end;
$$;

revoke execute on function public.daily_client_set_membership_access(uuid,uuid,text[],text[]) from public, anon;
grant execute on function public.daily_client_set_membership_access(uuid,uuid,text[],text[]) to authenticated;

create or replace function public.daily_client_set_membership_status(
  p_organisation_id uuid, p_membership_id uuid, p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_membership public.organisation_memberships%rowtype;
begin
  if current_user_id is null then raise exception 'authenticated user required'; end if;
  if p_status not in ('active','disabled') then raise exception 'unsupported membership status'; end if;
  if not public.can_invite_organisation_user(p_organisation_id) then raise exception 'user management permission required'; end if;

  select * into target_membership
  from public.organisation_memberships
  where id = p_membership_id and organisation_id = p_organisation_id
  for update;
  if not found then raise exception 'membership not found'; end if;
  if target_membership.user_id = current_user_id then raise exception 'users cannot disable themselves'; end if;
  if exists (select 1 from public.organisation_membership_roles r
    where r.membership_id = target_membership.id and r.role = 'manager') then
    raise exception 'manager status is reserved to Selen staff';
  end if;
  if target_membership.status = 'revoked' then raise exception 'revoked membership cannot be reactivated'; end if;

  update public.organisation_memberships
  set status = p_status,
      disabled_at = case when p_status = 'disabled' then now() else null end,
      disabled_by = case when p_status = 'disabled' then current_user_id else null end,
      disable_reason = case when p_status = 'disabled' then 'Disabled by organisation manager' else null end,
      updated_by = current_user_id, updated_at = now()
  where id = target_membership.id;
end;
$$;

revoke execute on function public.daily_client_set_membership_status(uuid,uuid,text) from public, anon;
grant execute on function public.daily_client_set_membership_status(uuid,uuid,text) to authenticated;

drop policy if exists "Trainers can update their own unvalidated trainer profile" on public.daily_trainer_profiles;
create policy "Trainers can update their own unvalidated trainer profile"
on public.daily_trainer_profiles for update to authenticated
using (user_id = (select auth.uid()) and active = true and status not in ('validated','rejected'))
with check (user_id = (select auth.uid()) and active = true and status not in ('validated','rejected')
  and selen_validated_at is null and selen_validated_by is null);

drop policy if exists "daily_trainer_certifications_manager_delete" on public.daily_trainer_certifications;
create policy "daily_trainer_certifications_manager_delete"
on public.daily_trainer_certifications for delete to authenticated
using (exists (select 1 from public.daily_trainer_profiles dtp
  where dtp.id = trainer_profile_id and public.can_manage_daily_trainers(dtp.organisation_id)));

drop policy if exists "daily_trainer_certifications_own_delete" on public.daily_trainer_certifications;
create policy "daily_trainer_certifications_own_delete"
on public.daily_trainer_certifications for delete to authenticated
using (exists (select 1 from public.daily_trainer_profiles dtp
  where dtp.id = trainer_profile_id and dtp.user_id = (select auth.uid())));
