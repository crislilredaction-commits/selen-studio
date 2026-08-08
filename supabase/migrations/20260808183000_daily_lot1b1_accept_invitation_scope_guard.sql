-- Selen Daily Lot 1B.1 - defensive validation of stored invitation scope.
-- Keeps production and repository aligned after final post-application review.

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
  where token_hash = p_token_hash and status = 'pending'
  for update;

  if not found then raise exception 'pending invitation not found'; end if;
  if candidate.expires_at <= now() then raise exception 'invitation expired'; end if;
  if candidate.normalized_email <> current_email then raise exception 'invitation email does not match current user'; end if;

  if not public.daily_text_array_has_no_duplicates(candidate.intended_roles)
     or not public.daily_text_array_has_no_duplicates(candidate.intended_permission_blocks)
     or cardinality(candidate.intended_roles) = 0
     or not (candidate.intended_roles <@ array['manager','trainer','admin_assistant']::text[])
     or not (candidate.intended_permission_blocks <@ array['users','trainers','legal_profile','permanent_documents']::text[]) then
    raise exception 'stored invitation scope is invalid';
  end if;

  select * into target_membership
  from public.organisation_memberships
  where organisation_id = candidate.organisation_id
    and user_id = (select auth.uid())
  for update;

  if found then
    if target_membership.status in ('disabled','revoked') then
      raise exception 'disabled or revoked membership cannot be reactivated by invitation';
    elsif target_membership.status = 'invited' then
      update public.organisation_memberships
      set status = 'active', joined_at = now(), disabled_at = null, disabled_by = null, disable_reason = null
      where id = target_membership.id
      returning * into target_membership;
    end if;
  else
    insert into public.organisation_memberships(
      organisation_id, user_id, status, primary_role, joined_at, created_by
    ) values (
      candidate.organisation_id, (select auth.uid()), 'active', candidate.intended_roles[1], now(), candidate.invited_by
    ) returning * into target_membership;
  end if;

  foreach assigned_role in array candidate.intended_roles loop
    insert into public.organisation_membership_roles(membership_id, role, created_by)
    values(target_membership.id, assigned_role, candidate.invited_by)
    on conflict (membership_id, role) do nothing;
  end loop;

  foreach assigned_block in array candidate.intended_permission_blocks loop
    insert into public.organisation_membership_permission_blocks(
      membership_id, permission_block, enabled, granted_by, granted_at, revoked_at
    ) values (
      target_membership.id, assigned_block, true, candidate.invited_by, now(), null
    )
    on conflict (membership_id, permission_block) do update
      set enabled = true, granted_by = excluded.granted_by, granted_at = excluded.granted_at, revoked_at = null;
  end loop;

  update public.daily_organisation_invitations
  set status = 'accepted', accepted_at = now(), accepted_user_id = (select auth.uid())
  where id = candidate.id;

  invitation_id := candidate.id;
  membership_id := target_membership.id;
  return next;
end;
$$;

revoke execute on function public.daily_accept_organisation_invitation(text)
  from public, anon;
grant execute on function public.daily_accept_organisation_invitation(text)
  to authenticated;
