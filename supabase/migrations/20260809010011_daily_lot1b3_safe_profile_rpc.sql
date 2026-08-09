-- Selen Daily Lot 1B.3 - controlled client update for non-sensitive organisation contact data.

create or replace function public.daily_client_update_safe_organisation(
  p_organisation_id uuid,
  p_administrative_email text default null,
  p_administrative_phone text default null,
  p_administrative_address text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is null then raise exception 'authenticated user required'; end if;

  if not (
    public.has_organisation_role(p_organisation_id, 'manager')
    or public.has_organisation_permission_block(p_organisation_id, 'legal_profile')
  ) then
    raise exception 'legal profile permission required';
  end if;

  update public.organisations
  set administrative_email = nullif(btrim(coalesce(p_administrative_email, '')), ''),
      administrative_phone = nullif(btrim(coalesce(p_administrative_phone, '')), ''),
      administrative_address = nullif(btrim(coalesce(p_administrative_address, '')), '')
  where id = p_organisation_id;

  if not found then raise exception 'organisation not found'; end if;
end;
$$;

revoke execute on function public.daily_client_update_safe_organisation(uuid,text,text,text)
  from public, anon;
grant execute on function public.daily_client_update_safe_organisation(uuid,text,text,text)
  to authenticated;
