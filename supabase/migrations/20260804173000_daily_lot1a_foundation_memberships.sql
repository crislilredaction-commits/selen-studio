-- Selen Daily Lot 1A - organisation memberships, roles, permission blocks and auth helpers.
-- Additive migration only. No Daily V0 table is removed or backfilled here.

create table if not exists public.organisation_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'invited',
  primary_role text null,
  joined_at timestamptz not null default now(),
  disabled_at timestamptz null,
  disabled_by uuid null references auth.users(id) on delete set null,
  disable_reason text null,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_memberships_status_check
    check (status in ('invited', 'active', 'disabled', 'revoked')),
  constraint organisation_memberships_primary_role_check
    check (
      primary_role is null
      or primary_role in ('manager', 'trainer', 'admin_assistant')
    ),
  constraint organisation_memberships_disabled_state_check
    check (
      (status <> 'disabled' and disabled_at is null)
      or (status = 'disabled' and disabled_at is not null)
    ),
  constraint organisation_memberships_disable_reason_check
    check (
      status <> 'disabled'
      or nullif(btrim(coalesce(disable_reason, '')), '') is not null
    ),
  constraint organisation_memberships_user_unique
    unique (organisation_id, user_id)
);

create index if not exists organisation_memberships_user_idx
  on public.organisation_memberships (user_id, status);

create index if not exists organisation_memberships_organisation_idx
  on public.organisation_memberships (organisation_id, status);

create table if not exists public.organisation_membership_roles (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.organisation_memberships(id) on delete restrict,
  role text not null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint organisation_membership_roles_role_check
    check (role in ('manager', 'trainer', 'admin_assistant')),
  constraint organisation_membership_roles_unique
    unique (membership_id, role)
);

create index if not exists organisation_membership_roles_membership_idx
  on public.organisation_membership_roles (membership_id, role);

create table if not exists public.organisation_membership_permission_blocks (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.organisation_memberships(id) on delete restrict,
  permission_block text not null,
  enabled boolean not null default true,
  granted_by uuid null references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz null,
  reason text null,
  constraint organisation_membership_permission_blocks_block_check
    check (
      permission_block in (
        'company',
        'permanent_documents',
        'users',
        'trainings',
        'sessions',
        'monitoring',
        'settings',
        'exports'
      )
    ),
  constraint organisation_membership_permission_blocks_revoked_check
    check ((enabled = true and revoked_at is null) or (enabled = false)),
  constraint organisation_membership_permission_blocks_unique
    unique (membership_id, permission_block)
);

create index if not exists organisation_membership_permission_blocks_membership_idx
  on public.organisation_membership_permission_blocks (membership_id, permission_block, enabled);

create or replace function public.daily_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.daily_set_updated_at() from public, anon, authenticated;
grant execute on function public.daily_set_updated_at() to service_role;

drop trigger if exists organisation_memberships_set_updated_at on public.organisation_memberships;
create trigger organisation_memberships_set_updated_at
before update on public.organisation_memberships
for each row execute function public.daily_set_updated_at();

create or replace function public.daily_is_selen_staff()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
  )
  or exists (
    select 1
    from public.selen_admin_users sau
    where sau.is_active = true
      and (
        sau.user_id = (select auth.uid())
        or lower(sau.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
      )
  );
$$;

revoke execute on function public.daily_is_selen_staff() from public, anon;

create or replace function public.has_active_organisation_membership(p_organisation_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_memberships om
    where om.organisation_id = p_organisation_id
      and om.user_id = (select auth.uid())
      and om.status = 'active'
  );
$$;

revoke execute on function public.has_active_organisation_membership(uuid) from public, anon;

create or replace function public.has_organisation_role(p_organisation_id uuid, p_role text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_memberships om
    join public.organisation_membership_roles omr
      on omr.membership_id = om.id
    where om.organisation_id = p_organisation_id
      and om.user_id = (select auth.uid())
      and om.status = 'active'
      and omr.role = p_role
  );
$$;

revoke execute on function public.has_organisation_role(uuid, text) from public, anon;

create or replace function public.has_organisation_permission_block(
  p_organisation_id uuid,
  p_permission_block text
)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.organisation_memberships om
    join public.organisation_membership_permission_blocks omp
      on omp.membership_id = om.id
    where om.organisation_id = p_organisation_id
      and om.user_id = (select auth.uid())
      and om.status = 'active'
      and omp.permission_block = p_permission_block
      and omp.enabled = true
      and omp.revoked_at is null
  );
$$;

revoke execute on function public.has_organisation_permission_block(uuid, text) from public, anon;

create or replace function public.can_access_organisation(p_organisation_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.daily_is_selen_staff()
    or public.has_active_organisation_membership(p_organisation_id);
$$;

revoke execute on function public.can_access_organisation(uuid) from public, anon;

create or replace function public.can_manage_organisation_users(p_organisation_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.daily_is_selen_staff()
    or public.has_organisation_role(p_organisation_id, 'manager')
    or public.has_organisation_permission_block(p_organisation_id, 'users');
$$;

revoke execute on function public.can_manage_organisation_users(uuid) from public, anon;

create or replace function public.can_manage_daily_sessions(p_organisation_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.daily_is_selen_staff()
    or public.has_organisation_role(p_organisation_id, 'manager')
    or public.has_organisation_role(p_organisation_id, 'trainer')
    or public.has_organisation_role(p_organisation_id, 'admin_assistant')
    or public.has_organisation_permission_block(p_organisation_id, 'sessions');
$$;

revoke execute on function public.can_manage_daily_sessions(uuid) from public, anon;

create or replace function public.can_manage_daily_documents(p_organisation_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.daily_is_selen_staff()
    or public.has_organisation_role(p_organisation_id, 'manager')
    or public.has_organisation_permission_block(p_organisation_id, 'permanent_documents')
    or public.has_organisation_permission_block(p_organisation_id, 'trainings');
$$;

revoke execute on function public.can_manage_daily_documents(uuid) from public, anon;

alter table public.organisation_memberships enable row level security;
alter table public.organisation_membership_roles enable row level security;
alter table public.organisation_membership_permission_blocks enable row level security;

drop policy if exists "Selen staff can manage organisation memberships" on public.organisation_memberships;
create policy "Selen staff can manage organisation memberships"
on public.organisation_memberships
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Members can read their own organisation memberships" on public.organisation_memberships;
create policy "Members can read their own organisation memberships"
on public.organisation_memberships
for select
to authenticated
using (user_id = (select auth.uid()) and status = 'active');

drop policy if exists "Selen staff can manage organisation membership roles" on public.organisation_membership_roles;
create policy "Selen staff can manage organisation membership roles"
on public.organisation_membership_roles
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Members can read their own organisation roles" on public.organisation_membership_roles;
create policy "Members can read their own organisation roles"
on public.organisation_membership_roles
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_memberships om
    where om.id = organisation_membership_roles.membership_id
      and om.user_id = (select auth.uid())
      and om.status = 'active'
  )
);

drop policy if exists "Selen staff can manage organisation permission blocks" on public.organisation_membership_permission_blocks;
create policy "Selen staff can manage organisation permission blocks"
on public.organisation_membership_permission_blocks
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Members can read their own organisation permission blocks" on public.organisation_membership_permission_blocks;
create policy "Members can read their own organisation permission blocks"
on public.organisation_membership_permission_blocks
for select
to authenticated
using (
  exists (
    select 1
    from public.organisation_memberships om
    where om.id = organisation_membership_permission_blocks.membership_id
      and om.user_id = (select auth.uid())
      and om.status = 'active'
  )
);

revoke all on table public.organisation_memberships from public, anon, authenticated;
revoke all on table public.organisation_membership_roles from public, anon, authenticated;
revoke all on table public.organisation_membership_permission_blocks from public, anon, authenticated;

grant select, insert, update, delete on table public.organisation_memberships to authenticated;
grant select, insert, update, delete on table public.organisation_membership_roles to authenticated;
grant select, insert, update, delete on table public.organisation_membership_permission_blocks to authenticated;

grant execute on function public.daily_is_selen_staff() to authenticated;
grant execute on function public.has_active_organisation_membership(uuid) to authenticated;
grant execute on function public.has_organisation_role(uuid, text) to authenticated;
grant execute on function public.has_organisation_permission_block(uuid, text) to authenticated;
grant execute on function public.can_access_organisation(uuid) to authenticated;
grant execute on function public.can_manage_organisation_users(uuid) to authenticated;
grant execute on function public.can_manage_daily_sessions(uuid) to authenticated;
grant execute on function public.can_manage_daily_documents(uuid) to authenticated;
