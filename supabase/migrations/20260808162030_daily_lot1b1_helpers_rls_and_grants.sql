-- Selen Daily Lot 1B.1 - authorization helpers, controlled invitation RPCs, RLS and strict grants.

do $$
begin
  alter table public.organisation_membership_permission_blocks
    drop constraint if exists organisation_membership_permission_blocks_block_check;
  alter table public.organisation_membership_permission_blocks
    add constraint organisation_membership_permission_blocks_block_check
    check (
      permission_block in (
        'company','permanent_documents','users','trainers','legal_profile',
        'trainings','sessions','monitoring','settings','exports'
      )
    );
end;
$$;

create or replace function public.can_manage_daily_trainers(p_organisation_id uuid)
returns boolean
language sql stable security invoker set search_path = public
as $$
  select public.daily_is_selen_staff()
    or public.has_organisation_role(p_organisation_id, 'manager')
    or public.has_organisation_permission_block(p_organisation_id, 'trainers');
$$;

create or replace function public.can_invite_organisation_user(p_organisation_id uuid)
returns boolean
language sql stable security invoker set search_path = public
as $$
  select public.daily_is_selen_staff()
    or public.has_organisation_role(p_organisation_id, 'manager')
    or public.has_organisation_permission_block(p_organisation_id, 'users');
$$;

create or replace function public.can_submit_organisation_profile_change(p_organisation_id uuid)
returns boolean
language sql stable security invoker set search_path = public
as $$
  select public.daily_is_selen_staff()
    or public.has_organisation_role(p_organisation_id, 'manager')
    or public.has_organisation_permission_block(p_organisation_id, 'legal_profile');
$$;

create or replace function public.can_review_organisation_profile_change()
returns boolean
language sql stable security invoker set search_path = public
as $$ select public.daily_is_selen_staff(); $$;

create or replace function public.can_view_daily_trainer_profile(p_organisation_id uuid)
returns boolean
language sql stable security invoker set search_path = public
as $$
  select public.daily_is_selen_staff()
    or public.has_organisation_role(p_organisation_id, 'manager')
    or public.has_organisation_permission_block(p_organisation_id, 'trainers');
$$;

revoke execute on function public.can_manage_daily_trainers(uuid) from public, anon;
revoke execute on function public.can_invite_organisation_user(uuid) from public, anon;
revoke execute on function public.can_submit_organisation_profile_change(uuid) from public, anon;
revoke execute on function public.can_review_organisation_profile_change() from public, anon;
revoke execute on function public.can_view_daily_trainer_profile(uuid) from public, anon;
grant execute on function public.can_manage_daily_trainers(uuid) to authenticated;
grant execute on function public.can_invite_organisation_user(uuid) to authenticated;
grant execute on function public.can_submit_organisation_profile_change(uuid) to authenticated;
grant execute on function public.can_review_organisation_profile_change() to authenticated;
grant execute on function public.can_view_daily_trainer_profile(uuid) to authenticated;

create or replace function public.daily_can_assign_invitation_scope(
  p_organisation_id uuid,
  p_roles text[],
  p_permission_blocks text[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_membership_id uuid;
  has_users_block boolean := false;
  role_value text;
  block_value text;
begin
  if (select auth.uid()) is null then return false; end if;

  if cardinality(p_roles) = 0
     or not public.daily_text_array_has_no_duplicates(p_roles)
     or not public.daily_text_array_has_no_duplicates(p_permission_blocks)
     or not (p_roles <@ array['manager','trainer','admin_assistant']::text[])
     or not (p_permission_blocks <@ array['users','trainers','legal_profile','permanent_documents']::text[]) then
    return false;
  end if;

  if public.daily_is_selen_staff() then return true; end if;

  select om.id into current_membership_id
  from public.organisation_memberships om
  where om.organisation_id = p_organisation_id
    and om.user_id = (select auth.uid())
    and om.status = 'active'
  limit 1;

  if current_membership_id is null then return false; end if;

  if exists (
    select 1 from public.organisation_membership_roles omr
    where omr.membership_id = current_membership_id and omr.role = 'manager'
  ) then
    if 'manager' = any(p_roles) then return false; end if;

    foreach role_value in array p_roles loop
      if role_value not in ('trainer','admin_assistant') then return false; end if;
    end loop;

    foreach block_value in array p_permission_blocks loop
      if not exists (
        select 1 from public.organisation_membership_permission_blocks omp
        where omp.membership_id = current_membership_id
          and omp.permission_block = block_value
          and omp.enabled = true
          and omp.revoked_at is null
      ) then return false; end if;
    end loop;
    return true;
  end if;

  select exists (
    select 1 from public.organisation_membership_permission_blocks omp
    where omp.membership_id = current_membership_id
      and omp.permission_block = 'users'
      and omp.enabled = true
      and omp.revoked_at is null
  ) into has_users_block;

  if has_users_block then
    return p_roles <@ array['trainer']::text[]
      and cardinality(p_permission_blocks) = 0;
  end if;
  return false;
end;
$$;

revoke execute on function public.daily_can_assign_invitation_scope(uuid,text[],text[])
  from public, anon, authenticated;
grant execute on function public.daily_can_assign_invitation_scope(uuid,text[],text[])
  to service_role;

create or replace function public.daily_create_organisation_invitation(
  p_organisation_id uuid,
  p_invited_email text,
  p_intended_roles text[],
  p_intended_permission_blocks text[],
  p_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare invitation_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'authenticated user required'; end if;
  if not public.daily_can_assign_invitation_scope(p_organisation_id,p_intended_roles,p_intended_permission_blocks) then
    raise exception 'invitation scope is not allowed for current user';
  end if;

  insert into public.daily_organisation_invitations(
    organisation_id, invited_email, normalized_email, invited_by,
    intended_roles, intended_permission_blocks, token_hash, expires_at
  ) values (
    p_organisation_id, p_invited_email, lower(btrim(p_invited_email)), (select auth.uid()),
    p_intended_roles, p_intended_permission_blocks, p_token_hash, now() + interval '7 days'
  ) returning id into invitation_id;
  return invitation_id;
end;
$$;

create or replace function public.daily_resend_organisation_invitation(
  p_invitation_id uuid,
  p_new_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_invitation public.daily_organisation_invitations%rowtype;
  new_invitation_id uuid := gen_random_uuid();
begin
  if (select auth.uid()) is null then raise exception 'authenticated user required'; end if;

  select * into previous_invitation
  from public.daily_organisation_invitations
  where id=p_invitation_id and status='pending'
  for update;

  if not found then raise exception 'pending invitation not found'; end if;

  if not public.daily_can_assign_invitation_scope(
    previous_invitation.organisation_id,
    previous_invitation.intended_roles,
    previous_invitation.intended_permission_blocks
  ) then raise exception 'invitation resend is not allowed for current user'; end if;

  update public.daily_organisation_invitations
    set status='superseded', superseded_by=new_invitation_id
    where id=p_invitation_id;

  insert into public.daily_organisation_invitations(
    id, organisation_id, invited_email, normalized_email, invited_by,
    intended_roles, intended_permission_blocks, token_hash, expires_at, resend_count
  ) values (
    new_invitation_id, previous_invitation.organisation_id,
    previous_invitation.invited_email, previous_invitation.normalized_email,
    (select auth.uid()), previous_invitation.intended_roles,
    previous_invitation.intended_permission_blocks, p_new_token_hash,
    now()+interval '7 days', previous_invitation.resend_count+1
  );
  return new_invitation_id;
end;
$$;

create or replace function public.daily_revoke_organisation_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare candidate public.daily_organisation_invitations%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'authenticated user required'; end if;
  select * into candidate
  from public.daily_organisation_invitations
  where id=p_invitation_id and status='pending'
  for update;
  if not found then raise exception 'pending invitation not found'; end if;

  if not public.daily_can_assign_invitation_scope(
    candidate.organisation_id, candidate.intended_roles, candidate.intended_permission_blocks
  ) then raise exception 'invitation revocation is not allowed for current user'; end if;

  update public.daily_organisation_invitations
  set status='revoked', revoked_at=now(), revoked_by=(select auth.uid())
  where id=p_invitation_id;
end;
$$;

create or replace function public.daily_accept_organisation_invitation(p_token_hash text)
returns table(invitation_id uuid, membership_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.daily_organisation_invitations%rowtype;
  current_email text;
  target_membership public.organisation_memberships%rowtype;
  assigned_role text;
  assigned_block text;
begin
  if (select auth.uid()) is null then raise exception 'authenticated user required'; end if;

  current_email := lower(btrim(coalesce(
    (select auth.jwt() ->> 'email'),
    current_setting('request.jwt.claim.email', true),
    ''
  )));
  if current_email = '' then raise exception 'authenticated email required'; end if;

  select * into candidate
  from public.daily_organisation_invitations
  where token_hash=p_token_hash and status='pending'
  for update;

  if not found then raise exception 'pending invitation not found'; end if;
  if candidate.expires_at <= now() then raise exception 'invitation expired'; end if;
  if candidate.normalized_email <> current_email then raise exception 'invitation email does not match current user'; end if;

  if not public.daily_text_array_has_no_duplicates(candidate.intended_roles)
     or not public.daily_text_array_has_no_duplicates(candidate.intended_permission_blocks)
     or cardinality(candidate.intended_roles)=0
     or not(candidate.intended_roles <@ array['manager','trainer','admin_assistant']::text[])
     or not(candidate.intended_permission_blocks <@ array['users','trainers','legal_profile','permanent_documents']::text[]) then
    raise exception 'stored invitation scope is invalid';
  end if;

  select * into target_membership
  from public.organisation_memberships
  where organisation_id=candidate.organisation_id
    and user_id=(select auth.uid())
  for update;

  if found then
    if target_membership.status in ('disabled','revoked') then
      raise exception 'disabled or revoked membership cannot be reactivated by invitation';
    elsif target_membership.status='invited' then
      update public.organisation_memberships
      set status='active', joined_at=now(), disabled_at=null, disabled_by=null, disable_reason=null
      where id=target_membership.id
      returning * into target_membership;
    end if;
  else
    insert into public.organisation_memberships(
      organisation_id,user_id,status,primary_role,joined_at,created_by
    ) values (
      candidate.organisation_id,(select auth.uid()),'active',candidate.intended_roles[1],now(),candidate.invited_by
    ) returning * into target_membership;
  end if;

  foreach assigned_role in array candidate.intended_roles loop
    insert into public.organisation_membership_roles(membership_id,role,created_by)
    values(target_membership.id,assigned_role,candidate.invited_by)
    on conflict (membership_id,role) do nothing;
  end loop;

  foreach assigned_block in array candidate.intended_permission_blocks loop
    insert into public.organisation_membership_permission_blocks(
      membership_id,permission_block,enabled,granted_by,granted_at,revoked_at
    ) values (
      target_membership.id,assigned_block,true,candidate.invited_by,now(),null
    )
    on conflict (membership_id,permission_block) do update
      set enabled=true, granted_by=excluded.granted_by, granted_at=excluded.granted_at, revoked_at=null;
  end loop;

  update public.daily_organisation_invitations
  set status='accepted', accepted_at=now(), accepted_user_id=(select auth.uid())
  where id=candidate.id;

  invitation_id := candidate.id;
  membership_id := target_membership.id;
  return next;
end;
$$;

revoke execute on function public.daily_create_organisation_invitation(uuid,text,text[],text[],text)
  from public, anon;
revoke execute on function public.daily_resend_organisation_invitation(uuid,text)
  from public, anon;
revoke execute on function public.daily_revoke_organisation_invitation(uuid)
  from public, anon;
revoke execute on function public.daily_accept_organisation_invitation(text)
  from public, anon;
grant execute on function public.daily_create_organisation_invitation(uuid,text,text[],text[],text) to authenticated;
grant execute on function public.daily_resend_organisation_invitation(uuid,text) to authenticated;
grant execute on function public.daily_revoke_organisation_invitation(uuid) to authenticated;
grant execute on function public.daily_accept_organisation_invitation(text) to authenticated;

drop policy if exists "Managers can update safe organisation fields" on public.organisations;
create policy "Managers can update safe organisation fields"
on public.organisations for update to authenticated
using (public.has_organisation_role(id,'manager'))
with check (public.has_organisation_role(id,'manager'));

drop policy if exists "Staff can manage organisation profile change requests" on public.daily_organisation_profile_change_requests;
create policy "Staff can manage organisation profile change requests"
on public.daily_organisation_profile_change_requests for all to authenticated
using (public.daily_is_selen_staff()) with check (public.daily_is_selen_staff());

drop policy if exists "Managers can create organisation profile change requests" on public.daily_organisation_profile_change_requests;
create policy "Managers can create organisation profile change requests"
on public.daily_organisation_profile_change_requests for insert to authenticated
with check (
  requested_by=(select auth.uid())
  and public.can_submit_organisation_profile_change(organisation_id)
  and status='pending'
  and reviewed_by is null and reviewed_at is null
);

drop policy if exists "Managers can read organisation profile change requests" on public.daily_organisation_profile_change_requests;
create policy "Managers can read organisation profile change requests"
on public.daily_organisation_profile_change_requests for select to authenticated
using (public.can_submit_organisation_profile_change(organisation_id));

drop policy if exists "Staff can read organisation invitations" on public.daily_organisation_invitations;
create policy "Staff can read organisation invitations"
on public.daily_organisation_invitations for select to authenticated
using (public.daily_is_selen_staff());

drop policy if exists "Organisation user managers can read invitations" on public.daily_organisation_invitations;
create policy "Organisation user managers can read invitations"
on public.daily_organisation_invitations for select to authenticated
using (public.can_invite_organisation_user(organisation_id));

drop policy if exists "Staff can manage Daily trainer profiles" on public.daily_trainer_profiles;
create policy "Staff can manage Daily trainer profiles"
on public.daily_trainer_profiles for all to authenticated
using (public.daily_is_selen_staff()) with check (public.daily_is_selen_staff());

drop policy if exists "Managers can read organisation trainer profiles" on public.daily_trainer_profiles;
create policy "Managers can read organisation trainer profiles"
on public.daily_trainer_profiles for select to authenticated
using (public.can_view_daily_trainer_profile(organisation_id));

drop policy if exists "Managers can create organisation trainer profiles" on public.daily_trainer_profiles;
create policy "Managers can create organisation trainer profiles"
on public.daily_trainer_profiles for insert to authenticated
with check (
  public.can_manage_daily_trainers(organisation_id)
  and status not in ('validated','rejected')
  and selen_validated_at is null and selen_validated_by is null
);

drop policy if exists "Managers can update unvalidated organisation trainer profiles" on public.daily_trainer_profiles;
create policy "Managers can update unvalidated organisation trainer profiles"
on public.daily_trainer_profiles for update to authenticated
using (
  public.can_manage_daily_trainers(organisation_id)
  and status not in ('validated','rejected')
)
with check (
  public.can_manage_daily_trainers(organisation_id)
  and status not in ('validated','rejected')
  and selen_validated_at is null and selen_validated_by is null
);

drop policy if exists "Trainers can read their own trainer profile" on public.daily_trainer_profiles;
create policy "Trainers can read their own trainer profile"
on public.daily_trainer_profiles for select to authenticated
using (user_id=(select auth.uid()) and active=true);

drop policy if exists "Staff can manage trainer internal notes" on public.daily_trainer_profile_internal_notes;
create policy "Staff can manage trainer internal notes"
on public.daily_trainer_profile_internal_notes for all to authenticated
using (public.daily_is_selen_staff()) with check (public.daily_is_selen_staff());

drop policy if exists "Staff can manage Daily trainer document links" on public.daily_trainer_profile_documents;
create policy "Staff can manage Daily trainer document links"
on public.daily_trainer_profile_documents for all to authenticated
using (public.daily_is_selen_staff()) with check (public.daily_is_selen_staff());

drop policy if exists "Managers can manage organisation trainer document links" on public.daily_trainer_profile_documents;
create policy "Managers can manage organisation trainer document links"
on public.daily_trainer_profile_documents for all to authenticated
using (
  exists (
    select 1 from public.daily_trainer_profiles dtp
    where dtp.id=daily_trainer_profile_documents.trainer_profile_id
      and public.can_manage_daily_trainers(dtp.organisation_id)
  )
)
with check (
  exists (
    select 1 from public.daily_trainer_profiles dtp
    where dtp.id=daily_trainer_profile_documents.trainer_profile_id
      and public.can_manage_daily_trainers(dtp.organisation_id)
  )
);

drop policy if exists "Trainers can read their own trainer document links" on public.daily_trainer_profile_documents;
create policy "Trainers can read their own trainer document links"
on public.daily_trainer_profile_documents for select to authenticated
using (
  exists (
    select 1 from public.daily_trainer_profiles dtp
    where dtp.id=daily_trainer_profile_documents.trainer_profile_id
      and dtp.user_id=(select auth.uid()) and dtp.active=true
  )
);

drop policy if exists "Staff can read trainer condition acceptances" on public.daily_trainer_condition_acceptances;
create policy "Staff can read trainer condition acceptances"
on public.daily_trainer_condition_acceptances for select to authenticated
using (public.daily_is_selen_staff());

drop policy if exists "Trainers can append their condition acceptances" on public.daily_trainer_condition_acceptances;
create policy "Trainers can append their condition acceptances"
on public.daily_trainer_condition_acceptances for insert to authenticated
with check (
  accepted_by=(select auth.uid())
  and exists (
    select 1 from public.daily_trainer_profiles dtp
    where dtp.id=trainer_profile_id
      and dtp.user_id=(select auth.uid())
      and dtp.active=true
      and dtp.engagement_type='subcontractor'
  )
);

drop policy if exists "Trainers can read their own condition acceptances" on public.daily_trainer_condition_acceptances;
create policy "Trainers can read their own condition acceptances"
on public.daily_trainer_condition_acceptances for select to authenticated
using (
  accepted_by=(select auth.uid())
  or exists (
    select 1 from public.daily_trainer_profiles dtp
    where dtp.id=trainer_profile_id and dtp.user_id=(select auth.uid())
  )
);

revoke all on table public.daily_organisation_profile_change_requests from public, anon, authenticated;
revoke all on table public.daily_organisation_invitations from public, anon, authenticated;
revoke all on table public.daily_trainer_profiles from public, anon, authenticated;
revoke all on table public.daily_trainer_profile_internal_notes from public, anon, authenticated;
revoke all on table public.daily_trainer_profile_documents from public, anon, authenticated;
revoke all on table public.daily_trainer_condition_acceptances from public, anon, authenticated;

grant select,insert,update on table public.daily_organisation_profile_change_requests to authenticated;
grant select on table public.daily_organisation_invitations to authenticated;
grant select,insert,update on table public.daily_trainer_profiles to authenticated;
grant select,insert,update on table public.daily_trainer_profile_internal_notes to authenticated;
grant select,insert,update on table public.daily_trainer_profile_documents to authenticated;
grant select,insert on table public.daily_trainer_condition_acceptances to authenticated;

revoke truncate,references,trigger on table public.daily_organisation_profile_change_requests from authenticated;
revoke truncate,references,trigger on table public.daily_organisation_invitations from authenticated;
revoke truncate,references,trigger on table public.daily_trainer_profiles from authenticated;
revoke truncate,references,trigger on table public.daily_trainer_profile_internal_notes from authenticated;
revoke truncate,references,trigger on table public.daily_trainer_profile_documents from authenticated;
revoke truncate,references,trigger on table public.daily_trainer_condition_acceptances from authenticated;
