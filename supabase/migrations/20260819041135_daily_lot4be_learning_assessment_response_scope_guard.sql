create or replace function public.daily_guard_learning_assessment_response_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session_organisation uuid;
  v_session_formation uuid;
  v_enrolment_organisation uuid;
  v_enrolment_session uuid;
begin
  select organisation_id, formation_id
    into v_session_organisation, v_session_formation
  from public.daily_sessions
  where id = new.session_id;

  if v_session_organisation is null then
    raise exception 'daily_learning_assessment_response_invalid_session';
  end if;

  select organisation_id, session_id
    into v_enrolment_organisation, v_enrolment_session
  from public.daily_session_enrolments
  where id = new.enrolment_id;

  if v_enrolment_organisation is null then
    raise exception 'daily_learning_assessment_response_invalid_enrolment';
  end if;

  if new.organisation_id <> v_session_organisation
     or new.organisation_id <> v_enrolment_organisation
     or new.session_id <> v_enrolment_session
     or new.formation_id <> v_session_formation then
    raise exception 'daily_learning_assessment_response_scope_mismatch';
  end if;

  return new;
end;
$$;

revoke all on function public.daily_guard_learning_assessment_response_scope() from public, anon, authenticated;
grant execute on function public.daily_guard_learning_assessment_response_scope() to service_role;

drop trigger if exists daily_learning_assessment_responses_scope_guard on public.daily_learning_assessment_responses;
create trigger daily_learning_assessment_responses_scope_guard
before insert or update of organisation_id, session_id, enrolment_id, formation_id
on public.daily_learning_assessment_responses
for each row execute function public.daily_guard_learning_assessment_response_scope();
