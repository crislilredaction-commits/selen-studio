-- Fix Daily attendance scope validation on slot rows.
-- The previous trigger condition referenced enrolment_id on daily_attendance_slots.

create or replace function public.daily_validate_attendance_scope()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session_org uuid;
  v_slot_session uuid;
  v_slot_org uuid;
  v_enrolment_session uuid;
  v_enrolment_org uuid;
begin
  select organisation_id into v_session_org from public.daily_sessions where id=new.session_id;
  if v_session_org is null or v_session_org <> new.organisation_id then raise exception 'Daily attendance session organisation mismatch'; end if;

  if tg_table_name in ('daily_attendance_records','daily_attendance_access_tokens') then
    select session_id,organisation_id into v_slot_session,v_slot_org from public.daily_attendance_slots where id=new.slot_id;
    if v_slot_session is null or v_slot_session <> new.session_id or v_slot_org <> new.organisation_id then raise exception 'Daily attendance slot scope mismatch'; end if;
  end if;

  if tg_table_name='daily_attendance_records' then
    select session_id,organisation_id into v_enrolment_session,v_enrolment_org from public.daily_session_enrolments where id=new.enrolment_id;
    if v_enrolment_session is null or v_enrolment_session <> new.session_id or v_enrolment_org <> new.organisation_id then raise exception 'Daily attendance enrolment scope mismatch'; end if;
  elsif tg_table_name='daily_attendance_access_tokens' then
    if new.enrolment_id is not null then
      select session_id,organisation_id into v_enrolment_session,v_enrolment_org from public.daily_session_enrolments where id=new.enrolment_id;
      if v_enrolment_session is null or v_enrolment_session <> new.session_id or v_enrolment_org <> new.organisation_id then raise exception 'Daily attendance enrolment scope mismatch'; end if;
    end if;
  end if;

  return new;
end;
$$;
revoke execute on function public.daily_validate_attendance_scope() from public,anon,authenticated;
grant execute on function public.daily_validate_attendance_scope() to service_role;
