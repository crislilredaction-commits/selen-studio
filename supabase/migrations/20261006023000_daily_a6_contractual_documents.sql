-- A6 — contractual documents follow the explicit party on each session enrolment.
-- Additive/replacement-only: no business row is rewritten or deleted.

create or replace function public.daily_validate_pretraining_document_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare linked_org uuid;
begin
  if new.document_type not in ('training_program','training_agreement','training_contract','convocation','registration_positioning') then return new; end if;
  if new.document_type in ('training_program','training_agreement') then
    if new.linked_object_type is distinct from 'session' or new.linked_object_id is null then raise exception 'Daily session pretraining document must link to a session'; end if;
    select s.organisation_id into linked_org from public.daily_sessions s where s.id = new.linked_object_id;
  else
    if new.linked_object_type is distinct from 'enrolment' or new.linked_object_id is null then raise exception 'Daily learner pretraining document must link to an enrolment'; end if;
    select e.organisation_id into linked_org from public.daily_session_enrolments e where e.id = new.linked_object_id;
  end if;
  if linked_org is null then raise exception 'Daily pretraining linked object not found'; end if;
  if linked_org <> new.organisation_id then raise exception 'Daily pretraining document organisation mismatch'; end if;
  return new;
end;
$$;
revoke execute on function public.daily_validate_pretraining_document_scope() from public, anon, authenticated;
grant execute on function public.daily_validate_pretraining_document_scope() to service_role;

create or replace function public.daily_pretraining_document_session_id(p_document_type text, p_linked_object_type text, p_linked_object_id uuid)
returns uuid language sql stable security definer set search_path = public
as $$
  select case
    when p_document_type in ('training_program','training_agreement') and p_linked_object_type = 'session' then p_linked_object_id
    when p_document_type in ('training_contract','convocation','registration_positioning') and p_linked_object_type = 'enrolment'
      then (select e.session_id from public.daily_session_enrolments e where e.id = p_linked_object_id)
    else null end;
$$;
revoke execute on function public.daily_pretraining_document_session_id(text,text,uuid) from public, anon, authenticated;
grant execute on function public.daily_pretraining_document_session_id(text,text,uuid) to service_role;

create or replace function public.daily_sync_session_pretraining_checklist(p_session_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare enrolment_count integer := 0; individual_count integer := 0; unspecified_count integer := 0; company_count integer := 0;
  expected_count integer := 0; current_count integer := 0; validated_count integer := 0; target_status text;
begin
  if p_session_id is null then return; end if;
  select count(*), count(*) filter (where contracting_party_type = 'individual'), count(*) filter (where contracting_party_type is null),
         count(distinct nullif(btrim(company_name), '')) filter (where contracting_party_type = 'company')
    into enrolment_count, individual_count, unspecified_count, company_count
  from public.daily_session_enrolments where session_id = p_session_id and status not in ('declined','cancelled','abandoned');
  expected_count := 1 + (enrolment_count * 2) + individual_count + unspecified_count + company_count;
  with required_docs as (
    select d.id,d.status from public.daily_documents d where d.is_current=true and d.document_type in ('training_program','training_agreement') and d.linked_object_type='session' and d.linked_object_id=p_session_id
    union all
    select d.id,d.status from public.daily_documents d join public.daily_session_enrolments e on e.id=d.linked_object_id
      where d.is_current=true and d.document_type in ('training_contract','convocation','registration_positioning') and d.linked_object_type='enrolment'
        and e.session_id=p_session_id and e.status not in ('declined','cancelled','abandoned')
  ) select count(*),count(*) filter(where status in ('validated','published','signed','active')) into current_count,validated_count from required_docs;
  target_status := case when current_count=0 then 'todo' when current_count<expected_count then 'in_progress' when validated_count<expected_count then 'to_review' else 'validated' end;
  update public.daily_session_checklist_items set status=target_status,
    note=case when target_status='validated' then expected_count::text||' document(s) préformation validé(s).' else current_count::text||'/'||expected_count::text||' document(s) préformation préparé(s).' end
  where session_id=p_session_id and item_key='pretraining_documents' and status<>'not_applicable';
end;
$$;
revoke execute on function public.daily_sync_session_pretraining_checklist(uuid) from public, anon, authenticated;
grant execute on function public.daily_sync_session_pretraining_checklist(uuid) to service_role;

drop policy if exists "Session managers read Daily pretraining documents" on public.daily_documents;
create policy "Session managers read Daily pretraining documents" on public.daily_documents for select to authenticated
using (document_type in ('training_program','training_agreement','training_contract','convocation','registration_positioning') and public.can_manage_daily_sessions(organisation_id));

comment on function public.daily_sync_session_pretraining_checklist(uuid) is 'A6: counts one explicit contract per individual enrolment and one convention per distinct sponsoring company; null party remains incomplete.';
