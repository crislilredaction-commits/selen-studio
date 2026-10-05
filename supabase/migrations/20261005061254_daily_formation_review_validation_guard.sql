-- Validate exactly the programme saved by Studio. The legacy validator retains
-- the existing identity, public-link and version-history rules under this lock.
create or replace function public.daily_validate_formation_review(
  p_formation_id uuid,
  p_organisation_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_status text,
  p_validation_note text default null
)
returns public.daily_formations
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  f public.daily_formations;
  result public.daily_formations;
begin
  if p_expected_updated_at is null or p_expected_status is null
    or p_expected_status not in ('draft', 'review', 'correction_requested') then
    raise exception 'formation_changed' using errcode = 'P0001';
  end if;
  select * into f from public.daily_formations
    where id = p_formation_id and organisation_id = p_organisation_id
    for update;
  if not found or f.updated_at is distinct from p_expected_updated_at
    or f.status is distinct from p_expected_status then
    raise exception 'formation_changed' using errcode = 'P0001';
  end if;

  result := public.daily_validate_formation_version(f.id, p_validation_note);
  if result.id is distinct from f.id or result.organisation_id is distinct from f.organisation_id
    or result.status is distinct from 'validated' then
    raise exception 'formation_validation_not_confirmed';
  end if;
  -- A failure here rolls back validation as well. No validated programme can be
  -- left without its follow-up marker, and a stale retry cannot create another.
  update public.daily_formations
    set spontaneous_registration_task_status = 'to_attach'
    where id = f.id and organisation_id = f.organisation_id and status = 'validated'
    returning * into result;
  if not found then raise exception 'formation_validation_not_confirmed'; end if;
  return result;
end;
$$;

revoke all on function public.daily_validate_formation_review(uuid, uuid, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.daily_validate_formation_review(uuid, uuid, timestamptz, text, text) to service_role;
