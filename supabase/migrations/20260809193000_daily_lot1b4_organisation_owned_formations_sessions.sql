-- Selen Daily Lot 1B.4 - transition legacy user-owned formations/sessions to organisation ownership.

alter table public.daily_formations
  add column if not exists organisation_id uuid references public.organisations(id) on delete restrict;

alter table public.daily_sessions
  add column if not exists organisation_id uuid references public.organisations(id) on delete restrict;

-- No production Daily rows exist at migration time, so organisation ownership can become mandatory immediately.
alter table public.daily_formations alter column organisation_id set not null;
alter table public.daily_sessions alter column organisation_id set not null;

create index if not exists daily_formations_organisation_updated_idx
  on public.daily_formations(organisation_id, updated_at desc);
create index if not exists daily_sessions_organisation_updated_idx
  on public.daily_sessions(organisation_id, updated_at desc);
create index if not exists daily_sessions_organisation_formation_idx
  on public.daily_sessions(organisation_id, formation_id);

create or replace function public.can_manage_daily_trainings(p_organisation_id uuid)
returns boolean
language sql stable security invoker set search_path = public
as $$
  select public.daily_is_selen_staff()
    or public.has_organisation_role(p_organisation_id, 'manager')
    or public.has_organisation_permission_block(p_organisation_id, 'trainings');
$$;

create or replace function public.can_manage_daily_sessions(p_organisation_id uuid)
returns boolean
language sql stable security invoker set search_path = public
as $$
  select public.daily_is_selen_staff()
    or public.has_organisation_role(p_organisation_id, 'manager')
    or public.has_organisation_permission_block(p_organisation_id, 'sessions');
$$;

revoke execute on function public.can_manage_daily_trainings(uuid) from public, anon;
revoke execute on function public.can_manage_daily_sessions(uuid) from public, anon;
grant execute on function public.can_manage_daily_trainings(uuid) to authenticated, service_role;
grant execute on function public.can_manage_daily_sessions(uuid) to authenticated, service_role;

-- Replace legacy per-user RLS with organisation-scoped authorization.
drop policy if exists "Clients can create their Daily formations" on public.daily_formations;
drop policy if exists "Clients can delete their Daily formations" on public.daily_formations;
drop policy if exists "Clients can read their Daily formations" on public.daily_formations;
drop policy if exists "Clients can update their Daily formations" on public.daily_formations;

create policy "Organisation members can read Daily formations"
on public.daily_formations for select to authenticated
using (public.can_manage_daily_trainings(organisation_id));

create policy "Organisation members can create Daily formations"
on public.daily_formations for insert to authenticated
with check (
  public.can_manage_daily_trainings(organisation_id)
  and user_id = (select auth.uid())
);

create policy "Organisation members can update Daily formations"
on public.daily_formations for update to authenticated
using (public.can_manage_daily_trainings(organisation_id))
with check (public.can_manage_daily_trainings(organisation_id));

create policy "Organisation members can delete Daily formations"
on public.daily_formations for delete to authenticated
using (public.can_manage_daily_trainings(organisation_id));

drop policy if exists "Clients can create their Daily sessions" on public.daily_sessions;
drop policy if exists "Clients can delete their Daily sessions" on public.daily_sessions;
drop policy if exists "Clients can read their Daily sessions" on public.daily_sessions;
drop policy if exists "Clients can update their Daily sessions" on public.daily_sessions;

create policy "Organisation members can read Daily sessions"
on public.daily_sessions for select to authenticated
using (public.can_manage_daily_sessions(organisation_id));

create policy "Organisation members can create Daily sessions"
on public.daily_sessions for insert to authenticated
with check (
  public.can_manage_daily_sessions(organisation_id)
  and user_id = (select auth.uid())
  and exists (
    select 1 from public.daily_formations f
    where f.id = formation_id and f.organisation_id = organisation_id
  )
);

create policy "Organisation members can update Daily sessions"
on public.daily_sessions for update to authenticated
using (public.can_manage_daily_sessions(organisation_id))
with check (
  public.can_manage_daily_sessions(organisation_id)
  and exists (
    select 1 from public.daily_formations f
    where f.id = formation_id and f.organisation_id = organisation_id
  )
);

create policy "Organisation members can delete Daily sessions"
on public.daily_sessions for delete to authenticated
using (public.can_manage_daily_sessions(organisation_id));

-- Expose the new capability flags in the client workspace.
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
  can_trainers_all boolean := false;
  can_trainer_self boolean := false;
  can_legal boolean := false;
  can_trainings boolean := false;
  can_sessions boolean := false;
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
  can_trainers_all := 'manager' = any(current_roles) or 'trainers' = any(current_blocks);
  can_trainer_self := 'trainer' = any(current_roles);
  can_legal := 'manager' = any(current_roles) or 'legal_profile' = any(current_blocks);
  can_trainings := 'manager' = any(current_roles) or 'trainings' = any(current_blocks);
  can_sessions := 'manager' = any(current_roles) or 'sessions' = any(current_blocks);

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
      'trainers', can_trainers_all or can_trainer_self,
      'trainers_all', can_trainers_all,
      'legal_profile', can_legal,
      'permanent_documents', ('manager' = any(current_roles) or 'permanent_documents' = any(current_blocks)),
      'trainings', can_trainings,
      'sessions', can_sessions
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
    'trainers', case when (can_trainers_all or can_trainer_self) then coalesce((
      select jsonb_agg((to_jsonb(t) || jsonb_build_object(
        'certifications', coalesce((select jsonb_agg(to_jsonb(c) order by c.valid_until nulls last, c.created_at)
          from public.daily_trainer_certifications c where c.trainer_profile_id = t.id), '[]'::jsonb)
      )) order by t.display_name)
      from public.daily_trainer_profiles t
      where t.organisation_id = current_membership.organisation_id
        and (can_trainers_all or t.user_id = current_user_id)
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
