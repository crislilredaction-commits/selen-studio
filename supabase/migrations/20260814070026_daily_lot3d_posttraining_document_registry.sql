-- Selen Daily Lot 3D - canonical post-training documents and checklist synchronisation.

create or replace function public.daily_validate_posttraining_document_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_org uuid;
begin
  if new.document_type not in ('attendance_report','completion_certificate','satisfaction_summary') then
    return new;
  end if;

  if new.document_type in ('attendance_report','satisfaction_summary') then
    if new.linked_object_type is distinct from 'session' or new.linked_object_id is null then
      raise exception 'Daily session post-training document must link to a session';
    end if;
    select s.organisation_id into linked_org
    from public.daily_sessions s
    where s.id = new.linked_object_id;
  else
    if new.linked_object_type is distinct from 'enrolment' or new.linked_object_id is null then
      raise exception 'Daily learner post-training document must link to an enrolment';
    end if;
    select e.organisation_id into linked_org
    from public.daily_session_enrolments e
    where e.id = new.linked_object_id;
  end if;

  if linked_org is null then raise exception 'Daily post-training linked object not found'; end if;
  if linked_org <> new.organisation_id then raise exception 'Daily post-training document organisation mismatch'; end if;
  return new;
end;
$$;
revoke execute on function public.daily_validate_posttraining_document_scope() from public, anon, authenticated;
grant execute on function public.daily_validate_posttraining_document_scope() to service_role;

drop trigger if exists daily_documents_validate_posttraining_scope on public.daily_documents;
create trigger daily_documents_validate_posttraining_scope
before insert or update of organisation_id, document_type, linked_object_type, linked_object_id
on public.daily_documents
for each row execute function public.daily_validate_posttraining_document_scope();

create or replace function public.daily_posttraining_document_session_id(
  p_document_type text,
  p_linked_object_type text,
  p_linked_object_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_document_type in ('attendance_report','satisfaction_summary') and p_linked_object_type = 'session'
      then p_linked_object_id
    when p_document_type = 'completion_certificate' and p_linked_object_type = 'enrolment'
      then (select e.session_id from public.daily_session_enrolments e where e.id = p_linked_object_id)
    else null
  end;
$$;
revoke execute on function public.daily_posttraining_document_session_id(text,text,uuid) from public, anon, authenticated;
grant execute on function public.daily_posttraining_document_session_id(text,text,uuid) to service_role;

create or replace function public.daily_sync_session_posttraining_checklist(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  enrolment_count integer := 0;
  expected_count integer := 0;
  current_count integer := 0;
  validated_count integer := 0;
  target_status text;
  target_note text;
begin
  if p_session_id is null then return; end if;

  select count(*) into enrolment_count
  from public.daily_session_enrolments e
  where e.session_id = p_session_id
    and e.status not in ('declined','cancelled');

  expected_count := 2 + enrolment_count;

  with required_docs as (
    select d.id, d.status
    from public.daily_documents d
    where d.is_current = true
      and d.document_type in ('attendance_report','satisfaction_summary')
      and d.linked_object_type = 'session'
      and d.linked_object_id = p_session_id
    union all
    select d.id, d.status
    from public.daily_documents d
    join public.daily_session_enrolments e on e.id = d.linked_object_id
    where d.is_current = true
      and d.document_type = 'completion_certificate'
      and d.linked_object_type = 'enrolment'
      and e.session_id = p_session_id
      and e.status not in ('declined','cancelled')
  )
  select count(*), count(*) filter (where status in ('validated','published','signed','active'))
  into current_count, validated_count
  from required_docs;

  target_status := case
    when current_count = 0 then 'todo'
    when current_count < expected_count then 'in_progress'
    when validated_count < expected_count then 'to_review'
    else 'validated'
  end;

  target_note := case
    when target_status = 'validated' then expected_count::text || ' document(s) postformation validé(s).'
    else current_count::text || '/' || expected_count::text || ' document(s) postformation préparé(s).'
  end;

  update public.daily_session_checklist_items
  set status = target_status,
      note = target_note
  where session_id = p_session_id
    and item_key = 'posttraining_documents'
    and status <> 'not_applicable'
    and (status is distinct from target_status or note is distinct from target_note);
end;
$$;
revoke execute on function public.daily_sync_session_posttraining_checklist(uuid) from public, anon, authenticated;
grant execute on function public.daily_sync_session_posttraining_checklist(uuid) to service_role;

create or replace function public.daily_sync_posttraining_document_checklist_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_session uuid;
  new_session uuid;
begin
  if tg_op <> 'INSERT' then
    old_session := public.daily_posttraining_document_session_id(old.document_type, old.linked_object_type, old.linked_object_id);
  end if;
  if tg_op <> 'DELETE' then
    new_session := public.daily_posttraining_document_session_id(new.document_type, new.linked_object_type, new.linked_object_id);
  end if;
  if old_session is not null then perform public.daily_sync_session_posttraining_checklist(old_session); end if;
  if new_session is not null and new_session is distinct from old_session then perform public.daily_sync_session_posttraining_checklist(new_session); end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.daily_sync_posttraining_document_checklist_trigger() from public, anon, authenticated;
grant execute on function public.daily_sync_posttraining_document_checklist_trigger() to service_role;

drop trigger if exists daily_documents_sync_posttraining_checklist on public.daily_documents;
create trigger daily_documents_sync_posttraining_checklist
after insert or update or delete on public.daily_documents
for each row execute function public.daily_sync_posttraining_document_checklist_trigger();

create or replace function public.daily_sync_posttraining_enrolment_checklist_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then perform public.daily_sync_session_posttraining_checklist(old.session_id); end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.session_id is distinct from old.session_id or new.status is distinct from old.status) then
    perform public.daily_sync_session_posttraining_checklist(new.session_id);
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.daily_sync_posttraining_enrolment_checklist_trigger() from public, anon, authenticated;
grant execute on function public.daily_sync_posttraining_enrolment_checklist_trigger() to service_role;

drop trigger if exists daily_session_enrolments_sync_posttraining_checklist on public.daily_session_enrolments;
create trigger daily_session_enrolments_sync_posttraining_checklist
after insert or update of session_id, status or delete on public.daily_session_enrolments
for each row execute function public.daily_sync_posttraining_enrolment_checklist_trigger();

create index if not exists daily_documents_posttraining_current_idx
on public.daily_documents(organisation_id, linked_object_type, linked_object_id, document_type)
where is_current = true and document_type in ('attendance_report','completion_certificate','satisfaction_summary');

create policy "Session managers read Daily posttraining documents"
on public.daily_documents for select to authenticated
using (
  document_type in ('attendance_report','completion_certificate','satisfaction_summary')
  and public.can_manage_daily_sessions(organisation_id)
);
