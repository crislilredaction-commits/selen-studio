-- Selen Daily Lot 1B.2 - atomic Studio membership access updates and stricter certification validity.

alter table public.daily_trainer_certifications
  drop constraint if exists daily_trainer_certifications_validity_dates_check,
  add constraint daily_trainer_certifications_validity_dates_check
    check (
      (validity_mode = 'limited' and valid_until is not null)
      or (validity_mode in ('lifetime','unknown') and valid_until is null)
    );

create or replace function public.daily_studio_set_membership_access(
  p_organisation_id uuid,
  p_membership_id uuid,
  p_roles text[],
  p_permission_blocks text[],
  p_actor_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  requested_block text;
  membership_record public.organisation_memberships%rowtype;
begin
  if p_organisation_id is null or p_membership_id is null then
    raise exception 'organisation and membership are required';
  end if;

  if coalesce(cardinality(p_roles), 0) = 0 then
    raise exception 'at least one role is required';
  end if;

  if not public.daily_text_array_has_no_duplicates(coalesce(p_roles, '{}'::text[]))
     or not public.daily_text_array_has_no_duplicates(coalesce(p_permission_blocks, '{}'::text[])) then
    raise exception 'duplicate roles or permission blocks are not allowed';
  end if;

  if not (p_roles <@ array['manager','trainer','admin_assistant']::text[]) then
    raise exception 'invalid organisation role';
  end if;

  if not (coalesce(p_permission_blocks, '{}'::text[]) <@ array['users','trainers','legal_profile','permanent_documents']::text[]) then
    raise exception 'invalid organisation permission block';
  end if;

  select * into membership_record
  from public.organisation_memberships
  where id = p_membership_id
    and organisation_id = p_organisation_id
  for update;

  if not found then raise exception 'membership not found'; end if;

  delete from public.organisation_membership_roles
  where membership_id = p_membership_id
    and not (role = any(p_roles));

  foreach requested_role in array p_roles loop
    insert into public.organisation_membership_roles(membership_id, role, created_by)
    values(p_membership_id, requested_role, p_actor_user_id)
    on conflict on constraint organisation_membership_roles_unique do nothing;
  end loop;

  update public.organisation_memberships
  set primary_role = p_roles[1],
      updated_by = p_actor_user_id,
      updated_at = now()
  where id = p_membership_id;

  update public.organisation_membership_permission_blocks
  set enabled = false,
      revoked_at = now(),
      reason = 'Updated from Selen Studio'
  where membership_id = p_membership_id
    and enabled = true
    and revoked_at is null
    and not (permission_block = any(coalesce(p_permission_blocks, '{}'::text[])));

  foreach requested_block in array coalesce(p_permission_blocks, '{}'::text[]) loop
    insert into public.organisation_membership_permission_blocks(
      membership_id,
      permission_block,
      enabled,
      granted_by,
      granted_at,
      revoked_at,
      reason
    ) values (
      p_membership_id,
      requested_block,
      true,
      p_actor_user_id,
      now(),
      null,
      'Updated from Selen Studio'
    )
    on conflict on constraint organisation_membership_permission_blocks_unique do update
      set enabled = true,
          granted_by = excluded.granted_by,
          granted_at = excluded.granted_at,
          revoked_at = null,
          reason = excluded.reason;
  end loop;
end;
$$;

revoke execute on function public.daily_studio_set_membership_access(uuid,uuid,text[],text[],uuid)
  from public, anon, authenticated;
grant execute on function public.daily_studio_set_membership_access(uuid,uuid,text[],text[],uuid)
  to service_role;
