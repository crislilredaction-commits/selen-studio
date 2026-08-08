-- Daily Lot 1B.1: internal integrity triggers must be able to validate cross-row
-- organisation links even when the caller cannot directly read the referenced row under RLS.
-- Direct EXECUTE remains revoked from API roles; these functions are invoked only by their triggers.

create or replace function public.validate_daily_trainer_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_record public.organisation_memberships%rowtype;
begin
  if new.membership_id is not null then
    select * into membership_record
    from public.organisation_memberships
    where id = new.membership_id;

    if not found then raise exception 'trainer membership not found'; end if;
    if membership_record.organisation_id <> new.organisation_id then
      raise exception 'trainer membership belongs to another organisation';
    end if;

    if new.user_id is null then
      new.user_id := membership_record.user_id;
    elsif new.user_id <> membership_record.user_id then
      raise exception 'trainer user_id does not match membership user_id';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.validate_daily_trainer_profile_identity()
  from public, anon, authenticated;
grant execute on function public.validate_daily_trainer_profile_identity()
  to service_role;

create or replace function public.validate_daily_trainer_profile_document_organisation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trainer_organisation_id uuid;
  document_organisation_id uuid;
begin
  select organisation_id into trainer_organisation_id
  from public.daily_trainer_profiles
  where id = new.trainer_profile_id;
  if trainer_organisation_id is null then raise exception 'trainer profile not found'; end if;

  select organisation_id into document_organisation_id
  from public.daily_documents
  where id = new.daily_document_id;
  if document_organisation_id is null then raise exception 'Daily document not found'; end if;

  if trainer_organisation_id <> document_organisation_id then
    raise exception 'trainer profile and Daily document must belong to the same organisation';
  end if;
  return new;
end;
$$;

revoke execute on function public.validate_daily_trainer_profile_document_organisation()
  from public, anon, authenticated;
grant execute on function public.validate_daily_trainer_profile_document_organisation()
  to service_role;
