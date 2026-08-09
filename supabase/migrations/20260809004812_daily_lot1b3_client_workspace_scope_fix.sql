-- Selen Daily Lot 1B.3 - keep trainer self-service separate from organisation trainer management.

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
  can_manage_trainers boolean := false;
  is_trainer boolean := false;
  can_legal boolean := false;
  workspace jsonb;
begin
  if current_user_id is null then raise exception 'authenticated user required'; end if;

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
  can_manage_trainers := 'manager' = any(current_roles) or 'trainers' = any(current_blocks);
  is_trainer := 'trainer' = any(current_roles);
  can_legal := 'manager' = any(current_roles) or 'legal_profile' = any(current_blocks);

  select jsonb_build_object(
    'organisation', case when can_legal then to_jsonb(o) else jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'administrative_email', o.administrative_email,
      'administrative_phone', o.administrative_phone,
      'administrative_address', o.administrative_address
    ) end,
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
      'trainers', can_manage_trainers,
      'trainer_self', is_trainer,
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
    'trainers', case when can_manage_trainers or is_trainer then coalesce((
      select jsonb_agg((to_jsonb(t) || jsonb_build_object(
        'certifications', coalesce((select jsonb_agg(to_jsonb(c) order by c.valid_until nulls last, c.created_at)
          from public.daily_trainer_certifications c where c.trainer_profile_id = t.id), '[]'::jsonb)
      )) order by t.display_name)
      from public.daily_trainer_profiles t
      where t.organisation_id = current_membership.organisation_id
        and (can_manage_trainers or t.user_id = current_user_id)
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
